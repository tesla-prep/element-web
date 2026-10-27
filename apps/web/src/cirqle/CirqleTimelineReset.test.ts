/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    createClient,
    Direction,
    EventType,
    type IEvent,
    type MatrixClient,
    MatrixEvent,
    MsgType,
    Room,
    SyncAccumulator,
    TimelineWindow,
} from "matrix-js-sdk/src/matrix";

import { resetCirqleWarmup, warmCirqleChat } from "./CirqleWarmup";

const ROOM = "!chat:server";
const ME = "@me:server";
const CUSTOMER = "@whatsapp_79001112233:server";

const message = (id: string, ts: number): IEvent => ({
    type: EventType.RoomMessage,
    event_id: id,
    room_id: ROOM,
    sender: CUSTOMER,
    origin_server_ts: ts,
    content: { msgtype: MsgType.Text, body: "text of " + id },
    unsigned: {},
});
const redaction = (id: string, target: string, ts: number): IEvent => ({
    type: EventType.RoomRedaction,
    event_id: id,
    room_id: ROOM,
    sender: ME,
    origin_server_ts: ts,
    content: { redacts: target },
    redacts: target,
    unsigned: {},
});
const redacted = (event: IEvent, by: IEvent): IEvent => ({
    ...event,
    content: {},
    unsigned: { redacted_because: by },
});

interface Page {
    chunk: IEvent[];
    end?: string;
}

describe("CIRQLE: a limited sync while history is being paged back", () => {
    let client: MatrixClient;
    let room: Room;
    let pages: Record<string, Page | Promise<Page>>;
    let requested: string[];

    beforeEach(() => {
        pages = {};
        requested = [];
        client = createClient({
            baseUrl: "https://server",
            userId: ME,
            accessToken: "token",
            fetchFn: async (input: RequestInfo | URL): Promise<Response> => {
                const url = new URL(input instanceof Request ? input.url : input);
                if (!url.pathname.endsWith("/messages")) throw new Error("unexpected request " + url);
                const from = url.searchParams.get("from")!;
                requested.push(from);
                const page = await pages[from];
                if (!page) throw new Error("no page for " + from);
                return new Response(JSON.stringify({ start: from, ...page }), {
                    headers: { "Content-Type": "application/json" },
                });
            },
        });
        room = new Room(ROOM, client, ME, { timelineSupport: true });
        client.store.storeRoom(room);
    });

    afterEach(() => resetCirqleWarmup());

    const settle = async (): Promise<void> => {
        for (let i = 0; i < 20; i++) await new Promise((resolve) => setTimeout(resolve, 0));
    };

    /** What the chat shows: the events of a timeline window paged back to the start of the chat */
    const shown = async (): Promise<MatrixEvent[]> => {
        const window = new TimelineWindow(client, room.getUnfilteredTimelineSet(), { windowLimit: 1000 });
        await window.load(undefined, 50);
        while (await window.paginate(Direction.Backward, 50));
        return window.getEvents();
    };

    it("shows every message once, deleted ones deleted, when the reset lands while the warmup pages back", async () => {
        const [o1, o2, a1, a2, a3, n1] = [1, 2, 3, 4, 5, 7].map((ts, i) =>
            message(["$o1", "$o2", "$a1", "$a2", "$a3", "$n1"][i], ts),
        );
        const r3 = redaction("$r3", "$a3", 6);

        // The browser's copy of the chat (IndexedDB): the last messages before the break, $a3 not deleted yet.
        await room.addLiveEvents(
            [a1, a2, a3].map((e) => new MatrixEvent(e)),
            { addToState: false },
        );
        room.getLiveTimeline().setPaginationToken("cached", Direction.Backward);

        // The chat list shows from that copy and the warmup pages the chat back; the page is slow to come.
        let answerWarmup!: (page: Page) => void;
        pages.cached = new Promise<Page>((resolve) => (answerWarmup = resolve));
        warmCirqleChat(room);
        await settle();
        expect(requested).toEqual(["cached"]);

        // Meanwhile the first sync after the break is limited: $a3 was deleted and $n1 came. The chat is not
        // open, so Element lets the SDK drop every timeline (sync.ts, canResetEntireTimeline).
        room.resetLiveTimeline("gap", null);
        await room.addLiveEvents(
            [r3, n1].map((e) => new MatrixEvent(e)),
            { addToState: false },
        );

        // Then the warmup's page comes back, and the chat is paged back from the new live timeline.
        pages.old = { chunk: [] };
        pages.gap = { chunk: [redacted(a3, r3), a2, a1, o2], end: "older" };
        pages.older = { chunk: [o1] };
        answerWarmup({ chunk: [o2, o1], end: "old" });
        await settle();

        const events = await shown();
        expect(events.map((e) => e.getId())).toEqual(["$o1", "$o2", "$a1", "$a2", "$a3", "$r3", "$n1"]);
        expect(events.find((e) => e.getId() === "$a3")!.isRedacted()).toBe(true);
    });

    it("applies a deletion kept in the browser's copy to the message it deletes", async () => {
        const a1 = message("$a1", 1);
        const r1 = redaction("$r1", "$a1", 2);
        const accumulator = new SyncAccumulator();
        const sync = (events: IEvent[], batch: string): Parameters<SyncAccumulator["accumulate"]>[0] =>
            ({
                next_batch: batch,
                rooms: {
                    join: {
                        [ROOM]: {
                            timeline: { events, prev_batch: "p", limited: false },
                            state: { events: [] },
                            ephemeral: { events: [] },
                            account_data: { events: [] },
                            unread_notifications: {},
                        },
                    },
                },
            }) as unknown as Parameters<SyncAccumulator["accumulate"]>[0];
        accumulator.accumulate(sync([a1], "s1"));
        accumulator.accumulate(sync([r1], "s2"));
        const cached = accumulator.getJSON(true).roomsData.join[ROOM].timeline.events;
        expect(cached.map((e) => e.event_id)).toEqual(["$a1", "$r1"]);

        await room.addLiveEvents(
            cached.map((e) => new MatrixEvent(e as Partial<IEvent>)),
            { addToState: false, fromCache: true },
        );
        expect(room.findEventById("$a1")!.isRedacted()).toBe(true);
        expect(room.findEventById("$a1")!.getContent()).toEqual({});
    });
});
