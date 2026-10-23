/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from "vitest";
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

import { chatPreview, previewText } from "./CirqlePreview";

const ME = "@userId:matrix.org";
const ANNA = "@anna:matrix.org";
const CUSTOMER = "@whatsapp_lid-12345:matrix.org";
const OTHER = "@whatsapp_lid-67890:matrix.org";
let n = 0;

function message(roomId: string, sender: string, content: Record<string, unknown>, ts = 10): MatrixEvent {
    return mkEvent({ type: EventType.RoomMessage, room: roomId, user: sender, content, ts, event: true });
}

function text(roomId: string, sender: string, body: string, ts = 10): MatrixEvent {
    return message(roomId, sender, { msgtype: MsgType.Text, body }, ts);
}

function chat(
    client: MatrixClient,
    kind: "dm" | "group",
    events: (roomId: string) => MatrixEvent[],
    token: string | null = null,
): Room {
    const room = new Room(`!chat${n++}:matrix.org`, client, ME, {
        pendingEventOrdering: PendingEventOrdering.Detached,
    });
    vi.spyOn(room, "getMyMembership").mockReturnValue(KnownMembership.Join);
    const state = (type: string, skey: string, content: Record<string, unknown>): MatrixEvent =>
        mkEvent({ type, room: room.roomId, user: ME, skey, content, event: true });
    room.currentState.setStateEvents([
        state("m.bridge", "whatsapp", {
            "protocol": { id: "whatsapp" },
            "com.beeper.room_type": kind === "dm" ? "dm" : "group",
        }),
        state(EventType.RoomMember, ANNA, { membership: "join", displayname: "Anna Smith" }),
        state(EventType.RoomMember, CUSTOMER, { membership: "join", displayname: "+79213898002 (WA)" }),
        state(EventType.RoomMember, OTHER, { membership: "join", displayname: "Kristina Ivanova (WA)" }),
    ]);
    room.getLiveTimeline().setPaginationToken(token, EventTimeline.BACKWARDS);
    room.addLiveEvents(events(room.roomId), { addToState: false });
    return room;
}

describe("chatPreview", () => {
    let client: MatrixClient;

    beforeEach(() => {
        localStorage.clear();
        client = stubClient();
    });

    it("shows a customer's message in a private chat without a prefix", () => {
        expect(chatPreview(chat(client, "dm", (id) => [text(id, CUSTOMER, "Здравствуйте!")]))).toBe("Здравствуйте!");
    });

    it("marks our own message", () => {
        expect(chatPreview(chat(client, "dm", (id) => [text(id, ME, "See you")]))).toBe("You: See you");
    });

    it("names a colleague who answered", () => {
        expect(chatPreview(chat(client, "dm", (id) => [text(id, ANNA, "Done")]))).toBe("Anna: Done");
    });

    it("names the sender in a group by first name or formatted number, without (WA)", () => {
        expect(chatPreview(chat(client, "group", (id) => [text(id, OTHER, "Hi all")]))).toBe("Kristina: Hi all");
        expect(chatPreview(chat(client, "group", (id) => [text(id, CUSTOMER, "Hello")]))).toBe(
            "+7 921 389 8002: Hello",
        );
    });

    it("skips bot notices, edits and room changes after the last message", () => {
        const room = chat(client, "dm", (id) => [
            text(id, CUSTOMER, "Real message", 10),
            message(
                id,
                "@telegrambot:matrix.org",
                { msgtype: MsgType.Notice, body: "⚠️ Your message was not bridged" },
                20,
            ),
            message(
                id,
                CUSTOMER,
                {
                    "msgtype": MsgType.Text,
                    "body": "* edit",
                    "m.relates_to": { rel_type: "m.replace", event_id: "$x" },
                },
                30,
            ),
            mkEvent({
                type: EventType.RoomName,
                room: id,
                user: ME,
                skey: "",
                content: { name: "x" },
                ts: 40,
                event: true,
            }),
        ]);
        expect(chatPreview(room)).toBe("Real message");
    });

    it("shows nothing while there is no message yet", () => {
        expect(chatPreview(chat(client, "dm", () => []))).toBe("");
    });

    it("previews the last message from the server when the loaded events hold none", async () => {
        vi.mocked(client.createMessagesRequest).mockResolvedValue({
            chunk: [text("!x", CUSTOMER, "From history", 5).getEffectiveEvent()],
            start: "t_before",
        } as any);
        const room = chat(client, "dm", () => [], "t_before");
        expect(chatPreview(room)).toBe("");
        await vi.waitFor(() => expect(chatPreview(room)).toBe("From history"));
    });
});

describe("previewText", () => {
    const id = "!r:matrix.org";

    it.each([
        ["a photo", { msgtype: MsgType.Image, body: "IMG_1.jpg", filename: "IMG_1.jpg" }, "📷 Photo"],
        ["a photo with a caption", { msgtype: MsgType.Image, body: "look", filename: "IMG_1.jpg" }, "📷 look"],
        ["a video", { msgtype: MsgType.Video, body: "v.mp4" }, "🎥 Video"],
        [
            "a voice message",
            { "msgtype": MsgType.Audio, "body": "Voice", "org.matrix.msc3245.voice": {} },
            "🎤 Voice message",
        ],
        ["a file", { msgtype: MsgType.File, body: "report.pdf", filename: "report.pdf" }, "📄 report.pdf"],
        ["a location", { msgtype: MsgType.Location, body: "geo", geo_uri: "geo:1,2" }, "📍 Location"],
        [
            "a reply, without the quoted text",
            {
                "msgtype": MsgType.Text,
                "body": "> <@a:b> quoted\n\nanswer",
                "m.relates_to": { "m.in_reply_to": { event_id: "$q" } },
            },
            "answer",
        ],
    ])("describes %s", (_name, content, expected) => {
        expect(previewText(message(id, CUSTOMER, content))).toBe(expected);
    });

    it("says a deleted message was deleted", () => {
        const event = text(id, CUSTOMER, "secret");
        event.makeRedacted(
            mkEvent({ type: EventType.RoomRedaction, room: id, user: CUSTOMER, content: {}, event: true }),
            new Room(id, stubClient(), ME),
        );
        expect(previewText(event)).toBe("🚫 This message was deleted");
    });
});
