/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { afterEach, describe, expect, it, vi } from "vitest";
import { Direction, type Room } from "matrix-js-sdk/src/matrix";

import { resetCirqleWarmup, WARM_CHATS, warmCirqleChat, warmCirqleChats } from "./CirqleWarmup";

function fakeRoom(id: string, events: number, token: string | null = "t", calls: string[] = []): Room {
    const timeline = {
        events: new Array(events).fill(0),
        getEvents() {
            return this.events;
        },
        getPaginationToken: (dir: Direction) => (dir === Direction.Backward ? token : null),
    };
    const client = {
        paginateEventTimeline: vi.fn(async () => {
            calls.push(id);
            timeline.events.push(...new Array(50).fill(0));
            return true;
        }),
    };
    return { roomId: id, client, getLiveTimeline: () => timeline } as unknown as Room;
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe("CirqleWarmup", () => {
    afterEach(() => resetCirqleWarmup());

    it("pages back only the chats at the top of the list that are short of events", async () => {
        const calls: string[] = [];
        const rooms = Array.from({ length: WARM_CHATS + 3 }, (_, i) => fakeRoom(`!r${i}`, 5, "t", calls));
        rooms[1] = fakeRoom("!full", 80, "t", calls);
        rooms[2] = fakeRoom("!start", 5, null, calls);
        warmCirqleChats(rooms);
        for (let i = 0; i < 10; i++) await flush();
        expect(new Set(calls).size).toBe(WARM_CHATS - 2);
        expect(calls).not.toContain("!full");
        expect(calls).not.toContain("!start");
        expect(calls).not.toContain(`!r${WARM_CHATS}`);
    });

    it("stops paging once a screen of events is loaded", async () => {
        const calls: string[] = [];
        warmCirqleChats([fakeRoom("!a", 5, "t", calls)]);
        for (let i = 0; i < 10; i++) await flush();
        expect(calls).toEqual(["!a", "!a"]);
    });

    it("puts the chat being opened in front of the queue and warms each chat once", async () => {
        const calls: string[] = [];
        const rooms = ["!a", "!b", "!c", "!d"].map((id) => fakeRoom(id, 5, "t", calls));
        warmCirqleChats(rooms);
        warmCirqleChat(rooms[3]);
        warmCirqleChats(rooms);
        for (let i = 0; i < 20; i++) await flush();
        expect(calls.indexOf("!d")).toBeLessThan(calls.indexOf("!c"));
        expect(calls.filter((id) => id === "!d")).toHaveLength(2);
    });
});
