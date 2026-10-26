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
import { formatTime } from "../DateUtils";
import RoomAvatar from "../components/views/avatars/RoomAvatar";
import { CirqleNumberPicker } from "./CirqleNumberPicker";
import { cirqleLastTimestamp } from "./CirqleActivity";
import { chatPreview } from "./CirqlePreview";
import {
    ChannelIcon,
    ChatsIcon,
    GroupIcon,
    KebabIcon,
    LeaveIcon,
    PencilIcon,
    PlusIcon,
    ProfileIcon,
    SearchIcon,
    SettingsIcon,
} from "./CirqleIcons";
import { confirmSignOut } from "./CirqleRail";
import { useCirqlePhone } from "./CirqleMobile";
import { UserTab } from "../components/views/dialogs/UserTab";
import { type OpenToTabPayload } from "../dispatcher/payloads/OpenToTabPayload";
import { contactPhone, type Inbox, numberLine, repeatedNames, stripNetworkSuffix } from "./CirqleInboxes";
import { CirqleUiStore, type CirqleSection } from "./CirqleUiStore";
import { warmCirqleChat, warmCirqleChats } from "./CirqleWarmup";
import {
    type CirqleChip,
    isUnreadChat,
    pickedInboxes,
    sectionChips,
    useCirqleHasChannels,
    useCirqleInboxes,
    useCirqleRooms,
} from "./useCirqleChats";

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

function ChatRow({
    room,
    inboxes,
    selected,
    repeatedName,
}: {
    room: Room;
    inboxes: Inbox[];
    selected: boolean;
    /** Another private chat in the list has the same name: the customer's number tells them apart */
    repeatedName: boolean;
}): JSX.Element {
    const client = useMatrixClientContext();
    const vm = useCreateAutoDisposedViewModel(() => new RoomListItemViewModel({ room, client }));
    const item = useViewModel(vm);
    const unread = isUnreadChat(room);
    const count = item.notification.count;
    const line = numberLine(room, inboxes);
    const lineText = [repeatedName ? contactPhone(room, inboxes) : undefined, line.text].filter(Boolean).join(" · ");

    const open = (): void => {
        dis.dispatch<ViewRoomPayload>({ action: Action.ViewRoom, room_id: room.roomId, metricsTrigger: "RoomList" });
    };

    return (
        <button
            className={classNames("cirqle_ChatRow", { cirqle_ChatRow_selected: selected })}
            onClick={open}
            onPointerDown={() => warmCirqleChat(room)}
            aria-current={selected ? "page" : undefined}
        >
            <RoomAvatar room={room} size="48px" />
            <span className="cirqle_ChatRow_body">
                <span className="cirqle_ChatRow_top">
                    <span className="cirqle_ChatRow_name">{stripNetworkSuffix(item.name)}</span>
                    <span className={classNames("cirqle_ChatRow_time", { cirqle_ChatRow_time_unread: unread })}>
                        {chatTime(cirqleLastTimestamp(room))}
                    </span>
                </span>
                <span className="cirqle_ChatRow_middle">
                    <span className="cirqle_ChatRow_preview">{chatPreview(room)}</span>
                    {unread && <span className="cirqle_badge">{count > 0 ? count : ""}</span>}
                </span>
                {lineText && (
                    <span className={`cirqle_ChatRow_line cirqle_net_${line.network ?? "none"}`}>
                        <span className={`cirqle_dot cirqle_dot_${line.network ?? "none"}`} />
                        {lineText}
                    </span>
                )}
            </span>
        </button>
    );
}

const CHIP_LABELS: Record<CirqleChip, string> = {
    all: "All",
    unread: "Unread",
    favourites: "Favourites",
    groups: "Groups",
};

