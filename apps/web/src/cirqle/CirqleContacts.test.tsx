/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// @vitest-environment happy-dom

import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type MatrixClient, MatrixError, Method } from "matrix-js-sdk/src/matrix";
import { act, fireEvent, render, screen } from "test-utils-rtl";
import { stubClient } from "test-utils";

import MatrixClientContext from "../contexts/MatrixClientContext";
import Modal from "../Modal";
import QuestionDialog from "../components/views/dialogs/QuestionDialog";
import { CirqleLeftColumn } from "./CirqleLeftColumn";
import { type SharedContact } from "./CirqleSharedContacts";
import { CirqleUiStore } from "./CirqleUiStore";

vi.mock("./CirqleChatList", () => ({ CirqleChatList: () => <p>Chat list</p> }));
vi.mock("./CirqleNewChat", () => ({ CirqleNewChat: () => <p>New chat {CirqleUiStore.newChatQuery}</p> }));

const UNSTABLE = { prefix: "/_matrix/client/unstable" };
const LONG = "qa-Alexandra Konstantinopolskaya-Vasilyeva Junior";

let client: MatrixClient;
let contacts: SharedContact[];
let canEdit: boolean;
let answers: boolean[];
let refusal: MatrixError | undefined;

beforeEach(() => {
    client = stubClient();
    contacts = [
        { number: "+79181888877", name: "qa-Boris" },
        { number: "+14695550123", name: LONG },
        { number: "+14695551111", name: "anna qa" },
    ];
    canEdit = true;
    answers = [true];
    refusal = undefined;
    Object.assign(client, {
        http: {
            authedRequest: vi.fn().mockImplementation(async (_method: Method, path: string) => {
                if (path === "/com.cirqle/contacts") return { contacts, can_edit: canEdit };
                if (refusal) throw refusal;
                return {};
            }),
        },
    });
    vi.spyOn(Modal, "createDialog").mockImplementation(
        () =>
            ({ finished: Promise.resolve([answers.shift()]), close: vi.fn() }) as unknown as ReturnType<
                typeof Modal.createDialog
            >,
    );
    CirqleUiStore.openContacts();
});

afterEach(() => {
    act(() => CirqleUiStore.closePanel());
    vi.restoreAllMocks();
});

const column = (): React.ReactElement => (
    <MatrixClientContext.Provider value={client}>
        <CirqleLeftColumn />
    </MatrixClientContext.Provider>
);
const names = (): string[] =>
    [...document.querySelectorAll(".cirqle_NewChat_bookRow .cirqle_NewChat_name")].map((n) => n.textContent ?? "");
const requests = (): unknown[][] =>
    vi.mocked(client.http.authedRequest).mock.calls.filter((call) => call[1] !== "/com.cirqle/contacts");
const type = (label: string, value: string): void => {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
};

describe("Contacts", () => {
    it("lists the shared book by name with each number, and filters by name or digits", async () => {
        render(column());
        expect(await screen.findByText(LONG)).toBeTruthy();
        expect(client.http.authedRequest).toHaveBeenCalledWith(
            Method.Post,
            "/com.cirqle/contacts",
            undefined,
            {},
            UNSTABLE,
        );
        expect(names()).toEqual(["anna qa", LONG, "qa-Boris"]);
        expect(screen.getByText("+1 469 555 0123")).toBeTruthy();
        expect(screen.getByText("+7 918 188 8877")).toBeTruthy();

        type("Search name or number", "KONST");
        expect(names()).toEqual([LONG]);
        type("Search name or number", "918 188");
        expect(names()).toEqual(["qa-Boris"]);
        type("Search name or number", "zzz");
        expect(screen.getByText("No contacts found")).toBeTruthy();
    });

    it("says so when the book is empty or can't be read", async () => {
        contacts = [];
        const { unmount } = render(column());
        expect(await screen.findByText("No contacts yet")).toBeTruthy();
        unmount();

        vi.mocked(client.http.authedRequest).mockRejectedValueOnce(new Error("offline"));
        render(column());
        expect(await screen.findByText("Couldn't load contacts")).toBeTruthy();
    });

    it("lets only staff who may change the book add or edit; others open New chat with the number", async () => {
        canEdit = false;
        render(column());
        expect(await screen.findByText("qa-Boris")).toBeTruthy();
        expect(screen.queryByRole("button", { name: "New contact" })).toBeNull();
        fireEvent.click(screen.getByText("qa-Boris"));
        expect(screen.getByText("New chat +7 918 188 8877")).toBeTruthy();
    });
});

