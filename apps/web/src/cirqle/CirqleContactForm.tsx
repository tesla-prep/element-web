/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// New contact and Edit contact (VLA-864), in place of the chat list as WhatsApp
// Web has it: the name and the number with its country code. Save adds the
// contact or changes the one being edited (by its previous number); Delete
// contact… asks first. The relay bot's refusals are shown under the fields as
// they are. Done, the form goes back to Contacts or New chat, which read the book again.

import React, { type JSX, useState } from "react";
import { MatrixError } from "matrix-js-sdk/src/matrix";
import { logger } from "matrix-js-sdk/src/logger";

import { useMatrixClientContext } from "../contexts/MatrixClientContext";
import Modal from "../Modal";
import QuestionDialog from "../components/views/dialogs/QuestionDialog";
import { formatPhone } from "./CirqleInboxes";
import { PanelHeader } from "./CirqleContacts";
import { deleteSharedContact, saveSharedContact, type SharedContact } from "./CirqleSharedContacts";
import { CirqleUiStore } from "./CirqleUiStore";

/** The relay bot's own words ("+14695551234 is already in contacts as «Anna»"), else the error */
function errorText(e: unknown): string {
    if (e instanceof MatrixError && e.data.error) return e.data.error;
    return e instanceof Error ? e.message : String(e);
}

const back = (): void => CirqleUiStore.closeContactForm();

/** Save and Delete contact…: each sends one request, then goes back, or keeps the form with the refusal */
function useContactActions(edited: SharedContact | undefined): {
    busy: boolean;
    error?: string;
    save: (contact: { number: string; name: string }) => void;
    remove: () => Promise<void>;
} {
    const client = useMatrixClientContext();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string>();

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

    const save = (contact: { number: string; name: string }): void => {
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

    return { busy, error, save, remove };
}

function ContactField({
    id,
    label,
    ...input
}: { id: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>): JSX.Element {
    return (
        <div className="cirqle_ContactForm_field">
            <label htmlFor={id}>{label}</label>
            <input id={id} {...input} />
        </div>
    );
}

interface FieldsProps {
    name: string;
    number: string;
    busy: boolean;
    setName: (name: string) => void;
    setNumber: (number: string) => void;
    onSubmit: () => void;
}

/** Name and Phone number, with the country code note under a number typed without it; Enter saves, Escape goes back */
function ContactFields({ name, number, busy, setName, setNumber, onSubmit }: FieldsProps): JSX.Element {
    const onKeyDown = (ev: React.KeyboardEvent): void => {
        if (ev.key === "Enter") onSubmit();
        if (ev.key === "Escape" && !busy) back();
    };
    return (
        <>
            <ContactField
                id="cirqle_ContactForm_name"
                label="Name"
                autoFocus
                maxLength={200}
                value={name}
                disabled={busy}
                onChange={(ev) => setName(ev.target.value)}
                onKeyDown={onKeyDown}
            />
            <ContactField
                id="cirqle_ContactForm_number"
                label="Phone number"
                type="tel"
                inputMode="tel"
                placeholder="+1 214 555 0100"
                value={number}
                disabled={busy}
                onChange={(ev) => setNumber(ev.target.value)}
                onKeyDown={onKeyDown}
            />
            {/^\d{7,15}$/.test(number.replace(/[\s().-]/g, "")) && (
                <p className="cirqle_ContactForm_note" role="status">
                    Type the number with its country code, like +1 214 555 0100
                </p>
            )}
        </>
    );
}

export function CirqleContactForm(): JSX.Element {
    const edited = CirqleUiStore.editedContact;
    const { busy, error, save, remove } = useContactActions(edited);
    const [name, setName] = useState(edited?.name ?? "");
    const [number, setNumber] = useState(edited ? formatPhone(edited.number) : "");
    const changed = !edited || name.trim() !== edited.name || number.replace(/[^\d+]/g, "") !== edited.number;
    const ready = name.trim() !== "" && number.trim() !== "" && changed && !busy;
    const submit = (): void => {
        if (ready) save({ number: number.trim(), name: name.trim() });
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
            <ContactFields
                name={name}
                number={number}
                busy={busy}
                setName={setName}
                setNumber={setNumber}
                onSubmit={submit}
            />
            {error && (
                <p className="cirqle_ContactForm_error" role="alert">
                    {error}
                </p>
            )}
            <button type="button" className="cirqle_NewGroup_create" disabled={!ready} onClick={submit}>
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
