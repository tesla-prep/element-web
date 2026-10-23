/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// Which side of a WhatsApp-style chat a message sits on. Staff answer each chat
// under their own Matrix login and the relay bot sends it out from the number,
// so everything staff (or the number's own account) write is "ours", on the
// right with the staff member's name; customers' messages come from the
// bridges' ghost users and sit on the left.
//
// What the owner sends from the phone itself also comes from a ghost: the
// number's own one (`@whatsapp_lid-…` or `@whatsapp_<number>`). That is ours
// too. In a private chat everything but the customer's ghost is the number
// writing, including a number's older identity after WhatsApp's change of
// number; in a group the number's own ghosts are listed in its inbox space.

import { EventType, type MatrixClient, type MatrixEvent } from "matrix-js-sdk/src/matrix";

import { chatKind, getInboxes, privateChatContact } from "./CirqleInboxes";

const BRIDGE_USER = /^@(whatsapp|telegram)(bot)?(_|:)/;
const BRIDGE_BOT = /^@(whatsapp|telegram)bot:/;

export function isOurSide(event: MatrixEvent, client: MatrixClient): boolean {
    const sender = event.getSender();
    if (!sender) return false;
    if (sender === client.getUserId()) return true;
    if (!BRIDGE_USER.test(sender)) return true;
    if (BRIDGE_BOT.test(sender)) return false;
    const room = client.getRoom(event.getRoomId());
    const contact = room ? privateChatContact(room) : undefined;
    if (contact && sender !== contact) return true;
    return getInboxes(client).some((inbox) => inbox.ownUsers.has(sender));
}

/** In a private chat the customer's name is the chat's name, so their bubbles go without it, as on WhatsApp. */
export function hideCustomerName(event: MatrixEvent, client: MatrixClient): boolean {
    if (isOurSide(event, client)) return false;
    const room = client.getRoom(event.getRoomId());
    return !!room && chatKind(room) === "chat";
}

/**
 * Room state changes (joins, names, avatars, power levels) are the bridges' and
 * the relay bot's plumbing: staff and service users join every chat. WhatsApp
 * shows none of it. A tombstone stays, it points to the chat that continues.
 */
export function isPlumbingEvent(event: MatrixEvent): boolean {
    return event.isState() && event.getType() !== EventType.RoomTombstone;
}
