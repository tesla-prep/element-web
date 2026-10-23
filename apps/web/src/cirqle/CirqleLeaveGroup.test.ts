/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type MatrixClient, MatrixError, MatrixEvent, Method, Room } from "matrix-js-sdk/src/matrix";
import { stubClient } from "test-utils";

import Modal from "../Modal";
import SdkConfig from "../SdkConfig";
import SettingsStore from "../settings/SettingsStore";
import dis from "../dispatcher/dispatcher";
import { Action } from "../dispatcher/actions";
import { CIRQLE_BRAND } from "./CirqleFeatures";
import { type Inbox } from "./CirqleInboxes";
import { canLeaveCirqleGroup, leaveCirqleGroup } from "./CirqleLeaveGroup";

const SLAVA_TEST = {
    spaceId: "!slava:server",
    network: "whatsapp",
    label: "slava test",
    phone: "+7 964 898 6389",
    accountName: "wa-efa4b19c",
    childIds: new Set<string>(),
    ownUsers: new Set<string>(),
    connected: true,
    contactPhones: new Map<string, string>(),
} as Inbox;

describe("Leave group", () => {
    let client: MatrixClient;
    let answers: boolean[];

    const room = (id: string, network: string, channel: string): Room => {
        const created = new Room(id, client, client.getSafeUserId());
        created.name = "CIRQ-9 test";
        created.currentState.setStateEvents([
            new MatrixEvent({
                type: "m.bridge",
                state_key: `server/${network}`,
                event_id: `$bridge${id}`,
                room_id: id,
                sender: `@${network}bot:server`,
                content: { bridgebot: `@${network}bot:server`, protocol: { id: network }, channel: { id: channel } },
            }),
        ]);
        return created;
    };

    beforeEach(() => {
        client = stubClient();
        SdkConfig.put({ brand: CIRQLE_BRAND });
        answers = [true];
        vi.spyOn(Modal, "createDialog").mockImplementation(
            () =>
                ({ finished: Promise.resolve([answers.shift()]), close: vi.fn() }) as unknown as ReturnType<
                    typeof Modal.createDialog
                >,
        );
        vi.spyOn(dis, "fire").mockImplementation(() => {});
        Object.assign(client, { http: { authedRequest: vi.fn().mockResolvedValue({}) } });
    });

    afterEach(() => {
        SdkConfig.reset();
        vi.restoreAllMocks();
    });

    it("is offered in WhatsApp groups only", () => {
        expect(canLeaveCirqleGroup(room("!g:server", "whatsapp", "120363413301739487@g.us"))).toBe(true);
        expect(canLeaveCirqleGroup(room("!c:server", "whatsapp", "120363000000000000@newsletter"))).toBe(false);
        expect(canLeaveCirqleGroup(room("!t:server", "telegram", "chat:4001"))).toBe(false);
    });

    it("asks, then has the relay bot take the number out and goes back to the list", async () => {
        const group = room("!g:server", "whatsapp", "120363413301739487@g.us");
        await leaveCirqleGroup(client, group, [SLAVA_TEST]);
        expect(vi.mocked(Modal.createDialog).mock.calls[0][1]).toMatchObject({
            title: "Leave CIRQ-9 test?",
            description:
                "slava test +7 964 898 6389 will leave “CIRQ-9 test” on WhatsApp, for everyone at CIRQLE. The chat stays on the phone.",
        });
        expect(client.http.authedRequest).toHaveBeenCalledWith(
            Method.Post,
            "/com.cirqle/leave_group",
            undefined,
            { room_id: "!g:server" },
            expect.objectContaining({ prefix: "/_matrix/client/unstable" }),
        );
        expect(dis.fire).toHaveBeenCalledWith(Action.ViewHomePage);
    });

    it("does nothing when staff cancel", async () => {
        answers = [false];
        await leaveCirqleGroup(client, room("!g:server", "whatsapp", "1@g.us"), [SLAVA_TEST]);
        expect(client.http.authedRequest).not.toHaveBeenCalled();
    });

    it("shows the relay bot's refusal", async () => {
        client.http.authedRequest = vi
            .fn()
            .mockRejectedValue(
                new MatrixError(
                    { errcode: "M_UNKNOWN", error: "Another CIRQLE number is in this group too (Andrey - Personal)." },
                    409,
                ),
            );
        await leaveCirqleGroup(client, room("!g:server", "whatsapp", "1@g.us"), [SLAVA_TEST]);
        expect(vi.mocked(Modal.createDialog).mock.calls.at(-1)?.[1]).toEqual({
            title: "Couldn't leave the group",
            description: "Another CIRQLE number is in this group too (Andrey - Personal).",
        });
        expect(dis.fire).not.toHaveBeenCalled();
    });

    it("sends read receipts and typing, so the customer sees them from the number", () => {
        expect(SettingsStore.getValue("sendReadReceipts")).toBe(true);
        expect(SettingsStore.getValue("sendTypingNotifications")).toBe(true);
    });
});
