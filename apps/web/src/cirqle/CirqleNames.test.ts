/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MatrixEvent, Room, RoomMember } from "matrix-js-sdk/src/matrix";
import { renderHook } from "test-utils-rtl";
import { stubClient } from "test-utils";

import SdkConfig from "../SdkConfig";
import { usePermalink } from "../hooks/usePermalink";
import { PillType } from "../components/views/elements/PillType";
import { makeUserPermalink } from "../utils/permalinks/Permalinks";
import { CIRQLE_BRAND } from "./CirqleFeatures";
import { memberName } from "./CirqleInboxes";

const ROOM = "!group:server";
const OUR_GHOST = "@whatsapp_lid-13035913650214:server";
const ACCOUNT = "@account_whatsapp_wa-bba81064:server";

function join(userId: string, displayname: string): MatrixEvent {
    return new MatrixEvent({
        type: "m.room.member",
        state_key: userId,
        sender: userId,
        room_id: ROOM,
        event_id: `$${userId}`,
        content: { membership: "join", displayname },
    });
}

describe("names without Matrix IDs", () => {
    let room: Room;

    beforeEach(() => {
        const client = stubClient();
        SdkConfig.put({ brand: CIRQLE_BRAND });
        room = new Room(ROOM, client, client.getSafeUserId());
        // The number's account and its own ghost share the name, so Element tells them apart by Matrix ID
        room.currentState.setStateEvents([join(OUR_GHOST, "Andrey"), join(ACCOUNT, "Andrey")]);
        vi.mocked(client.getRoom).mockReturnValue(room);
    });

    afterEach(() => {
        SdkConfig.reset();
    });

    it("drops the Matrix ID Element adds to a shared name", () => {
        const ghost = room.getMember(OUR_GHOST)!;
        expect(ghost.name).toContain("@whatsapp_lid-13035913650214");
        expect(memberName(ghost)).toBe("Andrey");
        const fresh = new RoomMember(ROOM, "@whatsapp_lid-1:server");
        fresh.name = "Nellie";
        expect(memberName(fresh)).toBe("Nellie");
    });

    it("names the person in a mention or an In reply to pill without the Matrix ID", () => {
        const { result } = renderHook(() =>
            usePermalink({ room, type: PillType.UserMention, url: makeUserPermalink(OUR_GHOST) }),
        );
        expect(result.current.text).toBe("Andrey");
    });
});
