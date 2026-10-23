/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// New group panel, in place of the chat list, as in WhatsApp Web: pick the
// members, then name the group.
//
// Members are the relay bot's @newchat_<bridge>_<inbox>_<contact> users of the
// number written from: found by the people search, as in New chat, or built
// from that number's private chats. Create is one createRoom with them invited
// and is_direct false, which the relay bot answers with the real WhatsApp or
// Telegram group (the bridge's create_group), so no empty room is left behind.

import React, { type JSX, useEffect, useMemo, useRef, useState } from "react";
import { MatrixError, Preset, type Room, Visibility } from "matrix-js-sdk/src/matrix";
import { logger } from "matrix-js-sdk/src/logger";

import { useMatrixClientContext } from "../contexts/MatrixClientContext";
import { SDKContextClass } from "../contexts/SDKContextClass";
import dis from "../dispatcher/dispatcher";
import { Action } from "../dispatcher/actions";
import { type ViewRoomPayload } from "../dispatcher/payloads/ViewRoomPayload";
import Modal from "../Modal";
import ErrorDialog from "../components/views/dialogs/ErrorDialog";
import BaseAvatar from "../components/views/avatars/BaseAvatar";
import RoomListStoreV3 from "../stores/room-list-v3/RoomListStoreV3";
import { ArrowRightIcon, BackIcon, CheckIcon, CloseIcon, SearchIcon } from "./CirqleIcons";
import { chatKind, type Inbox, type Network, privateChatContact, stripNetworkSuffix } from "./CirqleInboxes";
import { contactSub, inboxOption, splitLabel } from "./CirqleNewChat";
import { CirqleUiStore } from "./CirqleUiStore";
import { useCirqleInboxes } from "./useCirqleChats";

/** The bridges' limits on a group name (their create_group capabilities). */
const NAME_MAX_LENGTH: Record<Network, number> = { whatsapp: 100, telegram: 255 };

interface Member {
    userId: string;
    name: string;
    sub: string;
    avatarUrl?: string;
}

/**
 * The relay bot's user for the contact of a private chat, written from `inbox`:
 * `@whatsapp_14695551234` is `@newchat_whatsapp_wa-01d17870_=14695551234`, `@whatsapp_lid-1957…`
 * is `…_lid-1957…`, `@telegram_4830…` is `@newchat_telegram_<account>_4830…`.
 */
export function newChatUserOf(room: Room, inbox: Inbox): string | undefined {
    const ghost = privateChatContact(room)?.match(/^@(whatsapp|telegram)_([a-z0-9-]+):(.+)$/);
    if (!ghost || ghost[1] !== inbox.network || !inbox.accountName) return undefined;
    const contact = inbox.network === "whatsapp" && /^\d{7,15}$/.test(ghost[2]) ? `=${ghost[2]}` : ghost[2];
    return `@newchat_${inbox.network}_${inbox.accountName}_${contact}:${ghost[3]}`;
}

/** What the relay bot or the network said, for the error dialog. */
function reasonOf(e: unknown): string {
    if (e instanceof MatrixError && e.data.error) return e.data.error;
    return e instanceof Error ? e.message : String(e);
}

