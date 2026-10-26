/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// CIRQLE Messenger on a phone, as WhatsApp is there:
//
// - the phone layout (only the list, or only the open chat) also in landscape,
//   where a phone is wider than 767 px but only some 400 px tall;
// - the keyboard shrinks the app to what is left above it instead of iOS
//   scrolling the whole page away (the app takes the visual viewport's height
//   and follows it when Safari pans);
// - a long press on a message opens its menu (reactions, Reply, Forward, Copy,
//   Delete): iOS never fires `contextmenu` on a touch, and the hover bar Element
//   shows on a tap is a desktop thing.

import { useSyncExternalStore } from "react";

import { DeviceType } from "../utils/device/parseUserAgent";
import { isCirqleMessenger } from "./CirqleFeatures";

/** Same query as the `@media` of `_narrow.pcss`. */
export const CIRQLE_PHONE_QUERY = "(max-width: 767px), (pointer: coarse) and (max-height: 500px)";

/** Phones and tablets: no hover, a finger. */
const TOUCH_QUERY = "(hover: none) and (pointer: coarse)";

/** How long a finger has to rest on a message before its menu opens, and how far it may wander. */
export const LONG_PRESS_MS = 450;
const LONG_PRESS_SLOP_PX = 10;
/** After the menu opened, the lifting finger and Android's own `contextmenu` are not acted on. */
const AFTER_OPEN_MS = 1500;

/** Phones are what staff use besides computers: no "does not support this browser" there. */
export function cirqleSupportsDevice(deviceType: DeviceType): boolean {
    return isCirqleMessenger() && deviceType === DeviceType.Mobile;
}

/** The phone layout of `_narrow.pcss` is on. */
export function useCirqlePhone(): boolean {
    return useSyncExternalStore(
        (onChange) => {
            const query = window.matchMedia(CIRQLE_PHONE_QUERY);
            query.addEventListener("change", onChange);
            return () => query.removeEventListener("change", onChange);
        },
        () => window.matchMedia(CIRQLE_PHONE_QUERY).matches,
    );
}

/** Opened from the home screen icon, not in a browser tab. */
export function isCirqleInstalled(): boolean {
    return (
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
}

/**
 * Sizes the app to the visual viewport: with the keyboard up, what is left above
 * it; Safari's pan to the focused field is followed, so the header stays at the
 * top and only the composer rises. Left alone while the person pinch-zooms.
 *
 * `tallest` keeps, per width, the tallest the viewport has been: the screen
 * without a keyboard. A keyboard takes more than a fifth of it (the browser's
 * own bars come and go by less), and then the home indicator is under it.
 */
export function syncCirqleViewport(
    root: HTMLElement,
    viewport: Pick<VisualViewport, "width" | "height" | "offsetTop" | "scale">,
    tallest = new Map<number, number>(),
): void {
    if (viewport.scale > 1.01) return;
    const width = Math.round(viewport.width);
    const full = Math.max(tallest.get(width) ?? 0, viewport.height);
    tallest.set(width, full);
    root.style.setProperty("--cirqle-app-height", `${Math.round(viewport.height)}px`);
    root.style.setProperty("--cirqle-app-top", `${Math.round(viewport.offsetTop)}px`);
    root.classList.toggle("cirqle_keyboard", viewport.height < full * 0.8);
}

/** A touch screen the app follows the keyboard on (`startCirqleMobile`). */
export function isCirqleTouch(): boolean {
    return isCirqleMessenger() && document.documentElement.classList.contains("cirqle_touch");
}

/**
 * The "jump to the latest message" button on a touch screen leaves the keyboard as
 * it was, as on WhatsApp: a tap on it does not take the focus from the composer
 * (iOS would drop the keyboard and bring it back, and the app follows both), and
 * it does not focus the composer when the keyboard was down.
 */
export function keepCirqleKeyboard(ev: { preventDefault(): void }): void {
    if (isCirqleTouch()) ev.preventDefault();
}

/**
 * On a touch screen the message field of a chat just opened is not focused: that
 * brought the keyboard up over every chat opened, which WhatsApp never does. A
 * tap in the field does; editing a message still focuses its own field.
 */
export function skipsCirqleAutoFocus(field: HTMLElement | null): boolean {
    return isCirqleTouch() && !!field?.closest(".mx_SendMessageComposer");
}

/**
 * On a touch screen the timeline keeps its bottom where it was while the chat
 * changes height, as WhatsApp does: the keyboard coming up or going down (on iOS
 * only the visual viewport, so Element is never told) left the newest messages
 * under the composer, or the view in the middle of a long message. What the
 * person scrolled to is remembered; a change of the panel's own height puts it back.
 */
export function keepCirqleTimelineBottom(panel: HTMLElement): () => void {
    if (!isCirqleTouch() || !panel.classList.contains("mx_RoomView_messagePanel")) return () => {};
    const distance = (): number => panel.scrollHeight - panel.scrollTop - panel.clientHeight;
    let fromBottom = distance();
    let height = panel.clientHeight;
    const onScroll = (): void => {
        if (panel.clientHeight === height) fromBottom = distance();
    };
    const observer = new ResizeObserver(() => {
        if (panel.clientHeight === height) return;
        height = panel.clientHeight;
        panel.scrollTop = panel.scrollHeight - panel.clientHeight - fromBottom;
    });
    panel.addEventListener("scroll", onScroll, { passive: true });
    observer.observe(panel);
    return () => {
        observer.disconnect();
        panel.removeEventListener("scroll", onScroll);
    };
}

/** The element a long press on `target` opens the menu of: a message's line (a link keeps its own menu). */
export function longPressTarget(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof Element)) return null;
    // A link or a control keeps its own touch; the quoted message of a reply is part of the message
    const control = target.closest("a[href], button, input, textarea, [contenteditable='true'], audio, video");
    if (control && !control.closest(".mx_ReplyChain")) return null;
    const tile = target.closest<HTMLElement>(".mx_EventTile");
    if (!tile?.closest(".mx_RoomView_body")) return null;
    return tile.querySelector<HTMLElement>(".mx_EventTile_line") ?? tile;
}

