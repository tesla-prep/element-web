/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// New chat panel, in place of the chat list (concept artboard NewChat).
//
// It sends exactly what Element's own Start chat does: the people search
// (user_directory/search, which the relay bot fills with each inbox's contacts
// and typed numbers as @newchat_<bridge>_<inbox>_<contact>) and, for the picked
// contact, Element's startDmOnFirstMessage (createRoom on the first message,
// answered by the relay bot with the real chat). "Write from" narrows the
// search to that number's contacts; under All numbers nothing is offered until
// staff pick the number.

import React, { type JSX, useEffect, useMemo, useRef, useState } from "react";
import { type Room } from "matrix-js-sdk/src/matrix";
import { logger } from "matrix-js-sdk/src/logger";

import { useMatrixClientContext } from "../contexts/MatrixClientContext";
import { SDKContextClass } from "../contexts/SDKContextClass";
import dis from "../dispatcher/dispatcher";
import { Action } from "../dispatcher/actions";
import { type ViewRoomPayload } from "../dispatcher/payloads/ViewRoomPayload";
import { DirectoryMember, startDmOnFirstMessage } from "../utils/direct-messages";
import RoomAvatar from "../components/views/avatars/RoomAvatar";
import BaseAvatar from "../components/views/avatars/BaseAvatar";
import RoomListStoreV3 from "../stores/room-list-v3/RoomListStoreV3";
import { BackIcon, ChannelIcon, GroupIcon, SearchIcon } from "./CirqleIcons";
import { chatKind, contactNumber, formatPhone, type Inbox, type Network, stripNetworkSuffix } from "./CirqleInboxes";
import { CirqleUiStore } from "./CirqleUiStore";
import { createChannel, createGroup } from "./CirqleChatList";
import { useCirqleInboxes } from "./useCirqleChats";

interface Found {
    userId: string;
    name: string;
    sub: string;
    avatarUrl?: string;
}

/** "Main #1 · WhatsApp +1 646 331 3251" */
function inboxOption(inbox: Inbox): string {
    const messenger = inbox.network === "whatsapp" ? "WhatsApp" : "Telegram";
    return `${inbox.label} · ${[messenger, inbox.phone].filter(Boolean).join(" ")}`;
}

/** "+14695551234 · Main #1" or "Anna Petrova, +14695551234 · Main #1": the relay bot's label, without the inbox. */
function splitLabel(displayName: string, network: Network): { name: string; sub: string } {
    const person = displayName.replace(/\s·\s[^·]+$/, "");
    const [name, number] = person.split(/,\s(?=\+)/);
    const messenger = network === "whatsapp" ? "On WhatsApp" : "On Telegram";
    const asNumber = (text: string): string => (/^\+\d{7,15}$/.test(text) ? formatPhone(text) : text);
    return number
        ? { name: asNumber(name), sub: `${formatPhone(number)} · ${messenger}` }
        : { name: asNumber(name || person), sub: `${messenger} · start chat` };
}

/** The contact's number, unless the chat is already named by it */
function contactSub(room: Room): string {
    const number = contactNumber(room);
    if (!number) return "";
    return room.name.replace(/[^\d]/g, "").includes(number.replace(/[^\d]/g, "")) ? "" : number;
}

