/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// When a chat last had activity, the way WhatsApp and Telegram order their chat
// lists: a message someone wrote, in or out, text or media. Joins, renames and
// other room state, the bridges' and the relay bot's own messages, edits,
// reactions and receipts leave a chat where it is.
//
// Element's recency looks only at the events sync loaded (the last 20 of each
// room), counts our own joins, and takes the oldest loaded event when none of
// them counts. The relay bot joins staff to every chat and the bridges keep
// renaming them, so hundreds of chats had only such events loaded and sorted
// by when that happened. When the loaded events hold no message, the server is
// asked once for the last one before them, and the answer is kept in the
// browser until the chat's loaded events change.

import {
    Direction,
    EventType,
    Filter,
    type IEvent,
    type IRoomEvent,
    M_POLL_START,
    MatrixEvent,
    RelationType,
    type Room,
    TypedEventEmitter,
} from "matrix-js-sdk/src/matrix";
import { logger } from "matrix-js-sdk/src/logger";

import { EffectiveMembership, getEffectiveMembership } from "../utils/membership";

const MESSAGE_TYPES: string[] = [
    EventType.RoomMessage,
    EventType.Sticker,
    EventType.RoomMessageEncrypted,
    M_POLL_START.name,
    M_POLL_START.altName,
];

/** The bridges' bots and the relay bot talk to staff, never to a customer. */
const BOT_USER = /^@(whatsappbot|telegrambot|relay-bot):/;

/** A chat's last activity turned out different from what the list sorted it by. */
export const CIRQLE_ACTIVITY_UPDATE = "cirqle_activity_update";

const STORAGE_KEY = "cirqle_chat_activity_v2";
const PAGE_SIZE = 50;
const PAGES = 4;
const PARALLEL = 4;

/** A message someone in the chat wrote: what moves a chat to the top. */
export function isChatActivity(event: MatrixEvent): boolean {
    if (event.isState() || !MESSAGE_TYPES.includes(event.getType())) return false;
    if (event.isRelation(RelationType.Replace)) return false;
    return !BOT_USER.test(event.getSender() ?? "");
}

function creationTs(room: Room): number {
    return room.currentState.getStateEvents(EventType.RoomCreate, "")?.getTs() ?? 0;
}

/** What the chat list preview needs of a message, kept small for localStorage. */
function trim(raw: IRoomEvent): Partial<IEvent> {
    const { body, formatted_body: _html, ...content } = raw.content;
    return {
        event_id: raw.event_id,
        type: raw.type,
        sender: raw.sender,
        origin_server_ts: raw.origin_server_ts,
        content: { ...content, body: typeof body === "string" ? body.slice(0, 300) : body },
        unsigned: raw.unsigned?.redacted_because ? { redacted_because: raw.unsigned.redacted_because } : undefined,
    };
}

interface Known {
    /** The back-pagination token of the live timeline the answer is for */
    token: string;
    ts: number;
    /** The message itself, for the chat list preview */
    event?: Partial<IEvent>;
}

export class CirqleActivityStore extends TypedEventEmitter<
    typeof CIRQLE_ACTIVITY_UPDATE,
    { [CIRQLE_ACTIVITY_UPDATE]: (room: Room) => void }
