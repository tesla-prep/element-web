/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// The settings staff need, and nothing that does not work for WhatsApp chats:
// no Appearance and Sidebar (the theme is the one choice of the CIRQLE look, at
// the top of Preferences: System, Light or Dark), no Security, Encryption
// and Labs (the bridged chats are not encrypted), and a short Preferences
// without the room list, read receipt, typing or language switches, which do
// nothing here. Element's Sessions (session verification, QR sign-in, IP
// addresses), Keyboard (calls, stickers, threads) and Help (crypto and server
// versions) are for Element's own users, not for staff answering WhatsApp;
// Help's "Clear cache and reload", which support needs, is under Preferences.

import React, { type JSX } from "react";
import { type MatrixClient } from "matrix-js-sdk/src/matrix";
import { logger } from "matrix-js-sdk/src/logger";
import { InlineField, Label, RadioControl, Root } from "@vector-im/compound-web";

import { Tab } from "../components/structures/TabbedView";
import { UserTab } from "../components/views/dialogs/UserTab";
import SettingsTab from "../components/views/settings/tabs/SettingsTab";
import { SettingsSection } from "../components/views/settings/shared/SettingsSection";
import { SettingsSubsection } from "../components/views/settings/shared/SettingsSubsection";
import SettingsFlag from "../components/views/elements/SettingsFlag";
import { SettingLevel } from "../settings/SettingLevel";
import AccessibleButton from "../components/views/elements/AccessibleButton";
import PlatformPeg from "../PlatformPeg";
import { useMatrixClientContext } from "../contexts/MatrixClientContext";
import { _t } from "../languageHandler";
import { type BooleanSettingKey } from "../settings/Settings";
import SettingsStore from "../settings/SettingsStore";
import { useTheme } from "../hooks/useTheme";
import dis from "../dispatcher/dispatcher";
import { Action } from "../dispatcher/actions";
import { type RecheckThemePayload } from "../dispatcher/payloads/RecheckThemePayload";
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

/** Help's "Clear cache and reload", which support asks staff for, without the rest of Help */
function clearCacheAndReload(client: MatrixClient): void {
    if (!PlatformPeg.get()) return;
    logger.log("Clear cache & reload clicked");
    client.stopClient();
    void client.store.deleteAllData().then(() => PlatformPeg.get()?.reload());
}

const THEMES = [
    { id: "system", label: "System" },
    { id: "light", label: "Light" },
    { id: "dark", label: "Dark" },
];

/** Element's theme settings (ThemeChoicePanel) as one choice: follow the system, or keep light or dark */
function CirqleTheme(): JSX.Element {
    const { theme, systemThemeActivated } = useTheme();
    const chosen = systemThemeActivated ? "system" : theme.includes("dark") ? "dark" : "light";
    return (
        <SettingsSubsection heading="Theme">
            <Root
                className="cirqle_ThemeChoice"
                onChange={async (evt) => {
                    const choice = new FormData(evt.currentTarget).get("cirqleTheme") as string;
                    // The theme first, so that leaving System switches once, not via the last theme kept
                    if (choice !== "system") await SettingsStore.setValue("theme", null, SettingLevel.DEVICE, choice);
                    await SettingsStore.setValue("use_system_theme", null, SettingLevel.DEVICE, choice === "system");
                    dis.dispatch<RecheckThemePayload>({ action: Action.RecheckTheme });
                }}
            >
                {THEMES.map(({ id, label }) => (
                    <InlineField
                        key={id}
                        name="cirqleTheme"
                        control={<RadioControl name="cirqleTheme" value={id} checked={chosen === id} readOnly />}
                    >
                        <Label>{label}</Label>
                    </InlineField>
                ))}
            </Root>
        </SettingsSubsection>
    );
}

export function CirqlePreferencesTab(): JSX.Element {
    const client = useMatrixClientContext();
    return (
        <SettingsTab data-testid="cirqle_PreferencesTab">
            <SettingsSection>
                <CirqleTheme />
                {PREFERENCES.map(({ heading, settings }) => (
                    <SettingsSubsection key={heading} heading={heading} formWrap>
                        {settings.map((name) => (
                            <SettingsFlag key={name} name={name} level={SettingLevel.ACCOUNT} />
                        ))}
                    </SettingsSubsection>
                ))}
                <SettingsSubsection heading="Troubleshooting">
                    <AccessibleButton onClick={() => clearCacheAndReload(client)} kind="danger_outline">
                        {_t("setting|help_about|clear_cache_reload")}
                    </AccessibleButton>
                </SettingsSubsection>
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
