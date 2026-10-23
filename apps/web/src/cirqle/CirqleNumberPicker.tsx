/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// «All numbers ▾» at the top right of the chat list. Picking a number shows only
// the chats of that WhatsApp number or Telegram account: it makes the bridge's
// space for that number Element's active space (Home is "All numbers"), and the
// list reads that space's chats. A disconnected number is marked and left out of
// All numbers; its chats stay readable when it is picked.

import React, { type JSX, useEffect, useRef, useState } from "react";
import classNames from "classnames";

import { SDKContextClass } from "../contexts/SDKContextClass";
import { MetaSpace, UPDATE_SELECTED_SPACE } from "../stores/spaces";
import { useEventEmitterState } from "../hooks/useEventEmitter";
import { AllNumbersIcon, CheckIcon, ChatsIcon, ChevronDownIcon, ChevronUpIcon, TelegramIcon } from "./CirqleIcons";
import { type Inbox, type Network } from "./CirqleInboxes";
import { type CirqleSection } from "./CirqleUiStore";
import { countUnread } from "./useCirqleChats";

interface Choice {
    key: string;
    label: string;
    sub: string;
    network?: Network;
    disconnected?: boolean;
    unread: number;
}

export function CirqleNumberPicker({ inboxes, section }: { inboxes: Inbox[]; section: CirqleSection }): JSX.Element {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const activeSpace = useEventEmitterState(
        SDKContextClass.instance.spaceStore,
        UPDATE_SELECTED_SPACE,
        () => SDKContextClass.instance.spaceStore.activeSpace,
    );

    // A space that is not a number (or a number since disconnected) counts as All numbers
    const selected = inboxes.find((inbox) => inbox.spaceId === activeSpace);
    useEffect(() => {
        if (inboxes.length && !selected && activeSpace !== MetaSpace.Home) {
            SDKContextClass.instance.spaceStore.setActiveSpace(MetaSpace.Home, false);
        }
    }, [inboxes, selected, activeSpace]);

    useEffect(() => {
        if (!open) return;
        const onPointer = (ev: PointerEvent): void => {
            if (!rootRef.current?.contains(ev.target as Node)) setOpen(false);
        };
        const onKey = (ev: KeyboardEvent): void => {
            if (ev.key === "Escape") setOpen(false);
        };
        document.addEventListener("pointerdown", onPointer);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("pointerdown", onPointer);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    const choices: Choice[] = [
        {
            key: MetaSpace.Home,
            label: "All numbers",
            sub: "Every connected number",
            unread: open ? countUnread(inboxes, undefined, section) : 0,
        },
        ...inboxes.map((inbox) => ({
            key: inbox.spaceId,
            label: inbox.label,
            sub: [inbox.network === "whatsapp" ? "WhatsApp" : "Telegram", inbox.phone].filter(Boolean).join(" · "),
            network: inbox.network,
            disconnected: !inbox.connected,
            unread: open ? countUnread(inboxes, inbox, section) : 0,
        })),
    ];
    const selectedKey = selected?.spaceId ?? MetaSpace.Home;
    const networks = selected
        ? [selected.network]
        : Array.from(new Set(inboxes.filter((inbox) => inbox.connected).map((inbox) => inbox.network)));

    const pick = (key: string): void => {
        setOpen(false);
        SDKContextClass.instance.spaceStore.setActiveSpace(key, false);
    };

    return (
        <div className="cirqle_NumberPicker" ref={rootRef}>
            <button
                className={classNames("cirqle_NumberPicker_pill", { cirqle_NumberPicker_pill_open: open })}
                aria-label="Choose number"
                aria-haspopup="listbox"
                aria-expanded={open}
                title={selected && !selected.connected ? `${selected.label} is disconnected` : undefined}
                onClick={() => setOpen(!open)}
            >
                {!open && (
                    <span className="cirqle_NumberPicker_dots">
                        {networks.map((network) => (
                            <span
                                key={network}
                                className={`cirqle_dot cirqle_dot_${selected && !selected.connected ? "none" : network}`}
                            />
                        ))}
                    </span>
                )}
                <span className="cirqle_NumberPicker_label">{selected?.label ?? "All numbers"}</span>
                {open ? <ChevronUpIcon /> : <ChevronDownIcon />}
            </button>
            {open && (
                <div className="cirqle_NumberPicker_list" role="listbox" aria-label="Numbers">
                    {choices.map((choice) => (
                        <button
                            key={choice.key}
                            role="option"
                            aria-selected={choice.key === selectedKey}
                            className="cirqle_NumberPicker_option"
                            onClick={() => pick(choice.key)}
                        >
                            <span
                                className={`cirqle_NumberPicker_icon cirqle_NumberPicker_icon_${choice.disconnected ? "off" : (choice.network ?? "all")}`}
                            >
                                {choice.network === "telegram" ? (
                                    <TelegramIcon size={18} />
                                ) : choice.network ? (
                                    <ChatsIcon size={18} />
                                ) : (
                                    <AllNumbersIcon size={18} />
                                )}
                            </span>
                            <span className="cirqle_NumberPicker_text">
                                <span className="cirqle_NumberPicker_name">{choice.label}</span>
                                <span className="cirqle_NumberPicker_sub">
                                    {choice.sub}
                                    {choice.disconnected && (
                                        <span className="cirqle_NumberPicker_off">Disconnected</span>
                                    )}
                                </span>
                            </span>
                            <span className="cirqle_NumberPicker_check">
                                {choice.key === selectedKey && <CheckIcon />}
                            </span>
                            <span className="cirqle_NumberPicker_count">
                                {choice.unread > 0 && <span className="cirqle_badge">{choice.unread}</span>}
                            </span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