> {
    private known: Record<string, Known> | undefined;
    private failed = new Map<string, string>();
    private queue: Room[] = [];
    private queued = new Set<string>();
    private running = 0;
    private saveTimer: number | undefined;
    private events = new Map<string, MatrixEvent>();

    /** When the chat last had activity, 0 while the server is being asked. */
    public lastActivity(room: Room): number {
        return this.latest(room).ts;
    }

    /** The message that last moved the chat, for its preview; undefined while unknown or when there is none. */
    public lastActivityEvent(room: Room): MatrixEvent | undefined {
        return this.latest(room).event;
    }

    private latest(room: Room): { ts: number; event?: MatrixEvent } {
        if (getEffectiveMembership(room.getMyMembership()) !== EffectiveMembership.Join) {
            const membership = room.currentState.getStateEvents(EventType.RoomMember, room.client.getSafeUserId());
            if (membership) return { ts: membership.getTs() };
        }
        const events = room.getLiveTimeline().getEvents();
        for (let i = events.length - 1; i >= 0; i--) {
            if (isChatActivity(events[i]) && events[i].getTs()) return { ts: events[i].getTs(), event: events[i] };
        }
        const token = room.getLiveTimeline().getPaginationToken(Direction.Backward);
        if (!token) return { ts: creationTs(room) };
        const known = this.store()[room.roomId];
        if (known?.token !== token && this.failed.get(room.roomId) !== token) this.ask(room);
        return { ts: known?.ts ?? 0, event: known?.event && this.cachedEvent(room.roomId, known.event) };
    }

    private cachedEvent(roomId: string, raw: Partial<IEvent>): MatrixEvent {
        const key = raw.event_id ?? "";
        let event = this.events.get(key);
        if (!event) {
            event = new MatrixEvent({ ...raw, room_id: roomId });
            this.events.set(key, event);
        }
        return event;
    }

    private store(): Record<string, Known> {
        if (!this.known) {
            try {
                this.known = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, Known>;
            } catch {
                this.known = {};
            }
        }
        return this.known;
    }

    private ask(room: Room): void {
        if (this.queued.has(room.roomId)) return;
        this.queued.add(room.roomId);
        this.queue.push(room);
        this.next();
    }

    private next(): void {
        while (this.running < PARALLEL && this.queue.length > 0) {
            const room = this.queue.shift()!;
            this.running++;
            void this.fetch(room).finally(() => {
                this.running--;
                this.queued.delete(room.roomId);
                this.next();
            });
        }
    }

    /** The newest message before the live timeline, from the server. */
    private async fetch(room: Room): Promise<void> {
        const token = room.getLiveTimeline().getPaginationToken(Direction.Backward);
        if (!token) return;
        const filter = new Filter(room.client.getSafeUserId());
        filter.setDefinition({ room: { timeline: { types: MESSAGE_TYPES } } });
        let from: string | undefined = token;
        let found: IRoomEvent | undefined;
        try {
            for (let page = 0; page < PAGES && from && !found; page++) {
                const response = await room.client.createMessagesRequest(
                    room.roomId,
                    from,
                    PAGE_SIZE,
                    Direction.Backward,
                    filter,
                );
                found = response.chunk.find((raw) => isChatActivity(new MatrixEvent(raw)));
                from = response.end;
            }
        } catch (error) {
            logger.warn(`Cirqle: could not find the last message in ${room.roomId}`, error);
            this.failed.set(room.roomId, token);
            return;
        }
        const known = this.store();
        const before = known[room.roomId];
        known[room.roomId] = found
            ? { token, ts: found.origin_server_ts, event: trim(found) }
            : { token, ts: creationTs(room) };
        this.save();
        const after = known[room.roomId];
        if (after.ts !== before?.ts || after.event?.event_id !== before?.event?.event_id) {
            this.emit(CIRQLE_ACTIVITY_UPDATE, room);
        }
    }

    private save(): void {
        window.clearTimeout(this.saveTimer);
        this.saveTimer = window.setTimeout(() => {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(this.store()));
            } catch (error) {
                logger.warn("Cirqle: could not keep the chat activity", error);
            }
        }, 1000);
    }
}

export const CirqleActivity = new CirqleActivityStore();

/** The recency the chat list sorts by and shows: the last activity in the chat or its threads. */
export function cirqleLastTimestamp(room: Room): number {
    const threads = room.getThreads().map((thread) => {
        const event = thread.replyToEvent ?? thread.rootEvent;
        return event && isChatActivity(event) ? event.getTs() : 0;
    });
    return Math.max(CirqleActivity.lastActivity(room), ...threads);
}
