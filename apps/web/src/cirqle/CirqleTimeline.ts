/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// Which side of a WhatsApp-style chat a message sits on. Staff answer each chat
// under their own Matrix login and the relay bot sends it out from the number,
// so everything staff (or the number's own account) write is "ours", on the
// right with the staff member's name; customers' messages come from the
// bridges' ghost users and sit on the left.

import { type MatrixClient, type MatrixEvent } from "matrix-js-sdk/src/matrix";

import { chatKind } from "./CirqleInboxes";

const BRIDGE_USER = /^@(whatsapp|telegram)(bot)?(_|:)/;

export function isOurSide(event: MatrixEvent, client: MatrixClient): boolean {
    const sender = event.getSender();
    if (!sender) return false;
    if (sender === client.getUserId()) return true;
    return !BRIDGE_USER.test(sender);
}

/** In a private chat the customer's name is the chat's name, so their bubbles go without it, as on WhatsApp. */
export function hideCustomerName(event: MatrixEvent, client: MatrixClient): boolean {
    if (isOurSide(event, client)) return false;
    const room = client.getRoom(event.getRoomId());
    return !!room && chatKind(room) === "chat";
}
