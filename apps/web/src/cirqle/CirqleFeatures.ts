/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// CIRQLE Messenger: what the staff build of Element leaves out. Every switch the
// fork adds to upstream code goes through here, so an upstream merge only has to
// keep the one-line hooks that call it.

import { UIComponent } from "../settings/UIFeature";

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
};

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
