/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type MatrixClient, MatrixEvent, type RoomMember } from "matrix-js-sdk/src/matrix";
import { stubClient } from "test-utils";

import Modal from "../Modal";
import SdkConfig from "../SdkConfig";
import { CIRQLE_BRAND } from "./CirqleFeatures";
import { ADD_MEMBER_EVENT_FIELD, NO_ANSWER_MS, watchCirqleInviteRefusals } from "./CirqleInviteRefusals";

const ROOM = "!group:server";
const CONTACT = "@newchat_whatsapp_wa-efa4b19c_=79181888877:server";

describe("Add member outcome", () => {
    let client: MatrixClient;
    let onMembership: (event: MatrixEvent, member: RoomMember, old?: string) => void;
    let stop: () => void;
    const member = (membership: string): RoomMember =>
        ({ roomId: ROOM, userId: CONTACT, membership, name: "Виктория, +79181888877 · slava test" }) as RoomMember;
    const event = (sender: string, content: Record<string, unknown>): MatrixEvent =>
        new MatrixEvent({
            type: "m.room.member",
            state_key: CONTACT,
            sender,
            room_id: ROOM,
            origin_server_ts: Date.now(),
            content,
        });

    beforeEach(() => {
        vi.useFakeTimers({ now: 1_800_000_000_000 });
        client = stubClient();
        SdkConfig.put({ brand: CIRQLE_BRAND });
        client.on = vi.fn((_name: string, handler: typeof onMembership) => {
            onMembership = handler;
            return client;
        }) as unknown as MatrixClient["on"];
        client.off = vi.fn() as unknown as MatrixClient["off"];
        vi.spyOn(Modal, "createDialog").mockReturnValue({} as ReturnType<typeof Modal.createDialog>);
        stop = watchCirqleInviteRefusals(client);
    });

    afterEach(() => {
        stop();
        SdkConfig.reset();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it("tells the inviter why the contact was not added", () => {
        onMembership(event(client.getSafeUserId(), { membership: "invite" }), member("invite"));
        onMembership(
            event(CONTACT, {
                membership: "leave",
                [ADD_MEMBER_EVENT_FIELD]: {
                    outcome: "failed",
                    error: "not_found",
                    message: "+79181888877 is not on WhatsApp.",
                },
            }),
            member("leave"),
            "invite",
        );
        expect(Modal.createDialog).toHaveBeenCalledWith(expect.anything(), {
            title: "Couldn't add Виктория, +79181888877 to My room",
            description: "+79181888877 is not on WhatsApp.",
        });
        vi.advanceTimersByTime(NO_ANSWER_MS);
        expect(Modal.createDialog).toHaveBeenCalledTimes(1);
    });

    it("says nothing when the contact was added", () => {
        onMembership(event(client.getSafeUserId(), { membership: "invite" }), member("invite"));
        onMembership(
            event(CONTACT, { membership: "leave", [ADD_MEMBER_EVENT_FIELD]: { outcome: "added" } }),
            member("leave"),
            "invite",
        );
        vi.advanceTimersByTime(NO_ANSWER_MS);
        expect(Modal.createDialog).not.toHaveBeenCalled();
    });

    it("says when there is no answer in 70 seconds", () => {
        onMembership(event(client.getSafeUserId(), { membership: "invite" }), member("invite"));
        vi.advanceTimersByTime(NO_ANSWER_MS);
        expect(Modal.createDialog).toHaveBeenCalledWith(expect.anything(), {
            title: "Couldn't add Виктория, +79181888877 to My room",
            description: "No answer from WhatsApp yet. Check the members in Group info in a minute.",
        });
    });

    it("ignores someone else's invite", () => {
        onMembership(event("@colleague:server", { membership: "invite" }), member("invite"));
        onMembership(event(CONTACT, { membership: "leave", reason: "не получилось" }), member("leave"), "invite");
        vi.advanceTimersByTime(NO_ANSWER_MS);
        expect(Modal.createDialog).not.toHaveBeenCalled();
    });
});
