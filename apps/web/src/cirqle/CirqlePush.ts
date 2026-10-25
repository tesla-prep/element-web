/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// Web Push: new customer messages on this device even with CIRQLE Messenger closed.
//
//   this app ── PushManager.subscribe(VAPID key) ──> the browser's push service (FCM, Apple, Mozilla, Windows)
//      └─ POST /pushers/set (pushkey = p256dh; endpoint, auth) ──> tuwunel
//   tuwunel ── a customer's message (CirqlePushRules) ──> Sygnal ──> push service ──> sw.js (CirqleServiceWorker)
//
// On or off per device: the browser's permission plus this device's pusher,
// remembered in localStorage. Element's own notifications stay quiet while it is
// on (Notifier hook), the service worker shows every message instead. The app
// keeps the chat map the service worker reads (CirqlePushShared) and closes a
// chat's notifications once the chat is read, here or on another device.

import {
    ClientEvent,
    type IPusher,
    type MatrixClient,
    type MatrixEvent,
    type Room,
    RoomEvent,
    SyncState,
} from "matrix-js-sdk/src/matrix";
import { logger } from "matrix-js-sdk/src/logger";
import { GenericToast } from "@element-hq/web-shared-components";

import PlatformPeg from "../PlatformPeg";
import dis from "../dispatcher/dispatcher";
import { Action } from "../dispatcher/actions";
import { type ViewRoomPayload } from "../dispatcher/payloads/ViewRoomPayload";
import ToastStore from "../stores/ToastStore";
import { type CirqlePushConfig, cirqlePushConfig } from "./CirqleFeatures";
import { chatKind, getInboxes, inboxesOf } from "./CirqleInboxes";
import { ownGhostsKey, syncCirqlePushRules } from "./CirqlePushRules";
import {
    type CirqlePushRooms,
    SUBSCRIPTION_CHANGED_MESSAGE,
    VIEW_ROOM_MESSAGE,
    writePushRooms,
} from "./CirqlePushShared";

/** unsupported: no Web Push here; install: iPhone/iPad, only from the Home Screen; blocked: by the browser */
export type CirqlePushState = "unsupported" | "install" | "blocked" | "off" | "on";

const DEVICE_KEY = "cirqle_push_device";
const PROMPT_SEEN_KEY = "cirqle_push_prompt_seen";
export const PROMPT_TOAST = "cirqle_push_prompt";
const SIGN_OUT_WAIT_MS = 3000;

interface PushDevice {
    userId: string;
    pushkey: string;
    endpoint: string;
}

function storedDevice(): PushDevice | undefined {
    try {
        return JSON.parse(localStorage.getItem(DEVICE_KEY) ?? "null") ?? undefined;
    } catch {
        return undefined;
    }
}

function isAppleMobile(): boolean {
    return (
        /iPhone|iPad|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
    );
}

/** Opened from the Home Screen (or installed on a computer), not in a browser tab. */
export function isStandalone(): boolean {
    return (
        window.matchMedia?.("(display-mode: standalone)").matches === true ||
        (navigator as { standalone?: boolean }).standalone === true
    );
}

export function cirqlePushState(): CirqlePushState {
    if (!cirqlePushConfig()) return "unsupported";
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        return isAppleMobile() && !isStandalone() ? "install" : "unsupported";
    }
    if (Notification.permission === "denied") return "blocked";
    return Notification.permission === "granted" && storedDevice() ? "on" : "off";
}

/** While this device gets pushes, the service worker shows every message and Element's own notifications stay quiet. */
export function isCirqlePushOn(): boolean {
    return cirqlePushState() === "on";
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
    const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
    return Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")), (c) => c.charCodeAt(0));
}

function sameKey(subscription: PushSubscription, key: Uint8Array): boolean {
    const current = subscription.options?.applicationServerKey;
    if (!current) return false;
    const bytes = new Uint8Array(current);
    return bytes.length === key.length && bytes.every((byte, i) => byte === key[i]);
}

/** This browser's subscription for the server's key: kept while the key is the same, renewed otherwise. */
async function subscribe(config: CirqlePushConfig): Promise<PushSubscription> {
    const registration = await navigator.serviceWorker.ready;
    const key = keyBytes(config.vapidPublicKey);
    const existing = await registration.pushManager.getSubscription();
    if (existing && sameKey(existing, key)) return existing;
    await existing?.unsubscribe();
    return registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
}

