/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// @vitest-environment happy-dom

import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type MatrixClient, MatrixEvent, Room } from "matrix-js-sdk/src/matrix";
import { KnownMembership } from "matrix-js-sdk/src/types";
import { render } from "test-utils-rtl";
import { stubClient } from "test-utils";

import SdkConfig from "../SdkConfig";
import { CIRQLE_BRAND } from "./CirqleFeatures";
import { addMemberLabel, addMemberTexts } from "./CirqleAddMember";
import { DMRoomTile } from "../components/views/dialogs/invite/DMRoomTile";
import { DirectoryMember } from "../utils/direct-messages";

const CONTACT = "@newchat_whatsapp_wa-bba81064_=79181888877:server";
const LID_CONTACT = "@newchat_whatsapp_wa-bba81064_lid-98204511141898:server";

function state(roomId: string, type: string, content: Record<string, unknown>, stateKey = ""): MatrixEvent {
    return new MatrixEvent({
        type,
        state_key: stateKey,
        content,
        room_id: roomId,
        sender: "@whatsappbot:server",
        event_id: `$${roomId}${type}${stateKey}`,
    });
}

describe("Add member, CIRQLE's way", () => {
    let client: MatrixClient;

    beforeEach(() => {
        client = stubClient();
        SdkConfig.put({ brand: CIRQLE_BRAND });
        const space = new Room("!andrey:server", client, client.getSafeUserId());
        space.currentState.setStateEvents([
            state("!andrey:server", "m.room.create", { type: "m.space" }),
            state("!andrey:server", "m.room.name", { name: "WhatsApp · Andrey - Personal" }),
            state(
                "!andrey:server",
                "m.bridge",
                {
                    "bridgebot": "@whatsappbot:server",
                    "protocol": { id: "whatsapp" },
                    "channel": { id: "__personal_filtering_space__" },
                    "com.beeper.room_type.v2": "personal_filtering_space",
                },
                "server/whatsapp",
            ),
            state("!andrey:server", "m.space.child", { via: ["server"] }, "!group:server"),
        ]);
        space.updateMyMembership(KnownMembership.Join);
        const group = new Room("!group:server", client, client.getSafeUserId());
        group.currentState.setStateEvents([
            state("!group:server", "m.room.create", {}),
            state("!group:server", "m.room.name", { name: "CIRQ-21 test" }),
            state(
                "!group:server",
                "m.bridge",
                {
                    bridgebot: "@whatsappbot:server",
                    protocol: { id: "whatsapp" },
                    channel: { id: "120363428957343332@g.us" },
                },
                "server/whatsapp",
            ),
        ]);
        group.updateMyMembership(KnownMembership.Join);
        group.recalculate();
        space.recalculate();
        vi.mocked(client.getRooms).mockReturnValue([space, group]);
        vi.mocked(client.getRoom).mockImplementation((id) => [space, group].find((r) => r.roomId === id) ?? null);
    });

    afterEach(() => {
        SdkConfig.reset();
    });

    it("names a contact by name or number, never by Matrix ID", () => {
        expect(addMemberLabel({ userId: CONTACT, name: "+79181888877 · Andrey - Personal" })).toEqual({
            name: "+7 918 188 8877",
            sub: "On WhatsApp · start chat",
        });
        expect(addMemberLabel({ userId: CONTACT, name: "Victoria, +79181888877 · Andrey - Personal" })).toEqual({
            name: "Victoria",
            sub: "+7 918 188 8877 · On WhatsApp",
        });
        // Typed before the profile loaded: Element names it by the Matrix ID
        expect(addMemberLabel({ userId: CONTACT, name: CONTACT })?.name).toBe("+7 918 188 8877");
        expect(addMemberLabel({ userId: LID_CONTACT, name: LID_CONTACT })?.name).toBe("this contact");
    });

    it("words the dialog for the group and its number", () => {
        expect(addMemberTexts(client, "!group:server")).toEqual({
            title: "Add to CIRQ-21 test",
            help: "Search a name or number among the contacts of Andrey - Personal.",
            button: "Add",
        });
        expect(addMemberTexts(client, "!plain:server")).toBeUndefined();
    });

    it("keeps Element's words outside CIRQLE", () => {
        SdkConfig.reset();
        expect(addMemberLabel({ userId: CONTACT, name: CONTACT })).toBeUndefined();
        expect(addMemberTexts(client, "!group:server")).toBeUndefined();
    });

    it("shows no Matrix ID in a suggestion", () => {
        const member = new DirectoryMember({ user_id: CONTACT, display_name: "+79181888877 · Andrey - Personal" });
        const { container } = render(<DMRoomTile member={member} />);
        expect(container.textContent).not.toContain("@newchat_");
        expect(container.textContent).toContain("+7 918 188 8877");
    });
});
