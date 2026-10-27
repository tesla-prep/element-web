/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { type MatrixClient, MatrixEvent, Room } from "matrix-js-sdk/src/matrix";
import { KnownMembership } from "matrix-js-sdk/src/types";
import { stubClient } from "test-utils";

import { LocalRoom, LOCAL_ROOM_ID_PREFIX } from "../models/LocalRoom";
import {
    chatKind,
    CONTACT_PHONES_EVENT,
    contactNumber,
    contactPhone,
    getInboxes,
    isStatusBroadcast,
    INBOX_STATE_EVENT,
    numberChats,
    numberLine,
    repeatedNames,
} from "./CirqleInboxes";
import { matchesChatSearch } from "./useCirqleChats";

interface State {
    type: string;
    state_key?: string;
    content: Record<string, unknown>;
}

function bridge(channel: Record<string, string>, extra: Record<string, string> = {}): State {
    return {
        type: "m.bridge",
        state_key: "server/whatsapp",
        content: { bridgebot: "@whatsappbot:server", protocol: { id: "whatsapp" }, channel, ...extra },
    };
}

const child = (roomId: string): State => ({ type: "m.space.child", state_key: roomId, content: { via: ["server"] } });

function mkRoom(client: MatrixClient, roomId: string, name: string, state: State[]): Room {
    const room = new Room(roomId, client, client.getSafeUserId());
    room.currentState.setStateEvents(
        [{ type: "m.room.create", content: {} }, { type: "m.room.name", content: { name } }, ...state].map(
            (ev, i) =>
                new MatrixEvent({
                    type: ev.type,
                    state_key: ev.state_key ?? "",
                    content: ev.content,
                    room_id: roomId,
                    sender: "@whatsappbot:server",
                    event_id: `$${roomId}-${i}`,
                }),
        ),
    );
    room.updateMyMembership(KnownMembership.Join);
    room.recalculate();
    return room;
}

function mkInboxSpace(client: MatrixClient, roomId: string, label: string, phone: string, state: State[]): Room {
    return mkRoom(client, roomId, `WhatsApp · ${label}`, [
        { type: "m.room.create", content: { type: "m.space" } },
        { type: "m.room.topic", content: { topic: `Your WhatsApp bridged chats - +${phone}` } },
        bridge(
            { "id": "__personal_filtering_space__", "fi.mau.receiver": phone },
            { "com.beeper.room_type.v2": "personal_filtering_space" },
        ),
        ...state,
    ]);
}

const dm = (lid: string): State => bridge({ id: `${lid}@lid` }, { "com.beeper.room_type": "dm" });

describe("chatKind", () => {
    it("is a private chat for the local room New chat opens before the first message", () => {
        const client = stubClient();
        expect(chatKind(new LocalRoom(LOCAL_ROOM_ID_PREFIX + "1", client, client.getSafeUserId()))).toBe("chat");
    });

    it("is a group for a plain room nobody bridged", () => {
        const client = stubClient();
        expect(chatKind(new Room("!plain:server", client, client.getSafeUserId()))).toBe("group");
    });
});

