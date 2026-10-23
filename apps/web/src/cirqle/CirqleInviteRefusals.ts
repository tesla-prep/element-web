/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// Add member: staff invite the relay bot's @newchat_ user of a contact into a
// group, the bot has the number add the real contact, and the @newchat_ user
// leaves. When WhatsApp or Telegram would not take the contact, the bot gives
// the reason in that leave (it posts nothing in the chat, which would reach
// the customers). Room state is hidden in CIRQLE, so the refusal is shown here
// to whoever invited.

import { type MatrixClient, type MatrixEvent, type RoomMember, RoomMemberEvent } from "matrix-js-sdk/src/matrix";

import Modal from "../Modal";
import ErrorDialog from "../components/views/dialogs/ErrorDialog";
import { isCirqleMessenger } from "./CirqleFeatures";
import { networkOf, stripNetworkSuffix } from "./CirqleInboxes";

const NEW_CHAT_USER = /^@newchat_/;
/** Older invites and leaves arrive again with the first sync after a reload. */
const RECENT_MS = 2 * 60 * 1000;

/** The relay bot's reason, in English: "+7918… не найден" (not found) or "не получилось" (did not work). */
export function refusalText(reason: string, network: string): string {
    const notFound = reason.match(/^(.+?)\s+не найден/);
    if (notFound) return `${notFound[1]} is not on ${network}.`;
    if (reason.startsWith("не получилось")) return `${network} did not accept it.`;
    return reason;
}

/** "Anna Petrova, +7918… · slava test" is "Anna Petrova, +7918…" */
function contactName(member: RoomMember): string {
    return member.name.replace(/\s·\s[^·]+$/, "");
}

/** Starts watching; returns the function that stops. */
export function watchCirqleInviteRefusals(client: MatrixClient): () => void {
    const invited = new Set<string>();
    const onMembership = (event: MatrixEvent, member: RoomMember, oldMembership?: string): void => {
        if (!isCirqleMessenger() || !NEW_CHAT_USER.test(member.userId)) return;
        if (Date.now() - event.getTs() > RECENT_MS) return;
        const key = `${member.roomId}|${member.userId}`;
        if (member.membership === "invite" && event.getSender() === client.getUserId()) {
            invited.add(key);
            return;
        }
        if (member.membership !== "leave" || oldMembership !== "invite" || !invited.delete(key)) return;
        const reason = event.getContent().reason;
        if (typeof reason !== "string" || !reason) return;
        const room = client.getRoom(member.roomId);
        const network = room && networkOf(room) === "telegram" ? "Telegram" : "WhatsApp";
        Modal.createDialog(ErrorDialog, {
            title: `Couldn't add ${contactName(member)}${room ? ` to ${stripNetworkSuffix(room.name)}` : ""}`,
            description: refusalText(reason, network),
        });
    };
    client.on(RoomMemberEvent.Membership, onMembership);
    return () => {
        client.off(RoomMemberEvent.Membership, onMembership);
    };
}
