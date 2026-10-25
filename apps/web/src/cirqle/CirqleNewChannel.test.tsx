/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// @vitest-environment happy-dom

import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type MatrixClient, MatrixError } from "matrix-js-sdk/src/matrix";
import { act, fireEvent, render, screen } from "test-utils-rtl";
import { stubClient } from "test-utils";

import MatrixClientContext from "../contexts/MatrixClientContext";
import { SDKContextClass } from "../contexts/SDKContextClass";
import { MetaSpace } from "../stores/spaces";
import dis from "../dispatcher/dispatcher";
import { Action } from "../dispatcher/actions";
import Modal from "../Modal";
import ErrorDialog from "../components/views/dialogs/ErrorDialog";
import { CirqleNewChannel } from "./CirqleNewChannel";
import { type Inbox, type Network } from "./CirqleInboxes";
import { CirqleUiStore } from "./CirqleUiStore";

const mocked = vi.hoisted(() => ({ inboxes: [] as Inbox[] }));

vi.mock("./useCirqleChats", () => ({ useCirqleInboxes: (): Inbox[] => mocked.inboxes }));

const inbox = (spaceId: string, label: string, network: Network, connected = true): Inbox => ({
    spaceId,
    network,
    label,
    phone: undefined,
    accountName: undefined,
    childIds: new Set(),
    ownUsers: new Set(),
    connected,
    contactPhones: new Map(),
});

describe("CirqleNewChannel", () => {
    let client: MatrixClient;

    beforeEach(() => {
        client = stubClient();
        vi.mocked(client.getDomain).mockReturnValue("server");
        vi.spyOn(SDKContextClass.instance.spaceStore, "activeSpace", "get").mockReturnValue(MetaSpace.Home);
        vi.spyOn(Modal, "createDialog").mockImplementation(() => ({}) as ReturnType<typeof Modal.createDialog>);
        mocked.inboxes = [
            inbox("!andrey:server", "Andrey - Personal", "whatsapp"),
            inbox("!main:server", "Main #1", "whatsapp", false),
            inbox("!tg:server", "Свободный номер", "telegram"),
        ];
    });

    const panel = (): void => {
        render(
            <MatrixClientContext.Provider value={client}>
                <CirqleNewChannel />
            </MatrixClientContext.Provider>,
        );
    };

    it("offers connected WhatsApp numbers only, and takes the only one without asking", () => {
        panel();
        const options = Array.from(screen.getByLabelText("Channel of").querySelectorAll("option")).map(
            (o) => o.textContent,
        );
        expect(options).toEqual(["Andrey - Personal · WhatsApp"]);
    });

    it("asks the relay bot for a public room in the number's space, which it answers with the channel", async () => {
        const dispatch = vi.spyOn(dis, "dispatch").mockImplementation(() => {});
        client.createRoom = vi.fn().mockResolvedValue({ room_id: "!channel:server" });
        panel();
        fireEvent.change(screen.getByLabelText("Channel name"), { target: { value: " CIRQLE News " } });
        await act(async () => fireEvent.click(screen.getByRole("button", { name: "Create" })));
        expect(client.createRoom).toHaveBeenCalledWith({
            name: "CIRQLE News",
            visibility: "public",
            preset: "public_chat",
            initial_state: [
                { type: "m.space.parent", state_key: "!andrey:server", content: { via: ["server"], canonical: true } },
            ],
        });
        expect(dispatch).toHaveBeenCalledWith(
            expect.objectContaining({ action: Action.ViewRoom, room_id: "!channel:server" }),
        );
        expect(CirqleUiStore.section).toBe("channels");
    });

    it("shows WhatsApp's refusal as the relay bot words it", async () => {
        const refusal =
            "WhatsApp did not create the channel on Andrey - Personal. Some numbers can't have channels: create it on the phone, then post to it from CIRQLE.";
        client.createRoom = vi.fn().mockRejectedValue(new MatrixError({ errcode: "M_UNKNOWN", error: refusal }, 400));
        panel();
        fireEvent.change(screen.getByLabelText("Channel name"), { target: { value: "News" } });
        await act(async () => fireEvent.click(screen.getByRole("button", { name: "Create" })));
        expect(Modal.createDialog).toHaveBeenCalledWith(ErrorDialog, {
            title: "Couldn't create the channel",
            description: refusal,
        });
    });

    it("says so when no WhatsApp number is connected", () => {
        mocked.inboxes = [inbox("!tg:server", "Свободный номер", "telegram")];
        panel();
        expect(screen.getByRole("status").textContent).toBe("No connected WhatsApp number: channels are WhatsApp's.");
        expect(screen.queryByRole("button", { name: "Create" })).toBeNull();
    });
});
