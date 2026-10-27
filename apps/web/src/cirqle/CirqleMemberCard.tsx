/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// The card that opens on someone in a chat (a sender's avatar, a mention,
// /whois, the avatar in the image viewer, a link to a user), in place of
// Element's user info. Element's offers Ignore, Remove, Mute, power levels and
// "Remove recent messages", which deletes someone's messages for everyone: none
// of that is WhatsApp's or safe for staff, so the card only says who this is.
//
// Its one button, Message, opens the customer's own private chat with the number
// this chat is on. When there is none the button is not shown: a new chat starts
// from New chat, where the number to write from is picked explicitly.

import React, { type JSX } from "react";
import { KnownMembership, type MatrixClient, type Room, RoomMember, type User } from "matrix-js-sdk/src/matrix";

import { useMatrixClientContext } from "../contexts/MatrixClientContext";
import dis from "../dispatcher/dispatcher";
import { Action } from "../dispatcher/actions";
import { type ViewRoomPayload } from "../dispatcher/payloads/ViewRoomPayload";
import MemberAvatar from "../components/views/avatars/MemberAvatar";
import RightPanelStore from "../stores/right-panel/RightPanelStore";
import { BackIcon, CloseIcon } from "./CirqleIcons";
import { ghostPhone, type Inbox, inboxesOf, memberName, privateChatContact, stripNetworkSuffix } from "./CirqleInboxes";
import { useCirqleInboxes } from "./useCirqleChats";

const GHOST = /^@(whatsapp|telegram)_/;
export const ACCOUNT = /^@account_(whatsapp|telegram)_/;
const SERVICE = /^@(relay-bot|learning-center|whatsappbot|telegrambot|newchat_[^:]*):/;

export interface MemberCardInfo {
    kind: "us" | "customer" | "colleague" | "service";
    name: string;
    sub?: string;
}

/** Who someone in a chat is, as the card says it. */
export function describeMember(
    userId: string,
    displayName: string,
    inboxes: Inbox[],
    myUserId: string,
): MemberCardInfo {
    const name = stripNetworkSuffix(displayName);
    const ours = inboxes.find(
        (inbox) => inbox.ownUsers.has(userId) || (!!inbox.accountName && userId.includes(`_${inbox.accountName}:`)),
    );
    if (ours || ACCOUNT.test(userId)) return { kind: "us", name: `${ours?.label ?? name} (us)`, sub: ours?.phone };
    if (SERVICE.test(userId)) return { kind: "service", name, sub: "Service account" };
    if (GHOST.test(userId)) {
        const phone = ghostPhone(userId, inboxes);
        const network = userId.startsWith("@telegram_") ? "Telegram" : "WhatsApp";
        return { kind: "customer", name, sub: phone && phone !== name ? phone : network };
    }
    if (userId === myUserId) return { kind: "colleague", name, sub: "You" };
    return { kind: "colleague", name, sub: `Colleague · ${userId.slice(1).split(":")[0]}` };
}

/**
 * The customer's private chat with the number `room` is on (with any of ours
 * when `room` is on none), other than `room` itself.
 */
export function customerChat(userId: string, client: MatrixClient, inboxes: Inbox[], room?: Room): Room | undefined {
    const own = room ? inboxesOf(room, inboxes) : [];
    for (const inbox of own.length ? own : inboxes) {
        for (const id of inbox.childIds) {
            const chat = id === room?.roomId ? null : client.getRoom(id);
            if (chat?.getMyMembership() === KnownMembership.Join && privateChatContact(chat) === userId) return chat;
        }
    }
    return undefined;
}

export function CirqleMemberCard({
    member,
    room,
    onClose,
}: {
    member: RoomMember | User;
    room?: Room;
    onClose: () => void;
}): JSX.Element {
    const client = useMatrixClientContext();
    const inboxes = useCirqleInboxes();
    const roomMember = member instanceof RoomMember ? member : (room?.getMember(member.userId) ?? null);
    const displayName = roomMember ? memberName(roomMember) : ((member as User).displayName ?? member.userId);
    const info = describeMember(member.userId, displayName, inboxes, client.getSafeUserId());
    const chat = info.kind === "customer" ? customerChat(member.userId, client, inboxes, room) : undefined;
    // Opened from Group info: back to the member list, as WhatsApp does, not out of the panel
    const rightPanel = RightPanelStore.instance;
    const back = !!room && rightPanel.previousCard.phase !== null;

    return (
        <aside className="cirqle_GroupInfo" aria-labelledby="cirqle_MemberCard_title">
            <div className="cirqle_GroupInfo_bar">
                {back ? (
                    <button
                        type="button"
                        className="cirqle_iconButton"
                        aria-label="Back"
                        onClick={() => rightPanel.popCard(room.roomId)}
                    >
                        <BackIcon />
                    </button>
                ) : (
                    <button
                        type="button"
                        className="cirqle_iconButton"
                        aria-label="Close contact info"
                        onClick={onClose}
                    >
                        <CloseIcon />
                    </button>
                )}
                <span className="cirqle_GroupInfo_barTitle">Contact info</span>
            </div>

            <div className="cirqle_GroupInfo_card cirqle_GroupInfo_identity">
                <MemberAvatar member={roomMember} fallbackUserId={member.userId} size="96px" />
                <h2 id="cirqle_MemberCard_title" className="cirqle_GroupInfo_name">
                    {info.name}
                </h2>
                {info.sub && <span className="cirqle_GroupInfo_sub">{info.sub}</span>}
                {chat && (
                    <button
                        type="button"
                        className="cirqle_GroupInfo_message"
                        onClick={() =>
                            dis.dispatch<ViewRoomPayload>({
                                action: Action.ViewRoom,
                                room_id: chat.roomId,
                                metricsTrigger: undefined,
                            })
                        }
                    >
                        Message
                    </button>
                )}
            </div>
        </aside>
    );
}