describe("numbers and their chats", () => {
    let client: MatrixClient;
    let rooms: Room[];

    beforeEach(() => {
        client = stubClient();
        // Main #1 is disconnected and holds a WhatsApp community with two groups
        rooms = [
            mkInboxSpace(client, "!main1:server", "Main #1", "16463313251", [
                child("!anna-main1:server"),
                child("!frisco:server"),
                { type: INBOX_STATE_EVENT, content: { connected: false } },
            ]),
            mkRoom(client, "!frisco:server", "CIRQLE | Frisco", [
                { type: "m.room.create", content: { type: "m.space" } },
                bridge({ id: "120363425399214516@g.us" }, { "com.beeper.room_type.v2": "space" }),
                child("!frisco-news:server"),
                child("!community:server"),
            ]),
            mkInboxSpace(client, "!slava:server", "slava test", "79648986389", [
                child("!tanya-1:server"),
                child("!tanya-2:server"),
                child("!status:server"),
                { type: INBOX_STATE_EVENT, content: { connected: true } },
                { type: CONTACT_PHONES_EVENT, content: { phones: { "238585550754026@lid": "+79161234567" } } },
            ]),
            mkRoom(client, "!anna-main1:server", "Anna (WA)", [dm("111")]),
            mkRoom(client, "!frisco-news:server", "CIRQLE | Frisco", [bridge({ id: "120363409561477405@g.us" })]),
            mkRoom(client, "!community:server", "Community", [bridge({ id: "120363408871160962@g.us" })]),
            mkRoom(client, "!tanya-1:server", "Татьяна (WA)", [dm("238585550754026")]),
            mkRoom(client, "!tanya-2:server", "Татьяна (WA)", [
                bridge({ id: "79035550000@s.whatsapp.net" }, { "com.beeper.room_type": "dm" }),
            ]),
            mkRoom(client, "!status:server", "WhatsApp Status Broadcast", [
                bridge({ "id": "status@broadcast", "fi.mau.receiver": "79648986389" }),
            ]),
            mkRoom(client, "!unlisted:server", "Someone (WA)", [dm("222")]),
        ];
        vi.mocked(client.getRooms).mockReturnValue(rooms);
        vi.mocked(client.getRoom).mockImplementation((id) => rooms.find((room) => room.roomId === id) ?? null);
    });

    const room = (id: string): Room => rooms.find((r) => r.roomId === id)!;
    const ids = (list: Room[]): string[] => list.map((r) => r.roomId);
    const chats = (): Room[] => rooms.filter((r) => !r.isSpaceRoom());

    it("reads the numbers, with the groups of a community inside a number's space", () => {
        const [main1, slava] = getInboxes(client);
        expect(main1.label).toBe("Main #1");
        expect(main1.phone).toBe("+1 646 331 3251");
        expect(main1.connected).toBe(false);
        expect(slava.connected).toBe(true);
        expect(main1.childIds.has("!frisco-news:server")).toBe(true);
        expect(main1.childIds.has("!community:server")).toBe(true);
        expect(slava.childIds.has("!community:server")).toBe(false);
    });

    it("names the number under a community's groups", () => {
        const inboxes = getInboxes(client);
        expect(numberLine(room("!community:server"), inboxes).text).toBe("Group · Main #1");
        expect(numberLine(room("!frisco-news:server"), inboxes).text).toBe("Group · Main #1");
    });

    it("counts a number connected until the relay bot says otherwise", () => {
        vi.mocked(client.getRooms).mockReturnValue([mkInboxSpace(client, "!new:server", "New", "15550001111", [])]);
        expect(getInboxes(client)[0].connected).toBe(true);
    });

    it("shows a picked number's own chats only, a disconnected one's too", () => {
        const [main1, slava] = getInboxes(client);
        const inboxes = [main1, slava];
        expect(ids(numberChats(chats(), inboxes, [main1]))).toEqual([
            "!anna-main1:server",
            "!frisco-news:server",
            "!community:server",
        ]);
        expect(ids(numberChats(chats(), inboxes, [slava]))).toEqual(["!tanya-1:server", "!tanya-2:server"]);
    });

    it("shows the chats of every picked number together", () => {
        const [main1, slava] = getInboxes(client);
        expect(ids(numberChats(chats(), [main1, slava], [main1, slava]))).toEqual([
            "!anna-main1:server",
            "!frisco-news:server",
            "!community:server",
            "!tanya-1:server",
            "!tanya-2:server",
        ]);
    });

    it("gives a number the community groups its account is in, though the community is not in its space", () => {
        // Andrey - Personal is in "CIRQLE | Frisco" (the community's announcements) but not in the community
        const join = (userId: string): State => ({
            type: "m.room.member",
            state_key: userId,
            content: { membership: "join" },
        });
        const andrey = "@account_whatsapp_wa-bba81064:server";
        rooms = [
            ...rooms.filter((r) => r.roomId !== "!frisco-news:server"),
            mkInboxSpace(client, "!andrey:server", "Andrey - Personal", "13026180314", [join(andrey)]),
            mkRoom(client, "!frisco-news:server", "CIRQLE | Frisco", [
                bridge({ id: "120363409561477405@g.us" }),
                join(andrey),
            ]),
            mkRoom(client, "!andrey-dm:server", "Someone (WA)", [dm("444"), join(andrey)]),
        ];
        vi.mocked(client.getRooms).mockReturnValue(rooms);
        const andreyInbox = getInboxes(client).find((inbox) => inbox.label === "Andrey - Personal")!;
        expect(andreyInbox.accountUserId).toBe(andrey);
        expect(andreyInbox.childIds.has("!frisco-news:server")).toBe(true);
        // A private chat is a number's only when its space lists it
        expect(andreyInbox.childIds.has("!andrey-dm:server")).toBe(false);
        expect(numberLine(room("!frisco-news:server"), getInboxes(client)).text).toBe(
            "Group · Andrey - Personal, Main #1",
        );
    });

    it("leaves disconnected numbers and WhatsApp's Status out of All numbers", () => {
        const inboxes = getInboxes(client);
        expect(ids(numberChats(chats(), inboxes, []))).toEqual([
            "!tanya-1:server",
            "!tanya-2:server",
            "!unlisted:server",
        ]);
    });

    it("leaves out a chat staff left or were taken out of, which Element keeps after a reload", () => {
        const [main1, slava] = getInboxes(client);
        room("!tanya-2:server").updateMyMembership(KnownMembership.Leave);
        room("!unlisted:server").updateMyMembership(KnownMembership.Ban);
        expect(ids(numberChats(chats(), [main1, slava], []))).toEqual(["!tanya-1:server"]);
        expect(ids(numberChats(chats(), [main1, slava], [slava]))).toEqual(["!tanya-1:server"]);
        room("!tanya-2:server").updateMyMembership(KnownMembership.Invite);
        expect(ids(numberChats(chats(), [main1, slava], [slava]))).toEqual(["!tanya-1:server", "!tanya-2:server"]);
    });

    it("finds a chat by the customer's number, also when the chat goes by a name", () => {
        const inboxes = getInboxes(client);
        const search = (query: string): string[] => {
            const needle = query.trim().toLocaleLowerCase();
            const digits = needle.replace(/[^\d]/g, "");
            return ids(chats().filter((r) => matchesChatSearch(r, inboxes, needle, digits)));
        };
        // Татьяна's LID chat: the number only the relay bot knows; the other one is keyed by phone
        expect(search("916 123")).toEqual(["!tanya-1:server"]);
        expect(search("+7 903 555")).toEqual(["!tanya-2:server"]);
        expect(search("татьяна")).toEqual(["!tanya-1:server", "!tanya-2:server"]);
        // Two digits are too few to search a number by
        expect(search("91")).toEqual([]);
    });

    it("knows WhatsApp's Status by its bridge id, not its name", () => {
        expect(isStatusBroadcast(room("!status:server"))).toBe(true);
        expect(isStatusBroadcast(mkRoom(client, "!x:server", "WhatsApp Status Broadcast", [dm("333")]))).toBe(false);
    });

    it("tells private chats with the same name apart by the customer's number", () => {
        const inboxes = getInboxes(client);
        // The community and its group share a name too, but only private chats show a number
        expect(repeatedNames(chats())).toEqual(new Set(["Татьяна"]));
        expect(contactPhone(room("!tanya-1:server"), inboxes)).toBe("+7 916 123 4567");
        expect(contactPhone(room("!tanya-2:server"), inboxes)).toBe("+7 903 555 0000");
        expect(contactPhone(room("!anna-main1:server"), inboxes)).toBeUndefined();
        expect(contactPhone(room("!community:server"), inboxes)).toBeUndefined();
    });
});

describe("contactNumber", () => {
    const withMember = (client: MatrixClient, userId: string, name: string): Room => {
        const room = mkRoom(client, "!dm-" + name + ":server", name, [
            { type: "m.room.member", state_key: userId, content: { membership: "join", displayname: name } },
        ]);
        return room;
    };

    it("reads a WhatsApp ghost's number", () => {
        expect(contactNumber(withMember(stubClient(), "@whatsapp_13026180314:server", "Anna"))).toBe("+1 302 618 0314");
    });

    it("never takes a Telegram user id for a phone number", () => {
        expect(contactNumber(withMember(stubClient(), "@telegram_8759317930:server", "Victoria"))).toBeUndefined();
    });
});
