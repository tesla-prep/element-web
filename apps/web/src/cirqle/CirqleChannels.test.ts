/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { type MatrixClient, MatrixEvent, Room } from "matrix-js-sdk/src/matrix";
import { KnownMembership } from "matrix-js-sdk/src/types";
import { stubClient } from "test-utils";

import { getInboxes, INBOX_STATE_EVENT } from "./CirqleInboxes";
import { hasChannels, sectionChips } from "./useCirqleChats";

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

describe("Channels on the rail", () => {
    let client: MatrixClient;
    let rooms: Room[];

    function setRooms(list: Room[]): void {
        rooms = list;
        vi.mocked(client.getRooms).mockReturnValue(rooms);
        vi.mocked(client.getRoom).mockImplementation((id) => rooms.find((room) => room.roomId === id) ?? null);
    }

    beforeEach(() => {
        client = stubClient();
        // Main #1 is disconnected and follows a WhatsApp channel; slava test has chats only
        setRooms([
            mkInboxSpace(client, "!main1:server", "Main #1", "16463313251", [
                child("!news:server"),
                { type: INBOX_STATE_EVENT, content: { connected: false } },
            ]),
            mkInboxSpace(client, "!slava:server", "slava test", "79648986389", [child("!anna:server")]),
            mkRoom(client, "!news:server", "News", [bridge({ id: "120363000000000000@newsletter" })]),
            mkRoom(client, "!anna:server", "Anna (WA)", [bridge({ id: "111@lid" }, { "com.beeper.room_type": "dm" })]),
        ]);
    });

    const inbox = (label: string) => getInboxes(client).find((i) => i.label === label);

    it("shows Channels only for a number that has a channel", () => {
        const inboxes = getInboxes(client);
        expect(hasChannels(rooms, inboxes, inbox("slava test"))).toBe(false);
        expect(hasChannels(rooms, inboxes, inbox("Main #1"))).toBe(true);
    });

    it("under All numbers, counts the channels of connected numbers only", () => {
        expect(hasChannels(rooms, getInboxes(client), undefined)).toBe(false);

        setRooms([
            ...rooms.filter((room) => room.roomId !== "!slava:server"),
            mkInboxSpace(client, "!slava:server", "slava test", "79648986389", [
                child("!anna:server"),
                child("!slava-news:server"),
            ]),
            mkRoom(client, "!slava-news:server", "Deals", [bridge({ id: "120363000000000001@newsletter" })]),
        ]);
        expect(hasChannels(rooms, getInboxes(client), undefined)).toBe(true);
    });

    it("has no Groups chip inside Channels", () => {
        expect(sectionChips("channels")).toEqual(["all", "unread", "favourites"]);
        expect(sectionChips("chats")).toEqual(["all", "unread", "favourites", "groups"]);
    });
});
