/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// Settings → Notifications in CIRQLE: one switch, "Notifications on this
// device" (CirqlePush). Element's own tab (account-wide rules, keywords,
// sounds) does not apply: which messages notify is CIRQLE's push rules.

import React, { type JSX, useCallback, useEffect, useState } from "react";
import { Button } from "@vector-im/compound-web";

import SettingsTab from "../components/views/settings/tabs/SettingsTab";
import { SettingsSection } from "../components/views/settings/shared/SettingsSection";
import { SettingsSubsection } from "../components/views/settings/shared/SettingsSubsection";
import { useMatrixClientContext } from "../contexts/MatrixClientContext";
import { type CirqlePushState, cirqlePushState, disableCirqlePush, enableCirqlePush } from "./CirqlePush";

const DESCRIPTIONS: Record<CirqlePushState, string> = {
    on: "On. Customers' new messages show up on this device even when CIRQLE Messenger is closed.",
    off: "Customers' new messages can show up on this device even when CIRQLE Messenger is closed.",
    blocked:
        "The browser blocks notifications for CIRQLE Messenger. Allow them in the site settings (the icon next to the address), then come back here.",
    install:
        "On iPhone and iPad, add CIRQLE Messenger to the Home Screen first: Share, then Add to Home Screen. Open it from there and turn notifications on.",
    unsupported: "This browser can't show notifications from CIRQLE Messenger.",
};

export function CirqleNotificationsTab(): JSX.Element {
    const client = useMatrixClientContext();
    const [state, setState] = useState<CirqlePushState>(cirqlePushState);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string>();

    // The permission may change in the browser's settings while this is open
    useEffect(() => {
        const recheck = (): void => setState(cirqlePushState());
        window.addEventListener("focus", recheck);
        return () => window.removeEventListener("focus", recheck);
    }, []);

    const run = useCallback(async (action: () => Promise<unknown>): Promise<void> => {
        setBusy(true);
        setError(undefined);
        try {
            await action();
        } catch {
            setError("That didn't work. Check the connection and try again.");
        } finally {
            setState(cirqlePushState());
            setBusy(false);
        }
    }, []);

    return (
        <SettingsTab data-testid="cirqle_NotificationsTab">
            <SettingsSection>
                <SettingsSubsection heading="Notifications on this device" description={DESCRIPTIONS[state]}>
                    {state === "off" && (
                        <Button
                            kind="primary"
                            size="md"
                            disabled={busy}
                            onClick={() => run(() => enableCirqlePush(client))}
                        >
                            Enable notifications
                        </Button>
                    )}
                    {state === "on" && (
                        <Button
                            kind="secondary"
                            size="md"
                            disabled={busy}
                            onClick={() => run(() => disableCirqlePush(client))}
                        >
                            Turn off
                        </Button>
                    )}
                    {error && <div className="cirqle_NotificationsTab_error">{error}</div>}
                </SettingsSubsection>
            </SettingsSection>
        </SettingsTab>
    );
}
