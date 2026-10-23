/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// Forward, WhatsApp style: to the chats of the number the message is in (a
// message is never forwarded from one number to another number's customer),
// and only after "Forward to …?".

import { type MatrixClient, type MatrixEvent, type Room } from "matrix-js-sdk/src/matrix";

import Modal from "../Modal";
import QuestionDialog from "../components/views/dialogs/QuestionDialog";
import { isCirqleMessenger } from "./CirqleFeatures";
import { getInboxes, inboxesOf, networkOf, stripNetworkSuffix } from "./CirqleInboxes";

export function isCirqleForwardTarget(client: MatrixClient, event: MatrixEvent, target: Room): boolean {
    if (!isCirqleMessenger()) return true;
    const source = client.getRoom(event.getRoomId());
    if (!source || !networkOf(target)) return false;
    const inboxes = getInboxes(client);
    const numbers = new Set(inboxesOf(source, inboxes).map((inbox) => inbox.spaceId));
    return inboxesOf(target, inboxes).some((inbox) => numbers.has(inbox.spaceId));
}

/** "Forward to Anna? It goes out from slava test." */
export async function confirmCirqleForward(client: MatrixClient, target: Room): Promise<boolean> {
    if (!isCirqleMessenger()) return true;
    const from = inboxesOf(target, getInboxes(client))
        .map((inbox) => inbox.label)
        .join(", ");
    const name = stripNetworkSuffix(target.name);
    const { finished } = Modal.createDialog(QuestionDialog, {
        title: `Forward to ${name}?`,
        description: from ? `The message goes to ${name} from ${from}.` : `The message goes to ${name}.`,
        button: "Forward",
    });
    const [confirmed] = await finished;
    return !!confirmed;
}
