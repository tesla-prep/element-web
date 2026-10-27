/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// Opening a chat used to show a spinner for 2-4 s: sync brings the last few
// events of a room, and bridged chats begin with dozens of hidden member and
// bridge state events, so Element pages back 2-3 times (one round trip each to
// the homeserver) before it has the messages and knows where the chat starts.
// The top of the chat list is paged back ahead of time, a few chats at a time,
// and the chat under the finger or the pointer (a hover on a computer) goes
// first. History comes without room members (skipCirqleMembersInHistory), so
// one page of 150 is usually a screen of messages even in a bridged group.

import { Direction, EventType, Filter, type IRoomEventFilter, type Room } from "matrix-js-sdk/src/matrix";
import { logger } from "matrix-js-sdk/src/logger";

/** How many chats from the top of the list are made ready to open */
export const WARM_CHATS = 30;
/** Enough events for a screen of messages once the hidden state events are dropped */
const WARM_EVENTS = 60;
const PAGE_EVENTS = 150;
const MAX_PAGES = 2;
const PARALLEL = 3;

/**
 * Back-pagination and /context leave the room's member events out. In a bridged
 * group most of the history is the bridge's joins and invites, which CIRQLE
 * hides anyway (isPlumbingEvent): "CIRQLE | Frisco" took 8 pages of 50 events
 * for one screen. The senders' own member events still come with every page
 * (lazy loading), so names and avatars are unchanged.
 */
export function skipCirqleMembersInHistory(): void {
    (Filter.LAZY_LOADING_MESSAGES_FILTER as IRoomEventFilter).not_types = [EventType.RoomMember];
}

const warmed = new Set<string>();
const queue: Room[] = [];
let running = 0;

function needsWarming(room: Room): boolean {
    const timeline = room.getLiveTimeline();
    return timeline.getEvents().length < WARM_EVENTS && !!timeline.getPaginationToken(Direction.Backward);
}

async function warm(room: Room): Promise<void> {
    const timeline = room.getLiveTimeline();
    for (let page = 0; page < MAX_PAGES && needsWarming(room); page++) {
        const more = await room.client.paginateEventTimeline(timeline, { backwards: true, limit: PAGE_EVENTS });
        if (!more) break;
    }
}

function next(): void {
    while (running < PARALLEL && queue.length > 0) {
        const room = queue.shift()!;
        running++;
        warm(room)
            .catch((error) => logger.warn(`Cirqle: could not page back ${room.roomId} ahead of time`, error))
            .finally(() => {
                running--;
                next();
            });
    }
}

function enqueue(room: Room, first: boolean): void {
    if (warmed.has(room.roomId)) {
        if (!first) return;
        const index = queue.indexOf(room);
        if (index < 0) return;
        queue.splice(index, 1);
    } else {
        warmed.add(room.roomId);
        if (!needsWarming(room)) return;
    }
    if (first) queue.unshift(room);
    else queue.push(room);
    next();
}

/** Pages back the chats at the top of the list, once per chat in this tab. */
export function warmCirqleChats(rooms: Room[]): void {
    for (const room of rooms.slice(0, WARM_CHATS)) enqueue(room, false);
}

/** The chat about to be opened (pointer down on its row) goes to the front of the queue. */
export function warmCirqleChat(room: Room): void {
    enqueue(room, true);
}

/** For tests */
export function resetCirqleWarmup(): void {
    warmed.clear();
    queue.length = 0;
    running = 0;
}
