/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// @vitest-environment happy-dom

import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type MatrixClient } from "matrix-js-sdk/src/matrix";
import { act, fireEvent, render, screen } from "test-utils-rtl";
import { stubClient } from "test-utils";

import MatrixClientContext from "../contexts/MatrixClientContext";
import { SDKContextClass } from "../contexts/SDKContextClass";
import { CirqleNewChat } from "./CirqleNewChat";
import { type Inbox } from "./CirqleInboxes";

const SPACE = "!slava-test:server";

vi.mock("./useCirqleChats", () => ({
    // The inboxes are read again on every room list update: a new object each render
    useCirqleInboxes: (): Inbox[] => [
        {
            spaceId: "!slava-test:server",
            network: "whatsapp",
            label: "slava test",
            phone: "+7 964 898 6389",
            accountName: "wa-efa4b19c",
            childIds: new Set(),
            ownUsers: new Set(),
        },
    ],
}));

vi.mock("../stores/room-list-v3/RoomListStoreV3", () => ({
    default: { instance: { getSortedRooms: () => [] } },
}));

describe("CirqleNewChat", () => {
    let client: MatrixClient;

    beforeEach(() => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        client = stubClient();
        vi.spyOn(SDKContextClass.instance.spaceStore, "activeSpace", "get").mockReturnValue(SPACE);
        client.searchUserDirectory = vi.fn().mockResolvedValue({
            limited: false,
            results: [
                {
                    user_id: "@newchat_whatsapp_wa-efa4b19c_=79990001122:server",
                    display_name: "Test Person, +79990001122 · slava test",
                },
                { user_id: "@newchat_whatsapp_wa-bba81064_=79990001122:server", display_name: "+79990001122 · Other" },
            ],
        });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    const panel = (): React.ReactElement => (
        <MatrixClientContext.Provider value={client}>
            <CirqleNewChat />
        </MatrixClientContext.Provider>
    );

    it("searches once per typed term although the inboxes are re-read", async () => {
        const { rerender } = render(panel());
        expect(screen.getByRole("combobox", { name: "Write from" })).toHaveProperty("value", SPACE);
        fireEvent.change(screen.getByRole("textbox", { name: "Search name or number" }), {
            target: { value: "+79990001122" },
        });
        for (let i = 0; i < 5; i++) {
            rerender(panel());
            await act(() => vi.advanceTimersByTimeAsync(400));
        }

        expect(client.searchUserDirectory).toHaveBeenCalledTimes(1);
        expect(client.searchUserDirectory).toHaveBeenCalledWith({ term: "+79990001122", limit: 30 });
        // Only the contacts of the number written from
        expect(await screen.findByText("Test Person")).toBeTruthy();
        expect(screen.getByText("+7 999 000 1122 · On WhatsApp")).toBeTruthy();
        expect(screen.queryByText("+7 999 000 1122")).toBeNull();
    });
});
