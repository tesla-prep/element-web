/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// @vitest-environment happy-dom

import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type MatrixClient, MatrixError, Room } from "matrix-js-sdk/src/matrix";
import { act, fireEvent, render, screen, within } from "test-utils-rtl";
import { mkEvent, stubClient } from "test-utils";

import MatrixClientContext from "../contexts/MatrixClientContext";
import { SDKContextClass } from "../contexts/SDKContextClass";
import { MetaSpace } from "../stores/spaces";
import dis from "../dispatcher/dispatcher";
import { Action } from "../dispatcher/actions";
import Modal from "../Modal";
import ErrorDialog from "../components/views/dialogs/ErrorDialog";
import { CirqleNewGroup, newChatUserOf } from "./CirqleNewGroup";
import { type Inbox } from "./CirqleInboxes";
import { CirqleUiStore } from "./CirqleUiStore";

const SERVER = "server";
const MAIN = "!main:server";
const OTHER = "!other:server";

const mocked = vi.hoisted(() => ({
    spaces: [] as string[],
    rooms: [] as unknown[],
    mainChats: new Set<string>(),
    disconnected: new Set<string>(),
}));

vi.mock("./useCirqleChats", () => ({
    useCirqleInboxes: (): Inbox[] =>
        mocked.spaces.map((spaceId) => ({
            spaceId,
            network: "whatsapp",
            label: spaceId === "!main:server" ? "Main #1" : "Other",
            phone: undefined,
            accountName: spaceId === "!main:server" ? "wa-01d17870" : "wa-bba81064",
            childIds: spaceId === "!main:server" ? mocked.mainChats : new Set(),
            ownUsers: new Set(),
            connected: !mocked.disconnected.has(spaceId),
            contactPhones: new Map(),
        })),
}));

vi.mock("../stores/room-list-v3/RoomListStoreV3", () => ({
    default: { instance: { getSortedRooms: () => mocked.rooms } },
}));

function inbox(network: "whatsapp" | "telegram", accountName?: string): Inbox {
    return {
        spaceId: MAIN,
        network,
        label: "Main #1",
        accountName,
        childIds: new Set(),
        ownUsers: new Set(),
        connected: true,
        contactPhones: new Map(),
    };
}

/** A chat the bridge made, as `m.bridge` describes it */
function bridged(
    client: MatrixClient,
    roomId: string,
    name: string,
    network: string,
    channel: string,
    type = "dm",
): Room {
    const room = new Room(roomId, client, client.getSafeUserId());
    room.currentState.setStateEvents([
        mkEvent({
            type: "m.bridge",
            room: roomId,
            user: `@${network}bot:${SERVER}`,
            skey: `${SERVER}/${network}`,
            content: {
                "bridgebot": `@${network}bot:${SERVER}`,
                "protocol": { id: network },
                "channel": { id: channel },
                "com.beeper.room_type": type,
            },
            event: true,
        }),
    ]);
    room.name = name;
    return room;
}

describe("newChatUserOf", () => {
    let client: MatrixClient;
    beforeEach(() => {
        client = stubClient();
    });

    it("names a WhatsApp contact by number or lid, as the relay bot does", () => {
        const byNumber = bridged(client, "!a:server", "Anna", "whatsapp", "14695551234@s.whatsapp.net");
        expect(newChatUserOf(byNumber, inbox("whatsapp", "wa-01d17870"))).toBe(
            "@newchat_whatsapp_wa-01d17870_=14695551234:server",
        );
        const byLid = bridged(client, "!b:server", "Bob", "whatsapp", "195700112233@lid");
        expect(newChatUserOf(byLid, inbox("whatsapp", "wa-01d17870"))).toBe(
            "@newchat_whatsapp_wa-01d17870_lid-195700112233:server",
        );
    });

    it("names a Telegram contact by user id", () => {
        const chat = bridged(client, "!t:server", "Tanya", "telegram", "user:4830011");
        expect(newChatUserOf(chat, inbox("telegram", "tg-447877300139"))).toBe(
            "@newchat_telegram_tg-447877300139_4830011:server",
        );
    });

    it("has nobody for a group, another messenger or an inbox without its account", () => {
        const group = bridged(client, "!g:server", "Team", "whatsapp", "1203630@g.us", "group");
        expect(newChatUserOf(group, inbox("whatsapp", "wa-01d17870"))).toBeUndefined();
        const chat = bridged(client, "!a:server", "Anna", "whatsapp", "14695551234@s.whatsapp.net");
        expect(newChatUserOf(chat, inbox("telegram", "tg-1"))).toBeUndefined();
        expect(newChatUserOf(chat, inbox("whatsapp"))).toBeUndefined();
    });
});

