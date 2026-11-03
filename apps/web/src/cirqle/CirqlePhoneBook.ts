/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// The phone book of the number New chat writes from. The relay bot answers
// POST /_matrix/client/unstable/com.cirqle/phone_book with every contact of the
// number, as the same @newchat_<bridge>_<inbox>_<contact> users the search
// offers (relay bot README, «Phone book»), so picking one starts the chat the
// same way.

import { useEffect, useState } from "react";
import { Method, type MatrixClient } from "matrix-js-sdk/src/matrix";
import { logger } from "matrix-js-sdk/src/logger";

import { formatPhone, type Network } from "./CirqleInboxes";

export interface BookContact {
    user_id: string;
    /** The name in the number's phone book, else the number */
    name: string;
    number?: string;
}

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
const isNumber = (text: string): boolean => /^\+?[\d\s().-]{7,}$/.test(text);

/** The book sorted by name, contacts it knows only by their number last; undefined while it loads, null if it failed */
export function usePhoneBook(
    client: MatrixClient,
    network: Network | undefined,
    account: string | undefined,
): BookContact[] | null | undefined {
    const [book, setBook] = useState<BookContact[] | null>();
    useEffect(() => {
        setBook(undefined);
        if (!network || !account) return;
        let stale = false;
        client.http
            .authedRequest<{ contacts: BookContact[] }>(
                Method.Post,
                "/com.cirqle/phone_book",
                undefined,
                { network, account },
                { prefix: "/_matrix/client/unstable" },
            )
            .then((r) => {
                if (stale) return;
                setBook(
                    [...r.contacts].sort(
                        (a, b) =>
                            Number(isNumber(a.name)) - Number(isNumber(b.name)) || collator.compare(a.name, b.name),
                    ),
                );
            })
            .catch((e) => {
                logger.warn("CIRQLE phone book failed", e);
                if (!stale) setBook(null);
            });
        return () => {
            stale = true;
        };
    }, [client, network, account]);
    return book;
}

/** Contacts whose name contains the term, or whose number has the digits of a typed number */
export function filterBook(book: BookContact[], term: string): BookContact[] {
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
