/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// What the left column shows: the chat list or the channel list (picked on the
// rail), or the New chat, New group or New channel panel in its place; and the
// numbers picked in the number picker, kept in this browser.

import { EventEmitter } from "events";

import { useEventEmitterState } from "../hooks/useEventEmitter";

export type CirqleSection = "chats" | "channels";
export type CirqlePanel = "list" | "newChat" | "newGroup" | "newChannel";

export const CIRQLE_UI_CHANGED = "changed";

/** localStorage: the spaces of the numbers picked in the number picker, `[]` for All numbers */
export const PICKED_NUMBERS_KEY = "cirqle_picked_numbers";

function readPickedNumbers(): string[] | undefined {
    try {
        const stored = JSON.parse(localStorage.getItem(PICKED_NUMBERS_KEY) ?? "null");
        return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === "string") : undefined;
    } catch {
        return undefined;
    }
}

class CirqleUiStoreClass extends EventEmitter {
    public section: CirqleSection = "chats";
    public panel: CirqlePanel = "list";
    /** What the person had typed into the list search when they opened New chat */
    public newChatQuery = "";
    /** The numbers' spaces picked in the number picker; none is All numbers */
    public pickedNumbers: string[] = readPickedNumbers() ?? [];
    /** Nothing was picked in this browser yet: the picker may take over Element's active space once */
    public pickedNumbersUnset = readPickedNumbers() === undefined;

    public pickNumbers(spaceIds: string[]): void {
        const picked = Array.from(new Set(spaceIds));
        if (!this.pickedNumbersUnset && picked.join() === this.pickedNumbers.join()) return;
        this.pickedNumbers = picked;
        this.pickedNumbersUnset = false;
        try {
            localStorage.setItem(PICKED_NUMBERS_KEY, JSON.stringify(picked));
        } catch {
            // private mode: the pick lasts until the page reloads
        }
        this.emit(CIRQLE_UI_CHANGED);
    }

    public showSection(section: CirqleSection): void {
        this.section = section;
        this.panel = "list";
        this.emit(CIRQLE_UI_CHANGED);
    }

    public openNewChat(query = ""): void {
        this.newChatQuery = query;
        this.panel = "newChat";
        this.emit(CIRQLE_UI_CHANGED);
    }

    public openNewGroup(): void {
        this.panel = "newGroup";
        this.emit(CIRQLE_UI_CHANGED);
    }

    public openNewChannel(): void {
        this.panel = "newChannel";
        this.emit(CIRQLE_UI_CHANGED);
    }

    /** Back to the list from New chat, New group or New channel */
    public closePanel(): void {
        this.panel = "list";
        this.emit(CIRQLE_UI_CHANGED);
    }
}

export const CirqleUiStore = new CirqleUiStoreClass();

export function useCirqleUi(): { section: CirqleSection; panel: CirqlePanel } {
    return useEventEmitterState(CirqleUiStore, CIRQLE_UI_CHANGED, () => ({
        section: CirqleUiStore.section,
        panel: CirqleUiStore.panel,
    }));
}

/** The picked numbers' spaces, re-read whenever the pick changes */
export function useCirqlePickedNumbers(): string[] {
    return useEventEmitterState(CirqleUiStore, CIRQLE_UI_CHANGED, () => CirqleUiStore.pickedNumbers);
}
