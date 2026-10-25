/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// What the app and the service worker share for Web Push (CirqlePush,
// CirqleServiceWorker). The service worker has no client state, so the app
// keeps a small map of chats (which number, private chat or group) in
// IndexedDB for it. Nothing here may import app code: the service worker
// bundle stays small and DOM-free.

/** One chat as a notification names it. */
export interface CirqlePushRoom {
    /** The last line of the notification: "via Main #1 · WhatsApp" */
    via: string;
    group: boolean;
}

export type CirqlePushRooms = Record<string, CirqlePushRoom>;

/** What Sygnal posts: the notification tuwunel sent, plus the pusher's default_payload. */
export interface CirqlePushPayload {
    room_id?: string;
    room_name?: string;
    event_id?: string;
    sender?: string;
    sender_display_name?: string;
    type?: string;
    content?: Record<string, any>;
    unread?: number;
    show_text?: boolean;
}

/** service worker → app: open this chat */
export const VIEW_ROOM_MESSAGE = "cirqle_view_room";
/** service worker → app: the browser replaced the push subscription, tell the homeserver */
export const SUBSCRIPTION_CHANGED_MESSAGE = "cirqle_push_subscription_changed";

const DB_NAME = "cirqle-push";
const STORE = "kv";
const ROOMS_KEY = "rooms";

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (): void => {
            request.result.createObjectStore(STORE);
        };
        request.onsuccess = (): void => resolve(request.result);
        request.onerror = (): void => reject(request.error);
    });
}

async function transact<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await openDb();
    try {
        return await new Promise<T>((resolve, reject) => {
            const request = run(db.transaction(STORE, mode).objectStore(STORE));
            request.onsuccess = (): void => resolve(request.result);
            request.onerror = (): void => reject(request.error);
        });
    } finally {
        db.close();
    }
}

export async function readPushRooms(): Promise<CirqlePushRooms> {
    return ((await transact("readonly", (store) => store.get(ROOMS_KEY))) as CirqlePushRooms | undefined) ?? {};
}

export async function writePushRooms(rooms: CirqlePushRooms): Promise<void> {
    await transact("readwrite", (store) => store.put(rooms, ROOMS_KEY));
}

function withCaption(label: string, content: Record<string, any>): string {
    const caption = content.filename && content.body !== content.filename ? content.body : undefined;
    return caption ? `${label.split(" ")[0]} ${caption}` : label;
}

/** A reply's text without the quoted message some bridges still put in front of it. */
function stripReplyFallback(body: string): string {
    const lines = body.split("\n");
    if (!lines[0]?.startsWith("> ")) return body;
    while (lines[0]?.startsWith(">")) lines.shift();
    return lines.join("\n").trim();
}

/** What a message says in a notification, in the chat list's words (CirqlePreview). */
export function pushText(payload: CirqlePushPayload): string {
    if (payload.show_text === false) return "New message";
    const content = payload.content ?? {};
    switch (payload.type) {
        case "m.sticker":
            return "Sticker";
        case "m.room.encrypted":
            return "Encrypted message";
        case "m.poll.start":
        case "org.matrix.msc3381.poll.start": {
            const poll = content["org.matrix.msc3381.poll.start"] ?? content["m.poll"];
            const question = poll?.question?.body ?? poll?.question?.["org.matrix.msc1767.text"];
            return typeof question === "string" ? `📊 ${question}` : "📊 Poll";
        }
    }
    switch (content.msgtype) {
        case "m.image":
            return withCaption("📷 Photo", content);
        case "m.video":
            return withCaption("🎥 Video", content);
        case "m.audio":
            return content["org.matrix.msc3245.voice"] ? "🎤 Voice message" : "🎵 Audio";
        case "m.file":
            return `📄 ${content.filename ?? content.body ?? "File"}`;
        case "m.location":
            return "📍 Location";
    }
    return typeof content.body === "string" && content.body ? stripReplyFallback(content.body) : "New message";
}

/** "Anna (WA)" as "Anna", as the chat list shows names. */
export function pushName(name: string | undefined): string | undefined {
    return name?.replace(/\s*\((WA|TG|Telegram)\)$/, "") || undefined;
}
