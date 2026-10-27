/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// CIRQLE Messenger: what the staff build of Element leaves out. Every switch the
// fork adds to upstream code goes through here, so an upstream merge only has to
// keep the one-line hooks that call it.

import { logger } from "matrix-js-sdk/src/logger";

import { UIComponent } from "../settings/UIFeature";
import SdkConfig from "../SdkConfig";

/** Staff never set up key backup or verify devices: the bridged chats are not encrypted. */
const HIDDEN_TOAST_PREFIXES = ["setupencryption", "reviewsessions", "unverified_session_", "analytics"];

const HIDDEN_COMPONENTS = new Set<string>([
    UIComponent.ExploreRooms,
    UIComponent.AddIntegrations,
    UIComponent.CreateSpaces,
]);

/**
 * Settings the CIRQLE look depends on, the same for everyone whatever they chose
 * in the stock Element (which shares this browser storage at chat.cirqlecirqle.com/).
 */
export const CIRQLE_FORCED_SETTINGS: Record<string, unknown> = {
    "layout": "bubble",
    "alwaysShowTimestamps": true,
    "showJoinLeaves": false,
    "showAvatarChanges": false,
    "showDisplaynameChanges": false,
    "showReadReceipts": false,
    "RoomList.showMessagePreview": true,
    "RoomList.showSections": false,
    "Spaces.allRoomsInHome": true,
    "RoomList.preferredSorting": "Recency",
};

/**
 * The CIRQLE build: cirqle/config.json names the brand. What CIRQLE takes out of
 * Element's own screens (below and in CirqleMessages, CirqleSettings) is behind
 * it, so Element's own tests keep running against stock Element.
 */
export const CIRQLE_BRAND = "CIRQLE Messenger";

export function isCirqleMessenger(): boolean {
    return SdkConfig.get().brand === CIRQLE_BRAND;
}

/** Web Push (CirqlePush): `cirqle_push` in config.json, filled in by cirqle/deploy.sh. */
export interface CirqlePushConfig {
    /** Sygnal behind the homeserver's nginx: https://matrix.cirqlecirqle.com/_matrix/push/v1/notify */
    gatewayUrl: string;
    appId: string;
    /** The VAPID public key, base64url, from the server's data/sygnal/vapid_public_key.txt */
    vapidPublicKey: string;
    /** Message text in notifications (lock screens included), or just "New message" */
    showMessageText: boolean;
}

/** Without the server's key (or outside CIRQLE) there is no push: every part of it hides. */
export function cirqlePushConfig(): CirqlePushConfig | undefined {
    if (!isCirqleMessenger()) return undefined;
    const raw = (SdkConfig.get() as { cirqle_push?: Record<string, unknown> }).cirqle_push;
    const { gateway_url: gatewayUrl, app_id: appId, vapid_public_key: vapidPublicKey } = raw ?? {};
    if (typeof gatewayUrl !== "string" || typeof appId !== "string" || typeof vapidPublicKey !== "string")
        return undefined;
    if (!gatewayUrl || !appId || !vapidPublicKey) return undefined;
    return { gatewayUrl, appId, vapidPublicKey, showMessageText: raw?.show_message_text !== false };
}

/**
 * "Read" and "typing" reach the customer from the number (the relay bot passes
 * staff's public read receipts and typing on), so every staff member sends them.
 */
export const CIRQLE_PRESENCE: Record<string, unknown> = {
    sendReadReceipts: true,
    sendTypingNotifications: true,
};

/** One language for every staff member: CIRQLE's own screens are in English. */
export const CIRQLE_LANGUAGE = "en";

/**
 * Slash commands that only change how a message reads. Every other one renames
 * or re-pictures the customer's group for everyone on WhatsApp (/roomname,
 * /topic, /roomavatar), removes people (/remove), edits Matrix plumbing (/op,
 * /devtools, /converttodm) or opens chats past CIRQLE (/msg, /join). Typed
 * anyway, Element offers to send them as a plain message.
 */
const ALLOWED_COMMANDS = new Set(["plain", "shrug", "tableflip", "unflip", "lenny"]);

/**
 * Phones stay in the web app, which has its own phone layout, instead of being
 * sent to Element's page that offers Element X (Element X cannot pick a number).
 */
export const CIRQLE_MOBILE_GUIDE_REDIRECT = false;

/**
 * Since 27.10.2026 the client API is also served on the app's own domain
 * (chat.cirqlecirqle.com/_matrix, cirqle/nginx.conf): no CORS preflight before
 * each request, and the page and the API share one connection. A session signed
 * in before keeps the old address in mx_hs_url; `cirqle_moved_homeservers` in
 * config.json lists such addresses, and they move to default_server_config's
 * base_url, with no new sign-in. The access token and the device stay the same:
 * it is the same homeserver.
 */
