/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// Contacts (VLA-864), in place of the chat list as WhatsApp Web has it: CIRQLE's
// shared book (CirqleSharedContacts), the same on every number, by name, with a
// search by name or digits. Staff whom Directory lets change it get New contact
// on top and Edit contact on a click; everyone else's click opens New chat with
// the contact's number, to pick the number to write from there. The book is
// read again while the screen is open (useLiveBook), so a change shows for everyone
// within a minute. The form is CirqleContactForm.

import React, { type JSX, useMemo, useState } from "react";

import { useMatrixClientContext } from "../contexts/MatrixClientContext";
import BaseAvatar from "../components/views/avatars/BaseAvatar";
import { AddMemberIcon, BackIcon, SearchIcon } from "./CirqleIcons";
import { formatPhone } from "./CirqleInboxes";
import { filterBook } from "./CirqlePhoneBook";
import { type SharedContact, useSharedContacts } from "./CirqleSharedContacts";
import { CirqleUiStore } from "./CirqleUiStore";

/** The back arrow and the title, as New chat has them */
export function PanelHeader({
    id,
    title,
    back,
    onBack,
    disabled,
}: {
    id: string;
    title: string;
    back: string;
    onBack: () => void;
    disabled?: boolean;
}): JSX.Element {
    return (
        <div className="cirqle_NewChat_header">
            <button
                type="button"
                className="cirqle_iconButton cirqle_iconButton_green cirqle_NewChat_back"
                aria-label={back}
                disabled={disabled}
                onClick={onBack}
            >
                <BackIcon />
            </button>
            <h2 id={id} className="cirqle_NewChat_title">
                {title}
            </h2>
        </div>
    );
}

/** "New contact" with its icon: on top of Contacts, and under New group in New chat */
export function NewContactRow(): JSX.Element {
    return (
        <button
            type="button"
            className="cirqle_NewChat_row cirqle_NewChat_action"
            onClick={() => CirqleUiStore.openContactForm()}
        >
            <span className="cirqle_NewChat_actionIcon">
                <AddMemberIcon />
            </span>
            <span className="cirqle_NewChat_actionLabel">New contact</span>
        </button>
    );
}

function ContactRow({ contact, onPick }: { contact: SharedContact; onPick: () => void }): JSX.Element {
    return (
        <button
            type="button"
            className="cirqle_NewChat_row cirqle_NewChat_contact cirqle_NewChat_bookRow"
            onClick={onPick}
        >
            <BaseAvatar name={contact.name} idName={contact.number} size="44px" />
            <span className="cirqle_NewChat_text cirqle_NewChat_text_ruled">
                <span className="cirqle_NewChat_name">{contact.name}</span>
                <span className="cirqle_NewChat_sub">{formatPhone(contact.number)}</span>
            </span>
        </button>
    );
}

export function CirqleContacts(): JSX.Element {
    const client = useMatrixClientContext();
    const book = useSharedContacts(client);
    const [query, setQuery] = useState("");
    const shown = useMemo(() => (book ? filterBook(book.contacts, query) : []), [book, query]);
    const canEdit = book?.canEdit === true;

    const pick = (contact: SharedContact): void => {
        if (canEdit) CirqleUiStore.openContactForm(contact);
        else CirqleUiStore.openNewChat(formatPhone(contact.number));
    };

    return (
        <section className="cirqle_NewChat cirqle_Contacts" aria-labelledby="cirqle_Contacts_title">
            <PanelHeader
                id="cirqle_Contacts_title"
                title="Contacts"
                back="Back to chats"
                onBack={() => CirqleUiStore.closePanel()}
            />
            <div className="cirqle_ChatList_search cirqle_NewChat_search">
                <SearchIcon />
                <input
                    aria-label="Search name or number"
                    placeholder="Search name or number"
                    value={query}
                    onChange={(ev) => setQuery(ev.target.value)}
                    onKeyDown={(ev) => {
                        if (ev.key === "Escape") CirqleUiStore.closePanel();
                        if (ev.key === "Enter" && shown[0]) pick(shown[0]);
                    }}
                />
            </div>
            <div className="cirqle_NewChat_rows">
                {canEdit && <NewContactRow />}
                {book === undefined && <p className="cirqle_NewChat_empty">Loading contacts…</p>}
                {book === null && <p className="cirqle_NewChat_empty">Couldn't load contacts</p>}
                {book?.contacts.length === 0 && <p className="cirqle_NewChat_empty">No contacts yet</p>}
                {!!book?.contacts.length && shown.length === 0 && (
                    <p className="cirqle_NewChat_empty">No contacts found</p>
                )}
                {shown.map((contact) => (
                    <ContactRow key={contact.number} contact={contact} onPick={() => pick(contact)} />
                ))}
            </div>
        </section>
    );
}
