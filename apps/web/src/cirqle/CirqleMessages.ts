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

import { type MatrixClient, type MatrixEvent } from "matrix-js-sdk/src/matrix";
import { ActionBarAction } from "@element-hq/web-shared-components";

import { isCirqleMessenger } from "./CirqleFeatures";

export function cirqleMayDelete(client: MatrixClient, event: MatrixEvent): boolean {
    return !isCirqleMessenger() || event.getSender() === client.getUserId();
}

/** The hover bar without "Reply in thread" and Pin. */
export function cirqleActionBarActions(actions: ActionBarAction[]): ActionBarAction[] {
    if (!isCirqleMessenger()) return actions;
    return actions.filter((action) => action !== ActionBarAction.ReplyInThread && action !== ActionBarAction.Pin);
}
