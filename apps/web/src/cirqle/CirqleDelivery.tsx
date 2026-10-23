/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// What WhatsApp and Telegram take from us, read from what the bridges say.
//
// Each bridge publishes in every chat what its network allows
// (`com.beeper.room_features`): WhatsApp takes an edit for 15 minutes and a
// delete for everyone for 2 days. Edit and Delete are not offered past that.
// After each message, edit or delete the bridge answers
// (`com.beeper.message_send_status`); when the network refused, the message
// says so, since otherwise it would look sent, edited or deleted here while
// the customer sees something else.
//
// Reactions: Telegram takes only its standard set (73 emoji, no skin tones;
// any other needs Premium, and the bridge's own error is REACTION_INVALID), a
// group may allow fewer. The bridge lists them as `allowed_reactions`, so the
// picker offers only those. A staff reaction reaches the network as the
// number's (the relay bot repeats it from the account owner), so the bridge's
// answer is on the owner's reaction; when it refused, the message says so.

import React, { type JSX, useEffect, useState } from "react";
import { ClientEvent, EventType, type MatrixEvent, RelationType, type Room } from "matrix-js-sdk/src/matrix";

import { MatrixClientPeg } from "../MatrixClientPeg";
import { isCirqleMessenger } from "./CirqleFeatures";
import { networkOf } from "./CirqleInboxes";
import { latestOurReaction } from "./CirqleReactions";

export const ROOM_FEATURES_EVENT = "com.beeper.room_features";
export const SEND_STATUS_EVENT = "com.beeper.message_send_status";

/** The part of the bridge's room features CIRQLE reads; ages are in seconds, levels below 1 mean "not supported". */
export interface RoomFeatures {
    edit?: number;
    edit_max_age?: number;
    delete?: number;
    delete_max_age?: number;
    reaction?: number;
    allowed_reactions?: string[];
    custom_emoji_reactions?: boolean;
}

export function roomFeatures(room: Room): RoomFeatures | undefined {
    // The state key names the bridge: "matrix.cirqlecirqle.com/whatsapp"
    return room.currentState.getStateEvents(ROOM_FEATURES_EVENT)[0]?.getContent<RoomFeatures>();
}

const VARIATION_SELECTORS = /[\uFE0E\uFE0F]/g;

/**
 * The reactions the network takes in this chat, as a test for a reaction key;
 * undefined when it takes any (WhatsApp, a Telegram Premium account).
 */
export function cirqleReactionFilter(room: Room | null | undefined): ((key: string) => boolean) | undefined {
    if (!isCirqleMessenger() || !room) return undefined;
    const features = roomFeatures(room);
    if (features?.reaction !== undefined && features.reaction < 1) return () => false;
    if (!features?.allowed_reactions?.length || features.custom_emoji_reactions) return undefined;
    // "👍️" in the bridge's list, "👍" from the picker
    const allowed = new Set(features.allowed_reactions.map((key) => key.replace(VARIATION_SELECTORS, "")));
    return (key) => allowed.has(key.replace(VARIATION_SELECTORS, ""));
}

interface SendStatus {
    "status"?: string;
    "reason"?: string;
    "message"?: string;
    "error"?: string;
    "m.relates_to"?: { event_id?: string };
}

const REASONS: Record<string, string> = {
    "m.event_too_old": "it is too old",
    "m.no_permission": "the number may not do this here",
    "m.bridge_unavailable": "the bridge is not connected",
    "m.foreign_network_error": "it was refused",
    "com.beeper.unsupported_event": "this is not supported",
};

/**
 * The bridge's last answer about an event. The SDK files a status as a
 * relation of its event and does not always keep it in the timeline (a status
 * about a reaction never is), so the relations are read first.
 */
function lastStatus(room: Room, eventId: string, timeline: Map<string, SendStatus>): SendStatus | undefined {
    const related = room.relations
        .getChildEventsForEvent(eventId, RelationType.Reference, SEND_STATUS_EVENT)
        ?.getRelations()
        .filter((event) => !event.isRedacted());
    if (!related?.length) return timeline.get(eventId);
    return related.reduce((last, event) => (event.getTs() >= last.getTs() ? event : last)).getContent<SendStatus>();
}

/** The bridge's last answer for each event of the room, in timeline order. */
function lastStatuses(room: Room): Map<string, SendStatus> {
    const statuses = new Map<string, SendStatus>();
    for (const event of room.getLiveTimeline().getEvents()) {
        if (event.getType() !== SEND_STATUS_EVENT) continue;
        const content = event.getContent<SendStatus>();
        const target = content["m.relates_to"]?.event_id;
        if (target) statuses.set(target, content);
    }
    return statuses;
}

