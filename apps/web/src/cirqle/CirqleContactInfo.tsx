/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// Contact info side panel for WhatsApp and Telegram private chats, in place of
// Element's room summary, built like Group info: the customer's name and number,
// the number we write from, and what WhatsApp offers there that means something
// for staff. Favourite and Mute are each staff member's own (a room tag and push
// rules), as Element's own are; Media, links and docs is Element's file panel,
// whose back arrow returns here.

import React, { type JSX, useContext } from "react";
import { type Room, RoomEvent } from "matrix-js-sdk/src/matrix";

import { SDKContext } from "../contexts/SDKContext";
import { useRoomName } from "../hooks/useRoomName";
import { useEventEmitterState } from "../hooks/useEventEmitter";
import { useNotificationState } from "../hooks/useRoomNotificationState";
import { RoomNotifState } from "../RoomNotifs";
import { RightPanelPhases } from "../stores/right-panel/RightPanelStorePhases";
import { DefaultTagID } from "../stores/room-list-v3/skip-list/tag";
import { getTagsForRoom } from "../utils/room/getTagsForRoom";
import { tagRoom } from "../utils/room/tagRoom";
import RoomAvatar from "../components/views/avatars/RoomAvatar";
import { BellOffIcon, CloseIcon, MediaIcon, StarIcon } from "./CirqleIcons";
import { chatKind, inboxesOf, networkOf, privateChatContact, stripNetworkSuffix } from "./CirqleInboxes";
import { ghostPhone } from "./CirqleMemberCard";
import { useCirqleInboxes } from "./useCirqleChats";

export function isCirqleContactInfoRoom(room: Room): boolean {
    return !!networkOf(room) && chatKind(room) === "chat";
}

/** Favourite, Mute notifications and Media, links and docs: the same in Contact info and Group info. */
export function CirqleChatActions({ room }: { room: Room }): JSX.Element {
    const sdkContext = useContext(SDKContext);
    const favourite = useEventEmitterState(room, RoomEvent.Tags, () =>
        getTagsForRoom(room).includes(DefaultTagID.Favourite),
    );
    const [notifications, setNotifications] = useNotificationState(room);
    const muted = notifications === RoomNotifState.Mute;

    return (
        <div className="cirqle_GroupInfo_card">
            <button
                type="button"
                className="cirqle_GroupInfo_row cirqle_GroupInfo_action"
                onClick={() => tagRoom(room, DefaultTagID.Favourite)}
            >
                <StarIcon />
                <span className="cirqle_GroupInfo_actionLabel">
                    {favourite ? "Remove from favourites" : "Add to favourites"}
                </span>
            </button>
            <button
                type="button"
                className="cirqle_GroupInfo_row cirqle_GroupInfo_action"
                role="switch"
                aria-checked={muted}
                onClick={() => setNotifications(muted ? RoomNotifState.AllMessages : RoomNotifState.Mute)}
            >
                <BellOffIcon />
                <span className="cirqle_GroupInfo_actionLabel">Mute notifications</span>
                <span className="cirqle_GroupInfo_switch" aria-hidden="true" />
            </button>
            <button
                type="button"
                className="cirqle_GroupInfo_row cirqle_GroupInfo_action"
                onClick={() =>
                    sdkContext.rightPanelStore.pushCard({ phase: RightPanelPhases.FilePanel }, true, room.roomId)
                }
            >
                <MediaIcon />
                <span className="cirqle_GroupInfo_actionLabel">Media, links and docs</span>
            </button>
        </div>
    );
}

export function CirqleContactInfo({ room }: { room: Room }): JSX.Element {
    const sdkContext = useContext(SDKContext);
    const inboxes = useCirqleInboxes();
    const name = stripNetworkSuffix(useRoomName(room));
    const contact = privateChatContact(room);
    const phone = contact ? ghostPhone(contact) : undefined;
    const own = inboxesOf(room, inboxes);
    const sub = [
        networkOf(room) === "telegram" ? "Telegram" : "WhatsApp",
        own.length ? `from ${own.map((inbox) => inbox.label).join(", ")}` : "",
    ]
        .filter(Boolean)
        .join(" · ");

    return (
        <aside className="cirqle_GroupInfo" aria-labelledby="cirqle_ContactInfo_title">
            <div className="cirqle_GroupInfo_bar">
                <button
                    type="button"
                    className="cirqle_iconButton"
                    aria-label="Close contact info"
                    onClick={() => sdkContext.rightPanelStore.hide(room.roomId)}
                >
                    <CloseIcon />
                </button>
                <span className="cirqle_GroupInfo_barTitle">Contact info</span>
            </div>

            <div className="cirqle_GroupInfo_card cirqle_GroupInfo_identity">
                <RoomAvatar room={room} size="96px" />
                <h2 id="cirqle_ContactInfo_title" className="cirqle_GroupInfo_name">
                    {name}
                </h2>
                {phone && phone !== name && <span className="cirqle_GroupInfo_phone">{phone}</span>}
                <span className="cirqle_GroupInfo_sub">{sub}</span>
            </div>

            <CirqleChatActions room={room} />
        </aside>
    );
}
