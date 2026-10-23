/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// The chat list, WhatsApp Web style, in place of Element's room list:
// «Chats», the number picker, New chat, the menu, search, chips and one list of
// every chat, newest first, each with the number it goes out from.

import React, { type JSX, useCallback, useContext, useEffect, useMemo, useState } from "react";
import classNames from "classnames";
import { type Room } from "matrix-js-sdk/src/matrix";
import { Menu, MenuItem } from "@vector-im/compound-web";
import { useCreateAutoDisposedViewModel, useViewModel } from "@element-hq/web-shared-components";

import dis from "../dispatcher/dispatcher";
import { Action } from "../dispatcher/actions";
import { type ViewRoomPayload } from "../dispatcher/payloads/ViewRoomPayload";
import { SDKContext } from "../contexts/SDKContext";
import { useMatrixClientContext } from "../contexts/MatrixClientContext";
import { UPDATE_EVENT } from "../stores/AsyncStore";
import { useEventEmitterState } from "../hooks/useEventEmitter";
import { RoomListItemViewModel } from "../viewmodels/room-list/RoomListItemViewModel";
import { getLastTimestamp } from "../stores/room-list-v3/skip-list/sorters/utils/getLastTimestamp";
import { formatTime } from "../DateUtils";
import RoomAvatar from "../components/views/avatars/RoomAvatar";
import { CirqleNumberPicker } from "./CirqleNumberPicker";
import { ChannelIcon, GroupIcon, KebabIcon, PencilIcon, PlusIcon, SearchIcon, SettingsIcon } from "./CirqleIcons";
import { type Inbox, numberLine, stripNetworkSuffix } from "./CirqleInboxes";
import { CirqleUiStore, type CirqleSection } from "./CirqleUiStore";
import { type CirqleChip, isUnreadChat, useCirqleInboxes, useCirqleRooms } from "./useCirqleChats";

const PAGE = 60;

/** "10:42" today, "Yesterday", "Mon" this week, else "10/12/26", like WhatsApp. */
export function chatTime(ts: number): string {
    if (!ts) return "";
    const date = new Date(ts);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const day = 24 * 60 * 60 * 1000;
    if (ts >= startOfToday) return formatTime(date);
    if (ts >= startOfToday - day) return "Yesterday";
    if (ts >= startOfToday - 6 * day) return date.toLocaleDateString("en-US", { weekday: "short" });
    return date.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit" });
}

export function createGroup(): void {
    dis.dispatch({ action: Action.CreateRoom });
}

export function createChannel(): void {
    // A public room is a WhatsApp channel: the relay bot creates it (createRoom, public, no contacts)
    dis.dispatch({ action: Action.CreateRoom, public: true });
}

function ChatRow({ room, inboxes, selected }: { room: Room; inboxes: Inbox[]; selected: boolean }): JSX.Element {
    const client = useMatrixClientContext();
    const vm = useCreateAutoDisposedViewModel(() => new RoomListItemViewModel({ room, client }));
    const item = useViewModel(vm);
    const unread = isUnreadChat(room);
    const count = item.notification.count;
    const line = numberLine(room, inboxes);

    const open = (): void => {
        dis.dispatch<ViewRoomPayload>({ action: Action.ViewRoom, room_id: room.roomId, metricsTrigger: "RoomList" });
    };

    return (
        <button
            className={classNames("cirqle_ChatRow", { cirqle_ChatRow_selected: selected })}
            onClick={open}
            aria-current={selected ? "page" : undefined}
        >
            <RoomAvatar room={room} size="48px" />
            <span className="cirqle_ChatRow_body">
                <span className="cirqle_ChatRow_top">
                    <span className="cirqle_ChatRow_name">{stripNetworkSuffix(item.name)}</span>
                    <span className={classNames("cirqle_ChatRow_time", { cirqle_ChatRow_time_unread: unread })}>
                        {chatTime(getLastTimestamp(room, client.getSafeUserId()))}
                    </span>
                </span>
                <span className="cirqle_ChatRow_middle">
                    <span className="cirqle_ChatRow_preview">{item.messagePreview ?? ""}</span>
                    {unread && <span className="cirqle_badge">{count > 0 ? count : ""}</span>}
                </span>
                {line.text && (
                    <span className={`cirqle_ChatRow_line cirqle_net_${line.network ?? "none"}`}>
                        <span className={`cirqle_dot cirqle_dot_${line.network ?? "none"}`} />
                        {line.text}
                    </span>
                )}
            </span>
        </button>
    );
}

const CHIPS: { chip: CirqleChip; label: string }[] = [
    { chip: "all", label: "All" },
    { chip: "unread", label: "Unread" },
    { chip: "favourites", label: "Favourites" },
    { chip: "groups", label: "Groups" },
];

