/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// Group info's Add member is Element's invite dialog, worded for CIRQLE: it
// offers the contacts of the group's own number (the relay bot's @newchat_
// users, CirqleInviteRefusals), names them as the number does, never by Matrix
// ID, and asks "Add +7 918 188 8877 to CIRQ-21 test?" in place of Element's
// "Invite new contacts to this room?", which warns about Matrix encryption
// identities that bridged contacts never have.

import { type MatrixClient, type Room } from "matrix-js-sdk/src/matrix";

import Modal from "../Modal";
import QuestionDialog from "../components/views/dialogs/QuestionDialog";
import { isCirqleMessenger } from "./CirqleFeatures";
import { formatPhone, getInboxes, inboxesOf, networkOf, type Network, stripNetworkSuffix } from "./CirqleInboxes";
import { splitLabel } from "./CirqleNewChat";

const NEW_CHAT_USER = /^@newchat_(whatsapp|telegram)_/;
/** `@newchat_whatsapp_wa-bba81064_=79181888877:server`: the contact part after the inbox */
const NEW_CHAT_NUMBER = /^@newchat_whatsapp_[^_]+_=(\d{7,15}):/;

interface Person {
    userId: string;
    name: string;
}

/** How a person in the invite dialog is named: the contact's name or number, as New chat names them. */
export function addMemberLabel(person: Person): { name: string; sub: string } | undefined {
    if (!isCirqleMessenger()) return undefined;
    const network = person.userId.match(NEW_CHAT_USER)?.[1] as Network | undefined;
    // Before its profile loads, a typed contact is named by its Matrix ID: its number, or a plain word, instead
    if (network && person.name.startsWith("@")) {
        const number = person.userId.match(NEW_CHAT_NUMBER)?.[1];
        return { name: number ? formatPhone(number) : "this contact", sub: "" };
    }
    if (network) return splitLabel(person.name, network);
    return { name: stripNetworkSuffix(person.name), sub: "" };
}

/** The dialog's title, line under it and button, for a bridged group; undefined keeps Element's. */
export function addMemberTexts(
    client: MatrixClient,
    roomId: string,
): { title: string; help: string; button: string } | undefined {
    const room = client.getRoom(roomId);
    if (!isCirqleMessenger() || !room || !networkOf(room)) return undefined;
    const own = inboxesOf(room, getInboxes(client)).map((inbox) => inbox.label);
    return {
        title: `Add to ${stripNetworkSuffix(room.name)}`,
        help: own.length
            ? `Search a name or number among the contacts of ${own.join(", ")}.`
            : "Search a name or number.",
        button: "Add",
    };
}

/** "Add +7 918 188 8877 to CIRQ-21 test?": true once confirmed. */
export async function confirmAddMember(client: MatrixClient, room: Room, people: Person[]): Promise<boolean> {
    const names = people.map((person) => addMemberLabel(person)?.name ?? person.name);
    const group = stripNetworkSuffix(room.name);
    const network = networkOf(room) === "telegram" ? "Telegram" : "WhatsApp";
    const from = inboxesOf(room, getInboxes(client))
        .map((inbox) => inbox.label)
        .join(", ");
    const { finished } = Modal.createDialog(QuestionDialog, {
        title: `Add ${names.join(", ")} to ${group}?`,
        description: `${from || "Our number"} will add ${names.length === 1 ? "them" : "everyone listed"} to the ${network} group.`,
        button: "Add",
    });
    const [confirmed] = await finished;
    return !!confirmed;
}
