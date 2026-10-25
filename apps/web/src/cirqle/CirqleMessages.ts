/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// What staff may do with a message, WhatsApp style. Element's message menu
// also offers threads (the customer gets a plain reply to the thread's last
// message), Share and Copy link (matrix.to links), Report (goes to our Matrix
// server's admins, not to WhatsApp) and View source (whose Edit opens devtools,
// which sends any event to the customer's chat). None of them is offered.
// Delete, as on WhatsApp: our own message is "Delete for everyone". Someone
// else's (a customer's, a colleague's, what the owner sent from the phone) asks
// "Delete for everyone" or "Delete for me". For everyone only in a group where
// our account administers it and the staff member's power level lets them
// redact: the relay bot raises staff there, and the bridge deletes the message
// as the admin (WhatsApp's admin revoke; Telegram's delete with revoke, where the
// bot raises staff only in groups our account created). For me hides it from
// this staff member alone, in every CIRQLE window (room account data), and
// nobody else is told.
// Edit and Delete for everyone are offered while the network still takes them,
// as its bridge publishes in the chat (WhatsApp: edit for 15 minutes, delete
// for everyone for 2 days).

import { EventType, type MatrixClient, type MatrixEvent, type Room } from "matrix-js-sdk/src/matrix";
import { ActionBarAction } from "@element-hq/web-shared-components";

import { isCirqleMessenger } from "./CirqleFeatures";
import { roomFeatures } from "./CirqleDelivery";
import { chatKind, getInboxes, networkOf } from "./CirqleInboxes";
import { ourAdminNumber } from "./CirqleGroupAdmin";

function allows(level: number | undefined, maxAge: number | undefined, event: MatrixEvent, now: number): boolean {
    if (level !== undefined && level < 1) return false;
    return maxAge === undefined || now - event.getTs() <= maxAge * 1000;
}

export function cirqleCanEdit(client: MatrixClient, event: MatrixEvent, now = Date.now()): boolean {
    if (!isCirqleMessenger()) return true;
    const room = client.getRoom(event.getRoomId());
    const features = room && roomFeatures(room);
    return !features || allows(features.edit, features.edit_max_age, event, now);
}

/**
 * Whether the network takes "Delete for everyone" for this message (the caller
 * checks the Matrix power level): our own within the network's time limit; anyone
 * else's only in a group, within the same limit, and on WhatsApp only where our
 * number is an admin.
 */
export function cirqleMayDelete(client: MatrixClient, event: MatrixEvent, now = Date.now()): boolean {
    if (!isCirqleMessenger()) return true;
    const room = client.getRoom(event.getRoomId());
    const features = room && roomFeatures(room);
    const inTime = !features || allows(features.delete, features.delete_max_age, event, now);
    if (event.getSender() === client.getUserId()) return inTime;
    if (!room || !inTime || chatKind(room) !== "group") return false;
    const network = networkOf(room);
    return network === "telegram" || (network === "whatsapp" && !!ourAdminNumber(room, getInboxes(client)));
}

/** "Delete for me" is for someone else's message in a WhatsApp or Telegram chat; our own is deleted for everyone. */
export function cirqleMayDeleteForMe(client: MatrixClient, event: MatrixEvent): boolean {
    if (!isCirqleMessenger() || event.getSender() === client.getUserId()) return false;
    if (event.isState() || event.isRedacted()) return false;
    const room = client.getRoom(event.getRoomId());
    return !!room && !!networkOf(room);
}

/** Room account data of each staff member: `{ "event_ids": [...] }`, the messages they deleted for themselves. */
export const HIDDEN_EVENTS_TYPE = "com.cirqle.hidden_events";

declare module "matrix-js-sdk/src/types" {
    interface RoomAccountDataEvents {
        [HIDDEN_EVENTS_TYPE]: { event_ids: string[] };
    }
}

/** Kept per chat; the oldest go first, they are long out of sight anyway. */
const HIDDEN_EVENTS_MAX = 500;

function hiddenIds(room: Room | null | undefined): string[] {
    const ids = room?.getAccountData(HIDDEN_EVENTS_TYPE)?.getContent()?.event_ids;
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
}

export function isHiddenForMe(client: MatrixClient | null | undefined, event: MatrixEvent): boolean {
    if (!client || event.getType() === EventType.RoomRedaction) return false;
    const id = event.getId();
    return !!id && hiddenIds(client.getRoom(event.getRoomId())).includes(id);
}

/** "Delete for me": the message disappears from this staff member's timeline in every window. */
export async function hideForMe(client: MatrixClient, event: MatrixEvent): Promise<void> {
    const roomId = event.getRoomId();
    const id = event.getId();
    if (!roomId || !id) return;
    const ids = hiddenIds(client.getRoom(roomId)).filter((hidden) => hidden !== id);
    await client.setRoomAccountData(roomId, HIDDEN_EVENTS_TYPE, { event_ids: [...ids, id].slice(-HIDDEN_EVENTS_MAX) });
}

const CUSTOMER = /^@(whatsapp|telegram)_/;

/**
 * Who @ offers: the people in the chat on WhatsApp or Telegram, not colleagues
 * or service users (a colleague's mention reaches the customer as a bare name)
 * and not our own number.
 */
export function isCirqleMentionable(client: MatrixClient, userId: string): boolean {
    if (!isCirqleMessenger()) return true;
    return CUSTOMER.test(userId) && !getInboxes(client).some((inbox) => inbox.ownUsers.has(userId));
}

/** The hover bar without "Reply in thread" and Pin. */
export function cirqleActionBarActions(actions: ActionBarAction[]): ActionBarAction[] {
    if (!isCirqleMessenger()) return actions;
    return actions.filter((action) => action !== ActionBarAction.ReplyInThread && action !== ActionBarAction.Pin);
}