export function CirqleChatList({ section }: { section: CirqleSection }): JSX.Element {
    const sdkContext = useContext(SDKContext);
    const inboxes = useCirqleInboxes();
    const [chip, setChip] = useState<CirqleChip>("all");
    const [query, setQuery] = useState("");
    const [menuOpen, setMenuOpen] = useState(false);
    const [shown, setShown] = useState(PAGE);
    const { rooms, unread } = useCirqleRooms(section, chip, query);
    const currentRoomId = useEventEmitterState(sdkContext.roomViewStore, UPDATE_EVENT, () =>
        sdkContext.roomViewStore.getRoomId(),
    );

    useEffect(() => setShown(PAGE), [section, chip, query]);
    const onScroll = useCallback(
        (ev: React.UIEvent<HTMLDivElement>) => {
            const el = ev.currentTarget;
            if (el.scrollTop + el.clientHeight > el.scrollHeight - 600 && shown < rooms.length) setShown(shown + PAGE);
        },
        [shown, rooms.length],
    );
    const visible = useMemo(() => rooms.slice(0, shown), [rooms, shown]);
    const title = section === "channels" ? "Channels" : "Chats";

    return (
        <section className="cirqle_ChatList" aria-label="Chat list">
            <div className="cirqle_ChatList_header">
                <h1 className="cirqle_ChatList_title">{title}</h1>
                <CirqleNumberPicker inboxes={inboxes} />
                <button
                    className="cirqle_iconButton cirqle_iconButton_green"
                    aria-label={section === "channels" ? "New channel" : "New chat"}
                    onClick={() => (section === "channels" ? createChannel() : CirqleUiStore.openNewChat())}
                >
                    <PencilIcon />
                </button>
                <Menu
                    open={menuOpen}
                    onOpenChange={setMenuOpen}
                    title="Menu"
                    side="bottom"
                    align="end"
                    trigger={
                        <button className="cirqle_iconButton" aria-label="Menu">
                            <KebabIcon />
                        </button>
                    }
                >
                    <MenuItem Icon={GroupIcon} label="New group" onSelect={createGroup} />
                    <MenuItem Icon={ChannelIcon} label="New channel" onSelect={createChannel} />
                    <MenuItem Icon={SettingsIcon} label="Settings" onSelect={() => dis.fire(Action.ViewUserSettings)} />
                </Menu>
            </div>
            <div className="cirqle_ChatList_search">
                <SearchIcon />
                <input
                    aria-label="Search or start a new chat"
                    placeholder="Search or start a new chat"
                    value={query}
                    onChange={(ev) => setQuery(ev.target.value)}
                    onKeyDown={(ev) => {
                        if (ev.key === "Escape") setQuery("");
                        if (ev.key === "Enter" && rooms[0]) {
                            dis.dispatch<ViewRoomPayload>({
                                action: Action.ViewRoom,
                                room_id: rooms[0].roomId,
                                metricsTrigger: "RoomList",
                            });
                        }
                    }}
                />
            </div>
            <div className="cirqle_ChatList_chips" role="tablist" aria-label="Filter">
                {CHIPS.map(({ chip: c, label }) => (
                    <button
                        key={c}
                        role="tab"
                        aria-selected={chip === c}
                        className={`cirqle_chip cirqle_chip_${c}`}
                        onClick={() => setChip(c)}
                    >
                        {label}
                        {c === "unread" && unread > 0 ? ` ${unread}` : ""}
                    </button>
                ))}
            </div>
            <div className="cirqle_ChatList_rows" onScroll={onScroll}>
                {visible.map((room) => (
                    <ChatRow key={room.roomId} room={room} inboxes={inboxes} selected={room.roomId === currentRoomId} />
                ))}
                {rooms.length === 0 && query.trim() !== "" && (
                    <button className="cirqle_ChatList_startNew" onClick={() => CirqleUiStore.openNewChat(query)}>
                        Start a new chat with {query.trim()}
                    </button>
                )}
                {rooms.length === 0 && query.trim() === "" && (
                    <p className="cirqle_ChatList_empty">
                        {section === "channels" ? "No channels yet" : chip === "all" ? "No chats yet" : "No chats here"}
                    </p>
                )}
            </div>
            <button
                className="cirqle_ChatList_fab"
                aria-label={section === "channels" ? "New channel" : "New chat, group or channel"}
                onClick={() => (section === "channels" ? createChannel() : CirqleUiStore.openNewChat())}
            >
                <PlusIcon />
                New
            </button>
        </section>
    );
}
