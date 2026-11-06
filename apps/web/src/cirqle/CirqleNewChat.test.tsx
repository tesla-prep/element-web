/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// @vitest-environment happy-dom

import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type MatrixClient, MatrixEvent, Method, Room } from "matrix-js-sdk/src/matrix";
import { act, fireEvent, render, screen } from "test-utils-rtl";
import { stubClient } from "test-utils";

import MatrixClientContext from "../contexts/MatrixClientContext";
import { SDKContextClass } from "../contexts/SDKContextClass";
import { MetaSpace } from "../stores/spaces";
import { CirqleNewChat, splitLabel } from "./CirqleNewChat";
import { CirqleContacts } from "./CirqleContacts";
import { bookLabel, filterBook } from "./CirqlePhoneBook";
import { type Inbox } from "./CirqleInboxes";

const SLAVA_TEST = "!slava-test:server";
const OTHER = "!other:server";

const mocked = vi.hoisted(() => ({
    spaces: [] as string[],
    disconnected: [] as string[],
    rooms: [] as Room[],
}));

vi.mock("./useCirqleChats", () => ({
    // The inboxes are read again on every room list update: new objects each render
    useCirqleInboxes: (): Inbox[] =>
        mocked.spaces.map((spaceId) => ({
            spaceId,
            network: "whatsapp",
            label: spaceId === "!slava-test:server" ? "slava test" : "Other",
            phone: undefined,
            accountName: spaceId === "!slava-test:server" ? "wa-efa4b19c" : "wa-bba81064",
            childIds: new Set(spaceId === "!slava-test:server" ? mocked.rooms.map((room) => room.roomId) : []),
            connected: !mocked.disconnected.includes(spaceId),
            contactPhones: new Map(),
            ownUsers: new Set(),
        })),
}));

vi.mock("../components/views/avatars/RoomAvatar", () => ({ default: () => null }));

