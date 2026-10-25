/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// The top of a message's menu (a long press on a phone, a right click on a
// computer), as on WhatsApp: a row of reactions, "+" for the rest, and Copy for
// the text itself.

import React, { type JSX } from "react";
import {
    EventType,
    type MatrixClient,
    type MatrixEvent,
    MsgType,
    RelationType,
    type Relations,
} from "matrix-js-sdk/src/matrix";

import { cirqleReactionFilter } from "./CirqleDelivery";
import { cirqleReplaceOwnReaction } from "./CirqleReactions";
import { isCirqleMessenger } from "./CirqleFeatures";

export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

const TEXT_TYPES = new Set<string>([MsgType.Text, MsgType.Notice, MsgType.Emote]);

/** The text Copy puts on the clipboard: a text message's body, or a photo's or file's caption. */
export function cirqleCopyText(event: MatrixEvent): string | undefined {
    if (!isCirqleMessenger() || event.isRedacted() || event.getType() !== EventType.RoomMessage) return undefined;
    const content = event.getContent();
    const body = typeof content.body === "string" ? content.body : undefined;
    if (!body?.trim()) return undefined;
    if (typeof content.msgtype === "string" && TEXT_TYPES.has(content.msgtype)) return body;
    // A media message's body is its file name unless a caption came with it
    return typeof content.filename === "string" && content.filename !== body ? body : undefined;
}

/** The quick reactions the chat's network takes, in WhatsApp's order. */
export function quickReactions(filter: ((key: string) => boolean) | undefined): string[] {
    return filter ? QUICK_REACTIONS.filter(filter) : QUICK_REACTIONS;
}

function myReactions(client: MatrixClient, reactions: Relations | null | undefined): Map<string, MatrixEvent> {
    const mine = reactions?.getAnnotationsBySender()?.[client.getSafeUserId()] ?? new Set<MatrixEvent>();
    return new Map([...mine].filter((ev) => !ev.isRedacted()).map((ev) => [ev.getRelation()?.key ?? "", ev] as const));
}

/** Picking a reaction we already gave takes it back; another one replaces ours, as WhatsApp does. */
export function toggleCirqleReaction(
    client: MatrixClient,
    event: MatrixEvent,
    reactions: Relations | null | undefined,
    key: string,
    canRedact: boolean,
): void {
    const given = myReactions(client, reactions).get(key);
    if (given) {
        if (canRedact) void client.redactEvent(event.getRoomId()!, given.getId()!);
        return;
    }
    cirqleReplaceOwnReaction(client, event, key);
    void client.sendEvent(event.getRoomId()!, EventType.Reaction, {
        "m.relates_to": { rel_type: RelationType.Annotation, event_id: event.getId()!, key },
    });
}

interface Props {
    client: MatrixClient;
    mxEvent: MatrixEvent;
    reactions?: Relations | null;
    canRedact: boolean;
    /** "+": the full emoji picker */
    onMore: () => void;
    onFinished: () => void;
}

export function CirqleQuickReactions({
    client,
    mxEvent,
    reactions,
    canRedact,
    onMore,
    onFinished,
}: Props): JSX.Element | null {
    const keys = quickReactions(cirqleReactionFilter(client.getRoom(mxEvent.getRoomId())));
    if (keys.length === 0) return null;
    const mine = myReactions(client, reactions);
    return (
        <div className="cirqle_QuickReactions" role="group" aria-label="React">
            {keys.map((key) => (
                <button
                    type="button"
                    key={key}
                    className="cirqle_QuickReactions_emoji"
                    aria-label={key}
                    aria-pressed={mine.has(key)}
                    onClick={() => {
                        toggleCirqleReaction(client, mxEvent, reactions, key, canRedact);
                        onFinished();
                    }}
                >
                    {key}
                </button>
            ))}
            <button type="button" className="cirqle_QuickReactions_more" aria-label="More reactions" onClick={onMore}>
                +
            </button>
        </div>
    );
}
