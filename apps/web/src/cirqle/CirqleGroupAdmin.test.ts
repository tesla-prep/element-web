/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type MatrixClient, MatrixEvent, Room } from "matrix-js-sdk/src/matrix";
import { KnownMembership } from "matrix-js-sdk/src/types";
import { stubClient } from "test-utils";

import SdkConfig from "../SdkConfig";
import { CIRQLE_BRAND } from "./CirqleFeatures";
import { getInboxes, NUMBER_USERS_EVENT } from "./CirqleInboxes";
import { canChangeGroupAdmin, ourAdminNumber } from "./CirqleGroupAdmin";
import { cirqleMayDelete, cirqleMayDeleteForMe, HIDDEN_EVENTS_TYPE, hideForMe, isHiddenForMe } from "./CirqleMessages";
import { showsSenderAvatar } from "./CirqleSenderAvatar";
import { MatrixClientPeg } from "../MatrixClientPeg";

const ACCOUNT = "@account_whatsapp_wa-bba81064:server";
const OUR_GHOST = "@whatsapp_lid-13035913650214:server";
const ANNA = "@whatsapp_lid-111:server";
const CREATOR = "@whatsapp_lid-222:server";
const ADMIN = "@whatsapp_lid-333:server";
const COLLEAGUE = "@colleague:server";

interface State {
    type: string;
    state_key?: string;
    content: Record<string, unknown>;
}

const join = (userId: string): State => ({ type: "m.room.member", state_key: userId, content: { membership: "join" } });

function bridge(id: string, protocol = "whatsapp", extra: Record<string, unknown> = {}): State {
    return {
        type: "m.bridge",
        state_key: `server/${protocol}`,
        content: { bridgebot: `@${protocol}bot:server`, protocol: { id: protocol }, channel: { id }, ...extra },
    };
}

function mkRoom(client: MatrixClient, roomId: string, state: State[]): Room {
    const room = new Room(roomId, client, client.getSafeUserId());
    room.currentState.setStateEvents(
        [{ type: "m.room.create", content: {} }, join(client.getSafeUserId()), ...state].map(
            (ev, i) =>
                new MatrixEvent({
                    type: ev.type,
                    state_key: ev.state_key ?? "",
                    content: ev.content,
                    room_id: roomId,
                    sender: "@whatsappbot:server",
                    event_id: `$${roomId}-${i}`,
                }),
        ),
    );
    room.updateMyMembership(KnownMembership.Join);
    room.recalculate();
    return room;
}

function group(client: MatrixClient, roomId: string, users: Record<string, number>, protocol = "whatsapp"): Room {
    return mkRoom(client, roomId, [
        bridge("120363000000000000@g.us", protocol),
        ...[ACCOUNT, OUR_GHOST, ANNA, CREATOR, ADMIN].map(join),
        { type: "m.room.power_levels", content: { users, redact: 50, kick: 50, state_default: 99 } },
    ]);
}

