/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// What CIRQLE's chats are, read from the bridges' own room state.
//
// Every connected WhatsApp number or Telegram account ("inbox") has a space the
// bridge made ("personal filtering space", renamed by the relay bot to
// "WhatsApp · Main #1"); its topic ends with the number. A chat belongs to the
// inboxes whose spaces list it as a child, or list the WhatsApp community it is in,
// and a group to every inbox whose account is in it: the bridge lists a
// community's groups only under the community, which a number that is in a
// group but not in the community itself (its announcements, "CIRQLE | Frisco")
// never gets.

import { EventType, type MatrixClient, type Room, type RoomMember } from "matrix-js-sdk/src/matrix";

import DMRoomMap from "../utils/DMRoomMap";
import { isLocalRoom } from "../utils/localRoom/isLocalRoom";

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
    /** "@account_whatsapp_wa-01d17870:server": the account user, a member of every chat of the number */
    accountUserId?: string;
    childIds: Set<string>;
    /** False once the relay bot says the number's bridge login is gone (no phone behind it) */
    connected: boolean;
    /** Private chats' numbers WhatsApp only gives the bridge as LIDs, by the chat's bridge id ("2385…@lid") */
    contactPhones: Map<string, string>;
    /**
     * The bridge's users that are this number or account itself: what its owner
     * sends from the phone reaches Matrix from them. The bridge's ghost of the
     * number, plus the ones the relay bot lists in the space (a WhatsApp number
     * also writes as `@whatsapp_lid-…`, which nothing else here reveals).
     */
    ownUsers: Set<string>;
}

/** Space state the relay bot keeps: `{ "user_ids": [...] }`, the number's own bridge users. */
export const NUMBER_USERS_EVENT = "com.cirqle.team_messenger.number_users";

/**
 * Space state the relay bot keeps: `{ "connected": false, "number": "+16463313251", "state": "BAD_CREDENTIALS" }`.
 * `connected` turns false once WhatsApp or Telegram ended the session (not on a short drop).
 */
export const INBOX_STATE_EVENT = "com.cirqle.team_messenger.inbox";

/**
 * Space state the relay bot keeps: `{ "phones": { "2385…@lid": "+79161234567" } }`, the
 * customer's number for private chats WhatsApp names by LID. Any state key: the bot may split it.
 */
export const CONTACT_PHONES_EVENT = "com.cirqle.team_messenger.contact_phones";

const NETWORK_PREFIXES: Record<Network, string> = { whatsapp: "WhatsApp · ", telegram: "Telegram · " };

interface BridgeContent {
    "bridgebot"?: string;
    "protocol"?: { id?: string };
    "channel"?: { "id"?: string; "fi.mau.receiver"?: string };
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

/** WhatsApp's Status updates reach Matrix as a chat with the bridge id `status@broadcast`; they are not one. */
export function isStatusBroadcast(room: Room): boolean {
    return bridgeContent(room)?.channel?.id === "status@broadcast";
}

function listedChildren(space: Room): string[] {
    return space.currentState
        .getStateEvents(EventType.SpaceChild)
        .filter((ev) => Array.isArray(ev.getContent()?.via))
        .map((ev) => ev.getStateKey()!);
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
        // A WhatsApp community the number is in is a space inside the number's space;
        // the bridge lists the community's groups only there
        const childIds = new Set<string>();
        const spaces = [room];
        for (let space = spaces.pop(); space; space = spaces.pop()) {
            for (const id of listedChildren(space)) {
                if (childIds.has(id)) continue;
                childIds.add(id);
                const child = client.getRoom(id);
                if (child && bridgeContent(child)?.["com.beeper.room_type.v2"] === "space") spaces.push(child);
            }
        }
        const contactPhones = new Map<string, string>();
        for (const ev of room.currentState.getStateEvents(CONTACT_PHONES_EVENT)) {
            const phones = ev.getContent()?.phones;
            if (!phones || typeof phones !== "object") continue;
            for (const [id, phone] of Object.entries(phones)) {
                if (typeof phone === "string") contactPhones.set(id, phone);
            }
        }
        const accountUserId = room
            .getJoinedMembers()
            .map((member) => member.userId)
            .find((userId) => ACCOUNT_USER.test(userId));
        const receiver = bridge.channel?.["fi.mau.receiver"];
        const listed = room.currentState.getStateEvents(NUMBER_USERS_EVENT, "")?.getContent()?.user_ids;
        const ownUsers = new Set<string>(Array.isArray(listed) ? listed.filter((id) => typeof id === "string") : []);
        const server = bridge.bridgebot?.split(":").slice(1).join(":");
        if (receiver && server) ownUsers.add(`@${network}_${receiver}:${server}`);
        inboxes.push({
            spaceId: room.roomId,
            network,
            label,
            phone: phoneMatch ? formatPhone(phoneMatch[1]) : undefined,
            accountName: accountUserId?.match(ACCOUNT_USER)?.[1],
            accountUserId,
            childIds,
            connected: room.currentState.getStateEvents(INBOX_STATE_EVENT, "")?.getContent()?.connected !== false,
            contactPhones,
            ownUsers,
        });
    }
    addGroupsOfAccounts(client, inboxes);
    // WhatsApp numbers first, then Telegram accounts, each by name
    return inboxes.sort((a, b) =>
        a.network === b.network ? a.label.localeCompare(b.label) : a.network === "whatsapp" ? -1 : 1,
    );
}

