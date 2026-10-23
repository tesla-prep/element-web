/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// Element's own room list store, read the CIRQLE way: one list of every chat,
// newest first, narrowed by the picked number and the chips.

import { useCallback, useEffect, useState } from "react";
import { type Room } from "matrix-js-sdk/src/matrix";

import RoomListStoreV3, { LISTS_UPDATE_EVENT } from "../stores/room-list-v3/RoomListStoreV3";
import { FilterEnum, type FilterKey } from "../stores/room-list-v3/skip-list/filters";
import { SDKContextClass } from "../contexts/SDKContextClass";
import { UPDATE_SELECTED_SPACE, UPDATE_TOP_LEVEL_SPACES } from "../stores/spaces";
import { RoomNotificationStateStore, UPDATE_STATUS_INDICATOR } from "../stores/notifications/RoomNotificationStateStore";
import { getMarkedUnreadState } from "../utils/notifications";
import { useMatrixClientContext } from "../contexts/MatrixClientContext";
import { chatKind, getInboxes, type Inbox } from "./CirqleInboxes";
import { type CirqleSection } from "./CirqleUiStore";

export type CirqleChip = "all" | "unread" | "favourites" | "groups";

const CHIP_FILTERS: Record<CirqleChip, FilterKey[] | undefined> = {
    all: undefined,
    unread: [FilterEnum.UnreadFilter],
    favourites: [FilterEnum.FavouriteFilter],
    groups: [FilterEnum.RoomsFilter],
};

/** Re-render whenever the room list, the spaces or the unread counts change. */
function useListVersion(): number {
    const [version, setVersion] = useState(0);
    useEffect(() => {
        const bump = (): void => setVersion((v) => v + 1);
        RoomListStoreV3.instance.on(LISTS_UPDATE_EVENT, bump);
        SDKContextClass.instance.spaceStore.on(UPDATE_TOP_LEVEL_SPACES, bump);
        SDKContextClass.instance.spaceStore.on(UPDATE_SELECTED_SPACE, bump);
        RoomNotificationStateStore.instance.on(UPDATE_STATUS_INDICATOR, bump);
        return () => {
            RoomListStoreV3.instance.off(LISTS_UPDATE_EVENT, bump);
            SDKContextClass.instance.spaceStore.off(UPDATE_TOP_LEVEL_SPACES, bump);
            SDKContextClass.instance.spaceStore.off(UPDATE_SELECTED_SPACE, bump);
            RoomNotificationStateStore.instance.off(UPDATE_STATUS_INDICATOR, bump);
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

/** Unread chats in every number, for the rail. */
export function useCirqleUnreadChats(): number {
    const version = useListVersion();
    const count = useCallback(
        () => RoomListStoreV3.instance.getSortedRooms().filter((r) => inSection(r, "chats") && isUnreadChat(r)).length,
        [],
    );
    const [unread, setUnread] = useState(count);
    useEffect(() => setUnread(count()), [count, version]);
    return unread;
}

export interface CirqleRooms {
    rooms: Room[];
    /** Unread chats in the picked number, for the Unread chip */
    unread: number;
}

export function useCirqleRooms(section: CirqleSection, chip: CirqleChip, query: string): CirqleRooms {
    const version = useListVersion();
    const read = useCallback((): CirqleRooms => {
        const store = RoomListStoreV3.instance;
        const all = store.getSortedRoomsInActiveSpace().sections.flatMap((s) => s.rooms);
        const shown = store
            .getSortedRoomsInActiveSpace(CHIP_FILTERS[chip])
            .sections.flatMap((s) => s.rooms)
            .filter((room) => inSection(room, section));
        const needle = query.trim().toLocaleLowerCase();
        const digits = needle.replace(/[^\d]/g, "");
        const rooms = needle
            ? shown.filter((room) => {
                  const name = room.name.toLocaleLowerCase();
                  return name.includes(needle) || (digits.length >= 3 && name.replace(/[^\d]/g, "").includes(digits));
              })
            : shown;
        return { rooms, unread: all.filter((r) => inSection(r, section) && isUnreadChat(r)).length };
    }, [section, chip, query]);
    const [result, setResult] = useState(read);
    useEffect(() => setResult(read()), [read, version]);
    return result;
}