describe("group admins and deleting others' messages", () => {
    let client: MatrixClient;
    let rooms: Room[];
    const me = (): string => client.getSafeUserId();

    const message = (roomId: string, sender: string, id = "$m"): MatrixEvent =>
        new MatrixEvent({
            type: "m.room.message",
            sender,
            room_id: roomId,
            event_id: id,
            origin_server_ts: Date.now(),
            content: { msgtype: "m.text", body: "hi" },
        });

    beforeEach(() => {
        client = stubClient();
        SdkConfig.put({ brand: CIRQLE_BRAND });
        const space = mkRoom(client, "!andrey:server", [
            { type: "m.room.create", content: { type: "m.space" } },
            bridge("__personal_filtering_space__", "whatsapp", {
                "com.beeper.room_type.v2": "personal_filtering_space",
            }),
            { type: "m.room.name", content: { name: "WhatsApp · Andrey - Personal" } },
            { type: "m.space.child", state_key: "!admin:server", content: { via: ["server"] } },
            { type: "m.space.child", state_key: "!member:server", content: { via: ["server"] } },
            { type: "m.space.child", state_key: "!dm:server", content: { via: ["server"] } },
            { type: NUMBER_USERS_EVENT, content: { user_ids: [OUR_GHOST] } },
            join(ACCOUNT),
        ]);
        rooms = [
            space,
            // Our number administers this group: staff got the kick (and redact) level from the relay bot
            group(client, "!admin:server", { [ACCOUNT]: 50, [me()]: 50, [CREATOR]: 75, [ADMIN]: 50 }),
            // Here our number is an ordinary member
            group(client, "!member:server", { [CREATOR]: 75 }),
            mkRoom(client, "!dm:server", [bridge("111@lid", "whatsapp", { "com.beeper.room_type": "dm" }), join(ANNA)]),
            group(client, "!tg:server", { [me()]: 50 }, "telegram"),
        ];
        vi.mocked(client.getRooms).mockReturnValue(rooms);
        vi.mocked(client.getRoom).mockImplementation((id) => rooms.find((room) => room.roomId === id) ?? null);
        vi.spyOn(MatrixClientPeg, "get").mockReturnValue(client);
    });

    afterEach(() => {
        SdkConfig.reset();
    });

    const room = (id: string): Room => rooms.find((r) => r.roomId === id)!;

    it("knows when our number is a group admin", () => {
        const inboxes = getInboxes(client);
        expect(ourAdminNumber(room("!admin:server"), inboxes)?.label).toBe("Andrey - Personal");
        expect(ourAdminNumber(room("!member:server"), inboxes)).toBeUndefined();
        expect(ourAdminNumber(room("!dm:server"), inboxes)).toBeUndefined();
    });

    it("offers Make group admin and Dismiss as admin only where our number is an admin, never for the creator or us", () => {
        const inboxes = getInboxes(client);
        const admin = room("!admin:server");
        expect(canChangeGroupAdmin(admin, admin.getMember(ANNA)!, inboxes)).toBe(true);
        expect(canChangeGroupAdmin(admin, admin.getMember(ADMIN)!, inboxes)).toBe(true);
        expect(canChangeGroupAdmin(admin, admin.getMember(CREATOR)!, inboxes)).toBe(false);
        expect(canChangeGroupAdmin(admin, admin.getMember(OUR_GHOST)!, inboxes)).toBe(false);
        expect(canChangeGroupAdmin(admin, admin.getMember(ACCOUNT)!, inboxes)).toBe(false);
        const member = room("!member:server");
        expect(canChangeGroupAdmin(member, member.getMember(ANNA)!, inboxes)).toBe(false);
    });

    it("deletes a customer's message for everyone only in groups, on WhatsApp as its admin; for me anywhere", () => {
        expect(cirqleMayDelete(client, message("!admin:server", ANNA))).toBe(true);
        expect(cirqleMayDelete(client, message("!member:server", ANNA))).toBe(false);
        expect(cirqleMayDelete(client, message("!dm:server", ANNA))).toBe(false);
        // Telegram leaves it to the power level the relay bot gives staff where our account created the group
        expect(cirqleMayDelete(client, message("!tg:server", ANNA))).toBe(true);
        for (const id of ["!admin:server", "!member:server", "!dm:server", "!tg:server"]) {
            expect(cirqleMayDeleteForMe(client, message(id, ANNA))).toBe(true);
        }
        expect(cirqleMayDeleteForMe(client, message("!member:server", COLLEAGUE))).toBe(true);
    });

    it("keeps our own messages to Delete for everyone", () => {
        expect(cirqleMayDelete(client, message("!member:server", me()))).toBe(true);
        expect(cirqleMayDeleteForMe(client, message("!member:server", me()))).toBe(false);
    });

    it("hides a message for this staff member only, in their room account data", async () => {
        const event = message("!member:server", ANNA, "$anna");
        vi.mocked(client.setRoomAccountData).mockImplementation(async (roomId, type, content) => {
            room(roomId).addAccountData([new MatrixEvent({ type, content })]);
            return {};
        });
        expect(isHiddenForMe(client, event)).toBe(false);
        await hideForMe(client, event);
        expect(client.setRoomAccountData).toHaveBeenCalledWith("!member:server", HIDDEN_EVENTS_TYPE, {
            event_ids: ["$anna"],
        });
        expect(isHiddenForMe(client, event)).toBe(true);
        expect(isHiddenForMe(client, message("!member:server", ANNA, "$other"))).toBe(false);
        await hideForMe(client, event);
        expect(room("!member:server").getAccountData(HIDDEN_EVENTS_TYPE)?.getContent().event_ids).toEqual(["$anna"]);
    });

    it("shows senders' avatars in groups, not in private chats or on our side", () => {
        expect(showsSenderAvatar(message("!member:server", ANNA))).toBe(true);
        expect(showsSenderAvatar(message("!member:server", OUR_GHOST))).toBe(false);
        expect(showsSenderAvatar(message("!member:server", me()))).toBe(false);
        expect(showsSenderAvatar(message("!member:server", COLLEAGUE))).toBe(false);
        expect(showsSenderAvatar(message("!dm:server", ANNA))).toBe(false);
    });
});
