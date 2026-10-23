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
import { CirqleNumberPicker } from "./CirqleNumberPicker";
import { type Inbox } from "./CirqleInboxes";

vi.mock("./useCirqleChats", () => ({
    countUnread: (_inboxes: Inbox[], picked: Inbox | undefined) => (picked ? 3 : 5),
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
});