export function CirqleChatList({ section }: { section: CirqleSection }): JSX.Element {
    const sdkContext = useContext(SDKContext);
    const inboxes = useCirqleInboxes();
    const [pickedChip, setChip] = useState<CirqleChip>("all");
    const chips = sectionChips(section);
    const chip = chips.includes(pickedChip) ? pickedChip : "all";
    const [query, setQuery] = useState("");
    const [menuOpen, setMenuOpen] = useState(false);
    const phone = useCirqlePhone();
    const channels = useCirqleHasChannels();
    const [shown, setShown] = useState(PAGE);
    const { rooms, unread } = useCirqleRooms(inboxes, section, chip, query);
    const disconnected = pickedInboxes(inboxes).filter((inbox) => !inbox.connected);
    // Channels are WhatsApp's: New channel needs a connected WhatsApp number
    const whatsApp = inboxes.some((inbox) => inbox.network === "whatsapp" && inbox.connected);
    const repeated = useMemo(() => repeatedNames(rooms), [rooms]);
    const currentRoomId = useEventEmitterState(sdkContext.roomViewStore, UPDATE_EVENT, () =>
        sdkContext.roomViewStore.getRoomId(),
    );

    useEffect(() => setShown(PAGE), [section, chip, query]);
    useEffect(() => warmCirqleChats(rooms), [rooms]);
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
                <CirqleNumberPicker inboxes={inboxes} section={section} />
                {section === "chats" && (
                    <button
                        className="cirqle_iconButton cirqle_iconButton_green"
                        aria-label="New chat"
                        onClick={() => CirqleUiStore.openNewChat()}
                    >
                        <PencilIcon />
                    </button>
                )}
                {section === "channels" && whatsApp && (
                    <button
                        type="button"
                        className="cirqle_iconButton cirqle_iconButton_green"
                        aria-label="New channel"
                        onClick={() => CirqleUiStore.openNewChannel()}
                    >
                        <PencilIcon />
                    </button>
                )}
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
                    <MenuItem Icon={GroupIcon} label="New group" onSelect={() => CirqleUiStore.openNewGroup()} />
                    {whatsApp && (
                        <MenuItem
                            Icon={ChannelIcon}
                            label="New channel"
                            onSelect={() => CirqleUiStore.openNewChannel()}
                        />
                    )}
                    {/* A phone has no rail: what it holds is here, as in WhatsApp's menu */}
                    {phone && section === "chats" && channels && (
                        <MenuItem
                            Icon={ChannelIcon}
                            label="Channels"
                            onSelect={() => CirqleUiStore.showSection("channels")}
                        />
                    )}
                    {phone && section === "channels" && (
                        <MenuItem Icon={ChatsIcon} label="Chats" onSelect={() => CirqleUiStore.showSection("chats")} />
                    )}
                    <MenuItem Icon={SettingsIcon} label="Settings" onSelect={() => dis.fire(Action.ViewUserSettings)} />
                    {phone && (
                        <MenuItem
                            Icon={ProfileIcon}
                            label="Profile"
                            onSelect={() =>
                                dis.dispatch<OpenToTabPayload>({
                                    action: Action.ViewUserSettings,
                                    initialTabId: UserTab.Account,
                                })
                            }
                        />
                    )}
                    {phone && <MenuItem Icon={LeaveIcon} label="Sign out…" kind="critical" onSelect={confirmSignOut} />}
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
                {chips.map((c) => (
                    <button
                        key={c}
                        role="tab"
                        aria-selected={chip === c}
                        className={`cirqle_chip cirqle_chip_${c}`}
                        onClick={() => setChip(c)}
                    >
                        {CHIP_LABELS[c]}
                        {c === "unread" && unread > 0 ? ` ${unread}` : ""}
                    </button>
                ))}
            </div>
            {disconnected.length > 0 && (
                <p className="cirqle_ChatList_disconnected" role="status">
                    {disconnected.length === 1
                        ? `${disconnected[0].label} is disconnected: you can read its chats, but not write from it.`
                        : `${disconnected.map((inbox) => inbox.label).join(", ")} are disconnected: you can read their chats, but not write from them.`}
                </p>
            )}
            <div className="cirqle_ChatList_rows" onScroll={onScroll}>
                {visible.map((room) => (
                    <ChatRow
                        key={room.roomId}
                        room={room}
                        inboxes={inboxes}
                        selected={room.roomId === currentRoomId}
                        repeatedName={repeated.has(stripNetworkSuffix(room.name))}
                    />
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
            {section === "chats" && (
                <button
                    className="cirqle_ChatList_fab"
                    aria-label="New chat or group"
                    onClick={() => CirqleUiStore.openNewChat()}
                >
                    <PlusIcon />
                    New
                </button>
            )}
        </section>
    );
}