describe("CirqleNewGroup", () => {
    let client: MatrixClient;
    let activeSpace: string;

    beforeEach(() => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        client = stubClient();
        activeSpace = MetaSpace.Home;
        mocked.spaces = [MAIN, OTHER];
        mocked.rooms = [
            bridged(client, "!anna:server", "Anna (WA)", "whatsapp", "14695551234@s.whatsapp.net"),
            bridged(client, "!bob:server", "Bob (WA)", "whatsapp", "195700112233@lid"),
            bridged(client, "!elsewhere:server", "Carl (WA)", "whatsapp", "15550001111@s.whatsapp.net"),
        ];
        mocked.mainChats = new Set(["!anna:server", "!bob:server"]);
        mocked.disconnected = new Set();
        vi.spyOn(SDKContextClass.instance.spaceStore, "activeSpace", "get").mockImplementation(() => activeSpace);
        client.searchUserDirectory = vi.fn().mockResolvedValue({
            limited: false,
            results: [
                {
                    user_id: "@newchat_whatsapp_wa-01d17870_=79990001122:server",
                    display_name: "Test Person, +79990001122 · Main #1",
                },
                { user_id: "@newchat_whatsapp_wa-bba81064_=79990001122:server", display_name: "+79990001122 · Other" },
            ],
        });
        vi.spyOn(dis, "dispatch").mockImplementation(() => {});
        vi.spyOn(Modal, "createDialog").mockImplementation(() => ({}) as ReturnType<typeof Modal.createDialog>);
        vi.spyOn(CirqleUiStore, "closePanel");
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    const panel = (): React.ReactElement => (
        <MatrixClientContext.Provider value={client}>
            <CirqleNewGroup />
        </MatrixClientContext.Provider>
    );
    const writeFrom = (): HTMLSelectElement => screen.getByRole("combobox", { name: "Write from" });
    const search = async (term: string): Promise<void> => {
        fireEvent.change(screen.getByRole("textbox", { name: "Search name or number" }), { target: { value: term } });
        await act(() => vi.advanceTimersByTimeAsync(400));
    };
    const button = (name: string): HTMLButtonElement => screen.getByRole("button", { name });
    // A contact row, by the name it shows
    const contact = (name: string): HTMLButtonElement =>
        within(document.querySelector<HTMLElement>(".cirqle_NewChat_rows")!).getByText(name).closest("button")!;
    const chips = (): string[] =>
        Array.from(document.querySelectorAll(".cirqle_NewGroup_chipName")).map((el) => el.textContent ?? "");

    it("under All numbers offers nobody until a number is picked", async () => {
        render(panel());
        expect(writeFrom().value).toBe("");
        expect(screen.getByRole("status").textContent).toBe("Choose the number to write from");
        await search("+79990001122");
        expect(client.searchUserDirectory).not.toHaveBeenCalled();
        expect(screen.queryByText("Anna")).toBeNull();

        fireEvent.change(writeFrom(), { target: { value: MAIN } });
        await act(() => vi.advanceTimersByTimeAsync(400));
        expect(client.searchUserDirectory).toHaveBeenCalledTimes(1);
        expect(await screen.findByText("Test Person")).toBeTruthy();
        // Only the contacts of the number written from
        expect(screen.queryByText("+7 999 000 1122")).toBeNull();
    });

    it("does not offer a disconnected number", () => {
        mocked.disconnected = new Set([OTHER]);
        render(panel());
        // The one connected number is written from, as when it is the only one
        expect(writeFrom().value).toBe(MAIN);
        expect(Array.from(writeFrom().options).map((option) => option.value)).toEqual([MAIN]);
    });

    it("offers the number's private chats as contacts", () => {
        activeSpace = MAIN;
        render(panel());
        expect(writeFrom().value).toBe(MAIN);
        expect(screen.getByText("Contacts on Main #1")).toBeTruthy();
        expect(contact("Anna")).toBeTruthy();
        expect(contact("Bob")).toBeTruthy();
        expect(screen.queryByText("Carl")).toBeNull();
    });

    it("picks members as chips and moves on only with one picked", async () => {
        activeSpace = MAIN;
        render(panel());
        expect(button("Next").disabled).toBe(true);

        fireEvent.click(contact("Anna"));
        await search("Test");
        await screen.findByText("Test Person");
        fireEvent.click(contact("Test Person"));
        expect(chips()).toEqual(["Anna", "Test Person"]);
        expect(button("Next").disabled).toBe(false);

        fireEvent.click(button("Remove Anna"));
        expect(chips()).toEqual(["Test Person"]);
        fireEvent.click(button("Remove Test Person"));
        expect(chips()).toEqual([]);
        expect(button("Next").disabled).toBe(true);
    });

    it("forgets the picked members when the number changes", () => {
        activeSpace = MAIN;
        render(panel());
        fireEvent.click(contact("Anna"));
        expect(chips()).toEqual(["Anna"]);
        fireEvent.change(writeFrom(), { target: { value: OTHER } });
        expect(chips()).toEqual([]);
        expect(button("Next").disabled).toBe(true);
    });

    it("creates the group with the picked contacts and opens it", async () => {
        activeSpace = MAIN;
        let created!: (value: { room_id: string }) => void;
        client.createRoom = vi.fn().mockReturnValue(new Promise((resolve) => (created = resolve)));
        render(panel());
        fireEvent.click(contact("Anna"));
        fireEvent.click(contact("Bob"));
        fireEvent.click(button("Next"));

        const name = screen.getByRole("textbox", { name: "Group name" }) as HTMLInputElement;
        expect(name.maxLength).toBe(100);
        expect(button("Create").disabled).toBe(true);
        fireEvent.change(name, { target: { value: "   " } });
        expect(button("Create").disabled).toBe(true);
        fireEvent.change(name, { target: { value: " Spring trip " } });
        fireEvent.click(button("Create"));

        expect(screen.getByRole("status").textContent).toBe("Creating group…");
        expect(button("Create").disabled).toBe(true);
        expect(client.createRoom).toHaveBeenCalledWith({
            name: "Spring trip",
            invite: [
                "@newchat_whatsapp_wa-01d17870_=14695551234:server",
                "@newchat_whatsapp_wa-01d17870_lid-195700112233:server",
            ],
            is_direct: false,
            preset: "private_chat",
            visibility: "private",
        });

        await act(async () => created({ room_id: "!group:server" }));
        expect(dis.dispatch).toHaveBeenCalledWith(
            expect.objectContaining({ action: Action.ViewRoom, room_id: "!group:server" }),
        );
        expect(CirqleUiStore.closePanel).toHaveBeenCalled();
    });

    it("shows why the group was not created", async () => {
        activeSpace = MAIN;
        client.createRoom = vi
            .fn()
            .mockRejectedValue(
                new MatrixError({ errcode: "M_UNKNOWN", error: "Not found on WhatsApp: +14695551234" }, 400),
            );
        render(panel());
        fireEvent.click(contact("Anna"));
        fireEvent.click(button("Next"));
        fireEvent.change(screen.getByRole("textbox", { name: "Group name" }), { target: { value: "Trip" } });
        await act(async () => fireEvent.click(button("Create")));

        expect(Modal.createDialog).toHaveBeenCalledWith(ErrorDialog, {
            title: "Couldn't create the group",
            description: "Not found on WhatsApp: +14695551234",
        });
        expect(screen.queryByRole("status")).toBeNull();
        expect(button("Create").disabled).toBe(false);
        expect(CirqleUiStore.closePanel).not.toHaveBeenCalled();
    });
});
