/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventType, type MatrixClient, type MatrixEvent, MsgType, Room } from "matrix-js-sdk/src/matrix";
import { KnownMembership } from "matrix-js-sdk/src/types";
import { mkEvent, stubClient } from "test-utils";

import { NUMBER_USERS_EVENT } from "./CirqleInboxes";
import { hideCustomerName, isOurSide } from "./CirqleTimeline";

const SERVER = "matrix.cirqlecirqle.com";
const ME = `@vchizhov:${SERVER}`;
const STAFF = `@adubrovsky:${SERVER}`;
const ACCOUNT = `@account_whatsapp_wa-bba81064:${SERVER}`;
const WA_BOT = `@whatsappbot:${SERVER}`;
const TG_BOT = `@telegrambot:${SERVER}`;

// "Andrey - Personal": +1 302 618 0314, whose own WhatsApp LID is 13035913650214
const NUMBER = "13026180314";
const NUMBER_PHONE_GHOST = `@whatsapp_${NUMBER}:${SERVER}`;
const NUMBER_LID_GHOST = `@whatsapp_lid-13035913650214:${SERVER}`;
// The number's identity before WhatsApp's change of number, seen in old chats
const NUMBER_OLD_GHOST = `@whatsapp_lid-214693301997673:${SERVER}`;
const JANAKI = `@whatsapp_lid-50002177056782:${SERVER}`;
const GROUP_MEMBER = `@whatsapp_lid-225022648049807:${SERVER}`;

const TG_ACCOUNT = "8759317930";
const TG_OWN_GHOST = `@telegram_${TG_ACCOUNT}:${SERVER}`;
const TG_CONTACT = `@telegram_429896795:${SERVER}`;

type Network = "whatsapp" | "telegram";

function bridgeState(roomId: string, network: Network, content: Record<string, unknown>): MatrixEvent {
    const bot = network === "whatsapp" ? WA_BOT : TG_BOT;
    return mkEvent({
        type: "m.bridge",
        room: roomId,
        user: bot,
        skey: `${SERVER}/${network}`,
        content: { bridgebot: bot, protocol: { id: network }, ...content },
        event: true,
    });
}

function room(client: MatrixClient, roomId: string, state: MatrixEvent[]): Room {
    const created = new Room(roomId, client, ME);
    created.currentState.setStateEvents(state);
    return created;
}

function created(roomId: string): MatrixEvent {
    return mkEvent({ type: EventType.RoomCreate, room: roomId, user: WA_BOT, skey: "", content: {}, event: true });
}

function privateChat(
    client: MatrixClient,
    roomId: string,
    network: Network,
    channelId: string,
    receiver: string,
): Room {
    return room(client, roomId, [
        created(roomId),
        bridgeState(roomId, network, {
            "channel": { "id": channelId, "fi.mau.receiver": receiver },
            "com.beeper.room_type": "dm",
        }),
    ]);
}

function inboxSpace(client: MatrixClient, network: Network, receiver: string, listed?: unknown[]): Room {
    const id = `!space-${receiver}:${SERVER}`;
    const space = room(client, id, [
        mkEvent({
            type: EventType.RoomCreate,
            room: id,
            user: WA_BOT,
            skey: "",
            content: { type: "m.space" },
            event: true,
        }),
        bridgeState(id, network, {
            "channel": { "id": "__personal_filtering_space__", "fi.mau.receiver": receiver },
            "com.beeper.room_type.v2": "personal_filtering_space",
        }),
        ...(listed
            ? [
                  mkEvent({
                      type: NUMBER_USERS_EVENT,
                      room: id,
                      user: ACCOUNT,
                      skey: "",
                      content: { user_ids: listed },
                      event: true,
                  }),
              ]
            : []),
    ]);
    vi.spyOn(space, "getMyMembership").mockReturnValue(KnownMembership.Join);
    return space;
}

function message(roomId: string, sender: string): MatrixEvent {
    return mkEvent({
        type: EventType.RoomMessage,
        room: roomId,
        user: sender,
        content: { msgtype: MsgType.Text, body: "Nope, lease is not signed yet" },
        event: true,
    });
}

