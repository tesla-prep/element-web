/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// CIRQLE's own right panel cards, in place of Element's. WhatsApp and Telegram
// chats get Contact info or Group info for Element's room summary and for its
// member list (People, which leads on to invites and user info). Everyone gets
// the member card for Element's user info, whichever way they open it: a
// sender's avatar, a mention, /whois, the image viewer, a link to a user.
// Everything else (the file panel our Media, links and docs opens, threads,
// pinned messages) stays Element's.

import React, { type JSX } from "react";
import { type Room } from "matrix-js-sdk/src/matrix";

import { RightPanelPhases } from "../stores/right-panel/RightPanelStorePhases";
import { type IRightPanelCardState } from "../stores/right-panel/RightPanelStoreIPanelState";
import { CirqleContactInfo, isCirqleContactInfoRoom } from "./CirqleContactInfo";
import { CirqleGroupInfo, isCirqleGroupInfoRoom } from "./CirqleGroupInfo";
import { CirqleMemberCard } from "./CirqleMemberCard";

export function cirqleRightPanelCard(
    phase: RightPanelPhases | null | undefined,
    room: Room | undefined,
    cardState: IRightPanelCardState | undefined,
    onClose: () => void,
): JSX.Element | undefined {
    if (phase === RightPanelPhases.MemberInfo && cardState?.member) {
        return (
            <CirqleMemberCard key={cardState.member.userId} member={cardState.member} room={room} onClose={onClose} />
        );
    }
    if (!room || (phase !== RightPanelPhases.RoomSummary && phase !== RightPanelPhases.MemberList)) return undefined;
    if (isCirqleContactInfoRoom(room)) return <CirqleContactInfo room={room} />;
    if (isCirqleGroupInfoRoom(room)) return <CirqleGroupInfo room={room} />;
    return undefined;
}
