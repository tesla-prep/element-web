/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// Senders' avatars in WhatsApp and Telegram groups, as on WhatsApp: beside the
// first bubble of each run of someone else's messages, and a click opens their
// card (CirqleMemberCard, through Element's "view user"). Bubbles further down
// the run keep the same indent without one. Private chats and our own side have
// none: there the name of the chat or the side already says who wrote.

import React, { type JSX } from "react";
import { type MatrixEvent, type RoomMember } from "matrix-js-sdk/src/matrix";

import { MatrixClientPeg } from "../MatrixClientPeg";
import MemberAvatar from "../components/views/avatars/MemberAvatar";
import { isCirqleMessenger } from "./CirqleFeatures";
import { chatKind, networkOf } from "./CirqleInboxes";
import { isOurSide } from "./CirqleTimeline";

export function showsSenderAvatar(event: MatrixEvent): boolean {
    const client = MatrixClientPeg.get();
    const room = client?.getRoom(event.getRoomId());
    if (!isCirqleMessenger() || !client || !room || event.isState()) return false;
    return !!networkOf(room) && chatKind(room) === "group" && !isOurSide(event, client);
}

export function CirqleSenderAvatar({
    member,
    event,
    continuation,
}: {
    member: RoomMember | null;
    event: MatrixEvent;
    continuation?: boolean;
}): JSX.Element {
    if (continuation) return <span className="cirqle_SenderAvatar cirqle_SenderAvatar_run" />;
    return (
        <span className="cirqle_SenderAvatar">
            <MemberAvatar member={member} fallbackUserId={event.getSender()} size="32px" viewUserOnClick />
        </span>
    );
}
