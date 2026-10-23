/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// @vitest-environment happy-dom

import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventType, type MatrixClient, Room, RoomMember, User } from "matrix-js-sdk/src/matrix";
import { KnownMembership } from "matrix-js-sdk/src/types";
import { fireEvent, render, screen } from "test-utils-rtl";
import { mkEvent, stubClient } from "test-utils";

import MatrixClientContext from "../contexts/MatrixClientContext";
import dis from "../dispatcher/dispatcher";
import { Action } from "../dispatcher/actions";
import DMRoomMap from "../utils/DMRoomMap";
import { CirqleMemberCard, customerChat, describeMember } from "./CirqleMemberCard";
import { type Inbox } from "./CirqleInboxes";

const SERVER = "matrix.cirqlecirqle.com";
const ME = `@vchizhov:${SERVER}`;
const COLLEAGUE = `@adubrovsky:${SERVER}`;
const WA_BOT = `@whatsappbot:${SERVER}`;
const ACCOUNT = `@account_whatsapp_wa-efa4b19c:${SERVER}`;
const OWN_LID = `@whatsapp_lid-13035913650214:${SERVER}`;
const CUSTOMER = `@whatsapp_15557093423:${SERVER}`;
const LID_CUSTOMER = `@whatsapp_lid-50002177056782:${SERVER}`;
const TG_CUSTOMER = `@telegram_429896795:${SERVER}`;

const GROUP = `!group:${SERVER}`;
const DM = `!dm:${SERVER}`;
const OTHER_DM = `!other-dm:${SERVER}`;
const OTHER_GROUP = `!other-group:${SERVER}`;

const SLAVA_TEST: Inbox = {
    spaceId: "!slava:server",
    network: "whatsapp",
    label: "slava test",
    phone: "+1 302 618 0314",
    accountName: "wa-efa4b19c",
    childIds: new Set([GROUP, DM]),
    ownUsers: new Set([OWN_LID]),
};
const OTHER: Inbox = {
    spaceId: "!other:server",
    network: "whatsapp",
    label: "Main #1",
    phone: "+1 646 331 3251",
    accountName: "wa-01d17870",
    childIds: new Set([OTHER_DM, OTHER_GROUP]),
    ownUsers: new Set(),
};
const INBOXES = [SLAVA_TEST, OTHER];

vi.mock("./useCirqleChats", () => ({ useCirqleInboxes: (): Inbox[] => INBOXES }));

function chat(client: MatrixClient, roomId: string, content: object): Room {
    const room = new Room(roomId, client, ME);
    room.currentState.setStateEvents([
        mkEvent({ type: EventType.RoomCreate, room: roomId, user: WA_BOT, skey: "", content: {}, event: true }),
        mkEvent({
            type: "m.bridge",
            room: roomId,
            user: WA_BOT,
            skey: `${SERVER}/whatsapp`,
            content: { bridgebot: WA_BOT, protocol: { id: "whatsapp" }, ...content },
            event: true,
        }),
    ]);
    vi.spyOn(room, "getMyMembership").mockReturnValue(KnownMembership.Join);
    return room;
}

describe("describeMember", () => {
    it.each([
        ["a customer keyed by number", CUSTOMER, "Janaki (WA)", "customer", "Janaki", "+1 555 709 3423"],
        ["a customer named by number", CUSTOMER, "+15557093423", "customer", "+1 555 709 3423", "WhatsApp"],
        ["a customer WhatsApp knows by LID only", LID_CUSTOMER, "Tanya (WA)", "customer", "Tanya", "WhatsApp"],
        ["a Telegram contact, whose id is no phone number", TG_CUSTOMER, "Olga", "customer", "Olga", "Telegram"],
        ["our number's account", ACCOUNT, "slava test", "us", "slava test (us)", "+1 302 618 0314"],
        ["our number writing from the phone", OWN_LID, "Slava (WA)", "us", "slava test (us)", "+1 302 618 0314"],
        ["a colleague", COLLEAGUE, "Andrey Dubrovsky", "colleague", "Andrey Dubrovsky", "Colleague · adubrovsky"],
        ["me", ME, "vchizhov", "colleague", "vchizhov", "You"],
        ["the bridge bot", WA_BOT, "WhatsApp bridge bot", "service", "WhatsApp bridge bot", "Service account"],
    ])("describes %s", (_name, userId, displayName, kind, name, sub) => {
        expect(describeMember(userId, displayName, INBOXES, ME)).toEqual({ kind, name, sub });
    });
});