/** Sygnal's Web Push pusher: the pushkey is the subscription's p256dh, base64url as the browser gives it. */
async function registerPusher(
    client: MatrixClient,
    config: CirqlePushConfig,
    subscription: PushSubscription,
): Promise<void> {
    const { keys } = subscription.toJSON();
    if (!keys?.p256dh || !keys.auth) throw new Error("The browser's push subscription has no keys");
    const previous = storedDevice();
    await client.setPusher({
        kind: "http",
        app_id: config.appId,
        pushkey: keys.p256dh,
        app_display_name: "CIRQLE Messenger",
        device_display_name: PlatformPeg.get()?.getDefaultDeviceDisplayName() ?? "CIRQLE Messenger",
        lang: navigator.language || "en",
        data: {
            url: config.gatewayUrl,
            endpoint: subscription.endpoint,
            auth: keys.auth,
            // tuwunel also sends count-only pushes; a push that shows nothing would cost the subscription
            events_only: true,
            default_payload: { show_text: config.showMessageText },
        } as IPusher["data"],
    });
    if (previous && previous.pushkey !== keys.p256dh && previous.userId === client.getUserId()) {
        await client
            .removePusher(previous.pushkey, config.appId)
            .catch((e) => logger.warn("CIRQLE push: old pusher", e));
    }
    const device: PushDevice = {
        userId: client.getSafeUserId(),
        pushkey: keys.p256dh,
        endpoint: subscription.endpoint,
    };
    localStorage.setItem(DEVICE_KEY, JSON.stringify(device));
}

/** Only from a click: iOS asks for the permission on a user gesture alone. */
export async function enableCirqlePush(client: MatrixClient): Promise<CirqlePushState> {
    const config = cirqlePushConfig();
    const state = cirqlePushState();
    if (!config || state === "unsupported" || state === "install") return state;
    if ((await Notification.requestPermission()) !== "granted") return cirqlePushState();
    await registerPusher(client, config, await subscribe(config));
    ToastStore.sharedInstance().dismissToast(PROMPT_TOAST);
    await writeRoomMap(client).catch((e) => logger.warn("CIRQLE push: chat map", e));
    return cirqlePushState();
}

export async function disableCirqlePush(client: MatrixClient): Promise<void> {
    const config = cirqlePushConfig();
    const device = storedDevice();
    localStorage.removeItem(DEVICE_KEY);
    if (config && device) {
        await client.removePusher(device.pushkey, config.appId).catch((e) => logger.warn("CIRQLE push: pusher", e));
    }
    const registration = await navigator.serviceWorker?.getRegistration();
    await (await registration?.pushManager.getSubscription())?.unsubscribe();
}

/** Sign out (Lifecycle hook): the homeserver drops the device's pushers with it, the browser's subscription goes here. */
export async function cirqlePushSignOut(client: MatrixClient): Promise<void> {
    if (!cirqlePushConfig() || !storedDevice()) return;
    await Promise.race([
        disableCirqlePush(client).catch((e) => logger.warn("CIRQLE push: sign out", e)),
        new Promise((resolve) => setTimeout(resolve, SIGN_OUT_WAIT_MS)),
    ]);
}

/**
 * On start and when the browser renews the subscription: the homeserver has
 * this device's current subscription. It may not, after the browser replaced
 * it or after Sygnal reported it gone and the homeserver dropped the pusher.
 */
export async function refreshCirqlePush(client: MatrixClient): Promise<void> {
    const config = cirqlePushConfig();
    const device = storedDevice();
    if (!config || !device || !("Notification" in window)) return;
    if (Notification.permission !== "granted") {
        // withdrawn in the browser's settings
        await disableCirqlePush(client);
        return;
    }
    const subscription = await subscribe(config);
    const p256dh = subscription.toJSON().keys?.p256dh;
    const { pushers = [] } = await client.getPushers();
    const registered = pushers.some((pusher) => {
        const data = pusher.data as { url?: string; endpoint?: string; default_payload?: { show_text?: boolean } };
        return (
            pusher.app_id === config.appId &&
            pusher.pushkey === p256dh &&
            data.url === config.gatewayUrl &&
            data.endpoint === subscription.endpoint &&
            data.default_payload?.show_text === config.showMessageText
        );
    });
    if (!registered || device.userId !== client.getUserId()) await registerPusher(client, config, subscription);
}

/** What the service worker needs to name a chat: its number and whether it is a group. */
export function pushRooms(client: MatrixClient): CirqlePushRooms {
    const inboxes = getInboxes(client);
    const rooms: CirqlePushRooms = {};
    for (const room of client.getRooms()) {
        const own = inboxesOf(room, inboxes);
        if (!own.length || room.isSpaceRoom()) continue;
        const network = own[0].network === "telegram" ? "Telegram" : "WhatsApp";
        rooms[room.roomId] = {
            via: `via ${own.map((inbox) => inbox.label).join(", ")} · ${network}`,
            group: chatKind(room) !== "chat",
        };
    }
    return rooms;
}

