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

import React, { type JSX, useEffect, useState } from "react";
import { type MatrixEvent, type Room, RoomEvent } from "matrix-js-sdk/src/matrix";

import { MatrixClientPeg } from "../MatrixClientPeg";
import { isCirqleMessenger } from "./CirqleFeatures";
import { networkOf } from "./CirqleInboxes";

export const ROOM_FEATURES_EVENT = "com.beeper.room_features";
export const SEND_STATUS_EVENT = "com.beeper.message_send_status";

/** The part of the bridge's room features CIRQLE reads; ages are in seconds, levels below 1 mean "not supported". */
export interface RoomFeatures {
    edit?: number;
    edit_max_age?: number;
    delete?: number;
    delete_max_age?: number;
}

export function roomFeatures(room: Room): RoomFeatures | undefined {
    // The state key names the bridge: "matrix.cirqlecirqle.com/whatsapp"
    return room.currentState.getStateEvents(ROOM_FEATURES_EVENT)[0]?.getContent<RoomFeatures>();
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
    what: "message" | "edit" | "delete";
    reason: string;
}

/** Why the network did not take this message, its last edit or its deletion; undefined when it did (or has not answered yet). */
export function deliveryFailure(room: Room, event: MatrixEvent): DeliveryFailure | undefined {
    const statuses = lastStatuses(room);
    const failed = (id: string | undefined): SendStatus | undefined => {
        const status = id ? statuses.get(id) : undefined;
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
    return message && { what: "message", reason: why(message) };
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
    }
}

/** Under a message the network refused: what did not reach the customer, and why. */
export function CirqleDeliveryNotice({ mxEvent }: { mxEvent: MatrixEvent }): JSX.Element | null {
    const room = MatrixClientPeg.get()?.getRoom(mxEvent.getRoomId());
    const [, setVersion] = useState(0);
    useEffect(() => {
        if (!room || !isCirqleMessenger()) return;
        const onTimeline = (event: MatrixEvent): void => {
            if (event.getType() === SEND_STATUS_EVENT) setVersion((v) => v + 1);
        };
        room.on(RoomEvent.Timeline, onTimeline);
        return () => {
            room.off(RoomEvent.Timeline, onTimeline);
        };
    }, [room]);
    if (!room || !isCirqleMessenger()) return null;
    const failure = deliveryFailure(room, mxEvent);
    if (!failure) return null;
    const network = networkOf(room) === "telegram" ? "Telegram" : "WhatsApp";
    return (
        <div className="cirqle_DeliveryNotice" role="status">
            {deliveryText(failure, network)}
        </div>
    );
}
