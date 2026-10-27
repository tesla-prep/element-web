/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// Group info side panel (concept artboard GroupInfo), shown for WhatsApp and
// Telegram groups and channels in place of Element's room summary.
//
// Members are the people in the group on WhatsApp or Telegram: the bridge's
// ghost users and our number's own account. Staff and service users are Matrix
// only and are not listed. A member opens their card; where our number is a
// group admin, each member's menu has Make group admin or Dismiss as admin
// (WhatsApp, CirqleGroupAdmin) and Remove, as in WhatsApp. Add member and Remove
// are Element's own invite and remove (kick), which the relay bot and the
// bridges carry out on WhatsApp and Telegram; a channel has subscribers, not
// members, so it has no Add member.
// Leave group… takes the number itself out of a WhatsApp group (decision 5,
// option B, CirqleLeaveGroup); a channel or a Telegram group has no Leave.

import React, { type JSX, useContext } from "react";
import { KnownMembership, type Room, type RoomMember } from "matrix-js-sdk/src/matrix";
import { logger } from "matrix-js-sdk/src/logger";
import { Menu, MenuItem } from "@vector-im/compound-web";

import { useMatrixClientContext } from "../contexts/MatrixClientContext";
import { SDKContext } from "../contexts/SDKContext";
import { useRoomMembers } from "../hooks/useRoomMembers";
import { useRoomName } from "../hooks/useRoomName";
import dis from "../dispatcher/dispatcher";
import { Action } from "../dispatcher/actions";
import Modal from "../Modal";
import QuestionDialog from "../components/views/dialogs/QuestionDialog";
import ErrorDialog from "../components/views/dialogs/ErrorDialog";
import RoomAvatar from "../components/views/avatars/RoomAvatar";
import MemberAvatar from "../components/views/avatars/MemberAvatar";
import { AddMemberIcon, ChevronDownIcon, CloseIcon, LeaveIcon } from "./CirqleIcons";
import {
    chatKind,
    ghostPhone,
    type Inbox,
    inboxesOf,
    memberName,
    networkOf,
    stripNetworkSuffix,
} from "./CirqleInboxes";
import { CirqleChatActions } from "./CirqleContactInfo";
import { ACCOUNT } from "./CirqleMemberCard";
import { useCirqleInboxes } from "./useCirqleChats";
import { canLeaveCirqleGroup, leaveCirqleGroup } from "./CirqleLeaveGroup";
import { canChangeGroupAdmin, isGroupAdmin, ourAdminNumber, setGroupAdmin } from "./CirqleGroupAdmin";

const GHOST = /^@(whatsapp|telegram)_([^:]+):/;

/**
 * The people in the group on WhatsApp or Telegram: ghosts and our accounts, not
 * staff. Our number's own ghost (what its phone sends as) is the same person as
 * its account, listed once as "(us)".
 */
export function groupPeople(members: RoomMember[], inboxes: Inbox[] = []): RoomMember[] {
    return members
        .filter((m) => m.membership === KnownMembership.Join && (GHOST.test(m.userId) || ACCOUNT.test(m.userId)))
        .filter((m) => !inboxes.some((inbox) => inbox.ownUsers.has(m.userId)))
        .sort(
            (a, b) =>
                Number(ACCOUNT.test(b.userId)) - Number(ACCOUNT.test(a.userId)) ||
                memberName(a).localeCompare(memberName(b)),
        );
}

/** A member's number under their name, unless they are saved by that number only and named by it already. */
export function memberSubline(label: string, phone: string | undefined): string | undefined {
    return phone && phone.replace(/\D/g, "") !== label.replace(/\D/g, "") ? phone : undefined;
}

/** "1 member", "3 members" */
export function membersLabel(count: number): string {
    return count === 1 ? "1 member" : `${count} members`;
}

/** Bridged groups and channels get this panel, private chats get Contact info. */
export function isCirqleGroupInfoRoom(room: Room): boolean {
    return !!networkOf(room) && chatKind(room) !== "chat";
}