let writtenRooms = "";

async function writeRoomMap(client: MatrixClient): Promise<void> {
    if (!isCirqlePushOn()) return;
    const rooms = pushRooms(client);
    const json = JSON.stringify(rooms);
    if (json === writtenRooms) return;
    await writePushRooms(rooms);
    writtenRooms = json;
}

async function closeRoomNotifications(roomId: string): Promise<void> {
    const registration = await navigator.serviceWorker?.getRegistration();
    for (const notification of (await registration?.getNotifications({ tag: roomId })) ?? []) notification.close();
}

/** A receipt event with our own read receipt in it: the chat was read, here or on another device. */
function readByMe(event: MatrixEvent, userId: string): boolean {
    return Object.values(event.getContent() ?? {}).some((byType) =>
        Object.values((byType ?? {}) as Record<string, Record<string, unknown>>).some((users) => !!users?.[userId]),
    );
}

function isPhone(): boolean {
    return /Android|iPhone|iPad|iPod|Mobile/.test(navigator.userAgent);
}

/** Once per device, while the browser has not been asked: the permission itself is asked on Enable alone. */
export function maybeShowCirqlePushPrompt(client: MatrixClient): void {
    if (cirqlePushState() !== "off" || Notification.permission !== "default") return;
    if (localStorage.getItem(PROMPT_SEEN_KEY)) return;
    const seen = (): void => {
        localStorage.setItem(PROMPT_SEEN_KEY, "true");
        ToastStore.sharedInstance().dismissToast(PROMPT_TOAST);
    };
    ToastStore.sharedInstance().addOrReplaceToast({
        key: PROMPT_TOAST,
        title: isPhone() ? "Get new messages on this phone" : "Get new messages on this computer",
        props: {
            description: "Customers' messages show up here even when CIRQLE Messenger is closed.",
            primaryLabel: "Enable",
            onPrimaryClick: () => {
                const enabled = enableCirqlePush(client);
                seen();
                void enabled.catch((e) => logger.warn("CIRQLE push: enable", e));
            },
            secondaryLabel: "Not now",
            onSecondaryClick: seen,
        },
        component: GenericToast,
        priority: 30,
    });
}

/** Mounted with the rail: keeps the push rules, the pusher and the chat map in step with the account. */
export function watchCirqlePush(client: MatrixClient): () => void {
    if (!cirqlePushConfig()) return () => {};
    let ghosts: string | undefined;
    let started = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    writtenRooms = "";

    const update = (): void => {
        timer = undefined;
        void writeRoomMap(client).catch((e) => logger.warn("CIRQLE push: chat map", e));
        const key = ownGhostsKey(client);
        if (key === ghosts) return;
        ghosts = key;
        void syncCirqlePushRules(client).catch((e) => {
            ghosts = undefined;
            logger.warn("CIRQLE push: push rules", e);
        });
    };
    const start = (): void => {
        started = true;
        update();
        void refreshCirqlePush(client).catch((e) => logger.warn("CIRQLE push: pusher", e));
        maybeShowCirqlePushPrompt(client);
    };
    const onSync = (state: SyncState): void => {
        if (state !== SyncState.Prepared && state !== SyncState.Syncing) return;
        if (!started) start();
        else timer ??= setTimeout(update, 5000);
    };
    const onReceipt = (event: MatrixEvent, room: Room): void => {
        if (readByMe(event, client.getSafeUserId())) void closeRoomNotifications(room.roomId);
    };
    const onWorkerMessage = (event: MessageEvent): void => {
        if (event.data?.type === VIEW_ROOM_MESSAGE && typeof event.data.roomId === "string") {
            dis.dispatch<ViewRoomPayload>({
                action: Action.ViewRoom,
                room_id: event.data.roomId,
                metricsTrigger: "Notification",
            });
        } else if (event.data?.type === SUBSCRIPTION_CHANGED_MESSAGE) {
            void refreshCirqlePush(client).catch((e) => logger.warn("CIRQLE push: pusher", e));
        }
    };

    client.on(ClientEvent.Sync, onSync);
    client.on(RoomEvent.Receipt, onReceipt);
    navigator.serviceWorker?.addEventListener("message", onWorkerMessage);
    if (client.isInitialSyncComplete()) start();
    return () => {
        client.off(ClientEvent.Sync, onSync);
        client.off(RoomEvent.Receipt, onReceipt);
        navigator.serviceWorker?.removeEventListener("message", onWorkerMessage);
        clearTimeout(timer);
    };
}
