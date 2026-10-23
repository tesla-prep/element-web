/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// CIRQLE Messenger: what the staff build of Element leaves out. Every switch the
// fork adds to upstream code goes through here, so an upstream merge only has to
// keep the one-line hooks that call it.

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

/** The one theme the CIRQLE look is drawn on. */
export const CIRQLE_THEME = "light";

export function isCirqleHiddenToast(key: string): boolean {
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
