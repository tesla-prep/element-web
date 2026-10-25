/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// The deep green rail on the left, in place of Element's space bar:
// logo, Chats (with the number of unread chats), Channels (only while the picked
// number, or any number under All numbers, has a channel), settings, profile.

import React, { type JSX, useCallback, useEffect, useState } from "react";
import { Menu, MenuItem } from "@vector-im/compound-web";

import logoUrl from "../../res/img/cirqle/cirqle-shield-outlined-marble.svg";
import { ChannelIcon, ChatsIcon, LeaveIcon, SettingsIcon } from "./CirqleIcons";
import { CirqleUiStore, useCirqleUi } from "./CirqleUiStore";
import { useCirqleHasChannels, useCirqleUnreadChats } from "./useCirqleChats";
import dis from "../dispatcher/dispatcher";
import { Action } from "../dispatcher/actions";
import { OwnProfileStore } from "../stores/OwnProfileStore";
import { UPDATE_EVENT } from "../stores/AsyncStore";
import { useEventEmitterState } from "../hooks/useEventEmitter";
import BaseAvatar from "../components/views/avatars/BaseAvatar";
import Modal from "../Modal";
import QuestionDialog from "../components/views/dialogs/QuestionDialog";
import { useMatrixClientContext } from "../contexts/MatrixClientContext";
import { watchCirqleInviteRefusals } from "./CirqleInviteRefusals";
import { watchCirqlePush } from "./CirqlePush";

function confirmSignOut(): void {
    const { finished } = Modal.createDialog(QuestionDialog, {
        title: "Sign out…",
        description: "You will need to sign in again to read and answer chats.",
        button: "Sign out",
        danger: true,
    });
    void finished.then(([confirmed]) => {
        if (confirmed) dis.dispatch({ action: "logout" });
    });
}

export function CirqleRail(): JSX.Element {
    const client = useMatrixClientContext();
    const { section, panel } = useCirqleUi();
    const unreadChats = useCirqleUnreadChats();
    const channels = useCirqleHasChannels();
    const [profileOpen, setProfileOpen] = useState(false);
    const profile = useEventEmitterState(OwnProfileStore.instance, UPDATE_EVENT, () => ({
        name: OwnProfileStore.instance.displayName ?? client.getUserId() ?? "",
        avatarUrl: OwnProfileStore.instance.getHttpAvatarUrl(72),
    }));

    useEffect(() => watchCirqleInviteRefusals(client), [client]);
    useEffect(() => watchCirqlePush(client), [client]);
    useEffect(() => {
        if (!channels && CirqleUiStore.section === "channels") CirqleUiStore.showSection("chats");
    }, [channels]);

    const openSettings = useCallback(() => dis.fire(Action.ViewUserSettings), []);
    const chatsActive = section === "chats" || panel !== "list";

    return (
        <nav className="cirqle_Rail" aria-label="Sections">
            <img className="cirqle_Rail_logo" src={logoUrl} alt="CIRQLE" />
            <button
                className="cirqle_Rail_button"
                aria-label="Chats"
                aria-current={chatsActive ? "page" : undefined}
                onClick={() => CirqleUiStore.showSection("chats")}
            >
                <ChatsIcon />
                {unreadChats > 0 && <span className="cirqle_Rail_badge">{unreadChats}</span>}
            </button>
            {channels && (
                <button
                    className="cirqle_Rail_button"
                    aria-label="Channels"
                    aria-current={!chatsActive && section === "channels" ? "page" : undefined}
                    onClick={() => CirqleUiStore.showSection("channels")}
                >
                    <ChannelIcon />
                </button>
            )}
            <div className="cirqle_Rail_spacer" />
            <button className="cirqle_Rail_button" aria-label="Settings" onClick={openSettings}>
                <SettingsIcon />
            </button>
            <Menu
                open={profileOpen}
                onOpenChange={setProfileOpen}
                title={profile.name}
                side="right"
                align="end"
                trigger={
                    <button className="cirqle_Rail_profile" aria-label="Profile">
                        <BaseAvatar
                            name={profile.name}
                            idName={client.getUserId() ?? undefined}
                            url={profile.avatarUrl}
                            size="36px"
                        />
                    </button>
                }
            >
                <MenuItem Icon={SettingsIcon} label="Settings" onSelect={openSettings} />
                <MenuItem Icon={LeaveIcon} label="Sign out…" kind="critical" onSelect={confirmSignOut} />
            </Menu>
        </nav>
    );
}
