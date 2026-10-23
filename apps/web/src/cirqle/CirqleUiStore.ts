/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// What the left column shows: the chat list or the channel list (picked on the
// rail), or the New chat or New group panel in its place.

import { EventEmitter } from "events";

import { useEventEmitterState } from "../hooks/useEventEmitter";

export type CirqleSection = "chats" | "channels";
export type CirqlePanel = "list" | "newChat" | "newGroup";

export const CIRQLE_UI_CHANGED = "changed";

class CirqleUiStoreClass extends EventEmitter {
    public section: CirqleSection = "chats";
    public panel: CirqlePanel = "list";
    /** What the person had typed into the list search when they opened New chat */
    public newChatQuery = "";

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

    /** Back to the list from New chat or New group */
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
