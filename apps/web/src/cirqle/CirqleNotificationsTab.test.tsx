/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// @vitest-environment happy-dom

import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "test-utils-rtl";
import userEvent from "@testing-library/user-event";
import { type MatrixClient } from "matrix-js-sdk/src/matrix";
import { stubClient } from "test-utils";

import SdkConfig from "../SdkConfig";
import MatrixClientContext from "../contexts/MatrixClientContext";
import { Tab } from "../components/structures/TabbedView";
import { UserTab } from "../components/views/dialogs/UserTab";
import { CIRQLE_BRAND } from "./CirqleFeatures";
import { type CirqlePushState } from "./CirqlePush";
import { CirqleNotificationsTab } from "./CirqleNotificationsTab";
import { cirqleUserTabs } from "./CirqleSettings";

const push = vi.hoisted(() => ({
    state: "off" as CirqlePushState,
    enable: vi.fn(),
    disable: vi.fn(),
}));
vi.mock("./CirqlePush", () => ({
    cirqlePushState: () => push.state,
    enableCirqlePush: push.enable,
    disableCirqlePush: push.disable,
}));

describe("Settings: notifications on this device", () => {
    let client: MatrixClient;

    const renderTab = (): void => {
        render(
            <MatrixClientContext.Provider value={client}>
                <CirqleNotificationsTab />
            </MatrixClientContext.Provider>,
        );
    };

    beforeEach(() => {
        client = stubClient();
        push.state = "off";
        push.enable.mockImplementation(async () => (push.state = "on"));
        push.disable.mockImplementation(async () => (push.state = "off"));
    });

    afterEach(() => {
        SdkConfig.reset();
        vi.clearAllMocks();
    });

    it("turns notifications on from the button", async () => {
        renderTab();

        await userEvent.click(screen.getByRole("button", { name: "Enable notifications" }));

        expect(push.enable).toHaveBeenCalledWith(client);
        await waitFor(() => expect(screen.getByRole("button", { name: "Turn off" })).toBeTruthy());
        expect(screen.getByText(/^On\./)).toBeTruthy();
    });

    it("turns them off again", async () => {
        push.state = "on";
        renderTab();

        await userEvent.click(screen.getByRole("button", { name: "Turn off" }));

        expect(push.disable).toHaveBeenCalledWith(client);
        await waitFor(() => expect(screen.getByRole("button", { name: "Enable notifications" })).toBeTruthy());
    });

    it("says why there is no button", () => {
        push.state = "install";
        renderTab();
        expect(screen.getByText(/add CIRQLE Messenger to the Home Screen first/)).toBeTruthy();
        expect(screen.queryByRole("button")).toBeNull();
    });

    it("says when the browser blocks them", () => {
        push.state = "blocked";
        renderTab();
        expect(screen.getByText(/The browser blocks notifications/)).toBeTruthy();
    });

    it("says when something went wrong", async () => {
        push.enable.mockRejectedValue(new Error("offline"));
        renderTab();

        await userEvent.click(screen.getByRole("button", { name: "Enable notifications" }));

        await waitFor(() => expect(screen.getByText(/didn't work/)).toBeTruthy());
    });

    it("takes the place of Element's Notifications tab while push is set up", () => {
        const tabs = [new Tab(UserTab.Notifications, "Notifications", null, <div key="element">Element</div>)];
        SdkConfig.put({ brand: CIRQLE_BRAND });
        expect(cirqleUserTabs(tabs)[0]).toBe(tabs[0]);

        SdkConfig.put({
            brand: CIRQLE_BRAND,
            cirqle_push: { gateway_url: "https://hs/_matrix/push/v1/notify", app_id: "app", vapid_public_key: "BKEY" },
        } as Parameters<typeof SdkConfig.put>[0]);
        expect(cirqleUserTabs(tabs)[0].body.type).toBe(CirqleNotificationsTab);
    });
});
