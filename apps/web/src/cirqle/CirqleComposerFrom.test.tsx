/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// @vitest-environment happy-dom

import React from "react";
import { describe, expect, it, vi } from "vitest";
import { type Room } from "matrix-js-sdk/src/matrix";
import { render } from "test-utils-rtl";

import { CirqleComposerFrom } from "./CirqleComposerFrom";
import { type Inbox } from "./CirqleInboxes";

const inbox = (spaceId: string, label: string, network: Inbox["network"], phone: string, rooms: string[]): Inbox => ({
    spaceId,
    network,
    label,
    phone,
    childIds: new Set(rooms),
    connected: true,
    contactPhones: new Map(),
    ownUsers: new Set(),
});

vi.mock("./useCirqleChats", () => ({
    useCirqleInboxes: (): Inbox[] => [
        inbox("!ny:server", "SMS USA (NY)", "whatsapp", "+1 646 339 8834", ["!samreen:server"]),
        inbox("!tg:server", "Free number", "telegram", "+44 7877 300139", ["!tg-chat:server"]),
    ],
}));

const room = (roomId: string): Room => ({ roomId }) as Room;

describe("CirqleComposerFrom", () => {
    it("shows the number a chat writes from, in its messenger's colour", () => {
        const { container } = render(<CirqleComposerFrom room={room("!samreen:server")} />);
        const number = container.querySelector(".cirqle_ComposerFrom_number")!;
        expect(number.textContent).toBe("SMS USA (NY) · +1 646 339 8834");
        expect(number.classList.contains("cirqle_ComposerFrom_whatsapp")).toBe(true);

        const telegram = render(<CirqleComposerFrom room={room("!tg-chat:server")} />).container;
        expect(telegram.querySelector(".cirqle_ComposerFrom_telegram")?.textContent).toBe(
            "Free number · +44 7877 300139",
        );
    });

    it("shows nothing in a chat of no number", () => {
        const { container } = render(<CirqleComposerFrom room={room("!orphan:server")} />);
        expect(container.innerHTML).toBe("");
    });
});
