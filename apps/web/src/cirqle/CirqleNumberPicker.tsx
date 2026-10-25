/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// «All numbers ▾» at the top right of the chat list. Picking a number shows only
// the chats of that WhatsApp number or Telegram account; the round tick beside
// each number adds it to the pick or takes it out, so the list can show two
// WhatsApp numbers and a Telegram account together ("3 numbers"). The pick is
// kept in this browser (CirqleUiStore). One picked number is also Element's
// active space, as before; several or none is Home ("All numbers"). A
// disconnected number is marked and left out of All numbers; its chats stay
// readable when it is picked.

import React, { type JSX, useEffect, useRef, useState } from "react";
import classNames from "classnames";

import { SDKContextClass } from "../contexts/SDKContextClass";
import { MetaSpace, UPDATE_SELECTED_SPACE } from "../stores/spaces";
import { useEventEmitterState } from "../hooks/useEventEmitter";
import { AllNumbersIcon, CheckIcon, ChatsIcon, ChevronDownIcon, ChevronUpIcon, TelegramIcon } from "./CirqleIcons";
import { type Inbox } from "./CirqleInboxes";
import { type CirqleSection, CirqleUiStore, useCirqlePickedNumbers } from "./CirqleUiStore";
import { countUnread } from "./useCirqleChats";

/** The pill's text: "All numbers", the one number's name, or "3 numbers". */
export function pickedLabel(picked: Inbox[]): string {
    if (picked.length === 0) return "All numbers";
    if (picked.length === 1) return picked[0].label;
    return `${picked.length} numbers`;
}

