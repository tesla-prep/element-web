/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// Contacts (VLA-864), in place of the chat list as WhatsApp Web has it: CIRQLE's
// shared book (CirqleSharedContacts), the same on every number, by name, with a
// search by name or digits. Staff whom Directory lets change it get New contact
// on top and Edit contact on a click; everyone else's click opens New chat with
// the contact's number, to pick the number to write from there. The book is
// read again each time the screen opens, so a change shows for everyone.

import React, { type JSX, useMemo, useState } from "react";
import { MatrixError } from "matrix-js-sdk/src/matrix";
import { logger } from "matrix-js-sdk/src/logger";

import { useMatrixClientContext } from "../contexts/MatrixClientContext";
import BaseAvatar from "../components/views/avatars/BaseAvatar";
import Modal from "../Modal";
import QuestionDialog from "../components/views/dialogs/QuestionDialog";
import { AddMemberIcon, BackIcon, SearchIcon } from "./CirqleIcons";
import { formatPhone } from "./CirqleInboxes";
import { filterBook } from "./CirqlePhoneBook";
import { deleteSharedContact, saveSharedContact, type SharedContact, useSharedContacts } from "./CirqleSharedContacts";
import { CirqleUiStore } from "./CirqleUiStore";

/** The relay bot's own words ("+14695551234 is already in contacts as «Anna»"), else the error */
function errorText(e: unknown): string {
    if (e instanceof MatrixError && e.data.error) return e.data.error;
    return e instanceof Error ? e.message : String(e);
}

function PanelHeader({
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
                    <button
                        type="button"
                        key={contact.number}
                        className="cirqle_NewChat_row cirqle_NewChat_contact cirqle_NewChat_bookRow"
                        onClick={() => pick(contact)}
                    >
                        <BaseAvatar name={contact.name} idName={contact.number} size="44px" />
                        <span className="cirqle_NewChat_text cirqle_NewChat_text_ruled">
                            <span className="cirqle_NewChat_name">{contact.name}</span>
                            <span className="cirqle_NewChat_sub">{formatPhone(contact.number)}</span>
                        </span>
                    </button>
                ))}
            </div>
        </section>
    );
}

/** New contact, or Edit contact with Delete contact…: the name and the number with its country code */
export function CirqleContactForm(): JSX.Element {
    const client = useMatrixClientContext();
    const edited = CirqleUiStore.editedContact;
    const [name, setName] = useState(edited?.name ?? "");
    const [number, setNumber] = useState(edited ? formatPhone(edited.number) : "");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string>();
    const changed = !edited || name.trim() !== edited.name || number.replace(/[^\d+]/g, "") !== edited.number;
    const ready = name.trim() !== "" && number.trim() !== "" && changed && !busy;
    const back = (): void => CirqleUiStore.closeContactForm();

    const run = async (request: () => Promise<void>): Promise<void> => {
        setBusy(true);
        setError(undefined);
        try {
            await request();
            back();
        } catch (e) {
            logger.error("CIRQLE contact change failed", e);
            setError(errorText(e));
            setBusy(false);
        }
    };

    const save = (): void => {
        if (!ready) return;
        const contact = { number: number.trim(), name: name.trim() };
        void run(() => saveSharedContact(client, edited ? { ...contact, previous_number: edited.number } : contact));
    };

    const remove = async (): Promise<void> => {
        if (!edited) return;
        const { finished } = Modal.createDialog(QuestionDialog, {
            title: `Delete ${edited.name}?`,
            description: `${formatPhone(edited.number)} will be deleted from contacts on every number, for everyone at CIRQLE.`,
            button: "Delete contact",
            danger: true,
        });
        const [confirmed] = await finished;
        if (confirmed) await run(() => deleteSharedContact(client, edited.number));
    };

    const onKeyDown = (ev: React.KeyboardEvent): void => {
        if (ev.key === "Enter") save();
        if (ev.key === "Escape" && !busy) back();
    };

    return (
        <section className="cirqle_NewChat cirqle_ContactForm" aria-labelledby="cirqle_ContactForm_title">
            <PanelHeader
                id="cirqle_ContactForm_title"
                title={edited ? "Edit contact" : "New contact"}
                back="Back"
                onBack={back}
                disabled={busy}
            />
            <div className="cirqle_ContactForm_field">
                <label htmlFor="cirqle_ContactForm_name">Name</label>
                <input
                    id="cirqle_ContactForm_name"
                    autoFocus
                    maxLength={200}
                    value={name}
                    disabled={busy}
                    onChange={(ev) => setName(ev.target.value)}
                    onKeyDown={onKeyDown}
                />
            </div>
            <div className="cirqle_ContactForm_field">
                <label htmlFor="cirqle_ContactForm_number">Phone number</label>
                <input
                    id="cirqle_ContactForm_number"
                    type="tel"
                    inputMode="tel"
                    placeholder="+1 214 555 0100"
                    value={number}
                    disabled={busy}
                    onChange={(ev) => setNumber(ev.target.value)}
                    onKeyDown={onKeyDown}
                />
            </div>
            {/^\d{7,15}$/.test(number.replace(/[\s().-]/g, "")) && (
                <p className="cirqle_ContactForm_note" role="status">
                    Type the number with its country code, like +1 214 555 0100
                </p>
            )}
            {error && (
                <p className="cirqle_ContactForm_error" role="alert">
                    {error}
                </p>
            )}
            <button type="button" className="cirqle_NewGroup_create" disabled={!ready} onClick={save}>
                Save
            </button>
            {edited && (
                <button
                    type="button"
                    className="cirqle_ContactForm_delete"
                    disabled={busy}
                    onClick={() => void remove()}
                >
                    Delete contact…
                </button>
            )}
        </section>
    );
}
