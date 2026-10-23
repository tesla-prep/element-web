/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// The chat header, WhatsApp style: under the name the contact's number (or what
// the chat is) and the number we answer from; on the right search and a menu.

import React, { type JSX, useContext, useState } from "react";
import { type Room } from "matrix-js-sdk/src/matrix";
import { Menu, MenuItem } from "@vector-im/compound-web";

import { SDKContext } from "../contexts/SDKContext";
import { RightPanelPhases } from "../stores/right-panel/RightPanelStorePhases";
import dis from "../dispatcher/dispatcher";
import { Action } from "../dispatcher/actions";
import { useRoomMembers } from "../hooks/useRoomMembers";
import { groupPeople } from "./CirqleGroupInfo";
import { chatKind, contactNumber, inboxesOf, networkOf } from "./CirqleInboxes";
import { useCirqleInboxes } from "./useCirqleChats";
import { BackIcon, GroupIcon, KebabIcon, SearchIcon } from "./CirqleIcons";

export function CirqleRoomSubtitle({ room }: { room: Room }): JSX.Element | null {
    const inboxes = useCirqleInboxes();
    const memberCount = groupPeople(useRoomMembers(room)).length;
    const kind = chatKind(room);
    const from = inboxesOf(room, inboxes)
        .map((inbox) => inbox.label)
        .join(", ");
    const network = networkOf(room);

    const parts: string[] = [];
    if (kind === "chat") {
        const number = contactNumber(room);
        if (number && !room.name.replace(/[^\d]/g, "").includes(number.replace(/[^\d]/g, ""))) parts.push(number);
        else if (network === "telegram") parts.push("Telegram");
    } else {
        parts.push(`${network === "telegram" ? "Telegram " : ""}${kind === "channel" ? "channel" : "group"}`);
        if (kind === "group") parts.push(`${memberCount} members`);
    }
    if (from) parts.push(`from ${from}`);
    if (!parts.length) return null;
    const text = parts.join(" · ");
    return <span className="cirqle_RoomHeader_subtitle">{text.charAt(0).toUpperCase() + text.slice(1)}</span>;
}

export function CirqleRoomHeaderButtons({ room }: { room: Room }): JSX.Element {
    const sdkContext = useContext(SDKContext);
    const [menuOpen, setMenuOpen] = useState(false);
    const kind = chatKind(room);
    const infoLabel = kind === "chat" ? "Contact info" : kind === "channel" ? "Channel info" : "Group info";

    return (
        <>
            <button
                className="cirqle_iconButton cirqle_RoomHeader_button"
                aria-label="Search in chat"
                onClick={(ev) => {
                    ev.stopPropagation();
                    dis.fire(Action.FocusMessageSearch);
                }}
            >
                <SearchIcon size={20} />
            </button>
            <Menu
                open={menuOpen}
                onOpenChange={setMenuOpen}
                title="Menu"
                side="bottom"
                align="end"
                trigger={
                    <button className="cirqle_iconButton cirqle_RoomHeader_button" aria-label="Menu">
                        <KebabIcon />
                    </button>
                }
            >
                <MenuItem
                    Icon={GroupIcon}
                    label={infoLabel}
                    onSelect={() => sdkContext.rightPanelStore.setCard({ phase: RightPanelPhases.RoomSummary }, true)}
                />
            </Menu>
        </>
    );
}

/** On a phone-wide window the chat covers the list; this goes back to it. */
export function CirqleRoomBackButton(): JSX.Element {
    return (
        <button
            className="cirqle_iconButton cirqle_iconButton_green cirqle_RoomHeader_back"
            aria-label="Back to chats"
            onClick={() => dis.fire(Action.ViewHomePage)}
        >
            <BackIcon />
        </button>
    );
}
