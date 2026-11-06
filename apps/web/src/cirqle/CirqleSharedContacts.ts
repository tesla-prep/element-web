/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// CIRQLE's shared contact book, the same on every number (VLA-864). The relay
// bot keeps it and answers POST /_matrix/client/unstable/com.cirqle/contacts
// (the list, and whether this staff member may change it), /contacts/save and
// /contacts/delete. Its refusals come in English and are shown as they are.

import { useEffect, useState } from "react";
import { type MatrixClient, Method } from "matrix-js-sdk/src/matrix";
import { logger } from "matrix-js-sdk/src/logger";

import { sortBook } from "./CirqlePhoneBook";

export interface SharedContact {
    /** E.164, `+14695551234`: the contact's key */
    number: string;
    name: string;
    changed_by?: string;
    changed_at?: number;
}

export interface ContactBook {
    contacts: SharedContact[];
    /** Directory gives this staff member Write on "Messenger contacts" */
    canEdit: boolean;
}

const UNSTABLE = { prefix: "/_matrix/client/unstable" };

/** The book sorted by name, read again each time a screen shows it; undefined while it loads, null if it failed */
export function useSharedContacts(client: MatrixClient): ContactBook | null | undefined {
    const [book, setBook] = useState<ContactBook | null>();
    useEffect(() => {
        let stale = false;
        client.http
            .authedRequest<{ contacts: SharedContact[]; can_edit?: boolean }>(
                Method.Post,
                "/com.cirqle/contacts",
                undefined,
                {},
                UNSTABLE,
            )
            .then((r) => {
                if (!stale) setBook({ contacts: sortBook(r.contacts), canEdit: r.can_edit === true });
            })
            .catch((e) => {
                logger.warn("CIRQLE contacts failed", e);
                if (!stale) setBook(null);
            });
        return () => {
            stale = true;
        };
    }, [client]);
    return book;
}

/** Adds a contact, or changes the one that has `previous_number` (its name, its number or both) */
export async function saveSharedContact(
    client: MatrixClient,
    contact: { number: string; name: string; previous_number?: string },
): Promise<void> {
    await client.http.authedRequest(Method.Post, "/com.cirqle/contacts/save", undefined, contact, UNSTABLE);
}

export async function deleteSharedContact(client: MatrixClient, number: string): Promise<void> {
    await client.http.authedRequest(Method.Post, "/com.cirqle/contacts/delete", undefined, { number }, UNSTABLE);
}
