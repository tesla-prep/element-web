/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventType, type MatrixClient, type MatrixEvent, MsgType, RelationType, Room } from "matrix-js-sdk/src/matrix";
import { KnownMembership } from "matrix-js-sdk/src/types";
import { mkEvent, stubClient } from "test-utils";

import SdkConfig from "../SdkConfig";
import { CIRQLE_BRAND } from "./CirqleFeatures";
import { isCirqleForwardTarget } from "./CirqleForward";
import { isCirqleMentionable } from "./CirqleMessages";
import { cirqleReactionGroups, cirqleReplaceOwnReaction } from "./CirqleReactions";

const SERVER = "matrix.cirqlecirqle.com";
const WA_BOT = `@whatsappbot:${SERVER}`;
const COLLEAGUE = `@adubrovsky:${SERVER}`;
const ACCOUNT = `@account_whatsapp_wa-efa4b19c:${SERVER}`;
const CUSTOMER = `@whatsapp_lid-50002177056782:${SERVER}`;
const OTHER_CUSTOMER = `@whatsapp_lid-225022648049807:${SERVER}`;
const OWN_GHOST = `@whatsapp_79648986389:${SERVER}`;

function bridge(roomId: string, content: Record<string, unknown>): MatrixEvent {
    return mkEvent({
        type: "m.bridge",
        room: roomId,
        user: WA_BOT,
        skey: `${SERVER}/whatsapp`,
        content: { bridgebot: WA_BOT, protocol: { id: "whatsapp" }, ...content },
        event: true,
    });
}

describe("CIRQLE actions", () => {
    let client: MatrixClient;
    let rooms: Room[];

    const chat = (roomId: string, channel: string): Room => {
        const room = new Room(roomId, client, client.getSafeUserId());
        room.currentState.setStateEvents([
            bridge(roomId, { "channel": { id: channel }, "com.beeper.room_type": "dm" }),
        ]);
        return room;
    };
    const space = (receiver: string, children: string[]): Room => {
        const id = `!space-${receiver}:${SERVER}`;
        const room = new Room(id, client, client.getSafeUserId());
        room.currentState.setStateEvents([
            mkEvent({
                type: EventType.RoomCreate,
                room: id,
                user: WA_BOT,
                skey: "",
                content: { type: "m.space" },
                event: true,
            }),
            bridge(id, {
                "channel": { "id": "__personal_filtering_space__", "fi.mau.receiver": receiver },
                "com.beeper.room_type.v2": "personal_filtering_space",
            }),
            ...children.map((child) =>
                mkEvent({
                    type: EventType.SpaceChild,
                    room: id,
                    user: WA_BOT,
                    skey: child,
                    content: { via: [SERVER] },
                    event: true,
                }),
            ),
        ]);
        vi.spyOn(room, "getMyMembership").mockReturnValue(KnownMembership.Join);
        return room;
    };
    const reaction = (sender: string, key: string, ts: number): MatrixEvent =>
        mkEvent({
            type: EventType.Reaction,
            room: "!dm:server",
            user: sender,
            ts,
            content: { "m.relates_to": { rel_type: RelationType.Annotation, event_id: "$msg", key } },
            event: true,
        });

    beforeEach(() => {
        client = stubClient();
        SdkConfig.put({ brand: CIRQLE_BRAND });
        rooms = [
            chat("!dm:server", "50002177056782@lid"),
            chat("!dm2:server", "225022648049807@lid"),
            chat("!other-number:server", "11111111111@s.whatsapp.net"),
            new Room("!staff:server", client, client.getSafeUserId()),
        ];
        rooms.push(space("79648986389", ["!dm:server", "!dm2:server"]), space("13026180314", ["!other-number:server"]));
        client.getRooms = () => rooms;
        client.getRoom = (id?: string) => rooms.find((room) => room.roomId === id) ?? null;
    });

    afterEach(() => {
        SdkConfig.reset();
    });

    it("forwards only to chats of the number the message is in", () => {
        const message = mkEvent({
            type: EventType.RoomMessage,
            room: "!dm:server",
            user: CUSTOMER,
            content: { msgtype: MsgType.Text, body: "hello" },
            event: true,
        });
        expect(isCirqleForwardTarget(client, message, client.getRoom("!dm2:server")!)).toBe(true);
        expect(isCirqleForwardTarget(client, message, client.getRoom("!other-number:server")!)).toBe(false);
        expect(isCirqleForwardTarget(client, message, client.getRoom("!staff:server")!)).toBe(false);
        SdkConfig.reset();
        expect(isCirqleForwardTarget(client, message, client.getRoom("!other-number:server")!)).toBe(true);
    });

    it("counts our number's reaction once and shows only its latest", () => {
        const me = client.getSafeUserId();
        const groups = cirqleReactionGroups(
            [
                {
                    content: "👍",
                    events: [reaction(me, "👍", 1), reaction(ACCOUNT, "👍", 2), reaction(CUSTOMER, "👍", 3)],
                },
                { content: "😂", events: [reaction(COLLEAGUE, "😂", 5)] },
                { content: "❤️", events: [reaction(CUSTOMER, "❤️", 4)] },
            ],
            client,
        );
        // A colleague reacted last: WhatsApp now shows the number's 😂, the 👍 stays the customer's
        expect(groups.map((group) => [group.content, group.events.map((event) => event.getSender())])).toEqual([
            ["👍", [CUSTOMER]],
            ["😂", [COLLEAGUE]],
            ["❤️", [CUSTOMER]],
        ]);

        const mine = cirqleReactionGroups(
            [{ content: "👍", events: [reaction(me, "👍", 1), reaction(ACCOUNT, "👍", 2)] }],
            client,
        );
        expect(mine[0].events.map((event) => event.getSender())).toEqual([me]);
    });

    it("takes our previous reaction back before a new one", () => {
        const me = client.getSafeUserId();
        const old = reaction(me, "👍", 1);
        const same = reaction(me, "😂", 2);
        const message = mkEvent({
            type: EventType.RoomMessage,
            room: "!dm:server",
            user: CUSTOMER,
            content: { body: "hi" },
            event: true,
        });
        const room = client.getRoom("!dm:server")!;
        vi.spyOn(room.relations, "getChildEventsForEvent").mockReturnValue({
            getAnnotationsBySender: () => ({ [me]: new Set([old, same]) }),
        } as any);
        cirqleReplaceOwnReaction(client, message, "😂");
        expect(client.redactEvent).toHaveBeenCalledTimes(1);
        expect(client.redactEvent).toHaveBeenCalledWith("!dm:server", old.getId());
    });

    it("offers customers in @, not colleagues, service users or our own number", () => {
        rooms[4].currentState.setStateEvents([
            mkEvent({
                type: "com.cirqle.team_messenger.number_users",
                room: rooms[4].roomId,
                user: ACCOUNT,
                skey: "",
                content: { user_ids: [OWN_GHOST] },
                event: true,
            }),
        ]);
        expect(isCirqleMentionable(client, CUSTOMER)).toBe(true);
        expect(isCirqleMentionable(client, OTHER_CUSTOMER)).toBe(true);
        expect(isCirqleMentionable(client, COLLEAGUE)).toBe(false);
        expect(isCirqleMentionable(client, ACCOUNT)).toBe(false);
        expect(isCirqleMentionable(client, WA_BOT)).toBe(false);
        expect(isCirqleMentionable(client, OWN_GHOST)).toBe(false);
    });
});