const DM = `!janaki:${SERVER}`;
const PHONE_DM = `!phone-dm:${SERVER}`;
const GROUP = `!group:${SERVER}`;
const TG_DM = `!tg-dm:${SERVER}`;
const SELF_DM = `!self:${SERVER}`;

describe("isOurSide", () => {
    let client: MatrixClient;
    let rooms: Room[] = [];

    function setUp(listed?: unknown[]): void {
        rooms = [
            inboxSpace(client, "whatsapp", NUMBER, listed),
            inboxSpace(client, "telegram", TG_ACCOUNT),
            privateChat(client, DM, "whatsapp", "50002177056782@lid", NUMBER),
            privateChat(client, PHONE_DM, "whatsapp", "15557093423@s.whatsapp.net", NUMBER),
            room(client, GROUP, [
                created(GROUP),
                bridgeState(GROUP, "whatsapp", { channel: { id: "120363425399214516@g.us" } }),
            ]),
            privateChat(client, TG_DM, "telegram", "user:429896795", TG_ACCOUNT),
            privateChat(client, SELF_DM, "whatsapp", "13035913650214@lid", NUMBER),
        ];
    }

    beforeEach(() => {
        client = stubClient();
        vi.mocked(client.getUserId).mockReturnValue(ME);
        vi.mocked(client.getRooms).mockImplementation(() => rooms);
        vi.mocked(client.getRoom).mockImplementation((id) => rooms.find((r) => r.roomId === id) ?? null);
        setUp([NUMBER_PHONE_GHOST, NUMBER_LID_GHOST]);
    });

    it.each([
        ["our own message", DM, ME],
        ["a staff member's reply", DM, STAFF],
        ["the number's account user", DM, ACCOUNT],
        ["the number writing from the phone in a private chat", DM, NUMBER_LID_GHOST],
        ["the number's old identity after a change of number", DM, NUMBER_OLD_GHOST],
        ["the number writing from the phone in a chat keyed by phone number", PHONE_DM, NUMBER_LID_GHOST],
        ["the number writing from the phone in a group", GROUP, NUMBER_LID_GHOST],
        ["the number's phone ghost in a group", GROUP, NUMBER_PHONE_GHOST],
        ["the Telegram account writing from the phone", TG_DM, TG_OWN_GHOST],
        ["the number's chat with itself", SELF_DM, NUMBER_LID_GHOST],
    ])("puts %s on our side", (_name, roomId, sender) => {
        expect(isOurSide(message(roomId, sender), client)).toBe(true);
    });

    it.each([
        ["the customer in a private chat", DM, JANAKI],
        ["the customer in a chat keyed by phone number", PHONE_DM, `@whatsapp_15557093423:${SERVER}`],
        ["another member of a group", GROUP, GROUP_MEMBER],
        ["the Telegram contact", TG_DM, TG_CONTACT],
        ["the WhatsApp bridge bot", DM, WA_BOT],
        ["the Telegram bridge bot", TG_DM, TG_BOT],
    ])("puts %s on the customer's side", (_name, roomId, sender) => {
        expect(isOurSide(message(roomId, sender), client)).toBe(false);
    });

    it("knows the number's phone ghost from the bridge alone, before the relay bot lists its users", () => {
        setUp();
        expect(isOurSide(message(GROUP, NUMBER_PHONE_GHOST), client)).toBe(true);
        expect(isOurSide(message(GROUP, NUMBER_LID_GHOST), client)).toBe(false);
        expect(isOurSide(message(DM, NUMBER_LID_GHOST), client)).toBe(true);
    });

    it("ignores what is not a user id in the space's list", () => {
        setUp([42, NUMBER_LID_GHOST]);
        expect(isOurSide(message(GROUP, NUMBER_LID_GHOST), client)).toBe(true);
        expect(isOurSide(message(GROUP, GROUP_MEMBER), client)).toBe(false);
    });

    it("hides only the customer's name in a private chat", () => {
        expect(hideCustomerName(message(DM, JANAKI), client)).toBe(true);
        expect(hideCustomerName(message(DM, NUMBER_LID_GHOST), client)).toBe(false);
        expect(hideCustomerName(message(DM, STAFF), client)).toBe(false);
    });
});
