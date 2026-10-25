/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SdkConfig from "../SdkConfig";
import SettingsStore from "../settings/SettingsStore";
import { SettingLevel } from "../settings/SettingLevel";
import { CallStore } from "../stores/CallStore";
import UIStore from "../stores/UIStore";
import { ResizerViewModel } from "../viewmodels/structures/ResizerViewModel";
import { DisambiguatedProfileViewModel } from "../viewmodels/room/timeline/event-tile/DisambiguatedProfileViewModel";
import { getBrowserSupport } from "../SupportedBrowser";
import { DeviceType } from "../utils/device/parseUserAgent";
import { CIRQLE_BRAND } from "./CirqleFeatures";
import {
    LONG_PRESS_MS,
    cirqleSupportsDevice,
    longPressTarget,
    syncCirqleViewport,
    watchCirqleLongPress,
} from "./CirqleMobile";

const IPHONE =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";

function timeline(): { tile: HTMLElement; line: HTMLElement; link: HTMLAnchorElement } {
    document.body.innerHTML = `
        <div class="mx_RoomView_body">
            <li class="mx_EventTile"><div class="mx_EventTile_line"><blockquote class="mx_ReplyChain"><a href="#q" class="quote">quoted</a></blockquote><span class="text">hi</span><a href="#">link</a></div></li>
        </div>`;
    return {
        tile: document.querySelector(".mx_EventTile")!,
        line: document.querySelector(".mx_EventTile_line")!,
        link: document.querySelector("a:not(.quote)")!,
    };
}

function touch(target: Element, type: string, x = 10, y = 10): void {
    const ev = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(ev, "touches", { value: type === "touchend" ? [] : [{ clientX: x, clientY: y }] });
    target.dispatchEvent(ev);
}

describe("CIRQLE on phones", () => {
    beforeEach(() => {
        SdkConfig.put({ brand: CIRQLE_BRAND });
    });

    afterEach(() => {
        SdkConfig.reset();
        SettingsStore.reset();
        localStorage.clear();
        vi.useRealTimers();
        vi.restoreAllMocks();
        document.body.innerHTML = "";
    });

    it("takes phones as a supported browser, stock Element does not", () => {
        expect(cirqleSupportsDevice(DeviceType.Mobile)).toBe(true);
        expect(cirqleSupportsDevice(DeviceType.Desktop)).toBe(false);
        SdkConfig.reset();
        expect(cirqleSupportsDevice(DeviceType.Mobile)).toBe(false);
    });

    it("has no 'does not support this browser' on an iPhone", () => {
        vi.spyOn(navigator, "userAgent", "get").mockReturnValue(IPHONE);
        getBrowserSupport.clear?.();
        expect(getBrowserSupport()).toBe(true);
    });

    it("never collapses the chat list, whatever the width or the saved setting", () => {
        SettingsStore.setValue("RoomList.isPanelCollapsed", null, SettingLevel.DEVICE, true);
        vi.spyOn(UIStore.instance, "windowWidth", "get").mockReturnValue(768);
        const vm = new ResizerViewModel(CallStore.instance);
        expect(vm.getSnapshot().isCollapsed).toBe(false);
        const collapse = vi.fn();
        vm.setPanelHandle({ collapse, isCollapsed: () => false } as any);
        vm.onDoubleClick();
        expect(collapse).not.toHaveBeenCalled();
        vm.dispose();
    });

    it("names a sender without the Matrix ID, even when two have the same name", () => {
        const vm = new DisambiguatedProfileViewModel({
            fallbackName: "Andrey",
            member: {
                userId: "@whatsapp_lid-13035913650214:matrix.cirqlecirqle.com",
                roomId: "!r:s",
                rawDisplayName: "Andrey",
                disambiguate: true,
            },
        });
        expect(vm.getSnapshot().displayName).toBe("Andrey");
        expect(vm.getSnapshot().displayIdentifier).toBeUndefined();
    });

    it("sizes the app to what the keyboard leaves, and not while zoomed in", () => {
        const root = document.createElement("div");
        const tallest = new Map<number, number>();
        syncCirqleViewport(root, { width: 390, height: 844, offsetTop: 0, scale: 1 }, tallest);
        expect(root.classList.contains("cirqle_keyboard")).toBe(false);
        syncCirqleViewport(root, { width: 390, height: 412.4, offsetTop: 120, scale: 1 }, tallest);
        expect(root.style.getPropertyValue("--cirqle-app-height")).toBe("412px");
        expect(root.style.getPropertyValue("--cirqle-app-top")).toBe("120px");
        expect(root.classList.contains("cirqle_keyboard")).toBe(true);
        syncCirqleViewport(root, { width: 390, height: 200, offsetTop: 300, scale: 2 }, tallest);
        expect(root.style.getPropertyValue("--cirqle-app-height")).toBe("412px");
        // Safari's toolbar hiding is not a keyboard
        syncCirqleViewport(root, { width: 390, height: 780, offsetTop: 0, scale: 1 }, tallest);
        expect(root.classList.contains("cirqle_keyboard")).toBe(false);
        // Turned sideways: a new full height
        syncCirqleViewport(root, { width: 844, height: 360, offsetTop: 0, scale: 1 }, tallest);
        expect(root.classList.contains("cirqle_keyboard")).toBe(false);
    });

    it("opens a message's menu on a long press, not on a link or outside the timeline", () => {
        const { line, link } = timeline();
        expect(longPressTarget(line.querySelector(".text"))).toBe(line);
        expect(longPressTarget(line.querySelector(".quote"))).toBe(line);
        expect(longPressTarget(link)).toBeNull();
        expect(longPressTarget(document.body)).toBeNull();
    });

    it("sends a contextmenu to the message after the finger rests on it", () => {
        vi.useFakeTimers();
        const { line } = timeline();
        const onMenu = vi.fn((ev: MouseEvent) => [ev.clientX, ev.clientY]);
        line.addEventListener("contextmenu", onMenu);
        const stop = watchCirqleLongPress(document);

        touch(line.querySelector(".text")!, "touchstart", 40, 50);
        vi.advanceTimersByTime(LONG_PRESS_MS - 50);
        expect(onMenu).not.toHaveBeenCalled();
        vi.advanceTimersByTime(100);
        expect(onMenu).toHaveBeenCalledTimes(1);
        expect(onMenu.mock.results[0].value).toEqual([40, 50]);
        stop();
    });

    it("lets a scroll or a short tap through", () => {
        vi.useFakeTimers();
        const { line } = timeline();
        const onMenu = vi.fn();
        line.addEventListener("contextmenu", onMenu);
        const stop = watchCirqleLongPress(document);

        touch(line, "touchstart", 10, 10);
        touch(line, "touchmove", 10, 60);
        vi.advanceTimersByTime(LONG_PRESS_MS * 2);
        touch(line, "touchstart", 10, 10);
        touch(line, "touchend");
        vi.advanceTimersByTime(LONG_PRESS_MS * 2);
        expect(onMenu).not.toHaveBeenCalled();
        stop();
    });
});