export interface DeliveryFailure {
    what: "message" | "edit" | "delete" | "reaction";
    reason: string;
    /** The emoji, for a reaction */
    key?: string;
}

/** The relay bot's account owner, whose reaction carries a staff member's to the network. */
const ACCOUNT_OWNER = /^@account_(?:whatsapp|telegram)_/;
const UNSUPPORTED = "com.beeper.unsupported_event";

/** Why the network did not take this message, its last edit or its deletion; undefined when it did (or has not answered yet). */
export function deliveryFailure(room: Room, event: MatrixEvent): DeliveryFailure | undefined {
    const statuses = lastStatuses(room);
    const failed = (id: string | undefined): SendStatus | undefined => {
        const status = id ? lastStatus(room, id, statuses) : undefined;
        return status?.status?.startsWith("FAIL") ? status : undefined;
    };
    const why = (status: SendStatus): string =>
        status.message || status.error || REASONS[status.reason ?? ""] || "it was not accepted";
    const redaction = event.getUnsigned().redacted_because?.event_id ?? event.localRedactionEvent()?.getId();
    if (event.isRedacted()) {
        const status = failed(redaction);
        return status && { what: "delete", reason: why(status) };
    }
    const edit = failed(event.replacingEventId());
    if (edit) return { what: "edit", reason: why(edit) };
    const message = failed(event.getId());
    if (message) return { what: "message", reason: why(message) };

    // Our reaction the customer should see: the bridge answered on the number's copy of it
    const reactions =
        room.relations
            .getChildEventsForEvent(event.getId()!, RelationType.Annotation, EventType.Reaction)
            ?.getRelations() ?? [];
    const key = latestOurReaction(reactions, room.client)?.getRelation()?.key;
    if (!key) return undefined;
    const refused = reactions
        .filter((reaction) => !reaction.isRedacted() && reaction.getRelation()?.key === key)
        .filter((reaction) => ACCOUNT_OWNER.test(reaction.getSender() ?? ""))
        .map((reaction) => failed(reaction.getId()))
        .find(Boolean);
    if (!refused) return undefined;
    return { what: "reaction", key, reason: refused.reason === UNSUPPORTED ? UNSUPPORTED : why(refused) };
}

export function deliveryText(failure: DeliveryFailure, network: string): string {
    const reason = failure.reason.replace(/\.$/, "");
    switch (failure.what) {
        case "message":
            return `Not delivered to ${network}: ${reason}`;
        case "edit":
            return `Edit not delivered to ${network}: ${reason}. The customer sees the earlier text`;
        case "delete":
            return `Not deleted on ${network}: ${reason}. The customer still sees the message`;
        case "reaction":
            return failure.reason === UNSUPPORTED
                ? `Reaction ${failure.key} not delivered: ${network} takes only its standard reactions`
                : `Reaction ${failure.key} not delivered to ${network}: ${reason}`;
    }
}

/** Under a message the network refused: what did not reach the customer, and why. */
export function CirqleDeliveryNotice({ mxEvent }: { mxEvent: MatrixEvent }): JSX.Element | null {
    return isCirqleMessenger() ? <DeliveryNotice mxEvent={mxEvent} /> : null;
}

function DeliveryNotice({ mxEvent }: { mxEvent: MatrixEvent }): JSX.Element | null {
    const room = MatrixClientPeg.get()?.getRoom(mxEvent.getRoomId());
    const [, setVersion] = useState(0);
    useEffect(() => {
        if (!room) return;
        // Every event the client gets, since statuses about reactions never reach the timeline
        const onEvent = (event: MatrixEvent): void => {
            if (event.getRoomId() !== room.roomId) return;
            const type = event.getType();
            if (type === SEND_STATUS_EVENT || type === EventType.Reaction || type === EventType.RoomRedaction) {
                setVersion((v) => v + 1);
            }
        };
        room.client.on(ClientEvent.Event, onEvent);
        return () => {
            room.client.off(ClientEvent.Event, onEvent);
        };
    }, [room]);
    if (!room) return null;
    const failure = deliveryFailure(room, mxEvent);
    if (!failure) return null;
    const network = networkOf(room) === "telegram" ? "Telegram" : "WhatsApp";
    return (
        <div className="cirqle_DeliveryNotice" role="status">
            {deliveryText(failure, network)}
        </div>
    );
}
