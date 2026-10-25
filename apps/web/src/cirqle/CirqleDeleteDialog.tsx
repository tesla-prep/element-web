/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// "Delete for everyone?" in place of Element's "Confirm Removal" with a reason
// field: the reason reaches nobody on WhatsApp or Telegram. Someone else's
// message gets WhatsApp's "Delete message from Anna?" with Delete for everyone
// (where our number is a group admin) and Delete for me.

import React, { type JSX } from "react";
import { type MatrixClient, type MatrixEvent } from "matrix-js-sdk/src/matrix";
import { logger } from "matrix-js-sdk/src/logger";

import QuestionDialog from "../components/views/dialogs/QuestionDialog";
import BaseDialog from "../components/views/dialogs/BaseDialog";
import ErrorDialog from "../components/views/dialogs/ErrorDialog";
import Modal from "../Modal";
import { MatrixClientPeg } from "../MatrixClientPeg";
import { memberName, networkOf, stripNetworkSuffix } from "./CirqleInboxes";
import { hideForMe } from "./CirqleMessages";

interface Props {
    event: MatrixEvent;
    onFinished: (success?: boolean) => void;
}

export function CirqleDeleteDialog({ event, onFinished }: Props): JSX.Element {
    const room = MatrixClientPeg.get()?.getRoom(event.getRoomId());
    const network = room && networkOf(room);
    const where = network === "telegram" ? "Telegram" : network === "whatsapp" ? "WhatsApp" : "";
    return (
        <QuestionDialog
            title="Delete for everyone?"
            description={
                where
                    ? `The message will be deleted on ${where} for everyone in this chat.`
                    : "The message will be deleted for everyone in this chat."
            }
            button="Delete for everyone"
            danger
            onFinished={(confirmed) => onFinished(!!confirmed)}
        />
    );
}

type Choice = "everyone" | "me";

interface OthersProps {
    sender: string;
    network: string;
    everyone: boolean;
    onFinished: (choice?: Choice) => void;
}

export function CirqleDeleteOthersDialog({ sender, network, everyone, onFinished }: OthersProps): JSX.Element {
    return (
        <BaseDialog
            className="cirqle_DeleteDialog"
            title={`Delete message from ${sender}?`}
            onFinished={() => onFinished()}
            fixedWidth={false}
        >
            <p className="cirqle_DeleteDialog_text">
                {everyone
                    ? `Delete for everyone removes it on ${network} for the whole group and for everyone at CIRQLE. Delete for me hides it only from you.`
                    : `It will be hidden only from you. ${sender} and everyone else still see it.`}
            </p>
            <div className="cirqle_DeleteDialog_buttons">
                {everyone && (
                    <button type="button" className="cirqle_DeleteDialog_button" onClick={() => onFinished("everyone")}>
                        Delete for everyone
                    </button>
                )}
                <button type="button" className="cirqle_DeleteDialog_button" onClick={() => onFinished("me")}>
                    Delete for me
                </button>
                <button
                    type="button"
                    className="cirqle_DeleteDialog_button cirqle_DeleteDialog_cancel"
                    onClick={() => onFinished()}
                >
                    Cancel
                </button>
            </div>
        </BaseDialog>
    );
}

/** Someone else's message: asks, then deletes it for everyone (a redaction) or hides it for this staff member. */
export function deleteSomeoneElsesMessage(client: MatrixClient, event: MatrixEvent, everyone: boolean): void {
    const room = client.getRoom(event.getRoomId());
    const senderId = event.getSender() ?? "";
    const member = room?.getMember(senderId) ?? event.sender;
    const name = member ? memberName(member) : senderId;
    const { finished } = Modal.createDialog(CirqleDeleteOthersDialog, {
        sender: stripNetworkSuffix(name),
        network: room && networkOf(room) === "telegram" ? "Telegram" : "WhatsApp",
        everyone,
    });
    void finished.then(async ([choice]) => {
        try {
            if (choice === "everyone") await client.redactEvent(event.getRoomId()!, event.getId()!);
            if (choice === "me") await hideForMe(client, event);
        } catch (e) {
            logger.error("CIRQLE delete failed", e);
            Modal.createDialog(ErrorDialog, {
                title: "Couldn't delete the message",
                description: e instanceof Error ? e.message : String(e),
            });
        }
    });
}