export function CirqleNewGroup(): JSX.Element {
    const client = useMatrixClientContext();
    const inboxes = useCirqleInboxes();
    const activeSpace = SDKContextClass.instance.spaceStore.activeSpace;
    const [fromId, setFromId] = useState<string | undefined>(
        () => inboxes.find((inbox) => inbox.spaceId === activeSpace)?.spaceId,
    );
    // As in New chat: no number is assumed under All numbers
    const from = inboxes.find((inbox) => inbox.spaceId === fromId) ?? (inboxes.length === 1 ? inboxes[0] : undefined);
    const [step, setStep] = useState<"members" | "name">("members");
    const [query, setQuery] = useState("");
    const [found, setFound] = useState<Member[]>([]);
    const [members, setMembers] = useState<Member[]>([]);
    const [name, setName] = useState("");
    const [creating, setCreating] = useState(false);
    const searchRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (step === "members") searchRef.current?.focus();
    }, [step]);

    // Keyed by the number, not the inbox object, as in New chat
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
                .catch((e) => logger.warn("CIRQLE new group search failed", e));
        }, 300);
        return () => {
            stale = true;
            window.clearTimeout(timer);
        };
    }, [client, query, fromNetwork, fromAccount]);

    // The private chats this number already has, as its contacts
    const contacts = useMemo((): Member[] => {
        if (!from) return [];
        const needle = query.trim().toLocaleLowerCase();
        const listed = new Set(found.map((person) => person.userId));
        return RoomListStoreV3.instance
            .getSortedRooms()
            .filter((room) => from.childIds.has(room.roomId) && chatKind(room) === "chat")
            .filter((room) => !needle || room.name.toLocaleLowerCase().includes(needle))
            .sort((a, b) => a.name.localeCompare(b.name))
            .flatMap((room) => {
                const userId = newChatUserOf(room, from);
                if (!userId || listed.has(userId)) return [];
                return [{ userId, name: stripNetworkSuffix(room.name), sub: contactSub(room) }];
            })
            .slice(0, 200);
    }, [from, query, found]);

    const isPicked = (person: Member): boolean => members.some((m) => m.userId === person.userId);
    const toggle = (person: Member): void => {
        setMembers(isPicked(person) ? members.filter((m) => m.userId !== person.userId) : [...members, person]);
    };

    const pickNumber = (spaceId: string): void => {
        setFromId(spaceId);
        // A group goes out from one number, so its members are that number's contacts
        setMembers([]);
    };

    const maxLength = NAME_MAX_LENGTH[from?.network ?? "whatsapp"];
    const title = name.trim();
    const create = async (): Promise<void> => {
        if (!title || !members.length || creating) return;
        setCreating(true);
        try {
            const { room_id: roomId } = await client.createRoom({
                name: title,
                invite: members.map((m) => m.userId),
                is_direct: false,
                preset: Preset.PrivateChat,
                visibility: Visibility.Private,
            });
            dis.dispatch<ViewRoomPayload>({ action: Action.ViewRoom, room_id: roomId, metricsTrigger: "Created" });
            CirqleUiStore.closePanel();
        } catch (e) {
            logger.error("CIRQLE new group failed", e);
            setCreating(false);
            Modal.createDialog(ErrorDialog, { title: "Couldn't create the group", description: reasonOf(e) });
        }
    };

    const row = (person: Member): JSX.Element => {
        const picked = isPicked(person);
        return (
            <button
                type="button"
                key={person.userId}
                className="cirqle_NewChat_row cirqle_NewGroup_row"
                aria-pressed={picked}
                onClick={() => toggle(person)}
            >
                <BaseAvatar name={person.name} idName={person.userId} url={person.avatarUrl} size="44px" />
                <span className="cirqle_NewChat_text cirqle_NewChat_text_ruled">
                    <span className="cirqle_NewChat_name">{person.name}</span>
                    <span className="cirqle_NewChat_sub">{person.sub}</span>
                </span>
                <span className="cirqle_NewGroup_tick">{picked && <CheckIcon />}</span>
            </button>
        );
    };

    if (step === "name") {
        return (
            <section className="cirqle_NewChat cirqle_NewGroup" aria-labelledby="cirqle_NewGroup_title">
                <div className="cirqle_NewChat_header">
                    <button
                        type="button"
                        className="cirqle_iconButton cirqle_iconButton_green cirqle_NewChat_back"
                        aria-label="Back to members"
                        disabled={creating}
                        onClick={() => setStep("members")}
                    >
                        <BackIcon />
                    </button>
                    <h2 id="cirqle_NewGroup_title" className="cirqle_NewChat_title">
                        New group
                    </h2>
                </div>
                <div className="cirqle_NewGroup_nameField">
                    <label htmlFor="cirqle_NewGroup_name">Group name</label>
                    <input
                        id="cirqle_NewGroup_name"
                        autoFocus
                        maxLength={maxLength}
                        value={name}
                        disabled={creating}
                        onChange={(ev) => setName(ev.target.value)}
                        onKeyDown={(ev) => {
                            if (ev.key === "Enter") void create();
                        }}
                    />
                    <span className="cirqle_NewGroup_count">{maxLength - name.length}</span>
                </div>
                <p className="cirqle_NewGroup_summary">
                    {members.length === 1 ? "1 member" : `${members.length} members`}
                    {from ? ` from ${from.label}` : ""}: {members.map((m) => m.name).join(", ")}
                </p>
                {creating && (
                    <p className="cirqle_NewGroup_creating" role="status">
                        Creating group…
                    </p>
                )}
                <button
                    type="button"
                    className="cirqle_NewGroup_create"
                    disabled={!title || creating}
                    onClick={() => void create()}
                >
                    Create
                </button>
            </section>
        );
    }

    return (
        <section className="cirqle_NewChat cirqle_NewGroup" aria-labelledby="cirqle_NewGroup_title">
            <div className="cirqle_NewChat_header">
                <button
                    type="button"
                    className="cirqle_iconButton cirqle_iconButton_green cirqle_NewChat_back"
                    aria-label="Back to chats"
                    onClick={() => CirqleUiStore.closePanel()}
                >
                    <BackIcon />
                </button>
                <h2 id="cirqle_NewGroup_title" className="cirqle_NewChat_title">
                    Add group members
                </h2>
            </div>
            {inboxes.length > 0 && (
                <div className="cirqle_NewChat_from">
                    <label htmlFor="cirqle_NewGroup_from">Write from</label>
                    <select
                        id="cirqle_NewGroup_from"
                        value={from?.spaceId ?? ""}
                        onChange={(ev) => pickNumber(ev.target.value)}
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
            {members.length > 0 && (
                <ul className="cirqle_NewGroup_chips" aria-label="Group members">
                    {members.map((m) => (
                        <li key={m.userId} className="cirqle_NewGroup_chip">
                            <BaseAvatar name={m.name} idName={m.userId} url={m.avatarUrl} size="24px" />
                            <span className="cirqle_NewGroup_chipName">{m.name}</span>
                            <button type="button" aria-label={`Remove ${m.name}`} onClick={() => toggle(m)}>
                                <CloseIcon size={16} />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            <div className="cirqle_ChatList_search cirqle_NewChat_search">
                <SearchIcon />
                <input
                    ref={searchRef}
                    aria-label="Search name or number"
                    placeholder="Search name or number"
                    value={query}
                    onChange={(ev) => setQuery(ev.target.value)}
                    onKeyDown={(ev) => {
                        if (ev.key === "Escape") CirqleUiStore.closePanel();
                        if (ev.key === "Enter" && found[0] && !isPicked(found[0])) {
                            toggle(found[0]);
                            setQuery("");
                        }
                    }}
                />
            </div>
            <div className="cirqle_NewChat_rows">
                {found.map(row)}
                {from && contacts.length > 0 && <div className="cirqle_NewChat_section">Contacts on {from.label}</div>}
                {contacts.map(row)}
            </div>
            <button
                type="button"
                className="cirqle_NewGroup_next"
                aria-label="Next"
                disabled={!members.length}
                onClick={() => setStep("name")}
            >
                <ArrowRightIcon />
            </button>
        </section>
    );
}
