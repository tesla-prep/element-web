/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type MatrixClient, MatrixEvent, Room } from "matrix-js-sdk/src/matrix";
import { stubClient } from "test-utils";

import SdkConfig from "../SdkConfig";
import { CIRQLE_BRAND } from "./CirqleFeatures";
import {
    cirqleReactionFilter,
    deliveryFailure,
    deliveryText,
    ROOM_FEATURES_EVENT,
    SEND_STATUS_EVENT,
} from "./CirqleDelivery";
import { cirqleCanEdit, cirqleMayDelete } from "./CirqleMessages";
import { addMemberProblem, refusalText } from "./CirqleInviteRefusals";

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

    it("takes a status whose message is not loaded at once, without fetching the message (start from the cache)", async () => {
        vi.mocked(client.supportsThreads).mockReturnValue(true);
        await room.addLiveEvents([status("$older", "FAIL_RETRIABLE")], { addToState: false });
        expect(client.fetchRoomEvent).not.toHaveBeenCalled();
        const older = message("$older", 30 * MINUTE);
        await room.addLiveEvents([older], { addToState: false });
        expect(deliveryFailure(room, older)).toEqual({ what: "message", reason: "it was not accepted" });
    });

    it("still fetches the parent of other relations it cannot place", async () => {
        vi.mocked(client.supportsThreads).mockReturnValue(true);
        const reaction = new MatrixEvent({
            type: "m.reaction",
            event_id: "$like",
            room_id: ROOM,
            sender: "@whatsapp_1:server",
            origin_server_ts: NOW,
            content: { "m.relates_to": { rel_type: "m.annotation", event_id: "$elsewhere", key: "👍" } },
        });
        await room.addLiveEvents([reaction], { addToState: false });
        expect(client.fetchRoomEvent).toHaveBeenCalledWith(ROOM, "$elsewhere");
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

    const TELEGRAM_REACTIONS = ["❤️", "👍️", "👎️", "🔥", "🎉", "😍", "👀", "🫡", "❤️‍🔥"];
    const features = (content: Record<string, unknown>): void => {
        room.currentState.setStateEvents([
            new MatrixEvent({
                type: ROOM_FEATURES_EVENT,
                // replaces the chat's WhatsApp features from beforeEach
                state_key: "server/whatsapp",
                event_id: `$features-${Math.random()}`,
                room_id: ROOM,
                sender: "@telegrambot:server",
                content,
            }),
        ]);
    };
    const reaction = (id: string, sender: string, key: string, ts = NOW): MatrixEvent =>
        new MatrixEvent({
            type: "m.reaction",
            event_id: id,
            room_id: ROOM,
            sender,
            origin_server_ts: ts,
            content: { "m.relates_to": { rel_type: "m.annotation", event_id: "$msg", key } },
        });
    const OWNER = "@account_telegram_tg-447877300139:server";

    it("offers in Telegram only the reactions the bridge lists, with or without variation selectors", () => {
        // WhatsApp lists none: it takes any emoji
        expect(cirqleReactionFilter(room)).toBeUndefined();

        features({ reaction: 2, reaction_count: 1, allowed_reactions: TELEGRAM_REACTIONS });
        const takes = cirqleReactionFilter(room)!;
        expect(["👍", "👍️", "❤", "❤️", "🫡", "❤️‍🔥"].every(takes)).toBe(true);
        // Element's quick reactions Telegram refuses, a skin tone, the emoji from the user's screenshot
        expect(["😄", "😕", "🚀", "👍🏽", "🤟", "🤙"].some(takes)).toBe(false);

        features({ reaction: 2, allowed_reactions: TELEGRAM_REACTIONS, custom_emoji_reactions: true });
        expect(cirqleReactionFilter(room)).toBeUndefined();

        features({ reaction: -2 });
        expect(cirqleReactionFilter(room)!("👍")).toBe(false);

        SdkConfig.reset();
        expect(cirqleReactionFilter(room)).toBeUndefined();
    });

    it("says when our reaction did not reach the customer", () => {
        const me = client.getSafeUserId();
        const target = message("$msg", MINUTE, "@telegram_429896795:server");
        room.addLiveEvents(
            [
                target,
                reaction("$mine", me, "🤟"),
                reaction("$number", OWNER, "🤟"),
                // Staff's own reaction is always ignored: it travels as the number's
                status("$mine", "FAIL_RETRIABLE", { reason: "m.event_not_handled" }),
                status("$number", "FAIL_RETRIABLE", {
                    reason: "com.beeper.unsupported_event",
                    message: "Unsupported reaction",
                }),
            ],
            { addToState: false },
        );
        const failure = deliveryFailure(room, target)!;
        expect(failure.what).toBe("reaction");
        expect(failure.key).toBe("🤟");
        expect(deliveryText(failure, "Telegram")).toBe(
            "Reaction 🤟 not delivered: Telegram takes only its standard reactions",
        );
    });

    it("reads a status the SDK keeps only among the reaction's relations, not in the timeline", () => {
        const target = message("$msg", MINUTE, "@telegram_429896795:server");
        room.addLiveEvents([target, reaction("$number", OWNER, "🤑")], { addToState: false });
        room.relations.aggregateChildEvent(
            status("$number", "FAIL_RETRIABLE", { reason: "com.beeper.unsupported_event" }),
            room.getUnfilteredTimelineSet(),
        );
        expect(
            room
                .getLiveTimeline()
                .getEvents()
                .some((event) => event.getType() === SEND_STATUS_EVENT),
        ).toBe(false);
        expect(deliveryFailure(room, target)?.key).toBe("🤑");
    });

    it("stays quiet when the number's reaction went through, or only staff's own was ignored", () => {
        const me = client.getSafeUserId();
        const target = message("$msg", MINUTE, "@telegram_429896795:server");
        room.addLiveEvents(
            [target, reaction("$mine", me, "👍"), status("$mine", "FAIL_RETRIABLE", { reason: "m.event_not_handled" })],
            { addToState: false },
        );
        expect(deliveryFailure(room, target)).toBeUndefined();
        room.addLiveEvents([reaction("$number", OWNER, "👍"), status("$number", "SUCCESS")], { addToState: false });
        expect(deliveryFailure(room, target)).toBeUndefined();
    });

    it("passes on why else the bridge refused a reaction", () => {
        const target = message("$msg", MINUTE, "@whatsapp_lid-1:server");
        room.addLiveEvents(
            [
                target,
                reaction("$number", "@account_whatsapp_wa-efa4b19c:server", "👍"),
                status("$number", "FAIL_RETRIABLE", { message: "reaction target message not found" }),
            ],
            { addToState: false },
        );
        expect(deliveryText(deliveryFailure(room, target)!, "WhatsApp")).toBe(
            "Reaction 👍 not delivered to WhatsApp: reaction target message not found",
        );
    });

    it("explains a refused Add member in English", () => {
        expect(refusalText("+79181888877 не найден", "WhatsApp")).toBe("+79181888877 is not on WhatsApp.");
        expect(refusalText("не получилось", "WhatsApp")).toBe("WhatsApp did not accept it.");
        expect(refusalText("slava test: номер не подключён", "WhatsApp")).toBe("slava test: номер не подключён");
    });

    it("reads the relay bot's Add member outcome", () => {
        const field = "com.cirqle.add_member";
        expect(
            addMemberProblem({ membership: "leave", [field]: { outcome: "added", contact: "+1" } }, "WhatsApp"),
        ).toBeUndefined();
        expect(
            addMemberProblem(
                {
                    membership: "leave",
                    reason: "Anna does not let others add her to groups.",
                    [field]: {
                        outcome: "failed",
                        error: "privacy",
                        message: "Anna does not let others add her to groups.",
                    },
                },
                "WhatsApp",
            ),
        ).toBe("Anna does not let others add her to groups.");
        expect(addMemberProblem({ membership: "leave", [field]: { outcome: "unknown" } }, "WhatsApp")).toBe(
            "WhatsApp did not confirm it.",
        );
        // The bot before com.cirqle.add_member: a reason only when it failed
        expect(addMemberProblem({ membership: "leave" }, "WhatsApp")).toBeUndefined();
        expect(addMemberProblem({ membership: "leave", reason: "+79990000000 не найден" }, "WhatsApp")).toBe(
            "+79990000000 is not on WhatsApp.",
        );
    });
});
