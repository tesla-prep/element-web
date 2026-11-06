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
// staff pick the number. A disconnected number is not offered: nothing sends from it.
// The New chat row above New group says where a new chat starts: it puts the
// cursor in the search; New contact under New group is for staff who may change
// the shared book. Below them are Contacts, CIRQLE's shared book on the picked
// number (CirqlePhoneBook), and "Chats on <number>", the number's private chats
// with anyone the book does not have; the search filters both. A name is the
// book's to answer: only a typed number or Telegram username goes to the bridge.

import React, { type JSX, useDeferredValue, useEffect, useId, useMemo, useRef, useState } from "react";
import { type MatrixClient, type Room } from "matrix-js-sdk/src/matrix";
import { logger } from "matrix-js-sdk/src/logger";

import { useMatrixClientContext } from "../contexts/MatrixClientContext";
import { SDKContextClass } from "../contexts/SDKContextClass";
import { DirectoryMember, startDmOnFirstMessage } from "../utils/direct-messages";
import RoomListStoreV3 from "../stores/room-list-v3/RoomListStoreV3";
import { ChevronDownIcon, ChevronUpIcon } from "./CirqleIcons";
import { chatKind, contactNumber, formatPhone, type Inbox, type Network } from "./CirqleInboxes";
import { NumberLabel } from "./CirqleNumberPicker";
import { type BookContact, bookLabel, filterBook, usePhoneBook } from "./CirqlePhoneBook";
import { useSharedContacts } from "./CirqleSharedContacts";
import { PanelHeader } from "./CirqleContacts";
import {
    ChatsSection,
    ContactsSection,
    type Found,
    FoundRows,
    NewChatActions,
    NewChatNotes,
    NewChatSearch,
} from "./CirqleNewChatSections";
import { CirqleUiStore } from "./CirqleUiStore";
import { useCirqleInboxes } from "./useCirqleChats";

/**
 * "Write from": the number shown as the number picker lists it, the name over the
 * messenger and the number, and a click opens the list of the numbers below it.
 * Names wrap rather than being cut.
 */
