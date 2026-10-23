/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// «All numbers ▾» at the top right of the chat list. Picking a number shows only
// the chats of that WhatsApp number or Telegram account: it makes the bridge's
// space for that number Element's active space (Home, with every room in it,
// is "All numbers").

import React, { type JSX, useEffect, useRef, useState } from "react";
import classNames from "classnames";

import { SDKContextClass } from "../contexts/SDKContextClass";
import { MetaSpace, UPDATE_SELECTED_SPACE } from "../stores/spaces";
import RoomListStoreV3 from "../stores/room-list-v3/RoomListStoreV3";
import { useEventEmitterState } from "../hooks/useEventEmitter";
import { AllNumbersIcon, CheckIcon, ChatsIcon, ChevronDownIcon, ChevronUpIcon, TelegramIcon } from "./CirqleIcons";
import { type Inbox, type Network } from "./CirqleInboxes";
import { isUnreadChat } from "./useCirqleChats";

interface Choice {
    key: string;
    label: string;
    sub: string;
    network?: Network;
    unread: number;
}

function unreadIn(inbox: Inbox | undefined): number {
    return RoomListStoreV3.instance
        .getSortedRooms()
        .filter((room) => (!inbox || inbox.childIds.has(room.roomId)) && isUnreadChat(room)).length;
}

export function CirqleNumberPicker({ inboxes }: { inboxes: Inbox[] }): JSX.Element {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const activeSpace = useEventEmitterState(SDKContextClass.instance.spaceStore, UPDATE_SELECTED_SPACE, () => SDKContextClass.instance.spaceStore.activeSpace);

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
        { key: MetaSpace.Home, label: "All numbers", sub: "Every chat you can read", unread: open ? unreadIn(undefined) : 0 },
        ...inboxes.map((inbox) => ({
            key: inbox.spaceId,
            label: inbox.label,
            sub: [inbox.network === "whatsapp" ? "WhatsApp" : "Telegram", inbox.phone].filter(Boolean).join(" · "),
            network: inbox.network,
            unread: open ? unreadIn(inbox) : 0,
        })),
    ];
    const selectedKey = selected?.spaceId ?? MetaSpace.Home;
    const networks = selected ? [selected.network] : Array.from(new Set(inboxes.map((inbox) => inbox.network)));

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
                onClick={() => setOpen(!open)}
            >
                {!open && (
                    <span className="cirqle_NumberPicker_dots">
                        {networks.map((network) => (
                            <span key={network} className={`cirqle_dot cirqle_dot_${network}`} />
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
                            <span className={`cirqle_NumberPicker_icon cirqle_NumberPicker_icon_${choice.network ?? "all"}`}>
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
                                <span className="cirqle_NumberPicker_sub">{choice.sub}</span>
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
