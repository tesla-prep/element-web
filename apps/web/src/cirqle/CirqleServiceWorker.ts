/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// Web Push in the service worker (src/serviceworker/index.ts installs it).
//
// Each push is one message from a customer: the homeserver's push rules
// (CirqlePushRules) already left out staff, the numbers' own ghosts and the
// bots, so every push here is shown, as Safari and Chrome require. A chat is one
// notification (tagged with its room id) holding its last few messages, as on
// WhatsApp: "Victoria" / "Hello\nAre you open today?\nvia Main #1 · WhatsApp".
// Clicking it opens the chat in a window that is already open, or a new one.

import {
    type CirqlePushPayload,
    type CirqlePushRooms,
    pushName,
    pushText,
    readPushRooms,
    SUBSCRIPTION_CHANGED_MESSAGE,
    VIEW_ROOM_MESSAGE,
} from "./CirqlePushShared";

/** The last few messages of a chat stay in its notification. */
const MAX_LINES = 4;

interface WindowClientLike {
    url: string;
    focused: boolean;
    focus(): Promise<unknown>;
    postMessage(message: unknown): void;
}

interface ExtendableEventLike {
    waitUntil(promise: Promise<unknown>): void;
}

interface PushEventLike extends ExtendableEventLike {
    data?: { json(): unknown } | null;
}

interface NotificationClickLike extends ExtendableEventLike {
    notification: Notification;
}

interface SubscriptionChangeLike extends ExtendableEventLike {
    oldSubscription?: PushSubscription | null;
}

/** The parts of the service worker's global scope this uses (the DOM typings have no worker types). */
export interface CirqleWorkerScope {
    registration: ServiceWorkerRegistration;
    clients: {
        matchAll(options: { type: "window"; includeUncontrolled: boolean }): Promise<readonly WindowClientLike[]>;
        openWindow(url: string): Promise<unknown>;
    };
    addEventListener(type: string, listener: (event: any) => void): void;
}

interface NotificationLine {
    sender?: string;
    text: string;
}

function showsRoom(client: WindowClientLike, roomId: string): boolean {
    const hash = decodeURIComponent(new URL(client.url).hash);
    const prefix = `#/room/${roomId}`;
    return hash === prefix || hash.startsWith(prefix + "/") || hash.startsWith(prefix + "?");
}

function windows(scope: CirqleWorkerScope): Promise<readonly WindowClientLike[]> {
    return scope.clients.matchAll({ type: "window", includeUncontrolled: true });
}

async function closeRoomNotifications(scope: CirqleWorkerScope, roomId: string): Promise<void> {
    for (const notification of await scope.registration.getNotifications({ tag: roomId })) notification.close();
}

/** Apple's push service revokes a subscription whose pushes show nothing, even with the app in front. */
async function isApplePush(scope: CirqleWorkerScope): Promise<boolean> {
    const subscription = await scope.registration.pushManager.getSubscription();
    return !!subscription && new URL(subscription.endpoint).hostname.endsWith(".push.apple.com");
}

export async function showCirqlePush(scope: CirqleWorkerScope, payload: CirqlePushPayload): Promise<void> {
    const roomId = payload.room_id;
    const open = !!roomId && (await windows(scope)).some((client) => client.focused && showsRoom(client, roomId));
    if (open && !(await isApplePush(scope))) return;

    const rooms = await readPushRooms().catch((): CirqlePushRooms => ({}));
    const room = roomId ? rooms[roomId] : undefined;
    const sender = pushName(payload.sender_display_name) ?? payload.sender;
    const roomName = pushName(payload.room_name);
    const group = room?.group ?? (!!roomName && roomName !== sender);
    const previous = roomId ? await scope.registration.getNotifications({ tag: roomId }) : [];
    const earlier: NotificationLine[] = previous[0]?.data?.lines ?? [];
    const lines = [...earlier, { sender, text: pushText(payload) }].slice(-MAX_LINES);

    const title =
        group && roomName
            ? sender
                ? `${sender} · ${roomName}`
                : roomName
            : (sender ?? roomName ?? "CIRQLE Messenger");
    const body = [
        ...lines.map((line) => (group && lines.length > 1 && line.sender ? `${line.sender}: ${line.text}` : line.text)),
        ...(room?.via ? [room.via] : []),
    ].join("\n");
    const asset = (path: string): string => new URL(path, scope.registration.scope).href;
    await scope.registration.showNotification(title, {
        body,
        tag: roomId,
        renotify: !!roomId,
        icon: asset("cirqle-icons/icon-192.png"),
        badge: asset("cirqle-icons/badge-96.png"),
        timestamp: Date.now(),
        data: { roomId, lines },
    } as NotificationOptions);
    if (open && roomId) await closeRoomNotifications(scope, roomId);
}

export async function openCirqleChat(scope: CirqleWorkerScope, notification: Notification): Promise<void> {
    const roomId: string | undefined = notification.data?.roomId;
    notification.close();
    if (roomId) await closeRoomNotifications(scope, roomId);
    const open = await windows(scope);
    const target = open.find((client) => client.focused) ?? open[0];
    if (target) {
        if (roomId) target.postMessage({ type: VIEW_ROOM_MESSAGE, roomId });
        await target.focus().catch(() => {});
        return;
    }
    await scope.clients.openWindow(new URL(roomId ? `#/room/${roomId}` : "", scope.registration.scope).href);
}

async function renewSubscription(scope: CirqleWorkerScope, old?: PushSubscription | null): Promise<void> {
    const applicationServerKey = old?.options?.applicationServerKey;
    if (applicationServerKey) {
        await scope.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
    }
    // An open app tells the homeserver; otherwise the app does when it next starts (CirqlePush)
    for (const client of await windows(scope)) client.postMessage({ type: SUBSCRIPTION_CHANGED_MESSAGE });
}

export function installCirqlePush(scope: CirqleWorkerScope): void {
    scope.addEventListener("push", (event: PushEventLike) => {
        let payload: CirqlePushPayload = {};
        try {
            payload = (event.data?.json() as CirqlePushPayload) ?? {};
        } catch {
            // not JSON: still show something, a push that shows nothing costs the subscription
        }
        event.waitUntil(showCirqlePush(scope, payload));
    });
    scope.addEventListener("notificationclick", (event: NotificationClickLike) => {
        event.waitUntil(openCirqleChat(scope, event.notification));
    });
    scope.addEventListener("pushsubscriptionchange", (event: SubscriptionChangeLike) => {
        event.waitUntil(renewSubscription(scope, event.oldSubscription));
    });
}
