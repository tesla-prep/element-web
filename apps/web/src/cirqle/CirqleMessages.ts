/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// What staff may do with a message, WhatsApp style. Element's message menu
// also offers threads (the customer gets a plain reply to the thread's last
// message), Share and Copy link (matrix.to links), Report (goes to our Matrix
// server's admins, not to WhatsApp) and View source (whose Edit opens devtools,
// which sends any event to the customer's chat). None of them is offered.
// Delete is "Delete for everyone", for our own messages only: a customer's
// message deleted where our number is a group admin is gone for every member.
// Edit and Delete are offered while the network still takes them, as its
// bridge publishes in the chat (WhatsApp: edit for 15 minutes, delete for
// everyone for 2 days).

import { type MatrixClient, type MatrixEvent } from "matrix-js-sdk/src/matrix";
import { ActionBarAction } from "@element-hq/web-shared-components";

import { isCirqleMessenger } from "./CirqleFeatures";
import { roomFeatures } from "./CirqleDelivery";

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

export function cirqleMayDelete(client: MatrixClient, event: MatrixEvent, now = Date.now()): boolean {
    if (!isCirqleMessenger()) return true;
    if (event.getSender() !== client.getUserId()) return false;
    const room = client.getRoom(event.getRoomId());
    const features = room && roomFeatures(room);
    return !features || allows(features.delete, features.delete_max_age, event, now);
}

/** The hover bar without "Reply in thread" and Pin. */
export function cirqleActionBarActions(actions: ActionBarAction[]): ActionBarAction[] {
    if (!isCirqleMessenger()) return actions;
    return actions.filter((action) => action !== ActionBarAction.ReplyInThread && action !== ActionBarAction.Pin);
}
