/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// Element's own room list store, read the CIRQLE way: one list of every chat,
// newest first, narrowed by the picked numbers and the chips. A number's chats
// are the ones its space lists, not Element's space (which also pulls in private
// chats with anyone in the space), so the list, the chips, the picker and the
// rail count the same chats.

import { useCallback, useEffect, useState } from "react";
import { type Room } from "matrix-js-sdk/src/matrix";

import RoomListStoreV3, { LISTS_UPDATE_EVENT } from "../stores/room-list-v3/RoomListStoreV3";
import { DefaultTagID } from "../stores/room-list-v3/skip-list/tag";
import { SDKContextClass } from "../contexts/SDKContextClass";
import { UPDATE_SELECTED_SPACE, UPDATE_TOP_LEVEL_SPACES } from "../stores/spaces";
import {
    RoomNotificationStateStore,
    UPDATE_STATUS_INDICATOR,
} from "../stores/notifications/RoomNotificationStateStore";
import { getMarkedUnreadState } from "../utils/notifications";
import { useMatrixClientContext } from "../contexts/MatrixClientContext";
import { chatKind, contactPhone, getInboxes, type Inbox, networkOf, numberChats } from "./CirqleInboxes";
import { CIRQLE_UI_CHANGED, type CirqleSection, CirqleUiStore } from "./CirqleUiStore";

export type CirqleChip = "all" | "unread" | "favourites" | "groups";

const CHIP_MATCHES: Record<CirqleChip, (room: Room) => boolean> = {
    all: () => true,
    unread: isUnreadChat,
    favourites: (room) => !!room.tags[DefaultTagID.Favourite],
    // WhatsApp and Telegram groups, not rooms someone made in Matrix itself
    groups: (room) => chatKind(room) === "group" && networkOf(room) !== undefined,
};

/** The chips a section offers: channels are never groups, so the Channels list has no Groups chip. */
export function sectionChips(section: CirqleSection): CirqleChip[] {
    return section === "channels" ? ["all", "unread", "favourites"] : ["all", "unread", "favourites", "groups"];
}

/** Re-render whenever the room list, the spaces, the picked numbers or the unread counts change. */
function useListVersion(): number {
    const [version, setVersion] = useState(0);
    useEffect(() => {
        const bump = (): void => setVersion((v) => v + 1);
        RoomListStoreV3.instance.on(LISTS_UPDATE_EVENT, bump);
        SDKContextClass.instance.spaceStore.on(UPDATE_TOP_LEVEL_SPACES, bump);
        SDKContextClass.instance.spaceStore.on(UPDATE_SELECTED_SPACE, bump);
        RoomNotificationStateStore.instance.on(UPDATE_STATUS_INDICATOR, bump);
        CirqleUiStore.on(CIRQLE_UI_CHANGED, bump);
        return () => {
            RoomListStoreV3.instance.off(LISTS_UPDATE_EVENT, bump);
            SDKContextClass.instance.spaceStore.off(UPDATE_TOP_LEVEL_SPACES, bump);
            SDKContextClass.instance.spaceStore.off(UPDATE_SELECTED_SPACE, bump);
            RoomNotificationStateStore.instance.off(UPDATE_STATUS_INDICATOR, bump);
            CirqleUiStore.off(CIRQLE_UI_CHANGED, bump);
        };
    }, []);
    return version;
}

export function useCirqleInboxes(): Inbox[] {
    const client = useMatrixClientContext();
    const version = useListVersion();
    const [inboxes, setInboxes] = useState<Inbox[]>(() => getInboxes(client));
    useEffect(() => setInboxes(getInboxes(client)), [client, version]);
    return inboxes;
}

/** A chat counts as unread like WhatsApp does: it has new messages or was marked unread. */
export function isUnreadChat(room: Room): boolean {
    const state = RoomNotificationStateStore.instance.getRoomState(room);
    return !state.muted && (state.hasUnreadCount || getMarkedUnreadState(room) === true);
}

function inSection(room: Room, section: CirqleSection): boolean {
    return (chatKind(room) === "channel") === (section === "channels");
}

/** The numbers picked in the number picker; none is All numbers. */
export function pickedInboxes(inboxes: Inbox[]): Inbox[] {
    const picked = CirqleUiStore.pickedNumbers;
    return inboxes.filter((inbox) => picked.includes(inbox.spaceId));
}

/** The picked numbers' chats (All numbers when none) in a section, newest first. */
function sectionChats(inboxes: Inbox[], picked: Inbox[], section: CirqleSection): Room[] {
    return numberChats(RoomListStoreV3.instance.getSortedRooms(), inboxes, picked).filter((room) =>
        inSection(room, section),
    );
}

/** Whether the picked numbers (any connected number when none) have a channel: the rail shows Channels only then. */
export function hasChannels(rooms: Room[], inboxes: Inbox[], picked: Inbox[]): boolean {
    return numberChats(rooms, inboxes, picked).some((room) => inSection(room, "channels"));
}

export function useCirqleHasChannels(): boolean {
    const client = useMatrixClientContext();
    const version = useListVersion();
    const read = useCallback(() => {
        const inboxes = getInboxes(client);
        return hasChannels(RoomListStoreV3.instance.getSortedRooms(), inboxes, pickedInboxes(inboxes));
    }, [client]);
    const [has, setHas] = useState(read);
    useEffect(() => setHas(read()), [read, version]);
    return has;
}

/** Unread chats of the given numbers (All numbers when none) in a section. */
export function countUnread(inboxes: Inbox[], picked: Inbox[], section: CirqleSection): number {
    return sectionChats(inboxes, picked, section).filter(isUnreadChat).length;
}

/** Unread chats in every connected number, for the rail. */
export function useCirqleUnreadChats(): number {
    const client = useMatrixClientContext();
    const version = useListVersion();
    const count = useCallback(() => countUnread(getInboxes(client), [], "chats"), [client]);
    const [unread, setUnread] = useState(count);
    useEffect(() => setUnread(count()), [count, version]);
    return unread;
}

export interface CirqleRooms {
    rooms: Room[];
    /** Unread chats in the picked numbers, for the Unread chip */
    unread: number;
}

/** A chat found by its name, or by the customer's number (also when the chat goes by a name, as WhatsApp does). */
export function matchesChatSearch(room: Room, inboxes: Inbox[], needle: string, digits: string): boolean {
    const name = room.name.toLocaleLowerCase();
    if (name.includes(needle)) return true;
    if (digits.length < 3) return false;
    const phone = contactPhone(room, inboxes)?.replace(/[^\d]/g, "") ?? "";
    return name.replace(/[^\d]/g, "").includes(digits) || phone.includes(digits);
}

export function useCirqleRooms(inboxes: Inbox[], section: CirqleSection, chip: CirqleChip, query: string): CirqleRooms {
    const version = useListVersion();
    const read = useCallback((): CirqleRooms => {
        const all = sectionChats(inboxes, pickedInboxes(inboxes), section);
        const shown = all.filter(CHIP_MATCHES[chip]);
        const needle = query.trim().toLocaleLowerCase();
        const digits = needle.replace(/[^\d]/g, "");
        const rooms = needle ? shown.filter((room) => matchesChatSearch(room, inboxes, needle, digits)) : shown;
        return { rooms, unread: all.filter(isUnreadChat).length };
    }, [inboxes, section, chip, query]);
    const [result, setResult] = useState(read);
    useEffect(() => setResult(read()), [read, version]);
    return result;
}