vi.mock("../stores/room-list-v3/RoomListStoreV3", () => ({
    default: { instance: { getSortedRooms: () => mocked.rooms } },
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

const BOOK = [
    { user_id: "@newchat_whatsapp_wa-efa4b19c_=14695558888:server", name: "+14695558888", number: "+14695558888" },
    { user_id: "@newchat_whatsapp_wa-efa4b19c_lid-2:server", name: "boris", number: "+14695552222" },
    { user_id: "@newchat_whatsapp_wa-efa4b19c_lid-1:server", name: "Anna Client", number: "+14695551111" },
];

describe("phone book", () => {
    it("filters by name, or by the digits of a typed number", () => {
        expect(filterBook(BOOK, " ann").map((c) => c.name)).toEqual(["Anna Client"]);
        expect(filterBook(BOOK, "(469) 555-22").map((c) => c.name)).toEqual(["boris"]);
        expect(filterBook(BOOK, "")).toBe(BOOK);
    });

    it("shows the number under the name, or the number alone", () => {
        expect(bookLabel(BOOK[2])).toEqual({ name: "Anna Client", sub: "+1 469 555 1111" });
        expect(bookLabel(BOOK[0])).toEqual({ name: "+1 469 555 8888", sub: "" });
    });
});

let client: MatrixClient;
let book: typeof BOOK;
let canEdit: boolean;
let activeSpace: string;

function setUp(): void {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    client = stubClient();
    activeSpace = MetaSpace.Home;
    mocked.spaces = [OTHER, SLAVA_TEST];
    mocked.disconnected = [];
    mocked.rooms = [];
    book = BOOK;
    canEdit = false;
    Object.assign(client, {
        http: {
            authedRequest: vi.fn().mockImplementation(async (_method: Method, path: string) =>
                path === "/com.cirqle/contacts"
                    ? {
                          contacts: book.map((contact) => ({ number: contact.number, name: contact.name })),
                          can_edit: canEdit,
                      }
                    : { contacts: book },
            ),
        },
    });
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
}

function tearDown(): void {
    vi.useRealTimers();
}

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
    const names = screen.getAllByRole("option").map((o) => o.querySelector(".cirqle_NumberPicker_name")?.textContent);
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

describe("CirqleNewChat", () => {
    beforeEach(setUp);
    afterEach(tearDown);

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

    it("lists the shared book by name as Contacts, and the search filters it", async () => {
        activeSpace = SLAVA_TEST;
        render(panel());
        expect(await screen.findByText("Anna Client")).toBeTruthy();
        expect(client.http.authedRequest).toHaveBeenCalledWith(
            Method.Post,
            "/com.cirqle/phone_book",
            undefined,
            { network: "whatsapp", account: "wa-efa4b19c" },
            { prefix: "/_matrix/client/unstable" },
        );
        const listed = (): string[] =>
            [...document.querySelectorAll(".cirqle_NewChat_bookRow .cirqle_NewChat_name")].map(
                (n) => n.textContent ?? "",
            );
        expect(screen.getByText("Contacts")).toBeTruthy();
        expect(listed()).toEqual(["Anna Client", "boris", "+1 469 555 8888"]);
        search("BOR");
        await act(() => vi.advanceTimersByTimeAsync(400));
        expect(listed()).toEqual(["boris"]);
        // Names are the book's to answer; only a typed number is looked up on WhatsApp
        expect(client.searchUserDirectory).not.toHaveBeenCalled();
        search("+79990001122");
        await act(() => vi.advanceTimersByTimeAsync(400));
        expect(client.searchUserDirectory).toHaveBeenCalledTimes(1);
        expect(await screen.findByText("Test Person")).toBeTruthy();

        // The typed number of a contact the book has under their LID is shown once, in the book
        vi.mocked(client.searchUserDirectory).mockResolvedValueOnce({
            limited: false,
            results: [
                {
                    user_id: "@newchat_whatsapp_wa-efa4b19c_=14695552222:server",
                    display_name: "boris, +14695552222 · slava test",
                },
            ],
        });
        search("+1 469 555 2222");
        await act(() => vi.advanceTimersByTimeAsync(400));
        expect(client.searchUserDirectory).toHaveBeenCalledTimes(2);
        expect(listed()).toEqual(["boris"]);
        expect(document.querySelectorAll(".cirqle_NewChat_found")).toHaveLength(0);
    });

    it("still shows a found contact without a typed number when the book has one without a number", async () => {
        activeSpace = SLAVA_TEST;
        book = [...BOOK, { user_id: "@newchat_whatsapp_wa-efa4b19c_lid-3:server", name: "Clara" }] as typeof BOOK;
        vi.mocked(client.searchUserDirectory).mockResolvedValueOnce({
            limited: false,
            results: [
                {
                    user_id: "@newchat_whatsapp_wa-efa4b19c_lid-9:server",
                    display_name: "Dora, +79990001122 · slava test",
                },
            ],
        });
        render(panel());
        expect(await screen.findByText("Clara")).toBeTruthy();
        search("+79990001122");
        await act(() => vi.advanceTimersByTimeAsync(400));
        expect(await screen.findByText("Dora")).toBeTruthy();
        expect(document.querySelectorAll(".cirqle_NewChat_found")).toHaveLength(1);
    });

    it("says so when the book is empty, and still asks the bridge only for a typed number", async () => {
        activeSpace = SLAVA_TEST;
        book = [];
        render(panel());
        expect(await screen.findByText("No contacts yet. Type a number to start a chat.")).toBeTruthy();
        search("Test");
        await act(() => vi.advanceTimersByTimeAsync(400));
        expect(client.searchUserDirectory).not.toHaveBeenCalled();
        search("+7 918 188 8877");
        await act(() => vi.advanceTimersByTimeAsync(400));
        expect(client.searchUserDirectory).toHaveBeenCalledWith({ term: "+7 918 188 8877", limit: 30 });
    });

    it("New chat puts the cursor in the search", () => {
        render(panel());
        const input = screen.getByRole("textbox", { name: "Search name or number" });
        input.blur();
        fireEvent.click(screen.getByRole("button", { name: /^New chat/ }));
        expect(document.activeElement).toBe(input);
        expect(screen.getByRole("button", { name: "New group" })).toBeTruthy();
    });
});

describe("CirqleNewChat chats under the book", () => {
    beforeEach(setUp);
    afterEach(tearDown);

    it("lists the number's chats under the book, without anyone the book has", async () => {
        const chat = (id: string, name: string): Room => {
            const room = new Room(id, client, client.getSafeUserId());
            room.name = name;
            room.currentState.setStateEvents([
                new MatrixEvent({
                    type: "m.bridge",
                    state_key: "server/whatsapp",
                    event_id: `$bridge${id}`,
                    room_id: id,
                    sender: "@whatsappbot:server",
                    content: { "protocol": { id: "whatsapp" }, "com.beeper.room_type": "dm" },
                }),
            ]);
            return room;
        };
        mocked.rooms = [chat("!boris:server", "+14695552222"), chat("!zoe:server", "Zoe Parent +79181888877")];
        activeSpace = SLAVA_TEST;
        render(panel());
        expect(await screen.findByText("Chats on slava test")).toBeTruthy();
        const sections = [...document.querySelectorAll(".cirqle_NewChat_section")].map((n) => n.textContent);
        expect(sections).toEqual(["Contacts", "Chats on slava test"]);
        const chats = [...document.querySelectorAll(".cirqle_NewChat_contact:not(.cirqle_NewChat_bookRow)")];
        expect(chats.map((n) => n.querySelector(".cirqle_NewChat_name")?.textContent)).toEqual([
            "Zoe Parent +79181888877",
        ]);
        search("zoe");
        await act(() => vi.advanceTimersByTimeAsync(400));
        expect(document.querySelectorAll(".cirqle_NewChat_bookRow")).toHaveLength(0);
        expect(screen.getByText("Chats on slava test")).toBeTruthy();
    });
});

describe("CirqleNewChat book refresh", () => {
    beforeEach(setUp);
    afterEach(tearDown);

    it("drops a contact deleted elsewhere from both open New chat and Contacts within a minute", async () => {
        activeSpace = SLAVA_TEST;
        render(
            <MatrixClientContext.Provider value={client}>
                <CirqleNewChat />
                <CirqleContacts />
            </MatrixClientContext.Provider>,
        );
        expect(await screen.findAllByText("boris")).toHaveLength(2);
        const reads = vi.mocked(client.http.authedRequest).mock.calls.length;

        book = BOOK.filter((contact) => contact.name !== "boris");
        await act(() => vi.advanceTimersByTimeAsync(60 * 1000));
        expect(screen.queryAllByText("boris")).toHaveLength(0);
        expect(screen.getAllByText("Anna Client")).toHaveLength(2);
        expect(vi.mocked(client.http.authedRequest).mock.calls.length).toBeGreaterThan(reads);
    });

    it("reads the book again when the window comes back to the front", async () => {
        activeSpace = SLAVA_TEST;
        render(panel());
        expect(await screen.findByText("boris")).toBeTruthy();
        book = [
            ...BOOK,
            { user_id: "@newchat_whatsapp_wa-efa4b19c_=79181888877:server", name: "Zoe", number: "+79181888877" },
        ];
        await act(async () => {
            window.dispatchEvent(new Event("focus"));
        });
        expect(await screen.findByText("Zoe")).toBeTruthy();
    });
});

describe("CirqleNewChat New contact", () => {
    beforeEach(setUp);
    afterEach(tearDown);

    it("offers New contact under New group only to staff who may change the book", async () => {
        const { unmount } = render(panel());
        await act(() => vi.advanceTimersByTimeAsync(10));
        expect(screen.queryByRole("button", { name: "New contact" })).toBeNull();
        unmount();

        canEdit = true;
        render(panel());
        expect(await screen.findByRole("button", { name: "New contact" })).toBeTruthy();
        expect(client.http.authedRequest).toHaveBeenCalledWith(
            Method.Post,
            "/com.cirqle/contacts",
            undefined,
            {},
            { prefix: "/_matrix/client/unstable" },
        );
        const actions = [...document.querySelectorAll(".cirqle_NewChat_actionLabel")].map((n) => n.textContent);
        expect(actions).toEqual(["New chat", "New group", "New contact"]);
    });
});
