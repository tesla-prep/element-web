/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    EventTimeline,
    EventType,
    type MatrixClient,
    type MatrixEvent,
    MsgType,
    PendingEventOrdering,
    Room,
} from "matrix-js-sdk/src/matrix";
import { KnownMembership } from "matrix-js-sdk/src/types";
import { mkEvent, stubClient } from "test-utils";

import { CIRQLE_ACTIVITY_UPDATE, CirqleActivityStore, isChatActivity } from "./CirqleActivity";
import { RecencySorter } from "../stores/room-list-v3/skip-list/sorters/RecencySorter";

const ME = "@userId:matrix.org";
const STAFF = "@anna:matrix.org";
const CUSTOMER = "@whatsapp_13025550100:matrix.org";
const ROOM = "!chat:matrix.org";

function message(ts: number, user = CUSTOMER, content: Record<string, unknown> = {}): MatrixEvent {
    return mkEvent({
        type: EventType.RoomMessage,
        room: ROOM,
        user,
        content: { msgtype: MsgType.Text, body: "hi", ...content },
        ts,
        event: true,
    });
}

function state(type: string, ts: number, content: Record<string, unknown>, skey = "", user = ME): MatrixEvent {
    return mkEvent({ type, room: ROOM, user, skey, content, ts, event: true });
}

function joinedRoom(client: MatrixClient, events: MatrixEvent[], token: string | null = "t_before", id = ROOM): Room {
    const room = new Room(id, client, ME, { pendingEventOrdering: PendingEventOrdering.Detached });
    vi.spyOn(room, "getMyMembership").mockReturnValue(KnownMembership.Join);
    room.getLiveTimeline().setPaginationToken(token, EventTimeline.BACKWARDS);
    room.addLiveEvents(events, { addToState: false });
    return room;
}

describe("isChatActivity", () => {
    it.each([
        ["a customer's text", message(1)],
        ["a staff member's reply", message(1, STAFF)],
        ["our own reply", message(1, ME)],
        ["a photo", message(1, CUSTOMER, { msgtype: MsgType.Image, url: "mxc://x/y" })],
        ["a voice message", message(1, CUSTOMER, { "msgtype": MsgType.Audio, "org.matrix.msc3245.voice": {} })],
        ["a file", message(1, CUSTOMER, { msgtype: MsgType.File })],
        ["a bridged message the bridge could not show", message(1, CUSTOMER, { msgtype: MsgType.Notice })],
        ["a sticker", mkEvent({ type: EventType.Sticker, room: ROOM, user: CUSTOMER, content: {}, event: true })],
        [
            "a poll",
            mkEvent({ type: "org.matrix.msc3381.poll.start", room: ROOM, user: CUSTOMER, content: {}, event: true }),
        ],
    ])("counts %s", (_name, event) => {
        expect(isChatActivity(event)).toBe(true);
    });

    it.each([
        ["our join", state(EventType.RoomMember, 1, { membership: KnownMembership.Join }, ME)],
        ["a customer's join", state(EventType.RoomMember, 1, { membership: KnownMembership.Join }, CUSTOMER, CUSTOMER)],
        ["a rename", state(EventType.RoomName, 1, { name: "Kristina" })],
        ["a new avatar", state(EventType.RoomAvatar, 1, { url: "mxc://x/y" })],
        ["power levels", state(EventType.RoomPowerLevels, 1, {})],
        ["a bridge state event", state("uk.half-shot.bridge", 1, {}, "whatsapp")],
        [
            "a reaction",
            mkEvent({
                type: EventType.Reaction,
                room: ROOM,
                user: CUSTOMER,
                content: { "m.relates_to": { rel_type: "m.annotation", event_id: "$m", key: "👍" } },
                event: true,
            }),
        ],
        [
            "an edit",
            message(1, CUSTOMER, {
                "m.new_content": { body: "hi!" },
                "m.relates_to": { rel_type: "m.replace", event_id: "$m" },
            }),
        ],
        [
            "a redaction",
            mkEvent({
                type: EventType.RoomRedaction,
                room: ROOM,
                user: CUSTOMER,
                content: {},
                redacts: "$m",
                event: true,
            }),
        ],
        ["a WhatsApp bridge bot notice", message(1, "@whatsappbot:matrix.org", { msgtype: MsgType.Notice })],
        ["a Telegram bridge bot message", message(1, "@telegrambot:matrix.org")],
        ["a relay bot notice", message(1, "@relay-bot:matrix.org", { msgtype: MsgType.Notice })],
        [
            "a typing or receipt-like ephemeral",
            mkEvent({ type: "m.typing", room: ROOM, user: CUSTOMER, content: {}, event: true }),
        ],
    ])("does not count %s", (_name, event) => {
        expect(isChatActivity(event)).toBe(false);
    });
});

