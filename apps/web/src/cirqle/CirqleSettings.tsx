/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// The settings staff need, and nothing that does not work for WhatsApp chats:
// no Appearance and Sidebar (CIRQLE's look is fixed), no Security, Encryption
// and Labs (the bridged chats are not encrypted), and a short Preferences
// without the room list, read receipt, typing or language switches, which do
// nothing here.

import React, { type JSX } from "react";

import { Tab } from "../components/structures/TabbedView";
import { UserTab } from "../components/views/dialogs/UserTab";
import SettingsTab from "../components/views/settings/tabs/SettingsTab";
import { SettingsSection } from "../components/views/settings/shared/SettingsSection";
import { SettingsSubsection } from "../components/views/settings/shared/SettingsSubsection";
import SettingsFlag from "../components/views/elements/SettingsFlag";
import { SettingLevel } from "../settings/SettingLevel";
import { type BooleanSettingKey } from "../settings/Settings";
import { isCirqleMessenger } from "./CirqleFeatures";

const SHOWN_TABS = new Set<string>([
    UserTab.Account,
    UserTab.SessionManager,
    UserTab.Notifications,
    UserTab.Preferences,
    UserTab.Keyboard,
    UserTab.Help,
]);

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

export function cirqleUserTabs(tabs: Tab<UserTab>[]): Tab<UserTab>[] {
    if (!isCirqleMessenger()) return tabs;
    return tabs
        .filter((tab) => SHOWN_TABS.has(tab.id))
        .map((tab) =>
            tab.id === UserTab.Preferences
                ? new Tab(
                      tab.id,
                      tab.label,
                      tab.icon,
                      <CirqlePreferencesTab key="preferences" />,
                      tab.screenName,
                      tab.labelClassName,
                  )
                : tab,
        );
}
