/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// @vitest-environment happy-dom

import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { type MatrixClient, MatrixEvent, Room, RoomEvent } from "matrix-js-sdk/src/matrix";
import { stubClient } from "test-utils";

import SdkConfig from "../SdkConfig";
import dis from "../dispatcher/dispatcher";
import { Action } from "../dispatcher/actions";
import ToastStore from "../stores/ToastStore";
import { CIRQLE_BRAND, cirqlePushConfig, isCirqleHiddenToast } from "./CirqleFeatures";
import { type Inbox } from "./CirqleInboxes";
import {
    cirqlePushSignOut,
    cirqlePushState,
    disableCirqlePush,
    enableCirqlePush,
    isCirqlePushOn,
    maybeShowCirqlePushPrompt,
    PROMPT_TOAST,
    pushRooms,
    refreshCirqlePush,
    watchCirqlePush,
} from "./CirqlePush";
import { VIEW_ROOM_MESSAGE } from "./CirqlePushShared";

const inboxes = vi.hoisted(() => ({ list: [] as Inbox[] }));
vi.mock("./CirqleInboxes", async (original) => ({
    ...(await original<typeof import("./CirqleInboxes")>()),
    getInboxes: () => inboxes.list,
    chatKind: (room: Room) => (room.roomId.startsWith("!group") ? "group" : "chat"),
}));
vi.mock("./CirqlePushRules", () => ({ syncCirqlePushRules: vi.fn(async () => {}), ownGhostsKey: () => "" }));

const VAPID_KEY = "BHxhKBthARTwT7cWjgeMEWFjmO9h4bICQI8Iv4YDVyJBkO66E8LTfBJDw4Smksb8xr6znVLlpCGrPJxTruIch44";
const GATEWAY = "https://matrix.cirqlecirqle.com/_matrix/push/v1/notify";
const APP_ID = "com.cirqlecirqle.chat.web";
const ENDPOINT = "https://fcm.googleapis.com/fcm/send/abc";

function keyBytes(key: string): Uint8Array {
    const base64 = key.replace(/-/g, "+").replace(/_/g, "/");
    return Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")), (c) => c.charCodeAt(0));
}

interface FakeSubscription {
    endpoint: string;
    options: { applicationServerKey: ArrayBuffer };
    toJSON(): { endpoint: string; keys: { p256dh: string; auth: string } };
    unsubscribe: Mock<() => Promise<boolean>>;
}