/**
 * The customer's bridge user in a private chat, from the chat's own bridge
 * state: WhatsApp's "5000…@lid" is `@whatsapp_lid-5000…`, "1555…@s.whatsapp.net"
 * is `@whatsapp_1555…`, Telegram's "user:4830…" is `@telegram_4830…`.
 */
export function privateChatContact(room: Room): string | undefined {
    const bridge = bridgeContent(room);
    const network = networkOf(room);
    const id = bridge?.channel?.id;
    const server = bridge?.bridgebot?.split(":").slice(1).join(":");
    if (bridge?.["com.beeper.room_type"] !== "dm" || !network || !id || !server) return undefined;
    const lid = id.match(/^(\d+)@lid$/)?.[1];
    const ghost =
        network === "telegram"
            ? id.match(/^user:(\d+)$/)?.[1]
            : lid
              ? `lid-${lid}`
              : id.match(/^(\d+)@s\.whatsapp\.net$/)?.[1];
    return ghost ? `@${network}_${ghost}:${server}` : undefined;
}

const ACCOUNT_USER = /^@account_(?:whatsapp|telegram)_([^:]+):/;

/** Every bridged group a number's account is in is that number's, listed under its community or not. */
function addGroupsOfAccounts(client: MatrixClient, inboxes: Inbox[]): void {
    const accounts = inboxes.filter((inbox) => inbox.accountUserId);
    if (!accounts.length) return;
    for (const room of client.getRooms()) {
        if (room.isSpaceRoom() || room.getMyMembership() !== "join") continue;
        const bridge = bridgeContent(room);
        const network = networkOf(room);
        if (!bridge || !network || bridge["com.beeper.room_type"] === "dm") continue;
        for (const inbox of accounts) {
            if (inbox.network !== network || inbox.childIds.has(room.roomId)) continue;
            if (room.getMember(inbox.accountUserId!)?.membership === "join") inbox.childIds.add(room.roomId);
        }
    }
}

export function inboxesOf(room: Room, inboxes: Inbox[]): Inbox[] {
    return inboxes.filter((inbox) => inbox.childIds.has(room.roomId));
}

/**
 * The chats the picked numbers show: only their own. None picked is All numbers:
 * every connected number's chats, and the chats no number lists. WhatsApp's
 * Status never shows.
 */
export function numberChats(rooms: Room[], inboxes: Inbox[], picked: Inbox[]): Room[] {
    return rooms.filter((room) => {
        if (isStatusBroadcast(room)) return false;
        if (picked.length) return picked.some((inbox) => inbox.childIds.has(room.roomId));
        const own = inboxesOf(room, inboxes);
        return own.length === 0 || own.some((inbox) => inbox.connected);
    });
}

export function chatKind(room: Room): ChatKind {
    // New chat opens a local room until the first message: always a private chat
    if (isLocalRoom(room)) return "chat";
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

/**
 * The customer's number in a private chat: from the bridge's id for the chat when
 * WhatsApp gave the number, else from the relay bot's list for LID chats.
 */
export function contactPhone(room: Room, inboxes: Inbox[]): string | undefined {
    const id = bridgeContent(room)?.channel?.id;
    if (!id || chatKind(room) !== "chat") return undefined;
    const number =
        id.match(/^(\d{7,15})@s\.whatsapp\.net$/)?.[1] ??
        inboxesOf(room, inboxes)
            .map((inbox) => inbox.contactPhones.get(id))
            .find(Boolean);
    return number ? formatPhone(number) : undefined;
}

/**
 * "+1 555 709 3423" for a WhatsApp ghost keyed by its number, or for a LID ghost
 * whose number the relay bot lists for one of our numbers; Telegram ids carry none.
 */
export function ghostPhone(userId: string, inboxes: Inbox[] = []): string | undefined {
    const digits = userId.match(/^@whatsapp_(\d{7,15}):/)?.[1];
    if (digits) return formatPhone(digits);
    const lid = userId.match(/^@whatsapp_lid-(\d+):/)?.[1];
    const listed = lid && inboxes.map((inbox) => inbox.contactPhones.get(`${lid}@lid`)).find(Boolean);
    return listed ? formatPhone(listed) : undefined;
}

/** Private chats whose name is not unique among these: WhatsApp shows the number beside such names. */
export function repeatedNames(rooms: Room[]): Set<string> {
    const seen = new Set<string>();
    const repeated = new Set<string>();
    for (const room of rooms) {
        if (chatKind(room) !== "chat") continue;
        const name = stripNetworkSuffix(room.name);
        if (seen.has(name)) repeated.add(name);
        seen.add(name);
    }
    return repeated;
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
 * Someone's name without Element's "(@whatsapp_lid-…:server)", which it adds when
 * two people share a name: a bridge's Matrix ID means nothing to staff.
 */
export function memberName(member: RoomMember): string {
    return member.rawDisplayName && member.rawDisplayName !== member.userId ? member.rawDisplayName : member.name;
}

/**
 * A chat's name as staff read it: "Anna (WA)" as "Anna" (the number line already
 * says WhatsApp), "+13026180314" as "+1 302 618 0314".
 */
export function stripNetworkSuffix(name: string): string {
    const bare = name.replace(/\s*\((WA|TG|Telegram)\)$/, "");
    return /^\+\d{7,15}$/.test(bare) ? formatPhone(bare) : bare;
}
