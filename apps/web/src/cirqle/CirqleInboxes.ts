/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// What CIRQLE's chats are, read from the bridges' own room state.
//
// Every connected WhatsApp number or Telegram account ("inbox") has a space the
// bridge made ("personal filtering space", renamed by the relay bot to
// "WhatsApp · Main #1"); its topic ends with the number. A chat belongs to the
// inboxes whose spaces list it as a child.

import { EventType, type MatrixClient, type Room } from "matrix-js-sdk/src/matrix";

import DMRoomMap from "../utils/DMRoomMap";

export type Network = "whatsapp" | "telegram";
export type ChatKind = "chat" | "group" | "channel";

export interface Inbox {
    spaceId: string;
    network: Network;
    /** "Main #1": the space name without the network prefix */
    label: string;
    /** "+1 646 331 3251", when the space topic carries it */
    phone?: string;
    /** "wa-01d17870": the relay bot's name for the inbox, from its account user in the space */
    accountName?: string;
    childIds: Set<string>;
}

const NETWORK_PREFIXES: Record<Network, string> = { whatsapp: "WhatsApp · ", telegram: "Telegram · " };

interface BridgeContent {
    "protocol"?: { id?: string };
    "channel"?: { id?: string };
    "com.beeper.room_type"?: string;
    "com.beeper.room_type.v2"?: string;
}

function bridgeContent(room: Room): BridgeContent | undefined {
    const events = room.currentState.getStateEvents("m.bridge");
    return events[0]?.getContent<BridgeContent>();
}

export function networkOf(room: Room): Network | undefined {
    const id = bridgeContent(room)?.protocol?.id;
    return id === "whatsapp" || id === "telegram" ? id : undefined;
}

/** "+16463313251" as "+1 646 331 3251"; other countries keep their digits in two groups. */
export function formatPhone(raw: string): string {
    const digits = raw.replace(/[^\d]/g, "");
    if (digits.length === 11 && digits.startsWith("1")) {
        return `+1 ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
    }
    if (digits.length === 11 && digits.startsWith("7")) {
        return `+7 ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
    }
    if (digits.length === 12 && digits.startsWith("44")) {
        return `+44 ${digits.slice(2, 6)} ${digits.slice(6)}`;
    }
    return `+${digits}`;
}

export function getInboxes(client: MatrixClient): Inbox[] {
    const inboxes: Inbox[] = [];
    for (const room of client.getRooms()) {
        if (!room.isSpaceRoom() || room.getMyMembership() !== "join") continue;
        const bridge = bridgeContent(room);
        if (bridge?.["com.beeper.room_type.v2"] !== "personal_filtering_space") continue;
        const network = networkOf(room);
        if (!network) continue;
        const prefix = NETWORK_PREFIXES[network];
        const label = room.name.startsWith(prefix) ? room.name.slice(prefix.length) : room.name;
        const topic: string | undefined = room.currentState
            .getStateEvents(EventType.RoomTopic, "")
            ?.getContent()?.topic;
        const phoneMatch = topic?.match(/(\+\d{6,})\s*$/);
        const childIds = new Set(
            room.currentState
                .getStateEvents(EventType.SpaceChild)
                .filter((ev) => Array.isArray(ev.getContent()?.via))
                .map((ev) => ev.getStateKey()!),
        );
        const account = room
            .getJoinedMembers()
            .map((member) => member.userId.match(/^@account_(?:whatsapp|telegram)_([^:]+):/)?.[1])
            .find(Boolean);
        inboxes.push({
            spaceId: room.roomId,
            network,
            label,
            phone: phoneMatch ? formatPhone(phoneMatch[1]) : undefined,
            accountName: account,
            childIds,
        });
    }
    // WhatsApp numbers first, then Telegram accounts, each by name
    return inboxes.sort((a, b) =>
        a.network === b.network ? a.label.localeCompare(b.label) : a.network === "whatsapp" ? -1 : 1,
    );
}

export function inboxesOf(room: Room, inboxes: Inbox[]): Inbox[] {
    return inboxes.filter((inbox) => inbox.childIds.has(room.roomId));
}

export function chatKind(room: Room): ChatKind {
    const bridge = bridgeContent(room);
    if (bridge?.channel?.id?.endsWith("@newsletter")) return "channel";
    if (bridge?.["com.beeper.room_type"] === "dm" || DMRoomMap.shared()?.getUserIdForRoomId(room.roomId)) {
        return "chat";
    }
    // A room where only admins may post is a broadcast channel (Telegram channels)
    const powerLevels = room.currentState.getStateEvents(EventType.RoomPowerLevels, "")?.getContent();
    const eventsDefault = powerLevels?.events_default ?? 0;
    const myLevel = room.getMember(room.myUserId)?.powerLevel ?? 0;
    if (bridge && eventsDefault > 0 && myLevel < eventsDefault) return "channel";
    return "group";
}

/** The line under a chat: "Main #1", "Group · Main #1", "Telegram · School TG". */
export function numberLine(room: Room, inboxes: Inbox[]): { text: string; network?: Network } {
    const own = inboxesOf(room, inboxes);
    const network = own[0]?.network ?? networkOf(room);
    const names = own.map((inbox) => inbox.label).join(", ");
    const kind = chatKind(room);
    const parts: string[] = [];
    if (network === "telegram") parts.push(kind === "chat" ? "Telegram" : `Telegram ${kind}`);
    else if (kind === "group") parts.push("Group");
    else if (kind === "channel") parts.push("Channel");
    if (names) parts.push(names);
    return { text: parts.join(" · "), network };
}

const GHOST_NUMBER = /^@(?:whatsapp|telegram)_(\d{7,15}):/;

/** The customer's number in a private chat, read from the bridge's ghost user or the chat name. */
export function contactNumber(room: Room): string | undefined {
    for (const member of room.getJoinedMembers()) {
        const match = member.userId.match(GHOST_NUMBER);
        if (match) return formatPhone(match[1]);
    }
    const fromName = room.name.match(/\+\d{7,15}/);
    return fromName ? formatPhone(fromName[0]) : undefined;
}

/**
 * A chat's name as staff read it: "Anna (WA)" as "Anna" (the number line already
 * says WhatsApp), "+13026180314" as "+1 302 618 0314".
 */
export function stripNetworkSuffix(name: string): string {
    const bare = name.replace(/\s*\((WA|TG|Telegram)\)$/, "");
    return /^\+\d{7,15}$/.test(bare) ? formatPhone(bare) : bare;
}
