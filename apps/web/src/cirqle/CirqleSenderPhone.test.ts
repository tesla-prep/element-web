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
import { DisambiguatedProfileViewModel } from "../viewmodels/room/timeline/event-tile/DisambiguatedProfileViewModel";
import { CIRQLE_BRAND } from "./CirqleFeatures";
import { CONTACT_PHONES_EVENT, NUMBER_USERS_EVENT } from "./CirqleInboxes";
import { cirqleFallbackName, cirqleMentionName, cirqleSenderPhone } from "./CirqleSenderPhone";

const SERVER = "matrix.cirqlecirqle.com";
const SPACE = `!space:${SERVER}`;
const GROUP = `!group:${SERVER}`;
const DM = `!dm:${SERVER}`;
// "Andrey - Personal", +1 302 618 0314, writes from the phone as its LID ghost
const OWN_NUMBER_GHOST = `@whatsapp_13026180314:${SERVER}`;
const OWN_LID_GHOST = `@whatsapp_lid-13035913650214:${SERVER}`;
const NELLIE = `@whatsapp_lid-225022648049807:${SERVER}`; // number only in the relay bot's list
const ABDULLAH = `@whatsapp_8801877307243:${SERVER}`; // number in the ghost itself
const STRANGER = `@whatsapp_lid-99:${SERVER}`; // nobody knows the number
const TG_CUSTOMER = `@telegram_429896795:${SERVER}`;
const STAFF = `@adubrovsky:${SERVER}`;

function room(
    client: MatrixClient,
    roomId: string,
    state: Array<{ type: string; key?: string; content: object }>,
): Room {
    const r = new Room(roomId, client, client.getSafeUserId());
    r.currentState.setStateEvents(
        [{ type: "m.room.create", content: {} }, ...state].map(
            (ev, i) =>
                new MatrixEvent({
                    type: ev.type,
                    state_key: ev.key ?? "",
                    content: ev.content,
                    room_id: roomId,
                    sender: "@whatsappbot:" + SERVER,
                    event_id: `$${roomId}-${i}`,
                }),
        ),
    );
    r.updateMyMembership(KnownMembership.Join);
    return r;
}

const bridge = (channel: object, extra: object = {}): { type: string; key: string; content: object } => ({
    type: "m.bridge",
    key: `${SERVER}/whatsapp`,
    content: { bridgebot: "@whatsappbot:" + SERVER, protocol: { id: "whatsapp" }, channel, ...extra },
});

describe("the sender's number over a bubble in a group", () => {
    beforeEach(() => {
        const client = stubClient();
        SdkConfig.put({ brand: CIRQLE_BRAND });
        const space = room(client, SPACE, [
            { type: "m.room.create", content: { type: "m.space" } },
            { type: "m.room.name", content: { name: "WhatsApp · Andrey - Personal" } },
            { type: "m.room.topic", content: { topic: "Your WhatsApp bridged chats - +13026180314" } },
            bridge(
                { "id": "__personal_filtering_space__", "fi.mau.receiver": "13026180314" },
                { "com.beeper.room_type.v2": "personal_filtering_space" },
            ),
            { type: "m.space.child", key: GROUP, content: { via: [SERVER] } },
            { type: "m.space.child", key: DM, content: { via: [SERVER] } },
            { type: NUMBER_USERS_EVENT, content: { user_ids: [OWN_LID_GHOST] } },
            { type: CONTACT_PHONES_EVENT, content: { phones: { "225022648049807@lid": "+19299917911" } } },
        ]);
        const group = room(client, GROUP, [bridge({ id: "120363428957343332@g.us" })]);
        const dm = room(client, DM, [bridge({ id: "8801877307243@s.whatsapp.net" }, { "com.beeper.room_type": "dm" })]);
        const rooms = [space, group, dm];
        vi.spyOn(space, "isSpaceRoom").mockReturnValue(true);
        vi.mocked(client.getRooms).mockReturnValue(rooms);
        vi.mocked(client.getRoom).mockImplementation((id) => rooms.find((r) => r.roomId === id) ?? null);
    });

    afterEach(() => {
        SdkConfig.reset();
        vi.restoreAllMocks();
    });

    it("is the customer's number, from the ghost or from the relay bot's list for a LID", () => {
        expect(cirqleSenderPhone(NELLIE, GROUP, "Nellie")).toBe("+1 929 991 7911");
        expect(cirqleSenderPhone(ABDULLAH, GROUP, "Abdullah Mallik")).toBe("+8801877307243");
    });

    it("is not shown for staff, our number's own ghosts, Telegram or a number nobody knows", () => {
        expect(cirqleSenderPhone(STAFF, GROUP, "Andrey")).toBeUndefined();
        expect(cirqleSenderPhone(OWN_LID_GHOST, GROUP, "Andrey")).toBeUndefined();
        expect(cirqleSenderPhone(OWN_NUMBER_GHOST, GROUP, "Andrey")).toBeUndefined();
        expect(cirqleSenderPhone(TG_CUSTOMER, GROUP, "Victoria")).toBeUndefined();
        expect(cirqleSenderPhone(STRANGER, GROUP, "Raj")).toBeUndefined();
    });

    it("is not repeated when the name is the number, nor shown in a private chat", () => {
        expect(cirqleSenderPhone(ABDULLAH, GROUP, "+8801877307243")).toBeUndefined();
        expect(cirqleSenderPhone(ABDULLAH, DM, "Abdullah Mallik")).toBeUndefined();
    });

    it("goes after the name over the bubble, where stock Element would put the Matrix ID", () => {
        const vm = new DisambiguatedProfileViewModel({
            fallbackName: NELLIE,
            member: { userId: NELLIE, roomId: GROUP, rawDisplayName: "Nellie", disambiguate: false },
        });
        expect(vm.getSnapshot().displayName).toBe("Nellie");
        expect(vm.getSnapshot().displayIdentifier).toBe("+1 929 991 7911");
        vm.setMember(STAFF, { userId: STAFF, roomId: GROUP, rawDisplayName: "Andrey", disambiguate: true });
        expect(vm.getSnapshot().displayIdentifier).toBeUndefined();
    });

    it("names someone not loaded yet by their number, never by the bridge's Matrix ID", () => {
        expect(cirqleFallbackName(NELLIE)).toBe("+1 929 991 7911");
        expect(cirqleFallbackName(STRANGER)).toBe("WhatsApp contact");
        expect(cirqleFallbackName(TG_CUSTOMER)).toBe("Telegram user");
        expect(cirqleFallbackName(STAFF)).toBeUndefined();
        const vm = new DisambiguatedProfileViewModel({ fallbackName: NELLIE, member: null });
        expect(vm.getSnapshot().displayName).toBe("+1 929 991 7911");
        vm.setMember(OWN_NUMBER_GHOST, { userId: OWN_NUMBER_GHOST, roomId: GROUP, rawDisplayName: "Andrey (WA)", disambiguate: false });
        expect(vm.getSnapshot().displayName).toBe("Andrey");
    });

    it("gives a mention pill the name without the bridge's (WA), else the number", () => {
        expect(cirqleMentionName("+17548021097 (WA)", STRANGER)).toBe("+1 754 802 1097");
        expect(cirqleMentionName("nishka rastogi (WA)", STRANGER)).toBe("nishka rastogi");
        expect(cirqleMentionName(undefined, NELLIE)).toBe("+1 929 991 7911");
        expect(cirqleMentionName(NELLIE, NELLIE)).toBe("+1 929 991 7911");
        expect(cirqleMentionName("Andrey", STAFF)).toBe("Andrey");
    });
});
