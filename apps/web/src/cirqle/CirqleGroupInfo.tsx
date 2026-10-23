/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// Group info side panel (concept artboard GroupInfo), shown for WhatsApp and
// Telegram groups and channels in place of Element's room summary.
//
// Members are the people in the group on WhatsApp or Telegram: the bridge's
// ghost users and our number's own account. Staff and service users are Matrix
// only and are not listed. Add member, Remove… and Leave group… are Element's
// own invite, remove (kick) and leave, which the relay bot and the bridges
// carry out on WhatsApp and Telegram.

import React, { type JSX, useContext } from "react";
import { KnownMembership, type Room, type RoomMember } from "matrix-js-sdk/src/matrix";
import { logger } from "matrix-js-sdk/src/logger";

import { useMatrixClientContext } from "../contexts/MatrixClientContext";
import { SDKContext } from "../contexts/SDKContext";
import { useRoomMembers } from "../hooks/useRoomMembers";
import { useRoomName } from "../hooks/useRoomName";
import dis from "../dispatcher/dispatcher";
import Modal from "../Modal";
import ConfirmUserActionDialog from "../components/views/dialogs/ConfirmUserActionDialog";
import ErrorDialog from "../components/views/dialogs/ErrorDialog";
import RoomAvatar from "../components/views/avatars/RoomAvatar";
import MemberAvatar from "../components/views/avatars/MemberAvatar";
import { AddMemberIcon, CloseIcon, LeaveIcon } from "./CirqleIcons";
import { chatKind, formatPhone, inboxesOf, networkOf, stripNetworkSuffix } from "./CirqleInboxes";
import { useCirqleInboxes } from "./useCirqleChats";

const GHOST = /^@(whatsapp|telegram)_([^:]+):/;
export const ACCOUNT = /^@account_(whatsapp|telegram)_/;

/** Bridged groups and channels get this panel; private chats keep Element's room summary. */
/** The people in the group on WhatsApp or Telegram: ghosts and our accounts, not staff. */
export function groupPeople(members: RoomMember[]): RoomMember[] {
    return members
        .filter((m) => m.membership === KnownMembership.Join && (GHOST.test(m.userId) || ACCOUNT.test(m.userId)))
        .sort((a, b) => Number(ACCOUNT.test(b.userId)) - Number(ACCOUNT.test(a.userId)) || a.name.localeCompare(b.name));
}

/** "1 member", "3 members" */
export function membersLabel(count: number): string {
    return count === 1 ? "1 member" : `${count} members`;
}

export function isCirqleGroupInfoRoom(room: Room): boolean {
    return !!networkOf(room) && chatKind(room) !== "chat";
}

function memberSub(member: RoomMember): string {
    const digits = member.userId.match(GHOST)?.[2];
    return digits && /^\d{7,15}$/.test(digits) ? formatPhone(digits) : "";
}

async function removeMember(room: Room, member: RoomMember, client: ReturnType<typeof useMatrixClientContext>): Promise<void> {
    const { finished } = Modal.createDialog(ConfirmUserActionDialog, {
        member,
        action: "Remove",
        title: `Remove ${stripNetworkSuffix(member.name)} from ${stripNetworkSuffix(room.name)}?`,
        askReason: false,
        danger: true,
    });
    const [proceed] = await finished;
    if (!proceed) return;
    try {
        await client.kick(room.roomId, member.userId);
    } catch (e) {
        logger.error("CIRQLE remove member failed", e);
        Modal.createDialog(ErrorDialog, {
            title: "Could not remove",
            description: e instanceof Error ? e.message : String(e),
        });
    }
}

export function CirqleGroupInfo({ room }: { room: Room }): JSX.Element {
    const client = useMatrixClientContext();
    const sdkContext = useContext(SDKContext);
    const inboxes = useCirqleInboxes();
    const roomName = useRoomName(room);
    const members = useRoomMembers(room);
    const kind = chatKind(room);
    const network = networkOf(room);
    const own = inboxesOf(room, inboxes);

    const people = groupPeople(members);
    const me = room.getMember(client.getSafeUserId());
    const canRemove = (m: RoomMember): boolean =>
        !ACCOUNT.test(m.userId) &&
        !!me &&
        room.currentState.hasSufficientPowerLevelFor("kick", me.powerLevel) &&
        me.powerLevel > m.powerLevel;

    const noun = kind === "channel" ? "channel" : "group";
    const sub = [
        `${network === "telegram" ? "Telegram" : "WhatsApp"} ${noun}`,
        membersLabel(people.length),
        own.length ? `from ${own.map((inbox) => inbox.label).join(", ")}` : "",
    ]
        .filter(Boolean)
        .join(" · ");

    return (
        <aside className="cirqle_GroupInfo" aria-labelledby="cirqle_GroupInfo_title">
            <div className="cirqle_GroupInfo_bar">
                <button
                    className="cirqle_iconButton"
                    aria-label="Close group info"
                    onClick={() => sdkContext.rightPanelStore.hide(room.roomId)}
                >
                    <CloseIcon />
                </button>
                <span className="cirqle_GroupInfo_barTitle">{kind === "channel" ? "Channel info" : "Group info"}</span>
            </div>

            <div className="cirqle_GroupInfo_card cirqle_GroupInfo_identity">
                <RoomAvatar room={room} size="96px" />
                <h2 id="cirqle_GroupInfo_title" className="cirqle_GroupInfo_name">
                    {stripNetworkSuffix(roomName)}
                </h2>
                <span className="cirqle_GroupInfo_sub">{sub}</span>
            </div>

            <div className="cirqle_GroupInfo_card">
                <div className="cirqle_GroupInfo_section">{membersLabel(people.length)}</div>
                <button
                    className="cirqle_GroupInfo_row cirqle_GroupInfo_add"
                    onClick={() => dis.dispatch({ action: "view_invite", roomId: room.roomId })}
                >
                    <span className="cirqle_NewChat_actionIcon cirqle_GroupInfo_addIcon">
                        <AddMemberIcon />
                    </span>
                    <span className="cirqle_GroupInfo_addLabel">Add member</span>
                </button>
                {people.map((m) => {
                    const isUs = ACCOUNT.test(m.userId);
                    const ours = inboxes.find((inbox) => inbox.accountName && m.userId.includes(`_${inbox.accountName}:`));
                    const label = isUs ? `${ours?.label ?? stripNetworkSuffix(m.name)} (us)` : stripNetworkSuffix(m.name);
                    const subline = isUs ? (ours?.phone ?? "") : memberSub(m);
                    return (
                        <div key={m.userId} className="cirqle_GroupInfo_row">
                            <MemberAvatar member={m} size="44px" />
                            <span className="cirqle_GroupInfo_text">
                                <span className="cirqle_GroupInfo_memberName">{label}</span>
                                {subline && <span className="cirqle_GroupInfo_memberSub">{subline}</span>}
                            </span>
                            {m.powerLevel >= 100 && !canRemove(m) && <span className="cirqle_GroupInfo_admin">Admin</span>}
                            {canRemove(m) && (
                                <button
                                    className="cirqle_GroupInfo_remove"
                                    aria-label={`Remove ${label}`}
                                    onClick={() => void removeMember(room, m, client)}
                                >
                                    Remove…
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>

            <div className="cirqle_GroupInfo_card">
                <button
                    className="cirqle_GroupInfo_leave"
                    onClick={() => dis.dispatch({ action: "leave_room", room_id: room.roomId })}
                >
                    <LeaveIcon />
                    {kind === "channel" ? "Leave channel…" : "Leave group…"}
                </button>
            </div>
        </aside>
    );
}