/**
 * A finger resting on a message opens Element's message menu, as a right click
 * does: a `contextmenu` goes to the message's line at the finger. Android fires
 * its own on a long press; whichever comes second is dropped.
 */
export function watchCirqleLongPress(doc: Document = document): () => void {
    let timer: number | undefined;
    let start: { x: number; y: number } | undefined;
    let openedAt = -AFTER_OPEN_MS;

    const cancel = (): void => {
        window.clearTimeout(timer);
        timer = undefined;
        start = undefined;
    };

    const onTouchStart = (ev: TouchEvent): void => {
        cancel();
        if (ev.touches.length !== 1) return;
        const line = longPressTarget(ev.target);
        if (!line) return;
        const touch = ev.touches[0];
        start = { x: touch.clientX, y: touch.clientY };
        timer = window.setTimeout(() => {
            if (!start) return;
            const { x, y } = start;
            cancel();
            openedAt = Date.now();
            navigator.vibrate?.(10);
            line.dispatchEvent(
                new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: x, clientY: y }),
            );
        }, LONG_PRESS_MS);
    };

    const onTouchMove = (ev: TouchEvent): void => {
        if (!start) return;
        const touch = ev.touches[0];
        if (Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > LONG_PRESS_SLOP_PX) cancel();
    };

    const onTouchEnd = (ev: TouchEvent): void => {
        cancel();
        if (Date.now() - openedAt < AFTER_OPEN_MS && ev.cancelable) ev.preventDefault();
    };

    const onContextMenu = (ev: MouseEvent): void => {
        if (!ev.isTrusted) return;
        if (timer !== undefined) {
            cancel();
            openedAt = Date.now();
            return;
        }
        if (Date.now() - openedAt < AFTER_OPEN_MS) {
            ev.preventDefault();
            ev.stopPropagation();
        }
    };

    doc.addEventListener("touchstart", onTouchStart, { passive: true });
    doc.addEventListener("touchmove", onTouchMove, { passive: true });
    doc.addEventListener("touchend", onTouchEnd);
    doc.addEventListener("touchcancel", cancel);
    doc.addEventListener("contextmenu", onContextMenu, true);
    return () => {
        cancel();
        doc.removeEventListener("touchstart", onTouchStart);
        doc.removeEventListener("touchmove", onTouchMove);
        doc.removeEventListener("touchend", onTouchEnd);
        doc.removeEventListener("touchcancel", cancel);
        doc.removeEventListener("contextmenu", onContextMenu, true);
    };
}

/** Once the config is loaded: on touch screens, the app follows the keyboard and a long press opens a message's menu. */
/**
 * On a phone a chat opens on its messages, as in WhatsApp. Element reopens the
 * info panel left open in that chat, and on a phone the panel covers the chat.
 */
export function cirqleChatOpensOnMessages(): boolean {
    return isCirqleMessenger() && window.matchMedia(CIRQLE_PHONE_QUERY).matches;
}

export function startCirqleMobile(): void {
    if (!isCirqleMessenger()) return;
    const root = document.documentElement;
    root.classList.toggle("cirqle_installed", isCirqleInstalled());
    if (!window.matchMedia(TOUCH_QUERY).matches) return;
    root.classList.add("cirqle_touch");
    // oxlint-disable-next-line no-restricted-properties -- UIStore knows the window, not what the keyboard leaves of it
    const viewport = window.visualViewport;
    if (viewport) {
        root.classList.add("cirqle_viewport");
        const tallest = new Map<number, number>();
        const sync = (): void => syncCirqleViewport(root, viewport, tallest);
        viewport.addEventListener("resize", sync);
        viewport.addEventListener("scroll", sync);
        sync();
    }
    watchCirqleLongPress();
}
