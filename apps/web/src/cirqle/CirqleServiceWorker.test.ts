/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// @vitest-environment happy-dom

import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";

import { type CirqleWorkerScope, installCirqlePush, openCirqleChat, showCirqlePush } from "./CirqleServiceWorker";
import { type CirqlePushPayload, pushText, VIEW_ROOM_MESSAGE, writePushRooms } from "./CirqlePushShared";

const ROOM = "!chat:server";
const GROUP = "!group:server";

interface Shown {
    title: string;
    options: NotificationOptions & { data: { roomId?: string; lines: unknown[] } };
    close: () => void;
    tag?: string;
    data: { roomId?: string; lines: unknown[] };
}

interface AppWindow {
    url: string;
    focused: boolean;
    focus: Mock<() => Promise<unknown>>;
    postMessage: Mock<(message: unknown) => void>;
}

function appWindow(url: string, focused: boolean): AppWindow {
    return { url, focused, focus: vi.fn(async () => undefined), postMessage: vi.fn() };
}

describe("Web Push in the service worker", () => {
    let shown: Shown[];
    let windows: AppWindow[];
    let endpoint: string;
    let scope: CirqleWorkerScope;
    let listeners: Record<string, (event: any) => void>;

    const message = (overrides: CirqlePushPayload = {}): CirqlePushPayload => ({
        room_id: ROOM,
        room_name: "Victoria",
        event_id: "$1",
        sender: "@whatsapp_79161234567:server",
        sender_display_name: "Victoria",
        type: "m.room.message",
        content: { msgtype: "m.text", body: "Hello" },
        show_text: true,
        ...overrides,
    });

    beforeEach(async () => {
        shown = [];
        windows = [];
        listeners = {};
        endpoint = "https://fcm.googleapis.com/fcm/send/abc";
        const registration = {
            scope: "https://chat.example/",
            showNotification: vi.fn(async (title: string, options: Shown["options"]) => {
                const notification: Shown = {
                    title,
                    options,
                    tag: options.tag,
                    data: options.data,
                    close: () => (shown = shown.filter((n) => n !== notification)),
                };
                shown = [...shown.filter((n) => !options.tag || n.tag !== options.tag), notification];
            }),
            getNotifications: vi.fn(async ({ tag }: { tag?: string } = {}) =>
                shown.filter((n) => !tag || n.tag === tag),
            ),
            pushManager: {
                getSubscription: vi.fn(async () => ({ endpoint })),
                subscribe: vi.fn(async () => ({ endpoint: "https://fcm.googleapis.com/fcm/send/new" })),
            },
        };
        scope = {
            registration: registration as unknown as ServiceWorkerRegistration,
            clients: { matchAll: vi.fn(async () => windows), openWindow: vi.fn(async () => undefined) },
            addEventListener: (type, listener) => (listeners[type] = listener),
        };
        await writePushRooms({
            [ROOM]: { via: "via Main #1 · WhatsApp", group: false },
            [GROUP]: { via: "via Main #1 · WhatsApp", group: true },
        });
    });

    it("names a private chat by the customer and the number it came to", async () => {
        await showCirqlePush(scope, message());

        expect(shown).toHaveLength(1);
        expect(shown[0].title).toBe("Victoria");
        expect(shown[0].options).toMatchObject({
            body: "Hello\nvia Main #1 · WhatsApp",
            tag: ROOM,
            renotify: true,
            icon: "https://chat.example/cirqle-icons/icon-192.png",
            badge: "https://chat.example/cirqle-icons/badge-72.png",
            data: { roomId: ROOM },
        });
    });

    it("keeps a chat's last messages in its one notification, as WhatsApp does", async () => {
        for (const body of ["one", "two", "three", "four", "five"]) {
            await showCirqlePush(scope, message({ content: { msgtype: "m.text", body } }));
        }

        expect(shown).toHaveLength(1);
        expect(shown[0].options.body).toBe("two\nthree\nfour\nfive\nvia Main #1 · WhatsApp");
    });

    it("names the sender and the group, and who wrote each line", async () => {
        const group = { room_id: GROUP, room_name: "Parents 5B" };
        await showCirqlePush(scope, message({ ...group, sender_display_name: "Anna (WA)" }));
        expect(shown[0].title).toBe("Anna · Parents 5B");
        expect(shown[0].options.body).toBe("Hello\nvia Main #1 · WhatsApp");

        await showCirqlePush(scope, message({ ...group, sender_display_name: "Boris", content: { body: "Hi all" } }));
        expect(shown).toHaveLength(1);
        expect(shown[0].title).toBe("Boris · Parents 5B");
        expect(shown[0].options.body).toBe("Anna: Hello\nBoris: Hi all\nvia Main #1 · WhatsApp");
    });

    it("tells a group from a private chat without the chat map too", async () => {
        await showCirqlePush(scope, message({ room_id: "!unknown:server", room_name: "Parents 5B" }));

        expect(shown[0].title).toBe("Victoria · Parents 5B");
        expect(shown[0].options.body).toBe("Hello");
    });

    it("says what a message is in the chat list's words", () => {
        expect(pushText(message({ content: { msgtype: "m.image", body: "IMG_1.jpg" } }))).toBe("📷 Photo");
        expect(pushText(message({ content: { msgtype: "m.image", body: "Look", filename: "IMG_1.jpg" } }))).toBe(
            "📷 Look",
        );
        expect(
            pushText(message({ content: { "msgtype": "m.audio", "body": "a.ogg", "org.matrix.msc3245.voice": {} } })),
        ).toBe("🎤 Voice message");
        expect(pushText(message({ content: { msgtype: "m.file", body: "Invoice.pdf" } }))).toBe("📄 Invoice.pdf");
        expect(pushText(message({ type: "m.sticker", content: { body: "😀" } }))).toBe("Sticker");
        expect(pushText(message({ content: { msgtype: "m.text", body: "> <@a:server> Hi\n\nYes, at 5" } }))).toBe(
            "Yes, at 5",
        );
        expect(pushText(message({ show_text: false }))).toBe("New message");
    });

    it("shows nothing when the chat is open in the window in front", async () => {
        windows = [appWindow(`https://chat.example/#/room/${ROOM}`, true)];

        await showCirqlePush(scope, message());

        expect(scope.registration.showNotification).not.toHaveBeenCalled();
    });

    it("shows the message when the window in front has another chat open, or is in the background", async () => {
        windows = [
            appWindow("https://chat.example/#/room/!other:server", true),
            appWindow(`https://chat.example/#/room/${ROOM}`, false),
        ];

        await showCirqlePush(scope, message());

        expect(shown).toHaveLength(1);
    });

    it("on Apple's push service shows it and takes it back at once, a push that shows nothing costs the subscription", async () => {
        endpoint = "https://web.push.apple.com/QGuQ";
        windows = [appWindow(`https://chat.example/#/room/${ROOM}`, true)];

        await showCirqlePush(scope, message());

        expect(scope.registration.showNotification).toHaveBeenCalled();
        expect(shown).toHaveLength(0);
    });

    it("opens the chat in the window already open and closes its notifications", async () => {
        const app = appWindow("https://chat.example/#/home", false);
        windows = [app];
        await showCirqlePush(scope, message());
        await showCirqlePush(scope, message({ room_id: GROUP, room_name: "Parents 5B" }));

        await openCirqleChat(scope, shown[0] as unknown as Notification);

        expect(app.postMessage).toHaveBeenCalledWith({ type: VIEW_ROOM_MESSAGE, roomId: ROOM });
        expect(app.focus).toHaveBeenCalled();
        expect(shown.map((n) => n.tag)).toEqual([GROUP]);
    });

    it("opens a new window on the chat when none is open", async () => {
        await showCirqlePush(scope, message());

        await openCirqleChat(scope, shown[0] as unknown as Notification);

        expect(scope.clients.openWindow).toHaveBeenCalledWith(`https://chat.example/#/room/${ROOM}`);
    });

    it("listens for pushes, clicks and a renewed subscription", async () => {
        installCirqlePush(scope);
        const app = appWindow("https://chat.example/#/home", false);
        windows = [app];

        let wait: Promise<unknown> = Promise.resolve();
        listeners.push({ data: { json: () => message() }, waitUntil: (p: Promise<unknown>) => (wait = p) });
        await wait;
        expect(shown).toHaveLength(1);

        listeners.push({
            data: { json: () => JSON.parse("not json") },
            waitUntil: (p: Promise<unknown>) => (wait = p),
        });
        await wait;
        expect(shown.map((n) => n.title)).toContain("CIRQLE Messenger");

        const key = new Uint8Array([4, 1, 2]).buffer;
        listeners.pushsubscriptionchange({
            oldSubscription: { options: { applicationServerKey: key } },
            waitUntil: (p: Promise<unknown>) => (wait = p),
        });
        await wait;
        expect(scope.registration.pushManager.subscribe).toHaveBeenCalledWith({
            userVisibleOnly: true,
            applicationServerKey: key,
        });
        expect(app.postMessage).toHaveBeenCalledWith({ type: "cirqle_push_subscription_changed" });
    });
});
