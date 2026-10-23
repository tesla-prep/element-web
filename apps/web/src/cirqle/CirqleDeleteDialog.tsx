/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// "Delete for everyone?" in place of Element's "Confirm Removal" with a reason
// field: the reason reaches nobody on WhatsApp or Telegram.

import React, { type JSX } from "react";
import { type MatrixEvent } from "matrix-js-sdk/src/matrix";

import QuestionDialog from "../components/views/dialogs/QuestionDialog";
import { MatrixClientPeg } from "../MatrixClientPeg";
import { networkOf } from "./CirqleInboxes";

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