describe("Contacts: new contact", () => {
    it("adds a contact, then goes back to the list and reads it again", async () => {
        render(column());
        fireEvent.click(await screen.findByRole("button", { name: "New contact" }));
        expect(screen.getByRole("heading", { name: "New contact" })).toBeTruthy();
        const save = screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
        expect(save.disabled).toBe(true);
        type("Name", `  ${LONG} `);
        type("Phone number", "4695550123");
        expect(screen.getByRole("status").textContent).toBe(
            "Type the number with its country code, like +1 214 555 0100",
        );
        type("Phone number", "+1 (469) 555-0123");
        expect(screen.queryByRole("status")).toBeNull();
        expect(screen.queryByRole("button", { name: /^Delete/ })).toBeNull();
        await act(async () => fireEvent.click(save));

        expect(requests()).toEqual([
            [
                Method.Post,
                "/com.cirqle/contacts/save",
                undefined,
                { number: "+1 (469) 555-0123", name: LONG },
                UNSTABLE,
            ],
        ]);
        expect(await screen.findByRole("heading", { name: "Contacts" })).toBeTruthy();
        expect(
            vi.mocked(client.http.authedRequest).mock.calls.filter((c) => c[1] === "/com.cirqle/contacts"),
        ).toHaveLength(2);
    });

    it("shows the relay bot's refusal as it is and stays on the form", async () => {
        refusal = new MatrixError(
            { errcode: "M_UNKNOWN", error: "+14695551111 is already in contacts as «anna qa»" },
            409,
        );
        render(column());
        fireEvent.click(await screen.findByRole("button", { name: "New contact" }));
        type("Name", "qa-Anna 2");
        type("Phone number", "+1 469 555 1111");
        await act(async () => fireEvent.keyDown(screen.getByLabelText("Phone number"), { key: "Enter" }));
        expect((await screen.findByRole("alert")).textContent).toBe("+14695551111 is already in contacts as «anna qa»");
        expect(screen.getByRole("heading", { name: "New contact" })).toBeTruthy();
    });
});

describe("Contacts: edit contact", () => {
    it("changes a contact's name and number by its previous number", async () => {
        render(column());
        fireEvent.click(await screen.findByText("qa-Boris"));
        expect(screen.getByRole("heading", { name: "Edit contact" })).toBeTruthy();
        expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("qa-Boris");
        expect((screen.getByLabelText("Phone number") as HTMLInputElement).value).toBe("+7 918 188 8877");
        const save = screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
        expect(save.disabled).toBe(true);
        type("Name", "qa-Boris Petrov");
        type("Phone number", "+7 918 188 8878");
        await act(async () => fireEvent.click(save));
        expect(requests()).toEqual([
            [
                Method.Post,
                "/com.cirqle/contacts/save",
                undefined,
                { number: "+7 918 188 8878", name: "qa-Boris Petrov", previous_number: "+79181888877" },
                UNSTABLE,
            ],
        ]);
        expect(await screen.findByRole("heading", { name: "Contacts" })).toBeTruthy();
    });

    it("deletes a contact after the confirmation, and not without it", async () => {
        render(column());
        fireEvent.click(await screen.findByText("qa-Boris"));
        answers = [false];
        await act(async () => fireEvent.click(screen.getByRole("button", { name: "Delete contact…" })));
        expect(Modal.createDialog).toHaveBeenCalledWith(QuestionDialog, {
            title: "Delete qa-Boris?",
            description: "+7 918 188 8877 will be deleted from contacts on every number, for everyone at CIRQLE.",
            button: "Delete contact",
            danger: true,
        });
        expect(requests()).toEqual([]);

        answers = [true];
        await act(async () => fireEvent.click(screen.getByRole("button", { name: "Delete contact…" })));
        expect(requests()).toEqual([
            [Method.Post, "/com.cirqle/contacts/delete", undefined, { number: "+79181888877" }, UNSTABLE],
        ]);
        expect(await screen.findByRole("heading", { name: "Contacts" })).toBeTruthy();
    });
});

describe("Contacts: New contact from New chat", () => {
    it("goes back to New chat when New contact was opened there", async () => {
        act(() => CirqleUiStore.openNewChat());
        render(column());
        act(() => CirqleUiStore.openContactForm());
        expect(screen.getByRole("heading", { name: "New contact" })).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Back" }));
        expect(screen.getByText(/^New chat/)).toBeTruthy();
    });
});
