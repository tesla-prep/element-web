/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// What the right side shows when no chat is open (concept artboard Empty).

import React, { type JSX } from "react";

import logoUrl from "../../res/img/cirqle/cirqle-shield-outlined-marble.svg";
import { AllNumbersIcon, ChannelIcon, GroupIcon, PencilIcon } from "./CirqleIcons";
import { CirqleUiStore } from "./CirqleUiStore";
import { createChannel, createGroup } from "./CirqleChatList";

function openNumberPicker(): void {
    CirqleUiStore.showSection("chats");
    document.querySelector<HTMLButtonElement>(".cirqle_NumberPicker_pill")?.click();
}

const ACTIONS = [
    { label: "New chat", Icon: PencilIcon, onClick: () => CirqleUiStore.openNewChat() },
    { label: "New group", Icon: GroupIcon, onClick: createGroup },
    { label: "New channel", Icon: ChannelIcon, onClick: createChannel },
    { label: "Switch number", Icon: AllNumbersIcon, onClick: openNumberPicker },
];

export function CirqleEmpty(): JSX.Element {
    return (
        <main className="cirqle_Empty" aria-label="No chat open">
            <div className="cirqle_Empty_content">
                <div className="cirqle_Empty_mark">
                    <img src={logoUrl} alt="" />
                </div>
                <h2 className="cirqle_Empty_title">CIRQLE Messenger</h2>
                <p className="cirqle_Empty_text">
                    Pick a chat on the left, or start a new one. Every message goes out from the number shown under
                    the chat.
                </p>
                <div className="cirqle_Empty_actions">
                    {ACTIONS.map(({ label, Icon, onClick }) => (
                        <button key={label} className="cirqle_Empty_action" onClick={onClick}>
                            <span className="cirqle_Empty_actionIcon">
                                <Icon size={24} />
                            </span>
                            {label}
                        </button>
                    ))}
                </div>
            </div>
        </main>
    );
}