describe("CirqleMemberCard", () => {
    let client: MatrixClient;
    let rooms: Room[];

    beforeEach(() => {
        client = stubClient();
        vi.mocked(client.getUserId).mockReturnValue(ME);
        vi.mocked(client.getSafeUserId).mockReturnValue(ME);
        DMRoomMap.makeShared(client);
        rooms = [
            chat(client, GROUP, { channel: { id: "120363425399214516@g.us" } }),
            chat(client, DM, { "channel": { id: "15557093423@s.whatsapp.net" }, "com.beeper.room_type": "dm" }),
            chat(client, OTHER_GROUP, { channel: { id: "120363000000000001@g.us" } }),
            chat(client, OTHER_DM, { "channel": { id: "15557093423@s.whatsapp.net" }, "com.beeper.room_type": "dm" }),
        ];
        vi.mocked(client.getRoom).mockImplementation((id) => rooms.find((r) => r.roomId === id) ?? null);
    });

    const room = (id: string): Room => rooms.find((r) => r.roomId === id)!;
    const card = (member: RoomMember | User, inRoom?: Room): void => {
        render(
            <MatrixClientContext.Provider value={client}>
                <CirqleMemberCard member={member} room={inRoom} onClose={vi.fn()} />
            </MatrixClientContext.Provider>,
        );
    };
    const buttons = (): string[] =>
        Array.from(document.querySelectorAll("button")).map((b) => b.getAttribute("aria-label") ?? b.textContent ?? "");
    const member = (roomId: string, userId: string, name: string): RoomMember => {
        const m = new RoomMember(roomId, userId);
        m.name = name;
        return m;
    };

    describe("customerChat", () => {
        it("finds the customer's private chat with the number the group is on", () => {
            expect(customerChat(CUSTOMER, client, INBOXES, room(GROUP))?.roomId).toBe(DM);
            expect(customerChat(CUSTOMER, client, INBOXES, room(OTHER_GROUP))?.roomId).toBe(OTHER_DM);
        });

        it("finds none from the private chat itself, nor for someone with no private chat", () => {
            expect(customerChat(CUSTOMER, client, INBOXES, room(DM))).toBeUndefined();
            expect(customerChat(LID_CUSTOMER, client, INBOXES, room(GROUP))).toBeUndefined();
        });

        it("looks in every number when the card is not opened from a chat", () => {
            expect(customerChat(CUSTOMER, client, INBOXES)?.roomId).toBe(DM);
        });
    });

    it("offers a customer only Message, which opens their private chat with this number", () => {
        const dispatch = vi.spyOn(dis, "dispatch");
        card(member(GROUP, CUSTOMER, "Janaki (WA)"), room(GROUP));
        expect(screen.getByRole("heading", { name: "Janaki" })).toBeInTheDocument();
        expect(screen.getByText("+1 555 709 3423")).toBeInTheDocument();
        expect(buttons()).toEqual(["Close contact info", "Message"]);
        fireEvent.click(screen.getByRole("button", { name: "Message" }));
        expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ action: Action.ViewRoom, room_id: DM }));
    });

    it("has no Message in the customer's own private chat", () => {
        card(member(DM, CUSTOMER, "Janaki (WA)"), room(DM));
        expect(buttons()).toEqual(["Close contact info"]);
    });

    it("shows our number as us, with its number, and no buttons", () => {
        card(member(GROUP, ACCOUNT, "slava test"), room(GROUP));
        expect(screen.getByRole("heading", { name: "slava test (us)" })).toBeInTheDocument();
        expect(screen.getByText("+1 302 618 0314")).toBeInTheDocument();
        expect(buttons()).toEqual(["Close contact info"]);
    });

    it("shows a colleague as a colleague, with no buttons", () => {
        card(member(GROUP, COLLEAGUE, "Andrey Dubrovsky"), room(GROUP));
        expect(screen.getByRole("heading", { name: "Andrey Dubrovsky" })).toBeInTheDocument();
        expect(screen.getByText("Colleague · adubrovsky")).toBeInTheDocument();
        expect(buttons()).toEqual(["Close contact info"]);
    });

    it("shows a user opened from a link, outside any chat", () => {
        const user = new User(CUSTOMER);
        user.setDisplayName("Janaki (WA)");
        card(user);
        expect(screen.getByRole("heading", { name: "Janaki" })).toBeInTheDocument();
        expect(buttons()).toEqual(["Close contact info", "Message"]);
    });
});
