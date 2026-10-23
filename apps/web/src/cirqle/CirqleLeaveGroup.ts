/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// Leave group (decision 5, option B): the number itself leaves the WhatsApp
// group, for everyone at CIRQLE. Element's own leave would only take the staff
// member out of the Matrix room, and the relay bot puts them back. The relay
// bot does it (POST /_matrix/client/unstable/com.cirqle/leave_group, up to a
// minute); the bridge then closes the chat for everyone. Its refusals come in
// English and are shown as they are.

import { type MatrixClient, MatrixError, Method, type Room } from "matrix-js-sdk/src/matrix";
import { logger } from "matrix-js-sdk/src/logger";

import Modal from "../Modal";
import QuestionDialog from "../components/views/dialogs/QuestionDialog";
import ErrorDialog from "../components/views/dialogs/ErrorDialog";
import Spinner from "../components/views/elements/Spinner";
import dis from "../dispatcher/dispatcher";
import { Action } from "../dispatcher/actions";
import { chatKind, type Inbox, networkOf, stripNetworkSuffix } from "./CirqleInboxes";

/** The relay bot waits up to a minute for the bridge. */
const LEAVE_TIMEOUT_MS = 90 * 1000;

/** Only a WhatsApp group can be left from CIRQLE: not a channel, not Telegram. */
export function canLeaveCirqleGroup(room: Room): boolean {
    return networkOf(room) === "whatsapp" && chatKind(room) === "group";
}

export async function leaveCirqleGroup(client: MatrixClient, room: Room, own: Inbox[]): Promise<void> {
    const group = stripNetworkSuffix(room.name);
    const number = own.map((inbox) => [inbox.label, inbox.phone].filter(Boolean).join(" ")).join(", ") || "Our number";
    const { finished } = Modal.createDialog(QuestionDialog, {
        title: `Leave ${group}?`,
        description: `${number} will leave “${group}” on WhatsApp, for everyone at CIRQLE. The chat stays on the phone.`,
        button: "Leave group",
        danger: true,
    });
    const [confirmed] = await finished;
    if (!confirmed) return;
    const spinner = Modal.createDialog(Spinner, undefined, "mx_Dialog_spinner");
    try {
        await client.http.authedRequest(
            Method.Post,
            "/com.cirqle/leave_group",
            undefined,
            { room_id: room.roomId },
            { prefix: "/_matrix/client/unstable", localTimeoutMs: LEAVE_TIMEOUT_MS },
        );
        dis.fire(Action.ViewHomePage);
    } catch (e) {
        logger.error("CIRQLE leave group failed", e);
        Modal.createDialog(ErrorDialog, {
            title: "Couldn't leave the group",
            description:
                e instanceof MatrixError && e.data.error ? e.data.error : e instanceof Error ? e.message : String(e),
        });
    } finally {
        spinner.close();
    }
}
