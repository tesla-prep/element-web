/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// The customer's number beside their name over a bubble in a group, as WhatsApp
// shows it for someone the phone has no contact for ("~Nellie +1 754 802 1097").
// Staff, our number's own ghosts and Telegram users carry none; a name that is
// the number already does not repeat it. Private chats show no name at all.

import { MatrixClientPeg } from "../MatrixClientPeg";
import { chatKind, getInboxes, ghostPhone } from "./CirqleInboxes";

export function cirqleSenderPhone(userId: string, roomId: string, name: string): string | undefined {
    const client = MatrixClientPeg.get();
    const room = client?.getRoom(roomId);
    if (!client || !room || chatKind(room) === "chat") return undefined;
    const inboxes = getInboxes(client);
    if (inboxes.some((inbox) => inbox.ownUsers.has(userId))) return undefined;
    const phone = ghostPhone(userId, inboxes);
    if (!phone || name.replace(/\D/g, "").includes(phone.replace(/\D/g, ""))) return undefined;
    return phone;
}