export function CirqleWriteFrom({
    label,
    inboxes,
    from,
    disabled,
    onPick,
}: {
    label: string;
    inboxes: Inbox[];
    from: Inbox | undefined;
    disabled?: boolean;
    onPick: (spaceId: string) => void;
}): JSX.Element {
    const [open, setOpen] = useState(false);
    const labelId = useId();
    const valueId = useId();
    return (
        <div className="cirqle_NewChat_from">
            <span id={labelId} className="cirqle_NewChat_fromLabel">
                {label}
            </span>
            <button
                type="button"
                className={`cirqle_NewChat_fromPick${open ? " cirqle_NewChat_fromPick_open" : ""}`}
                aria-labelledby={`${labelId} ${valueId}`}
                aria-haspopup="listbox"
                aria-expanded={open}
                disabled={disabled}
                onClick={() => setOpen(!open)}
            >
                <span id={valueId} className="cirqle_NewChat_fromValue">
                    {from ? (
                        <NumberLabel inbox={from} />
                    ) : (
                        <span className="cirqle_NumberPicker_text">
                            <span className="cirqle_NumberPicker_name">Choose a number</span>
                        </span>
                    )}
                </span>
                {open ? <ChevronUpIcon /> : <ChevronDownIcon />}
            </button>
            {open && (
                <div
                    className="cirqle_NewChat_fromList"
                    role="listbox"
                    tabIndex={-1}
                    aria-labelledby={labelId}
                    onKeyDown={(ev) => {
                        if (ev.key !== "Escape") return;
                        ev.stopPropagation();
                        setOpen(false);
                    }}
                >
                    {inboxes.map((inbox) => (
                        <button
                            key={inbox.spaceId}
                            type="button"
                            role="option"
                            aria-selected={inbox === from}
                            className="cirqle_NumberPicker_item cirqle_NumberPicker_option"
                            onClick={() => {
                                setOpen(false);
                                onPick(inbox.spaceId);
                            }}
                        >
                            <NumberLabel inbox={inbox} />
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

/**
 * "+14695551234 · Main #1" or "Anna Petrova, +14695551234 · Main #1": the relay bot's label, without the inbox.
 * A typed number is shown as the number the chat would really go to, the one in the user id
 * (`@newchat_whatsapp_wa-…_=2145550100`): for "2145550100" WhatsApp may name a contact
 * "+12145550100" while the chat would start with +2145550100, which has no country code.
 */
export function splitLabel(displayName: string, network: Network, userId = ""): { name: string; sub: string } {
    const messenger = network === "whatsapp" ? "On WhatsApp" : "On Telegram";
    const target = userId.match(/_=(\d{7,15}):/)?.[1];
    const named = displayName.replace(/\s·\s[^·]+$/, "").split(/,\s(?=\+)/)[0];
    if (target && /^\+\d{7,15}$/.test(named) && named.slice(1) !== target) {
        return { name: formatPhone(`+${target}`), sub: `${messenger} · check the country code` };
    }
    const person = displayName.replace(/\s·\s[^·]+$/, "");
    const [name, number] = person.split(/,\s(?=\+)/);
    const asNumber = (text: string): string => (/^\+\d{7,15}$/.test(text) ? formatPhone(text) : text);
    return number
        ? { name: asNumber(name), sub: `${formatPhone(number)} · ${messenger}` }
        : { name: asNumber(name || person), sub: `${messenger} · start chat` };
}

/** People the bridge finds for a typed number or Telegram username on the number written from; a name is the book's to answer */
function useBridgeSearch(client: MatrixClient, from: Inbox | undefined, query: string): Found[] {
    const [found, setFound] = useState<Found[]>([]);
    // Keyed by the number, not the inbox object: inboxes are re-read on every room list
    // update, and each search makes the relay bot look the contact up on WhatsApp/Telegram.
    const fromNetwork = from?.network;
    const fromAccount = from?.accountName;
    useEffect(() => {
        const term = query.trim();
        const typed =
            /^\+?[\d\s().-]{7,}$/.test(term) ||
            (fromNetwork === "telegram" && /^(@|(https?:\/\/)?t\.me\/)\w/.test(term));
        if (!fromNetwork || !fromAccount || !typed) {
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
                                ...splitLabel(u.display_name ?? u.user_id, fromNetwork, u.user_id),
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
    return found;
}

/** The private chats the number already has, except with anyone the book has (by the number) */
function numberChats(from: Inbox, book: BookContact[] | null, query: string): Room[] {
    const needle = query.trim().toLocaleLowerCase();
    const inBook = new Set(book?.flatMap((contact) => (contact.number ? [contact.number.replace(/\D/g, "")] : [])));
    return RoomListStoreV3.instance
        .getSortedRooms()
        .filter((room) => from.childIds.has(room.roomId) && chatKind(room) === "chat")
        .filter((room) => !inBook.has(contactNumber(room)?.replace(/\D/g, "") ?? ""))
        .filter((room) => !needle || room.name.toLocaleLowerCase().includes(needle))
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, 200);
}

/** What New chat offers for the query: the book, people the bridge found who are not in it, and the number's other chats */
function useNewChatPeople(
    client: MatrixClient,
    from: Inbox | undefined,
    query: string,
): { book: BookContact[] | null | undefined; bookShown: Found[]; foundShown: Found[]; chats: Room[] } {
    const book = usePhoneBook(client, from?.network, from?.accountName);
    const found = useBridgeSearch(client, from, query);
    const bookQuery = useDeferredValue(query);
    const bookShown = useMemo((): Found[] => {
        if (!book) return [];
        return filterBook(book, bookQuery).map((contact) => ({ userId: contact.user_id, ...bookLabel(contact) }));
    }, [book, bookQuery]);
    // A contact in the book is offered there, once: a typed number (`@newchat_…_=<digits>`) of a
    // contact the book names by their WhatsApp LID is the same person
    const foundShown = useMemo(() => {
        const inBook = new Set(book?.flatMap((contact) => [contact.user_id, contact.number?.replace(/\D/g, "")]));
        return found.filter((person) => {
            const digits = person.userId.match(/_=(\d+):/)?.[1];
            return !inBook.has(person.userId) && !(digits && inBook.has(digits));
        });
    }, [book, found]);
    const chats = useMemo(
        (): Room[] => (from && book !== undefined ? numberChats(from, book, query) : []),
        [from, query, book],
    );
    return { book, bookShown, foundShown, chats };
}

/** Starts the chat with a picked person (Element's startDmOnFirstMessage) and goes back to the list */
function useStartChat(client: MatrixClient): { busy: boolean; start: (person: Found) => Promise<void> } {
    const [busy, setBusy] = useState(false);
    const start = async (person: Found): Promise<void> => {
        setBusy(true);
        try {
            await startDmOnFirstMessage(client, [
                new DirectoryMember({
                    user_id: person.userId,
                    display_name: person.name,
                    avatar_url: person.avatarUrl,
                }),
            ]);
            CirqleUiStore.closePanel();
        } catch (e) {
            logger.error("CIRQLE new chat failed", e);
        } finally {
            setBusy(false);
        }
    };
    return { busy, start };
}

export function CirqleNewChat(): JSX.Element {
    const client = useMatrixClientContext();
    const inboxes = useCirqleInboxes().filter((inbox) => inbox.connected);
    const [query, setQuery] = useState(CirqleUiStore.newChatQuery);
    const [fromId, setFromId] = useState(() => SDKContextClass.instance.spaceStore.activeSpace);
    // No number is assumed under All numbers: staff pick the one they write from
    const from = inboxes.find((inbox) => inbox.spaceId === fromId) ?? (inboxes.length === 1 ? inboxes[0] : undefined);
    const { book, bookShown, foundShown, chats } = useNewChatPeople(client, from, query);
    const canEdit = useSharedContacts(client)?.canEdit === true;
    const { busy, start } = useStartChat(client);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => inputRef.current?.focus(), []);

    return (
        <section className="cirqle_NewChat" aria-labelledby="cirqle_NewChat_title">
            <PanelHeader
                id="cirqle_NewChat_title"
                title="New chat"
                back="Back to chats"
                onBack={() => CirqleUiStore.closePanel()}
            />
            <NewChatSearch
                inputRef={inputRef}
                query={query}
                setQuery={setQuery}
                onEnter={() => {
                    const first = foundShown[0] ?? bookShown[0];
                    if (from && first && !busy) void start(first);
                }}
            />
            {inboxes.length > 0 && (
                <CirqleWriteFrom label="Write from" inboxes={inboxes} from={from} onPick={setFromId} />
            )}
            <NewChatNotes inboxes={inboxes} from={from} query={query} />
            <div className="cirqle_NewChat_rows">
                <FoundRows found={foundShown} disabled={busy || !from} onStart={(person) => void start(person)} />
                <NewChatActions onNewChat={() => inputRef.current?.focus()} canEdit={canEdit} />
                {from && (
                    <ContactsSection
                        book={book}
                        shown={bookShown}
                        busy={busy}
                        onStart={(person) => void start(person)}
                    />
                )}
                {from && <ChatsSection from={from} chats={chats} />}
            </div>
        </section>
    );
}
