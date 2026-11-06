/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// The contacts New chat offers on the number it writes from. The relay bot answers
// POST /_matrix/client/unstable/com.cirqle/phone_book with CIRQLE's shared book
// (CirqleSharedContacts, the same on every number; not the book of the number's
// phone), as the same @newchat_<bridge>_<inbox>_=<digits> users the search offers
// (relay bot README, «Phone book»), so picking one starts the chat the same way.

import { useEffect, useRef, useState } from "react";
import { Method, type MatrixClient } from "matrix-js-sdk/src/matrix";
import { logger } from "matrix-js-sdk/src/logger";

import { formatPhone, type Network } from "./CirqleInboxes";

export interface BookContact {
    user_id: string;
    /** The name in the book, else the number */
    name: string;
    number?: string;
}

interface Named {
    name: string;
    number?: string;
}

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
const isNumber = (text: string): boolean => /^\+?[\d\s().-]{7,}$/.test(text);

/** By name, contacts known only by their number last */
export function sortBook<T extends Named>(book: T[]): T[] {
    return [...book].sort(
        (a, b) => Number(isNumber(a.name)) - Number(isNumber(b.name)) || collator.compare(a.name, b.name),
    );
}

/** How often an open Contacts or New chat reads the book again: a change made elsewhere shows within a minute */
export const BOOK_REFRESH_MS = 30 * 1000;

/**
 * What `read` answers for `key`, read when the key changes, every BOOK_REFRESH_MS and when the
 * window comes back to the front; undefined while it first loads, null if that failed. A later
 * read that fails keeps what was shown.
 */
export function useLiveBook<T>(key: string | undefined, read: () => Promise<T>): T | null | undefined {
    const [book, setBook] = useState<{ key: string; value: T | null }>();
    const readRef = useRef(read);
    readRef.current = read;
    useEffect(() => {
        if (!key) return;
        let stale = false;
        const load = (): void => {
            readRef.current().then(
                (value) => {
                    if (!stale) setBook({ key, value });
                },
                (e) => {
                    logger.warn("CIRQLE contact book failed", e);
                    if (!stale) setBook((shown) => (shown?.key === key ? shown : { key, value: null }));
                },
            );
        };
        load();
        const timer = window.setInterval(load, BOOK_REFRESH_MS);
        window.addEventListener("focus", load);
        return () => {
            stale = true;
            window.clearInterval(timer);
            window.removeEventListener("focus", load);
        };
    }, [key]);
    return book && book.key === key ? book.value : undefined;
}

/** The book on the number New chat writes from, sorted by name, contacts it knows only by their number last */
export function usePhoneBook(
    client: MatrixClient,
    network: Network | undefined,
    account: string | undefined,
): BookContact[] | null | undefined {
    return useLiveBook(network && account ? `${network}/${account}` : undefined, () =>
        client.http
            .authedRequest<{ contacts: BookContact[] }>(
                Method.Post,
                "/com.cirqle/phone_book",
                undefined,
                { network, account },
                { prefix: "/_matrix/client/unstable" },
            )
            .then((r) => sortBook(r.contacts)),
    );
}

/** Contacts whose name contains the term, or whose number has the digits of a typed number */
export function filterBook<T extends Named>(book: T[], term: string): T[] {
    const needle = term.trim().toLocaleLowerCase();
    if (!needle) return book;
    const digits = /^\+?[\d\s().-]+$/.test(needle) ? needle.replace(/[^\d]/g, "") : "";
    return book.filter(
        (contact) =>
            contact.name.toLocaleLowerCase().includes(needle) ||
            (digits !== "" && (contact.number ?? "").replace(/[^\d]/g, "").includes(digits)),
    );
}

/** The name over the number, or the number alone when the book has no name for them */
export function bookLabel(contact: BookContact): { name: string; sub: string } {
    if (isNumber(contact.name)) return { name: formatPhone(contact.name), sub: "" };
    return { name: contact.name, sub: contact.number ? formatPhone(contact.number) : "" };
}