export function CirqleNumberPicker({ inboxes, section }: { inboxes: Inbox[]; section: CirqleSection }): JSX.Element {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const pickedIds = useCirqlePickedNumbers();
    const activeSpace = useEventEmitterState(
        SDKContextClass.instance.spaceStore,
        UPDATE_SELECTED_SPACE,
        () => SDKContextClass.instance.spaceStore.activeSpace,
    );
    const picked = inboxes.filter((inbox) => pickedIds.includes(inbox.spaceId));

    // Before the first pick in this browser, the number picked earlier (Element's active space) stays picked
    useEffect(() => {
        if (!inboxes.length) return;
        if (CirqleUiStore.pickedNumbersUnset) {
            const earlier = inboxes.find((inbox) => inbox.spaceId === activeSpace);
            if (earlier) CirqleUiStore.pickNumbers([earlier.spaceId]);
            return;
        }
        // A number that is gone (deleted, no longer read) drops out of the pick
        if (picked.length !== pickedIds.length) CirqleUiStore.pickNumbers(picked.map((inbox) => inbox.spaceId));
    }, [inboxes, activeSpace, picked, pickedIds]);

    // One picked number is Element's active space, as New chat and New group expect; otherwise Home
    const wantedSpace = picked.length === 1 ? picked[0].spaceId : MetaSpace.Home;
    useEffect(() => {
        if (!inboxes.length || CirqleUiStore.pickedNumbersUnset) return;
        const spaces = SDKContextClass.instance.spaceStore;
        if (spaces.activeSpace !== wantedSpace) spaces.setActiveSpace(wantedSpace, false);
    }, [inboxes, activeSpace, wantedSpace]);

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

    const networks = picked.length
        ? Array.from(new Set(picked.map((inbox) => inbox.network)))
        : Array.from(new Set(inboxes.filter((inbox) => inbox.connected).map((inbox) => inbox.network)));
    const off = picked.filter((inbox) => !inbox.connected);
    const allOff = picked.length > 0 && off.length === picked.length;

    const pickOnly = (spaceIds: string[]): void => {
        setOpen(false);
        CirqleUiStore.pickNumbers(spaceIds);
    };
    const toggle = (inbox: Inbox): void => {
        const ids = picked.map((p) => p.spaceId);
        CirqleUiStore.pickNumbers(
            ids.includes(inbox.spaceId) ? ids.filter((id) => id !== inbox.spaceId) : [...ids, inbox.spaceId],
        );
    };

    return (
        <div className="cirqle_NumberPicker" ref={rootRef}>
            <button
                className={classNames("cirqle_NumberPicker_pill", { cirqle_NumberPicker_pill_open: open })}
                aria-label="Choose number"
                aria-haspopup="listbox"
                aria-expanded={open}
                title={
                    off.length
                        ? `${off.map((inbox) => inbox.label).join(", ")} ${off.length === 1 ? "is" : "are"} disconnected`
                        : undefined
                }
                onClick={() => setOpen(!open)}
            >
                {!open && (
                    <span className="cirqle_NumberPicker_dots">
                        {networks.map((network) => (
                            <span key={network} className={`cirqle_dot cirqle_dot_${allOff ? "none" : network}`} />
                        ))}
                    </span>
                )}
                <span className="cirqle_NumberPicker_label">{pickedLabel(picked)}</span>
                {open ? <ChevronUpIcon /> : <ChevronDownIcon />}
            </button>
            {open && (
                <div
                    className="cirqle_NumberPicker_list"
                    role="listbox"
                    aria-label="Numbers"
                    aria-multiselectable="true"
                >
                    <div role="option" aria-selected={picked.length === 0} className="cirqle_NumberPicker_item">
                        <button type="button" className="cirqle_NumberPicker_option" onClick={() => pickOnly([])}>
                            <span className="cirqle_NumberPicker_icon cirqle_NumberPicker_icon_all">
                                <AllNumbersIcon size={18} />
                            </span>
                            <span className="cirqle_NumberPicker_text">
                                <span className="cirqle_NumberPicker_name">All numbers</span>
                                <span className="cirqle_NumberPicker_sub">Every connected number</span>
                            </span>
                            <span className="cirqle_NumberPicker_count">
                                <UnreadBadge count={countUnread(inboxes, [], section)} />
                            </span>
                        </button>
                        <span className="cirqle_NumberPicker_tick cirqle_NumberPicker_tick_all" aria-hidden="true">
                            {picked.length === 0 && <CheckIcon />}
                        </span>
                    </div>
                    {inboxes.map((inbox) => {
                        const isPicked = picked.includes(inbox);
                        const sub = [inbox.network === "whatsapp" ? "WhatsApp" : "Telegram", inbox.phone]
                            .filter(Boolean)
                            .join(" · ");
                        return (
                            <div
                                key={inbox.spaceId}
                                role="option"
                                aria-selected={isPicked}
                                className="cirqle_NumberPicker_item"
                            >
                                <button
                                    type="button"
                                    className="cirqle_NumberPicker_option"
                                    title={`Only ${inbox.label}`}
                                    onClick={() => pickOnly([inbox.spaceId])}
                                >
                                    <span
                                        className={`cirqle_NumberPicker_icon cirqle_NumberPicker_icon_${inbox.connected ? inbox.network : "off"}`}
                                    >
                                        {inbox.network === "telegram" ? (
                                            <TelegramIcon size={18} />
                                        ) : (
                                            <ChatsIcon size={18} />
                                        )}
                                    </span>
                                    <span className="cirqle_NumberPicker_text">
                                        <span className="cirqle_NumberPicker_name">{inbox.label}</span>
                                        <span className="cirqle_NumberPicker_sub">
                                            {sub}
                                            {!inbox.connected && (
                                                <span className="cirqle_NumberPicker_off">Disconnected</span>
                                            )}
                                        </span>
                                    </span>
                                    <span className="cirqle_NumberPicker_count">
                                        <UnreadBadge count={countUnread(inboxes, [inbox], section)} />
                                    </span>
                                </button>
                                <button
                                    type="button"
                                    role="checkbox"
                                    aria-checked={isPicked}
                                    aria-label={`Show ${inbox.label}`}
                                    className={classNames("cirqle_NumberPicker_tick", {
                                        cirqle_NumberPicker_tick_on: isPicked,
                                    })}
                                    onClick={() => toggle(inbox)}
                                >
                                    {isPicked && <CheckIcon size={14} />}
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function UnreadBadge({ count }: { count: number }): JSX.Element | null {
    return count > 0 ? <span className="cirqle_badge">{count}</span> : null;
}