async function removeMember(
    room: Room,
    member: RoomMember,
    client: ReturnType<typeof useMatrixClientContext>,
): Promise<void> {
    const name = stripNetworkSuffix(memberName(member));
    const group = stripNetworkSuffix(room.name);
    const { finished } = Modal.createDialog(QuestionDialog, {
        title: `Remove ${name} from ${group}?`,
        description: `${name} will be removed from “${group}” on ${networkOf(room) === "telegram" ? "Telegram" : "WhatsApp"}.`,
        button: "Remove",
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

    const people = groupPeople(members, inboxes);
    const me = room.getMember(client.getSafeUserId());
    // Like WhatsApp: only a group admin removes people, so only where our number is one
    const adminNumber = ourAdminNumber(room, inboxes);
    const canRemove = (m: RoomMember): boolean =>
        !!adminNumber &&
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
                    type="button"
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

            <CirqleChatActions room={room} />

            <div className="cirqle_GroupInfo_card">
                <div className="cirqle_GroupInfo_section">{membersLabel(people.length)}</div>
                {kind !== "channel" && (
                    <button
                        type="button"
                        className="cirqle_GroupInfo_row cirqle_GroupInfo_add"
                        onClick={() => dis.dispatch({ action: "view_invite", roomId: room.roomId })}
                    >
                        <span className="cirqle_NewChat_actionIcon cirqle_GroupInfo_addIcon">
                            <AddMemberIcon />
                        </span>
                        <span className="cirqle_GroupInfo_addLabel">Add member</span>
                    </button>
                )}
                {people.map((m) => (
                    <MemberRow
                        key={m.userId}
                        room={room}
                        member={m}
                        inboxes={inboxes}
                        canRemove={canRemove(m)}
                        onRemove={() => void removeMember(room, m, client)}
                        onAdmin={(admin) => void setGroupAdmin(client, room, m, admin)}
                    />
                ))}
            </div>

            {canLeaveCirqleGroup(room) && (
                <div className="cirqle_GroupInfo_card">
                    <button
                        type="button"
                        className="cirqle_GroupInfo_leave"
                        onClick={() => void leaveCirqleGroup(client, room, own)}
                    >
                        <LeaveIcon />
                        Leave group…
                    </button>
                </div>
            )}
        </aside>
    );
}

function MemberRow({
    room,
    member,
    inboxes,
    canRemove,
    onRemove,
    onAdmin,
}: {
    room: Room;
    member: RoomMember;
    inboxes: Inbox[];
    canRemove: boolean;
    onRemove: () => void;
    onAdmin: (admin: boolean) => void;
}): JSX.Element {
    const [menuOpen, setMenuOpen] = React.useState(false);
    const isUs = ACCOUNT.test(member.userId);
    const ours = inboxes.find((inbox) => inbox.accountName && member.userId.includes(`_${inbox.accountName}:`));
    const name = stripNetworkSuffix(memberName(member));
    const label = isUs ? `${ours?.label ?? name} (us)` : name;
    const subline = memberSubline(label, isUs ? ours?.phone : ghostPhone(member.userId, inboxes));
    const admin = isGroupAdmin(member);
    const changeAdmin = canChangeGroupAdmin(room, member, inboxes);

    return (
        <div className="cirqle_GroupInfo_row cirqle_GroupInfo_member">
            <button
                type="button"
                className="cirqle_GroupInfo_memberOpen"
                onClick={() => dis.dispatch({ action: Action.ViewUser, member })}
            >
                <MemberAvatar member={member} size="44px" />
                <span className="cirqle_GroupInfo_text">
                    <span className="cirqle_GroupInfo_memberName">{label}</span>
                    {subline && <span className="cirqle_GroupInfo_memberSub">{subline}</span>}
                </span>
                {admin && <span className="cirqle_GroupInfo_admin">Group admin</span>}
            </button>
            {(changeAdmin || canRemove) && (
                <Menu
                    open={menuOpen}
                    onOpenChange={setMenuOpen}
                    title={label}
                    side="bottom"
                    align="end"
                    trigger={
                        <button
                            type="button"
                            className="cirqle_iconButton cirqle_GroupInfo_memberMenu"
                            aria-label={`Options for ${label}`}
                        >
                            <ChevronDownIcon />
                        </button>
                    }
                >
                    {changeAdmin && (
                        <MenuItem
                            label={admin ? "Dismiss as admin" : "Make group admin"}
                            onSelect={() => onAdmin(!admin)}
                        />
                    )}
                    {canRemove && <MenuItem label="Remove" kind="critical" onSelect={onRemove} />}
                </Menu>
            )}
        </div>
    );
}
