/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { Room } from "matrix-js-sdk/src/matrix";
import { stubClient } from "test-utils";

import { LocalRoom, LOCAL_ROOM_ID_PREFIX } from "../models/LocalRoom";
import { chatKind } from "./CirqleInboxes";

describe("chatKind", () => {
    it("is a private chat for the local room New chat opens before the first message", () => {
        const client = stubClient();
        expect(chatKind(new LocalRoom(LOCAL_ROOM_ID_PREFIX + "1", client, client.getSafeUserId()))).toBe("chat");
    });

    it("is a group for a plain room nobody bridged", () => {
        const client = stubClient();
        expect(chatKind(new Room("!plain:server", client, client.getSafeUserId()))).toBe("group");
    });
});