describe("Web Push on this device", () => {
    let client: MatrixClient;
    let permission: NotificationPermission;
    let answer: NotificationPermission;
    let subscription: FakeSubscription | null;
    let workerListener: ((event: MessageEvent) => void) | undefined;
    let notifications: { close: Mock<() => void> }[];
    let pushManager: {
        getSubscription: Mock<() => Promise<FakeSubscription | null>>;
        subscribe: Mock<(options: PushSubscriptionOptionsInit) => Promise<FakeSubscription>>;
    };
    let registration: {
        pushManager: typeof pushManager;
        getNotifications: Mock<(filter: { tag: string }) => Promise<typeof notifications>>;
    };
    const userAgent = navigator.userAgent;

    const makeSubscription = (endpoint: string, key: string, p256dh = "BP256DH"): FakeSubscription => {
        const made: FakeSubscription = {
            endpoint,
            options: { applicationServerKey: keyBytes(key).buffer as ArrayBuffer },
            toJSON: () => ({ endpoint, keys: { p256dh, auth: "AUTH" } }),
            unsubscribe: vi.fn(async () => {
                if (subscription === made) subscription = null;
                return true;
            }),
        };
        return made;
    };

    const define = (target: object, name: string, value: unknown): void => {
        Object.defineProperty(target, name, { value, configurable: true, writable: true });
    };

    const config = (key = VAPID_KEY): void => {
        SdkConfig.put({
            brand: CIRQLE_BRAND,
            cirqle_push: { gateway_url: GATEWAY, app_id: APP_ID, vapid_public_key: key, show_message_text: true },
        } as Parameters<typeof SdkConfig.put>[0]);
    };

    beforeEach(() => {
        client = stubClient();
        Object.assign(client, { removePusher: vi.fn().mockResolvedValue({}) });
        localStorage.clear();
        config();
        inboxes.list = [];
        permission = "default";
        answer = "granted";
        subscription = null;
        notifications = [{ close: vi.fn() }];
        pushManager = {
            getSubscription: vi.fn(async () => subscription),
            subscribe: vi.fn(async () => (subscription = makeSubscription(ENDPOINT, VAPID_KEY))),
        };
        registration = { pushManager, getNotifications: vi.fn(async () => notifications) };
        define(window, "Notification", {
            get permission() {
                return permission;
            },
            requestPermission: vi.fn(async () => (permission = answer)),
        });
        define(window, "PushManager", function PushManager() {});
        define(navigator, "serviceWorker", {
            ready: Promise.resolve(registration),
            getRegistration: vi.fn(async () => registration),
            addEventListener: vi.fn(
                (_type: string, listener: (event: MessageEvent) => void) => (workerListener = listener),
            ),
            removeEventListener: vi.fn(),
        });
    });

    afterEach(() => {
        SdkConfig.reset();
        delete (window as { Notification?: unknown }).Notification;
        delete (window as { PushManager?: unknown }).PushManager;
        delete (navigator as { serviceWorker?: unknown }).serviceWorker;
        define(navigator, "userAgent", userAgent);
        vi.restoreAllMocks();
    });

    it("hides itself without the server's key", () => {
        config("");
        const on = vi.spyOn(client, "on");

        expect(cirqlePushConfig()).toBeUndefined();
        expect(cirqlePushState()).toBe("unsupported");
        watchCirqlePush(client)();
        expect(on).not.toHaveBeenCalled();
        expect(isCirqleHiddenToast("desktopnotifications")).toBe(false);
    });

    it("takes the place of Element's notifications prompt", () => {
        expect(isCirqleHiddenToast("desktopnotifications")).toBe(true);
    });

    it("says what this device can do", () => {
        expect(cirqlePushState()).toBe("off");
        permission = "denied";
        expect(cirqlePushState()).toBe("blocked");

        delete (window as { PushManager?: unknown }).PushManager;
        define(navigator, "userAgent", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15");
        expect(cirqlePushState()).toBe("install");
        define(navigator, "userAgent", "Mozilla/5.0 (X11; Linux x86_64) Firefox/140.0");
        expect(cirqlePushState()).toBe("unsupported");
    });

    it("subscribes with the server's key and registers Sygnal's pusher", async () => {
        expect(await enableCirqlePush(client)).toBe("on");

        expect(window.Notification.requestPermission).toHaveBeenCalled();
        const options = pushManager.subscribe.mock.calls[0][0];
        expect(options.userVisibleOnly).toBe(true);
        expect(Array.from(options.applicationServerKey as Uint8Array)).toEqual(Array.from(keyBytes(VAPID_KEY)));
        expect(client.setPusher).toHaveBeenCalledWith({
            kind: "http",
            app_id: APP_ID,
            pushkey: "BP256DH",
            app_display_name: "CIRQLE Messenger",
            device_display_name: expect.any(String),
            lang: expect.any(String),
            data: {
                url: GATEWAY,
                endpoint: ENDPOINT,
                auth: "AUTH",
                events_only: true,
                default_payload: { show_text: true },
            },
        });
        expect(isCirqlePushOn()).toBe(true);
    });

    it("stays off when the permission is refused", async () => {
        answer = "denied";

        expect(await enableCirqlePush(client)).toBe("blocked");

        expect(pushManager.subscribe).not.toHaveBeenCalled();
        expect(client.setPusher).not.toHaveBeenCalled();
    });

    it("subscribes again when the server's key changed", async () => {
        const old = makeSubscription("https://fcm.googleapis.com/fcm/send/old", "BAAA", "OLDKEY");
        subscription = old;

        await enableCirqlePush(client);

        expect(old.unsubscribe).toHaveBeenCalled();
        expect(pushManager.subscribe).toHaveBeenCalled();
    });

    it("on start, registers the pusher again when the homeserver dropped it, and only then", async () => {
        await enableCirqlePush(client);
        vi.mocked(client.setPusher).mockClear();
        vi.mocked(client.getPushers).mockResolvedValue({ pushers: [] });

        await refreshCirqlePush(client);
        expect(client.setPusher).toHaveBeenCalledTimes(1);

        const [registered] = vi.mocked(client.setPusher).mock.calls[0];
        vi.mocked(client.getPushers).mockResolvedValue({ pushers: [registered] });
        await refreshCirqlePush(client);
        expect(client.setPusher).toHaveBeenCalledTimes(1);
    });

    it("turns itself off when the browser's permission was withdrawn", async () => {
        await enableCirqlePush(client);
        permission = "default";

        await refreshCirqlePush(client);

        expect(client.removePusher).toHaveBeenCalledWith("BP256DH", APP_ID);
        expect(cirqlePushState()).toBe("off");
    });

    it("turns off: the pusher goes and the browser unsubscribes, on sign out too", async () => {
        await enableCirqlePush(client);
        const subscribed = subscription!;

        await disableCirqlePush(client);
        expect(client.removePusher).toHaveBeenCalledWith("BP256DH", APP_ID);
        expect(subscribed.unsubscribe).toHaveBeenCalled();
        expect(cirqlePushState()).toBe("off");

        await enableCirqlePush(client);
        vi.mocked(client.removePusher).mockClear();
        await cirqlePushSignOut(client);
        expect(client.removePusher).toHaveBeenCalledWith("BP256DH", APP_ID);
    });

    it("tells the service worker which number each chat is on", () => {
        const space = {
            spaceId: "!space:server",
            network: "whatsapp",
            label: "Main #1",
            childIds: new Set(["!chat:server", "!group:server"]),
        };
        inboxes.list = [space as Inbox];
        vi.mocked(client.getRooms).mockReturnValue(
            ["!chat:server", "!group:server", "!elsewhere:server"].map(
                (id) => new Room(id, client, client.getSafeUserId()),
            ),
        );

        expect(pushRooms(client)).toEqual({
            "!chat:server": { via: "via Main #1 · WhatsApp", group: false },
            "!group:server": { via: "via Main #1 · WhatsApp", group: true },
        });
    });

    it("opens the chat a notification was for, and closes a chat's notifications once it is read", async () => {
        await enableCirqlePush(client);
        const dispatch = vi.spyOn(dis, "dispatch").mockImplementation(() => {});
        const stop = watchCirqlePush(client);

        workerListener!({ data: { type: VIEW_ROOM_MESSAGE, roomId: "!chat:server" } } as MessageEvent);
        expect(dispatch).toHaveBeenCalledWith(
            expect.objectContaining({
                action: Action.ViewRoom,
                room_id: "!chat:server",
                metricsTrigger: "Notification",
            }),
        );

        const receipt = new MatrixEvent({
            type: "m.receipt",
            content: { $last: { "m.read": { [client.getSafeUserId()]: { ts: 1 } } } },
        });
        client.emit(RoomEvent.Receipt, receipt, new Room("!chat:server", client, client.getSafeUserId()));
        await vi.waitFor(() => expect(notifications[0].close).toHaveBeenCalled());
        expect(registration.getNotifications).toHaveBeenCalledWith({ tag: "!chat:server" });
        stop();
    });

    it("asks once, softly; the browser is asked only on Enable", () => {
        const add = vi.spyOn(ToastStore.sharedInstance(), "addOrReplaceToast");

        maybeShowCirqlePushPrompt(client);
        expect(add).toHaveBeenCalledWith(expect.objectContaining({ key: PROMPT_TOAST }));
        expect(window.Notification.requestPermission).not.toHaveBeenCalled();

        const toast = add.mock.calls[0][0] as unknown as { props: { onSecondaryClick: () => void } };
        toast.props.onSecondaryClick();
        add.mockClear();
        maybeShowCirqlePushPrompt(client);
        expect(add).not.toHaveBeenCalled();
    });

    it("asks nothing once the browser was asked", () => {
        permission = "denied";
        const add = vi.spyOn(ToastStore.sharedInstance(), "addOrReplaceToast");

        maybeShowCirqlePushPrompt(client);

        expect(add).not.toHaveBeenCalled();
    });
});
