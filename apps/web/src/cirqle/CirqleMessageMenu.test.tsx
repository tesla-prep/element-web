/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// @vitest-environment happy-dom

import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventType, type MatrixClient, MatrixEvent, MsgType, RelationType } from "matrix-js-sdk/src/matrix";
import { render, screen, fireEvent } from "test-utils-rtl";
import { stubClient } from "test-utils";

import SdkConfig from "../SdkConfig";
import { CIRQLE_BRAND } from "./CirqleFeatures";
import { CirqleQuickReactions, QUICK_REACTIONS, cirqleCopyText, quickReactions } from "./CirqleMessageMenu";

const ROOM = "!room:server";

function message(content: Record<string, unknown>): MatrixEvent {
    return new MatrixEvent({ type: "m.room.message", sender: "@c:server", room_id: ROOM, event_id: "$m", content });
}

describe("CIRQLE message menu", () => {
    let client: MatrixClient;

    beforeEach(() => {
        client = stubClient();
        vi.mocked(client.getRoom).mockReturnValue(null);
        SdkConfig.put({ brand: CIRQLE_BRAND });
    });

    afterEach(() => {
        SdkConfig.reset();
    });

    it("copies a text message's text and a photo's caption, not a file name", () => {
        expect(cirqleCopyText(message({ msgtype: MsgType.Text, body: "Привет" }))).toBe("Привет");
        expect(cirqleCopyText(message({ msgtype: MsgType.Image, body: "look", filename: "IMG_1.jpg" }))).toBe("look");
        expect(
            cirqleCopyText(message({ msgtype: MsgType.Image, body: "IMG_1.jpg", filename: "IMG_1.jpg" })),
        ).toBeUndefined();
        expect(cirqleCopyText(message({ msgtype: MsgType.Text, body: "  " }))).toBeUndefined();
        SdkConfig.reset();
        expect(cirqleCopyText(message({ msgtype: MsgType.Text, body: "hi" }))).toBeUndefined();
    });

    it("offers only the reactions the network takes", () => {
        expect(quickReactions(undefined)).toEqual(QUICK_REACTIONS);
        expect(quickReactions((key) => key === "👍" || key === "🙏")).toEqual(["👍", "🙏"]);
    });

    it("reacts from the row, replacing nothing when there is nothing of ours", () => {
        const event = message({ msgtype: MsgType.Text, body: "hi" });
        const onFinished = vi.fn();
        render(
            <CirqleQuickReactions
                client={client}
                mxEvent={event}
                reactions={null}
                canRedact={true}
                onMore={vi.fn()}
                onFinished={onFinished}
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: "❤️" }));
        expect(client.sendEvent).toHaveBeenCalledWith(ROOM, EventType.Reaction, {
            "m.relates_to": { rel_type: RelationType.Annotation, event_id: "$m", key: "❤️" },
        });
        expect(onFinished).toHaveBeenCalled();
    });

    it("takes back our own reaction when it is picked again", () => {
        const event = message({ msgtype: MsgType.Text, body: "hi" });
        const ours = new MatrixEvent({
            type: EventType.Reaction,
            sender: client.getSafeUserId(),
            room_id: ROOM,
            event_id: "$r",
            content: { "m.relates_to": { rel_type: RelationType.Annotation, event_id: "$m", key: "👍" } },
        });
        const reactions = { getAnnotationsBySender: () => ({ [client.getSafeUserId()]: new Set([ours]) }) } as any;
        render(
            <CirqleQuickReactions
                client={client}
                mxEvent={event}
                reactions={reactions}
                canRedact={true}
                onMore={vi.fn()}
                onFinished={vi.fn()}
            />,
        );
        const thumb = screen.getByRole("button", { name: "👍" });
        expect(thumb).toHaveAttribute("aria-pressed", "true");
        fireEvent.click(thumb);
        expect(client.redactEvent).toHaveBeenCalledWith(ROOM, "$r");
        expect(client.sendEvent).not.toHaveBeenCalled();
    });
});
