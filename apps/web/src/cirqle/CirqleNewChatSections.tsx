/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// The parts of the New chat panel (CirqleNewChat): its search, the notes under it,
// the people the bridge found, New chat / New group / New contact, Contacts (the
// shared book on the number written from) and "Chats on <number>".

import React, { type JSX } from "react";
import { type Room } from "matrix-js-sdk/src/matrix";

import dis from "../dispatcher/dispatcher";
import { Action } from "../dispatcher/actions";
import { type ViewRoomPayload } from "../dispatcher/payloads/ViewRoomPayload";
import RoomAvatar from "../components/views/avatars/RoomAvatar";
import BaseAvatar from "../components/views/avatars/BaseAvatar";
import { GroupIcon, PencilIcon, SearchIcon } from "./CirqleIcons";
import { contactNumber, type Inbox, stripNetworkSuffix } from "./CirqleInboxes";
import { type BookContact } from "./CirqlePhoneBook";
import { NewContactRow } from "./CirqleContacts";
import { CirqleUiStore } from "./CirqleUiStore";

export interface Found {
    userId: string;
    name: string;
    sub: string;
    avatarUrl?: string;
}

/** The contact's number, unless the chat is already named by it */
export function contactSub(room: Room): string {
    const number = contactNumber(room);
    if (!number) return "";
    return room.name.replace(/[^\d]/g, "").includes(number.replace(/[^\d]/g, "")) ? "" : number;
}

/** "Type the number with its country code" for a WhatsApp number without it, "Choose the number" under All numbers */
export function NewChatNotes({ inboxes, from, query }: { inboxes: Inbox[]; from?: Inbox; query: string }): JSX.Element {
    return (
        <>
            {from?.network === "whatsapp" && /^\d{7,15}$/.test(query.replace(/[\s().-]/g, "")) && (
                <p className="cirqle_NewChat_note" role="status">
                    Type the number with its country code, like +1 214 555 0100
                </p>
            )}
            {inboxes.length > 0 && !from && (
                <p className="cirqle_NewChat_hint" role="status">
                    Choose the number to write from
                </p>
            )}
        </>
    );
}

export function FoundRows({
    found,
    disabled,
    onStart,
}: {
    found: Found[];
    disabled: boolean;
    onStart: (person: Found) => void;
}): JSX.Element {
    return (
        <>
            {found.map((person) => (
                <button
                    type="button"
                    key={person.userId}
                    className="cirqle_NewChat_row cirqle_NewChat_found"
                    disabled={disabled}
                    onClick={() => onStart(person)}
                >
                    <BaseAvatar name={person.name} idName={person.userId} url={person.avatarUrl} size="48px" />
                    <span className="cirqle_NewChat_text">
                        <span className="cirqle_NewChat_name">{person.name}</span>
                        <span className="cirqle_NewChat_sub cirqle_NewChat_sub_green">{person.sub}</span>
                    </span>
                </button>
            ))}
        </>
    );
}

/** New chat (puts the cursor in the search), New group, and New contact for staff who may change the book */
export function NewChatActions({ onNewChat, canEdit }: { onNewChat: () => void; canEdit: boolean }): JSX.Element {
    return (
        <>
            <button type="button" className="cirqle_NewChat_row cirqle_NewChat_action" onClick={onNewChat}>
                <span className="cirqle_NewChat_actionIcon">
                    <PencilIcon />
                </span>
                <span className="cirqle_NewChat_text">
                    <span className="cirqle_NewChat_actionLabel">New chat</span>
                    <span className="cirqle_NewChat_sub">Search a name or type a number</span>
                </span>
            </button>
            <button
                type="button"
                className="cirqle_NewChat_row cirqle_NewChat_action"
                onClick={() => CirqleUiStore.openNewGroup()}
            >
                <span className="cirqle_NewChat_actionIcon">
                    <GroupIcon />
                </span>
                <span className="cirqle_NewChat_actionLabel">New group</span>
            </button>
            {canEdit && <NewContactRow />}
        </>
    );
}

/** "Contacts": the shared book on the number written from, or why it is empty */
export function ContactsSection({
    book,
    shown,
    busy,
    onStart,
}: {
    book: BookContact[] | null | undefined;
    shown: Found[];
    busy: boolean;
    onStart: (person: Found) => void;
}): JSX.Element {
    return (
        <>
            {book !== undefined && (shown.length > 0 || !book?.length) && (
                <div className="cirqle_NewChat_section">Contacts</div>
            )}
            {book === undefined && <p className="cirqle_NewChat_empty">Loading contacts…</p>}
            {book === null && <p className="cirqle_NewChat_empty">Couldn't load contacts</p>}
            {book?.length === 0 && (
                <p className="cirqle_NewChat_empty">No contacts yet. Type a number to start a chat.</p>
            )}
            {shown.map((person) => (
                <button
                    type="button"
                    key={person.userId}
                    className="cirqle_NewChat_row cirqle_NewChat_contact cirqle_NewChat_bookRow"
                    disabled={busy}
                    onClick={() => onStart(person)}
                >
                    <BaseAvatar name={person.name} idName={person.userId} size="44px" />
                    <span className="cirqle_NewChat_text cirqle_NewChat_text_ruled">
                        <span className="cirqle_NewChat_name">{person.name}</span>
                        <span className="cirqle_NewChat_sub">{person.sub}</span>
                    </span>
                </button>
            ))}
        </>
    );
}

/** "Chats on <number>": the number's private chats with anyone the book does not have; a click opens the chat */
export function ChatsSection({ from, chats }: { from: Inbox; chats: Room[] }): JSX.Element {
    const open = (room: Room): void => {
        dis.dispatch<ViewRoomPayload>({ action: Action.ViewRoom, room_id: room.roomId, metricsTrigger: "RoomList" });
        CirqleUiStore.closePanel();
    };
    return (
        <>
            {chats.length > 0 && <div className="cirqle_NewChat_section">Chats on {from.label}</div>}
            {chats.map((room) => (
                <button
                    type="button"
                    key={room.roomId}
                    className="cirqle_NewChat_row cirqle_NewChat_contact"
                    onClick={() => open(room)}
                >
                    <RoomAvatar room={room} size="44px" />
                    <span className="cirqle_NewChat_text cirqle_NewChat_text_ruled">
                        <span className="cirqle_NewChat_name">{stripNetworkSuffix(room.name)}</span>
                        <span className="cirqle_NewChat_sub">{contactSub(room)}</span>
                    </span>
                </button>
            ))}
        </>
    );
}

/** The search: Escape goes back, Enter starts a chat with the first person offered */
export function NewChatSearch({
    inputRef,
    query,
    setQuery,
    onEnter,
}: {
    inputRef: React.RefObject<HTMLInputElement | null>;
    query: string;
    setQuery: (query: string) => void;
    onEnter: () => void;
}): JSX.Element {
    return (
        <div className="cirqle_ChatList_search cirqle_NewChat_search">
            <SearchIcon />
            <input
                ref={inputRef}
                aria-label="Search name or number"
                placeholder="Search name or number"
                value={query}
                onChange={(ev) => setQuery(ev.target.value)}
                onKeyDown={(ev) => {
                    if (ev.key === "Escape") CirqleUiStore.closePanel();
                    if (ev.key === "Enter") onEnter();
                }}
            />
        </div>
    );
}
