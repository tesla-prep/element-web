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
import { MetaSpace } from "../stores/spaces";
import { CirqleNewChat, splitLabel } from "./CirqleNewChat";
import { type Inbox } from "./CirqleInboxes";

const SLAVA_TEST = "!slava-test:server";
const OTHER = "!other:server";

const mocked = vi.hoisted(() => ({ spaces: [] as string[], disconnected: [] as string[] }));

vi.mock("./useCirqleChats", () => ({
    // The inboxes are read again on every room list update: new objects each render
    useCirqleInboxes: (): Inbox[] =>
        mocked.spaces.map((spaceId) => ({
            spaceId,
            network: "whatsapp",
            label: spaceId === "!slava-test:server" ? "slava test" : "Other",
            phone: undefined,
            accountName: spaceId === "!slava-test:server" ? "wa-efa4b19c" : "wa-bba81064",
            childIds: new Set(),
            connected: !mocked.disconnected.includes(spaceId),
            contactPhones: new Map(),
            ownUsers: new Set(),
        })),
}));

vi.mock("../stores/room-list-v3/RoomListStoreV3", () => ({
    default: { instance: { getSortedRooms: () => [] } },
}));

describe("splitLabel", () => {
    const user = (contact: string): string => `@newchat_whatsapp_wa-e7d32330_${contact}:matrix.cirqlecirqle.com`;

    it("names a typed number by the number the chat goes to, not WhatsApp's guess", () => {
        // Typed "2145550100": WhatsApp names it +1 214…, the chat would go to +2145550100
        expect(splitLabel("+12145550100, +2145550100 · SMS USA (NY)", "whatsapp", user("=2145550100"))).toEqual({
            name: "+2145550100",
            sub: "On WhatsApp · check the country code",
        });
    });

    it("keeps the relay bot's label when the number is the one the chat goes to", () => {
        expect(splitLabel("+12145550100 · SMS USA (NY)", "whatsapp", user("=12145550100"))).toEqual({
            name: "+1 214 555 0100",
            sub: "On WhatsApp · start chat",
        });
        expect(splitLabel("Anna Petrova, +14695551234 · Main #1", "whatsapp", user("lid-195"))).toEqual({
            name: "Anna Petrova",
            sub: "+1 469 555 1234 · On WhatsApp",
        });
    });
});

describe("CirqleNewChat", () => {
    let client: MatrixClient;
    let activeSpace: string;

    beforeEach(() => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        client = stubClient();
        activeSpace = MetaSpace.Home;
        mocked.spaces = [OTHER, SLAVA_TEST];
        mocked.disconnected = [];
        vi.spyOn(SDKContextClass.instance.spaceStore, "activeSpace", "get").mockImplementation(() => activeSpace);
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
    const writeFrom = (): HTMLButtonElement => screen.getByRole("button", { name: /^Write from/ });
    // The name of the number written from, as Write from shows it
    const writtenFrom = (): string => writeFrom().querySelector(".cirqle_NumberPicker_name")?.textContent ?? "";
    const offered = (): string[] => {
        fireEvent.click(writeFrom());
        const names = screen
            .getAllByRole("option")
            .map((o) => o.querySelector(".cirqle_NumberPicker_name")?.textContent);
        fireEvent.click(writeFrom());
        return names as string[];
    };
    const pickNumber = (name: string): void => {
        fireEvent.click(writeFrom());
        fireEvent.click(screen.getByRole("option", { name: new RegExp(`^${name}`) }));
    };
    const search = (term: string): void => {
        fireEvent.change(screen.getByRole("textbox", { name: "Search name or number" }), { target: { value: term } });
    };

    it("searches once per typed term although the inboxes are re-read", async () => {
        activeSpace = SLAVA_TEST;
        const { rerender } = render(panel());
        expect(writtenFrom()).toBe("slava test");
        search("+79990001122");
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

    it("under All numbers offers nobody until a number is picked", async () => {
        render(panel());
        expect(writtenFrom()).toBe("Choose a number");
        expect(screen.getByRole("status").textContent).toBe("Choose the number to write from");

        search("+79990001122");
        await act(() => vi.advanceTimersByTimeAsync(400));
        fireEvent.keyDown(screen.getByRole("textbox", { name: "Search name or number" }), { key: "Enter" });
        expect(client.searchUserDirectory).not.toHaveBeenCalled();
        expect(screen.queryByText("Test Person")).toBeNull();

        pickNumber("slava test");
        await act(() => vi.advanceTimersByTimeAsync(400));
        expect(client.searchUserDirectory).toHaveBeenCalledTimes(1);
        expect(await screen.findByText("Test Person")).toBeTruthy();
        expect(screen.queryByRole("status")).toBeNull();
    });

    it("does not offer a disconnected number to write from", () => {
        mocked.disconnected = [OTHER];
        activeSpace = OTHER;
        render(panel());
        expect(offered()).toEqual(["slava test"]);
        expect(writtenFrom()).toBe("slava test");
    });

    it("writes from the only number there is", () => {
        mocked.spaces = [SLAVA_TEST];
        render(panel());
        expect(writtenFrom()).toBe("slava test");
        expect(screen.queryByRole("status")).toBeNull();
    });

    it("lists each number with its name over the number, and picks one", () => {
        render(panel());
        fireEvent.click(writeFrom());
        expect(writeFrom().getAttribute("aria-expanded")).toBe("true");
        expect(
            screen
                .getAllByRole("option")
                .map((o) => [
                    o.querySelector(".cirqle_NumberPicker_name")?.textContent,
                    o.querySelector(".cirqle_NumberPicker_sub")?.textContent,
                ]),
        ).toEqual([
            ["Other", "WhatsApp"],
            ["slava test", "WhatsApp"],
        ]);
        fireEvent.click(screen.getByRole("option", { name: /^Other/ }));
        expect(screen.queryByRole("listbox")).toBeNull();
        expect(writtenFrom()).toBe("Other");
    });

    it("New chat puts the cursor in the search and says what to type", () => {
        render(panel());
        const input = screen.getByRole("textbox", { name: "Search name or number" });
        input.blur();
        fireEvent.click(screen.getByRole("button", { name: /^New chat/ }));
        expect(document.activeElement).toBe(input);
        expect(screen.getAllByRole("status").map((s) => s.textContent)).toContain(
            "Type a name, or a number with its country code, like +1 214 555 0100",
        );
        expect(screen.getByRole("button", { name: "New group" })).toBeTruthy();
    });
});