export function CirqleNewChat(): JSX.Element {
    const client = useMatrixClientContext();
    const inboxes = useCirqleInboxes();
    const [query, setQuery] = useState(CirqleUiStore.newChatQuery);
    const activeSpace = SDKContextClass.instance.spaceStore.activeSpace;
    const [fromId, setFromId] = useState<string | undefined>(
        () => inboxes.find((inbox) => inbox.spaceId === activeSpace)?.spaceId,
    );
    // No number is assumed under All numbers: staff pick the one they write from
    const from = inboxes.find((inbox) => inbox.spaceId === fromId) ?? (inboxes.length === 1 ? inboxes[0] : undefined);
    const [found, setFound] = useState<Found[]>([]);
    const [busy, setBusy] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => inputRef.current?.focus(), []);

    // Keyed by the number, not the inbox object: inboxes are re-read on every room list
    // update, and each search makes the relay bot look the contact up on WhatsApp/Telegram.
    const fromNetwork = from?.network;
    const fromAccount = from?.accountName;
    useEffect(() => {
        const term = query.trim();
        if (!term || !fromNetwork || !fromAccount) {
            setFound([]);
            return;
        }
        let stale = false;
        const prefix = `@newchat_${fromNetwork}_${fromAccount}_`;
        const timer = window.setTimeout(() => {
            client
                .searchUserDirectory({ term, limit: 30 })
                .then((r) => {
                    if (stale) return;
                    setFound(
                        r.results
                            .filter((u) => u.user_id.startsWith(prefix))
                            .map((u) => ({
                                userId: u.user_id,
                                avatarUrl: u.avatar_url,
                                ...splitLabel(u.display_name ?? u.user_id, fromNetwork),
                            })),
                    );
                })
                .catch((e) => logger.warn("CIRQLE new chat search failed", e));
        }, 300);
        return () => {
            stale = true;
            window.clearTimeout(timer);
        };
    }, [client, query, fromNetwork, fromAccount]);

    // The private chats this number already has, as its contacts
    const contacts = useMemo((): Room[] => {
        if (!from) return [];
        const needle = query.trim().toLocaleLowerCase();
        return RoomListStoreV3.instance
            .getSortedRooms()
            .filter((room) => from.childIds.has(room.roomId) && chatKind(room) === "chat")
            .filter((room) => !needle || room.name.toLocaleLowerCase().includes(needle))
            .sort((a, b) => a.name.localeCompare(b.name))
            .slice(0, 200);
    }, [from, query]);

    const start = async (person: Found): Promise<void> => {
        setBusy(true);
        try {
            await startDmOnFirstMessage(client, [
                new DirectoryMember({ user_id: person.userId, display_name: person.name, avatar_url: person.avatarUrl }),
            ]);
            CirqleUiStore.closeNewChat();
        } catch (e) {
            logger.error("CIRQLE new chat failed", e);
        } finally {
            setBusy(false);
        }
    };

    const open = (room: Room): void => {
        dis.dispatch<ViewRoomPayload>({ action: Action.ViewRoom, room_id: room.roomId, metricsTrigger: "RoomList" });
        CirqleUiStore.closeNewChat();
    };

    return (
        <section className="cirqle_NewChat" aria-labelledby="cirqle_NewChat_title">
            <div className="cirqle_NewChat_header">
                <button
                    className="cirqle_iconButton cirqle_iconButton_green cirqle_NewChat_back"
                    aria-label="Back to chats"
                    onClick={() => CirqleUiStore.closeNewChat()}
                >
                    <BackIcon />
                </button>
                <h2 id="cirqle_NewChat_title" className="cirqle_NewChat_title">
                    New chat
                </h2>
            </div>
            <div className="cirqle_ChatList_search cirqle_NewChat_search">
                <SearchIcon />
                <input
                    ref={inputRef}
                    aria-label="Search name or number"
                    placeholder="Search name or number"
                    value={query}
                    onChange={(ev) => setQuery(ev.target.value)}
                    onKeyDown={(ev) => {
                        if (ev.key === "Escape") CirqleUiStore.closeNewChat();
                        if (ev.key === "Enter" && from && found[0] && !busy) void start(found[0]);
                    }}
                />
            </div>
            {inboxes.length > 0 && (
                <div className="cirqle_NewChat_from">
                    <label htmlFor="cirqle_NewChat_from">Write from</label>
                    <select
                        id="cirqle_NewChat_from"
                        value={from?.spaceId ?? ""}
                        onChange={(ev) => setFromId(ev.target.value)}
                    >
                        {!from && (
                            <option value="" disabled>
                                Choose a number
                            </option>
                        )}
                        {inboxes.map((inbox) => (
                            <option key={inbox.spaceId} value={inbox.spaceId}>
                                {inboxOption(inbox)}
                            </option>
                        ))}
                    </select>
                </div>
            )}
            {inboxes.length > 0 && !from && (
                <p className="cirqle_NewChat_hint" role="status">
                    Choose the number to write from
                </p>
            )}
            <div className="cirqle_NewChat_rows">
                {found.map((person) => (
                    <button
                        key={person.userId}
                        className="cirqle_NewChat_row cirqle_NewChat_found"
                        disabled={busy || !from}
                        onClick={() => void start(person)}
                    >
                        <BaseAvatar name={person.name} idName={person.userId} url={person.avatarUrl} size="48px" />
                        <span className="cirqle_NewChat_text">
                            <span className="cirqle_NewChat_name">{person.name}</span>
                            <span className="cirqle_NewChat_sub cirqle_NewChat_sub_green">{person.sub}</span>
                        </span>
                    </button>
                ))}
                <button className="cirqle_NewChat_row cirqle_NewChat_action" onClick={createGroup}>
                    <span className="cirqle_NewChat_actionIcon">
                        <GroupIcon />
                    </span>
                    <span className="cirqle_NewChat_actionLabel">New group</span>
                </button>
                <button className="cirqle_NewChat_row cirqle_NewChat_action" onClick={createChannel}>
                    <span className="cirqle_NewChat_actionIcon">
                        <ChannelIcon />
                    </span>
                    <span className="cirqle_NewChat_actionLabel">New channel</span>
                </button>
                {from && contacts.length > 0 && (
                    <div className="cirqle_NewChat_section">Contacts on {from.label}</div>
                )}
                {contacts.map((room) => (
                    <button key={room.roomId} className="cirqle_NewChat_row cirqle_NewChat_contact" onClick={() => open(room)}>
                        <RoomAvatar room={room} size="44px" />
                        <span className="cirqle_NewChat_text cirqle_NewChat_text_ruled">
                            <span className="cirqle_NewChat_name">{stripNetworkSuffix(room.name)}</span>
                            <span className="cirqle_NewChat_sub">{contactSub(room)}</span>
                        </span>
                    </button>
                ))}
            </div>
        </section>
    );
}
