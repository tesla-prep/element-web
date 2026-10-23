/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type MatrixClient, MatrixEvent, Room } from "matrix-js-sdk/src/matrix";
import { stubClient } from "test-utils";

import SdkConfig from "../SdkConfig";
import { CIRQLE_BRAND } from "./CirqleFeatures";
import { deliveryFailure, deliveryText, ROOM_FEATURES_EVENT, SEND_STATUS_EVENT } from "./CirqleDelivery";
import { cirqleCanEdit, cirqleMayDelete } from "./CirqleMessages";
import { refusalText } from "./CirqleInviteRefusals";

const ROOM = "!chat:server";
const NOW = 1_800_000_000_000;
const MINUTE = 60 * 1000;

describe("CIRQLE delivery", () => {
    let client: MatrixClient;
    let room: Room;

    const message = (id: string, ageMs: number, sender = client.getSafeUserId()): MatrixEvent =>
        new MatrixEvent({
            type: "m.room.message",
            event_id: id,
            room_id: ROOM,
            sender,
            origin_server_ts: NOW - ageMs,
            content: { msgtype: "m.text", body: "hi" },
        });
    const status = (target: string, value: string, extra: Record<string, unknown> = {}): MatrixEvent =>
        new MatrixEvent({
            type: SEND_STATUS_EVENT,
            event_id: `$status-${target}-${value}`,
            room_id: ROOM,
            sender: "@whatsappbot:server",
            origin_server_ts: NOW,
            content: { "m.relates_to": { rel_type: "m.reference", event_id: target }, "status": value, ...extra },
        });

    beforeEach(() => {
        client = stubClient();
        SdkConfig.put({ brand: CIRQLE_BRAND });
        room = new Room(ROOM, client, client.getSafeUserId());
        room.currentState.setStateEvents([
            new MatrixEvent({
                type: ROOM_FEATURES_EVENT,
                state_key: "server/whatsapp",
                event_id: "$features",
                room_id: ROOM,
                sender: "@whatsappbot:server",
                content: { edit: 2, edit_max_age: 900, delete: 2, delete_max_age: 172800, reaction_count: 1 },
            }),
        ]);
        client.getRoom = (id?: string) => (id === ROOM ? room : null);
    });

    afterEach(() => {
        SdkConfig.reset();
    });

    it("offers Edit for 15 minutes and Delete for everyone for 2 days, as the bridge publishes", () => {
        expect(cirqleCanEdit(client, message("$a", 14 * MINUTE), NOW)).toBe(true);
        expect(cirqleCanEdit(client, message("$a", 16 * MINUTE), NOW)).toBe(false);
        expect(cirqleMayDelete(client, message("$a", 47 * 60 * MINUTE), NOW)).toBe(true);
        expect(cirqleMayDelete(client, message("$a", 49 * 60 * MINUTE), NOW)).toBe(false);
        expect(cirqleMayDelete(client, message("$a", MINUTE, "@whatsapp_lid-1:server"), NOW)).toBe(false);
    });

    it("keeps Edit and Delete where the bridge publishes no limit", () => {
        room.currentState.setStateEvents([
            new MatrixEvent({
                type: ROOM_FEATURES_EVENT,
                state_key: "server/whatsapp",
                event_id: "$features2",
                room_id: ROOM,
                sender: "@telegrambot:server",
                content: { edit: 2, delete: 2 },
            }),
        ]);
        expect(cirqleCanEdit(client, message("$a", 30 * 24 * 60 * MINUTE), NOW)).toBe(true);
        expect(cirqleMayDelete(client, message("$a", 30 * 24 * 60 * MINUTE), NOW)).toBe(true);
    });

    it("says on the message what the network refused", () => {
        const sent = message("$sent", MINUTE);
        const refused = message("$refused", MINUTE);
        room.addLiveEvents(
            [
                sent,
                refused,
                status("$sent", "SUCCESS"),
                status("$refused", "FAIL_RETRIABLE", { reason: "m.foreign_network_error", internal_error: "secret" }),
            ],
            { addToState: false },
        );
        expect(deliveryFailure(room, sent)).toBeUndefined();
        const failure = deliveryFailure(room, refused)!;
        expect(failure).toEqual({ what: "message", reason: "it was refused" });
        expect(deliveryText(failure, "WhatsApp")).toBe("Not delivered to WhatsApp: it was refused");
    });

    it("takes the bridge's last answer: a retry that worked clears the refusal", () => {
        const event = message("$m", MINUTE);
        room.addLiveEvents([event, status("$m", "FAIL_RETRIABLE"), status("$m", "SUCCESS")], { addToState: false });
        expect(deliveryFailure(room, event)).toBeUndefined();
    });

    it("tells when an edit did not reach the customer", () => {
        const original = message("$old", 20 * MINUTE);
        const edit = new MatrixEvent({
            type: "m.room.message",
            event_id: "$edit",
            room_id: ROOM,
            sender: client.getSafeUserId(),
            origin_server_ts: NOW,
            content: {
                "msgtype": "m.text",
                "body": "* fixed",
                "m.new_content": { msgtype: "m.text", body: "fixed" },
                "m.relates_to": { rel_type: "m.replace", event_id: "$old" },
            },
        });
        original.makeReplaced(edit);
        room.addLiveEvents(
            [original, status("$edit", "FAIL_PERMANENT", { message: "the message is too old to be edited" })],
            {
                addToState: false,
            },
        );
        const failure = deliveryFailure(room, original)!;
        expect(deliveryText(failure, "WhatsApp")).toBe(
            "Edit not delivered to WhatsApp: the message is too old to be edited. The customer sees the earlier text",
        );
    });

    it("explains a refused Add member in English", () => {
        expect(refusalText("+79181888877 не найден", "WhatsApp")).toBe("+79181888877 is not on WhatsApp.");
        expect(refusalText("не получилось", "WhatsApp")).toBe("WhatsApp did not accept it.");
        expect(refusalText("slava test: номер не подключён", "WhatsApp")).toBe("slava test: номер не подключён");
    });
});