describe("CirqleActivityStore", () => {
    let client: MatrixClient;
    let store: CirqleActivityStore;

    beforeEach(() => {
        localStorage.clear();
        client = stubClient();
        store = new CirqleActivityStore();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("takes the last message, not the joins, renames, reactions and edits after it", () => {
        const room = joinedRoom(client, [
            message(5),
            state(EventType.RoomMember, 400, { membership: KnownMembership.Join }, ME),
            state(EventType.RoomName, 500, { name: "Kristina" }),
            mkEvent({
                type: EventType.Reaction,
                room: ROOM,
                user: CUSTOMER,
                content: { "m.relates_to": { rel_type: "m.annotation", event_id: "$m", key: "👍" } },
                ts: 600,
                event: true,
            }),
            message(700, CUSTOMER, { "m.new_content": {}, "m.relates_to": { rel_type: "m.replace", event_id: "$m" } }),
        ]);

        expect(store.lastActivity(room)).toBe(5);
        expect(client.createMessagesRequest).not.toHaveBeenCalled();
    });

    it("moves with a new message, in or out", () => {
        const room = joinedRoom(client, [message(5)]);
        room.addLiveEvents([message(50, STAFF)], { addToState: false });
        expect(store.lastActivity(room)).toBe(50);
    });

    it("asks the server once for the last message before the loaded events", async () => {
        const room = joinedRoom(client, [state(EventType.RoomMember, 400, { membership: KnownMembership.Join }, ME)]);
        vi.mocked(client.createMessagesRequest).mockResolvedValue({
            chunk: [
                message(300, "@whatsappbot:matrix.org", { msgtype: MsgType.Notice }).getEffectiveEvent(),
                message(200).getEffectiveEvent(),
            ],
            start: "t_before",
            end: "t_older",
        } as any);
        const updated = vi.fn();
        store.on(CIRQLE_ACTIVITY_UPDATE, updated);

        expect(store.lastActivity(room)).toBe(0);
        await vi.waitFor(() => expect(updated).toHaveBeenCalledWith(room));
        expect(store.lastActivity(room)).toBe(200);
        expect(client.createMessagesRequest).toHaveBeenCalledTimes(1);
        const [roomId, from, , dir, filter] = vi.mocked(client.createMessagesRequest).mock.calls[0];
        expect([roomId, from, dir]).toEqual([ROOM, "t_before", "b"]);
        expect(filter?.getDefinition().room?.timeline?.types).toContain(EventType.RoomMessage);
    });

    it("keeps asking older pages until it finds a message", async () => {
        const room = joinedRoom(client, []);
        vi.mocked(client.createMessagesRequest)
            .mockResolvedValueOnce({
                chunk: [message(300, "@relay-bot:matrix.org").getEffectiveEvent()],
                start: "t_before",
                end: "t_older",
            } as any)
            .mockResolvedValueOnce({
                chunk: [message(100).getEffectiveEvent()],
                start: "t_older",
                end: "t_oldest",
            } as any);

        store.lastActivity(room);
        await vi.waitFor(() => expect(store.lastActivity(room)).toBe(100));
        expect(vi.mocked(client.createMessagesRequest).mock.calls[1][1]).toBe("t_older");
    });

    it("remembers the answer after a reload while the loaded events stay the same", async () => {
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        const room = joinedRoom(client, []);
        vi.mocked(client.createMessagesRequest).mockResolvedValue({
            chunk: [message(200).getEffectiveEvent()],
            start: "t_before",
        } as any);
        store.lastActivity(room);
        await vi.waitFor(() => expect(store.lastActivity(room)).toBe(200));
        vi.advanceTimersByTime(1000);

        const reloaded = new CirqleActivityStore();
        expect(reloaded.lastActivity(room)).toBe(200);
        expect(client.createMessagesRequest).toHaveBeenCalledTimes(1);

        room.getLiveTimeline().setPaginationToken("t_after_gap", EventTimeline.BACKWARDS);
        reloaded.lastActivity(room);
        expect(client.createMessagesRequest).toHaveBeenCalledTimes(2);
    });

    it("keeps the message itself for the preview, trimmed, across a reload", async () => {
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        const room = joinedRoom(client, []);
        const long = "x".repeat(1000);
        vi.mocked(client.createMessagesRequest).mockResolvedValue({
            chunk: [
                message(200, CUSTOMER, {
                    body: long,
                    format: "org.matrix.custom.html",
                    formatted_body: "<b>x</b>",
                }).getEffectiveEvent(),
            ],
            start: "t_before",
        } as any);
        expect(store.lastActivityEvent(room)).toBeUndefined();
        await vi.waitFor(() => expect(store.lastActivityEvent(room)?.getTs()).toBe(200));
        vi.advanceTimersByTime(1000);

        const event = new CirqleActivityStore().lastActivityEvent(room)!;
        expect(event.getSender()).toBe(CUSTOMER);
        expect(event.getRoomId()).toBe(ROOM);
        expect(event.getContent().body).toHaveLength(300);
        expect(event.getContent().formatted_body).toBeUndefined();
    });

    it("does not ask again after a failure until the loaded events change", async () => {
        const room = joinedRoom(client, []);
        vi.mocked(client.createMessagesRequest).mockRejectedValue(new Error("M_LIMIT_EXCEEDED"));
        store.lastActivity(room);
        await vi.waitFor(() => expect(client.createMessagesRequest).toHaveBeenCalledTimes(1));
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(store.lastActivity(room)).toBe(0);
        expect(client.createMessagesRequest).toHaveBeenCalledTimes(1);
    });

    it("uses the creation time for a chat that never had a message", () => {
        const room = joinedRoom(client, [], null);
        room.currentState.setStateEvents([state(EventType.RoomCreate, 42, {})]);
        expect(store.lastActivity(room)).toBe(42);
        expect(client.createMessagesRequest).not.toHaveBeenCalled();
    });

    it("uses the invite time for a chat we are invited to", () => {
        const room = new Room(ROOM, client, ME);
        vi.spyOn(room, "getMyMembership").mockReturnValue(KnownMembership.Invite);
        room.currentState.setStateEvents([
            state(EventType.RoomMember, 77, { membership: KnownMembership.Invite }, ME, STAFF),
        ]);
        expect(store.lastActivity(room)).toBe(77);
    });
});

describe("chat list order", () => {
    it("puts the chat with the newest message first, whatever came after the messages", () => {
        localStorage.clear();
        const client = stubClient();
        const joinedLater = joinedRoom(
            client,
            [message(100), state(EventType.RoomMember, 900, { membership: KnownMembership.Join }, ME)],
            null,
            "!joined-later:matrix.org",
        );
        const renamedLater = joinedRoom(
            client,
            [message(200), state(EventType.RoomName, 950, { name: "Raj" }, "", "@whatsappbot:matrix.org")],
            null,
            "!renamed-later:matrix.org",
        );
        const newestMessage = joinedRoom(client, [message(300, STAFF)], null, "!newest:matrix.org");

        const sorted = new RecencySorter(ME).sort([joinedLater, renamedLater, newestMessage]);
        expect(sorted.map((room) => room.roomId)).toEqual([
            "!newest:matrix.org",
            "!renamed-later:matrix.org",
            "!joined-later:matrix.org",
        ]);
    });
});
