/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// @vitest-environment happy-dom

import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "test-utils-rtl";

import { SDKContextClass } from "../contexts/SDKContextClass";
import { MetaSpace } from "../stores/spaces";
import { CirqleNumberPicker, pickedLabel } from "./CirqleNumberPicker";
import { type Inbox } from "./CirqleInboxes";
import { CirqleUiStore, PICKED_NUMBERS_KEY } from "./CirqleUiStore";

vi.mock("./useCirqleChats", () => ({
    countUnread: (_inboxes: Inbox[], picked: Inbox[]) => (picked.length ? 3 : 5),
}));

const inbox = (spaceId: string, label: string, connected: boolean): Inbox => ({
    spaceId,
    network: "whatsapp",
    label,
    phone: "+1 646 331 3251",
    accountName: undefined,
    childIds: new Set(),
    connected,
    contactPhones: new Map(),
    ownUsers: new Set(),
});

describe("CirqleNumberPicker", () => {
    let activeSpace: string;
    const inboxes = [inbox("!main1:server", "Main #1", false), inbox("!slava:server", "slava test", true)];

    beforeEach(() => {
        activeSpace = MetaSpace.Home;
        vi.spyOn(SDKContextClass.instance.spaceStore, "activeSpace", "get").mockImplementation(() => activeSpace);
        vi.spyOn(SDKContextClass.instance.spaceStore, "setActiveSpace").mockImplementation((space) => {
            activeSpace = space;
        });
        localStorage.removeItem(PICKED_NUMBERS_KEY);
        CirqleUiStore.pickedNumbers = [];
        CirqleUiStore.pickedNumbersUnset = true;
    });

    it("marks a disconnected number and counts unread chats like the list does", () => {
        render(<CirqleNumberPicker inboxes={inboxes} section="chats" />);
        fireEvent.click(screen.getByRole("button", { name: "Choose number" }));
        const [all, main1, slava] = screen.getAllByRole("option");
        expect(all.textContent).toBe("All numbersEvery connected number5");
        expect(main1.textContent).toBe("Main #1WhatsApp · +1 646 331 3251Disconnected3");
        expect(slava.textContent).toBe("slava testWhatsApp · +1 646 331 32513");
    });

    it("shows a picked disconnected number without the green dot", () => {
        activeSpace = "!main1:server";
        const { container } = render(<CirqleNumberPicker inboxes={inboxes} section="chats" />);
        expect(screen.getByRole("button", { name: "Choose number" }).title).toBe("Main #1 is disconnected");
        expect(container.querySelector(".cirqle_dot_whatsapp")).toBeNull();
        expect(container.querySelector(".cirqle_dot_none")).not.toBeNull();
    });

    it("adds numbers with their ticks, says how many, and keeps the pick in the browser", () => {
        const three = [...inboxes, { ...inbox("!tg:server", "Свободный номер", true), network: "telegram" as const }];
        render(<CirqleNumberPicker inboxes={three} section="chats" />);
        fireEvent.click(screen.getByRole("button", { name: "Choose number" }));
        fireEvent.click(screen.getByRole("checkbox", { name: "Show slava test" }));
        fireEvent.click(screen.getByRole("checkbox", { name: "Show Свободный номер" }));
        // The list stays open while numbers are ticked
        expect(screen.getByRole("checkbox", { name: "Show slava test" }).getAttribute("aria-checked")).toBe("true");
        expect(screen.getByRole("button", { name: "Choose number" }).textContent).toBe("2 numbers");
        expect(JSON.parse(localStorage.getItem(PICKED_NUMBERS_KEY)!)).toEqual(["!slava:server", "!tg:server"]);
        // Several numbers are Element's Home, one is its space
        expect(activeSpace).toBe(MetaSpace.Home);

        fireEvent.click(screen.getByRole("checkbox", { name: "Show Свободный номер" }));
        expect(screen.getByRole("button", { name: "Choose number" }).textContent).toBe("slava test");
        expect(activeSpace).toBe("!slava:server");
    });

    it("picks only the number whose row is clicked, and All numbers clears the pick", () => {
        CirqleUiStore.pickNumbers(["!main1:server", "!slava:server"]);
        render(<CirqleNumberPicker inboxes={inboxes} section="chats" />);
        fireEvent.click(screen.getByRole("button", { name: "Choose number" }));
        fireEvent.click(screen.getAllByRole("option")[2].querySelector("button")!);
        expect(CirqleUiStore.pickedNumbers).toEqual(["!slava:server"]);
        expect(screen.queryByRole("listbox")).toBeNull();

        fireEvent.click(screen.getByRole("button", { name: "Choose number" }));
        fireEvent.click(screen.getByText("All numbers"));
        expect(CirqleUiStore.pickedNumbers).toEqual([]);
        expect(activeSpace).toBe(MetaSpace.Home);
    });

    it("drops a number that is no longer there from the pick", () => {
        CirqleUiStore.pickNumbers(["!gone:server", "!slava:server"]);
        render(<CirqleNumberPicker inboxes={inboxes} section="chats" />);
        expect(CirqleUiStore.pickedNumbers).toEqual(["!slava:server"]);
    });

    it("labels the pill", () => {
        expect(pickedLabel([])).toBe("All numbers");
        expect(pickedLabel([inboxes[1]])).toBe("slava test");
        expect(pickedLabel(inboxes)).toBe("2 numbers");
    });
});
