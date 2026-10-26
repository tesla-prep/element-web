/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// @vitest-environment happy-dom

import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MatrixEvent } from "matrix-js-sdk/src/matrix";
import { fireEvent, render } from "test-utils-rtl";

import SdkConfig from "../SdkConfig";
import JumpToBottomButton from "../components/views/rooms/JumpToBottomButton";
import { MessageTimestampViewModel } from "../viewmodels/room/timeline/event-tile/timestamp/MessageTimestampViewModel";
import { CIRQLE_BRAND } from "./CirqleFeatures";
import { keepCirqleKeyboard, keepCirqleTimelineBottom, skipsCirqleAutoFocus } from "./CirqleMobile";
import { isRoundVideo } from "./CirqleTimeline";

/** A scroll panel whose sizes the test sets, as happy-dom lays nothing out. */
function panel(scrollHeight: number, clientHeight: number, scrollTop: number): HTMLElement {
    const el = document.createElement("div");
    el.className = "mx_RoomView_messagePanel";
    let height = clientHeight;
    Object.defineProperty(el, "scrollHeight", { get: () => scrollHeight });
    Object.defineProperty(el, "clientHeight", { get: () => height, set: (h) => (height = h) });
    el.scrollTop = scrollTop;
    Object.defineProperty(el, "scrollTop", { value: scrollTop, writable: true });
    return el;
}

describe("the timeline on a phone", () => {
    let resized: (() => void) | undefined;

    beforeEach(() => {
        SdkConfig.put({ brand: CIRQLE_BRAND });
        document.documentElement.classList.add("cirqle_touch");
        vi.stubGlobal(
            "ResizeObserver",
            class {
                public constructor(cb: () => void) {
                    resized = cb;
                }
                public observe(): void {}
                public disconnect(): void {}
            },
        );
    });

    afterEach(() => {
        SdkConfig.reset();
        document.documentElement.classList.remove("cirqle_touch");
        vi.unstubAllGlobals();
        resized = undefined;
    });

    it("keeps the newest message above the composer when the keyboard comes up and goes down", () => {
        const el = panel(1600, 705, 895); // at the bottom
        const stop = keepCirqleTimelineBottom(el);
        (el as any).clientHeight = 321; // the keyboard came up
        resized!();
        expect(el.scrollTop).toBe(1600 - 321);
        // the person scrolls up 200 px, then the keyboard goes down
        el.scrollTop = 1600 - 321 - 200;
        el.dispatchEvent(new Event("scroll"));
        (el as any).clientHeight = 705;
        resized!();
        expect(el.scrollTop).toBe(1600 - 705 - 200);
        stop();
    });

    it("leaves other scroll panels and computers alone", () => {
        const list = panel(1000, 500, 0);
        list.className = "mx_SpaceHierarchy_list";
        keepCirqleTimelineBottom(list);
        expect(resized).toBeUndefined();
        document.documentElement.classList.remove("cirqle_touch");
        keepCirqleTimelineBottom(panel(1000, 500, 0));
        expect(resized).toBeUndefined();
    });

    it("does not take the focus from the composer on a tap of the jump-to-bottom button", () => {
        const onClick = vi.fn();
        const { container } = render(<JumpToBottomButton highlight={false} onScrollToBottomClick={onClick} />);
        const button = container.querySelector(".mx_JumpToBottomButton_scrollDown")!;
        expect(fireEvent.mouseDown(button)).toBe(false); // default prevented: the focus stays
        fireEvent.click(button);
        expect(onClick).toHaveBeenCalled();
        document.documentElement.classList.remove("cirqle_touch");
        expect(fireEvent.mouseDown(button)).toBe(true);
        const ev = { preventDefault: vi.fn() };
        keepCirqleKeyboard(ev);
        expect(ev.preventDefault).not.toHaveBeenCalled();
    });

    it("does not focus the message field of a chat just opened, but does an edit's", () => {
        document.body.innerHTML = `<div class="mx_SendMessageComposer"><div id="send"></div></div>
            <div class="mx_EditMessageComposer"><div id="edit"></div></div>`;
        expect(skipsCirqleAutoFocus(document.getElementById("send"))).toBe(true);
        expect(skipsCirqleAutoFocus(document.getElementById("edit"))).toBe(false);
        document.documentElement.classList.remove("cirqle_touch");
        expect(skipsCirqleAutoFocus(document.getElementById("send"))).toBe(false);
        document.body.innerHTML = "";
    });

    it("shows no full-date tooltip on a tap", () => {
        const vm = new MessageTimestampViewModel({ ts: 1_790_000_000_000 });
        expect(vm.getSnapshot().inhibitTooltip).toBe(true);
        document.documentElement.classList.remove("cirqle_touch");
        expect(new MessageTimestampViewModel({ ts: 1_790_000_000_000 }).getSnapshot().inhibitTooltip).toBeFalsy();
    });

    it("knows Telegram's round video message", () => {
        const video = (info: object): MatrixEvent =>
            new MatrixEvent({ type: "m.room.message", content: { msgtype: "m.video", body: "v.mp4", info } });
        expect(isRoundVideo(video({ "fi.mau.telegram.round_message": true, "w": 384, "h": 384 }))).toBe(true);
        expect(isRoundVideo(video({ w: 1280, h: 720 }))).toBe(false);
    });
});
