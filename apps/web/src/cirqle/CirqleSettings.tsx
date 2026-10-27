/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// The settings staff need, and nothing that does not work for WhatsApp chats:
// no Appearance and Sidebar (CIRQLE's look is fixed), no Security, Encryption
// and Labs (the bridged chats are not encrypted), and a short Preferences
// without the room list, read receipt, typing or language switches, which do
// nothing here. Element's Sessions (session verification, QR sign-in, IP
// addresses), Keyboard (calls, stickers, threads) and Help (crypto and server
// versions) are for Element's own users, not for staff answering WhatsApp.

import React, { type JSX } from "react";

import { Tab } from "../components/structures/TabbedView";
import { UserTab } from "../components/views/dialogs/UserTab";
import SettingsTab from "../components/views/settings/tabs/SettingsTab";
import { SettingsSection } from "../components/views/settings/shared/SettingsSection";
import { SettingsSubsection } from "../components/views/settings/shared/SettingsSubsection";
import SettingsFlag from "../components/views/elements/SettingsFlag";
import { SettingLevel } from "../settings/SettingLevel";
import { type BooleanSettingKey } from "../settings/Settings";
import { cirqlePushConfig, isCirqleMessenger } from "./CirqleFeatures";
import { CirqleNotificationsTab } from "./CirqleNotificationsTab";

const SHOWN_TABS = new Set<string>([UserTab.Account, UserTab.Notifications, UserTab.Preferences]);

const PREFERENCES: { heading: string; settings: BooleanSettingKey[] }[] = [
    {
        heading: "Typing",
        settings: [
            "MessageComposerInput.ctrlEnterToSend",
            "MessageComposerInput.useMarkdown",
            "MessageComposerInput.autoReplaceEmoji",
            "MessageComposerInput.suggestEmoji",
        ],
    },
    { heading: "Time", settings: ["showTwelveHourTimestamps"] },
    { heading: "Photos and videos", settings: ["autoplayGifs", "autoplayVideo"] },
];

export function CirqlePreferencesTab(): JSX.Element {
    return (
        <SettingsTab data-testid="cirqle_PreferencesTab">
            <SettingsSection>
                {PREFERENCES.map(({ heading, settings }) => (
                    <SettingsSubsection key={heading} heading={heading} formWrap>
                        {settings.map((name) => (
                            <SettingsFlag key={name} name={name} level={SettingLevel.ACCOUNT} />
                        ))}
                    </SettingsSubsection>
                ))}
            </SettingsSection>
        </SettingsTab>
    );
}

/** Our own tabs in place of Element's: Preferences always, Notifications while Web Push is set up (CirqlePush). */
function cirqleTab(tab: Tab<UserTab>): JSX.Element | undefined {
    if (tab.id === UserTab.Preferences) return <CirqlePreferencesTab key="preferences" />;
    if (tab.id === UserTab.Notifications && cirqlePushConfig()) return <CirqleNotificationsTab key="notifications" />;
    return undefined;
}

export function cirqleUserTabs(tabs: Tab<UserTab>[]): Tab<UserTab>[] {
    if (!isCirqleMessenger()) return tabs;
    return tabs
        .filter((tab) => SHOWN_TABS.has(tab.id))
        .map((tab) => {
            const body = cirqleTab(tab);
            return body ? new Tab(tab.id, tab.label, tab.icon, body, tab.screenName, tab.labelClassName) : tab;
        });
}