export function cirqleMovedHomeserverUrl(stored: string | null): string | null {
    const config = SdkConfig.get() as { cirqle_moved_homeservers?: unknown };
    const target = SdkConfig.get().default_server_config?.["m.homeserver"]?.base_url;
    const moved = config.cirqle_moved_homeservers;
    if (!stored || !target || !Array.isArray(moved)) return stored;
    const bare = (url: string): string => url.replace(/\/+$/, "");
    if (bare(stored) === bare(target)) return stored;
    if (!moved.some((url) => typeof url === "string" && bare(url) === bare(stored))) return stored;
    localStorage.setItem("mx_hs_url", target);
    logger.info(`CIRQLE: the homeserver moved from ${stored} to ${target}`);
    return target;
}

/**
 * The start fails with "Unable to load session" when the crypto WASM (or a
 * script) does not download: a network change or a dropped connection on the
 * way to Ashburn. Nothing in the page can try again (the crypto library keeps
 * its failed load), and the dialog's way out signs the person out. So the page
 * reloads instead, twice at most within two minutes, which downloads it again;
 * after that the dialog shows as before.
 */
const START_RELOADS_KEY = "cirqle_start_reloads";
const START_RELOADS = 2;
const START_RELOADS_WINDOW_MS = 2 * 60 * 1000;

export function isCirqleDownloadFailure(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    if (["CompileError", "ChunkLoadError"].includes(error.name)) return true;
    return /WebAssembly|wasm|Failed to fetch|NetworkError|Network error|Load failed|Loading chunk/i.test(error.message);
}

/** True when the page is reloading for another try; the caller stops there. */
export function reloadCirqleAfterDownloadFailure(error: unknown, now = Date.now()): boolean {
    if (!isCirqleMessenger() || !isCirqleDownloadFailure(error)) return false;
    let tries: number[] = [];
    try {
        tries = JSON.parse(sessionStorage.getItem(START_RELOADS_KEY) ?? "[]");
    } catch {}
    tries = tries.filter((t) => typeof t === "number" && now - t < START_RELOADS_WINDOW_MS);
    if (tries.length >= START_RELOADS) return false;
    sessionStorage.setItem(START_RELOADS_KEY, JSON.stringify([...tries, now]));
    logger.warn(`CIRQLE: the app did not download (${error}), reloading for try ${tries.length + 2}`);
    setTimeout(() => window.location.reload(), 1000 + tries.length * 2000);
    return true;
}

/** The one theme the CIRQLE look is drawn on. */
export const CIRQLE_THEME = "light";

/**
 * Element's setTheme polls for the stylesheet for 2 s and then rejects with
 * nothing, which index.ts shows as "Your Element is misconfigured". On the
 * first visit after a deploy the theme is not cached yet, and on a slow or
 * lossy connection it often takes longer. The stylesheet is already enabled
 * and applies as soon as it arrives, so the app starts instead of failing.
 * A real load error (an Event) still fails as before.
 */
export function cirqleThemeStillLoading(error: unknown): void {
    if (error !== undefined) throw error;
    logger.warn("CIRQLE: the theme stylesheet is still loading after 2 s, starting the app anyway");
}

export function isCirqleHiddenToast(key: string): boolean {
    // Element's "Enable desktop notifications" turns on notifications for an open tab only; ours (CirqlePush) take its place
    if (key === "desktopnotifications" && cirqlePushConfig()) return true;
    return HIDDEN_TOAST_PREFIXES.some((prefix) => key.startsWith(prefix));
}

export function isCirqleHiddenComponent(component: string): boolean {
    return HIDDEN_COMPONENTS.has(component);
}

export function isCirqleHiddenCommand(command: string): boolean {
    return isCirqleMessenger() && !ALLOWED_COMMANDS.has(command);
}

/**
 * A poll that arrives from WhatsApp shows its votes but takes none: the bridge
 * drops a vote staff cast through the relay, so it would only count here.
 * "3 votes · Vote on the phone"
 */
export function cirqlePollTotal(votes: number): string {
    return `${votes === 1 ? "1 vote" : `${votes} votes`} · Vote on the phone`;
}

/**
 * Ctrl/Cmd+K: the search box of the chat list (or of New chat, when it is
 * open), not Element's Spotlight, which creates Matrix rooms past CIRQLE.
 */
export function focusCirqleSearch(): void {
    document.querySelector<HTMLInputElement>(".cirqle_ChatList_search input")?.focus();
}
