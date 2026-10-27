/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// A voice message's waveform as WhatsApp and Telegram draw it: no seek dot, the bars
// fill in as the message plays (the one playing fills part way), and a click, a tap
// or a finger dragged along the waveform moves playback there. The range input
// Element puts over the waveform stays for the keyboard (arrows skip 5 s), but takes
// no pointer: on iOS a range input moves only by its thumb, which is gone.

import type React from "react";
import { clamp } from "@element-hq/web-shared-components";

import { type Playback } from "../audio/Playback";

/** How much of bar `index` of `count` is played, 0 to 1, at `progress` (0 to 1) through the message. */
export function cirqleBarFill(progress: number, index: number, count: number): number {
    if (!(progress > 0) || count === 0) return 0;
    return Number(clamp(progress * count - index, 0, 1).toFixed(3));
}

/** Where along the waveform a pointer is, 0 to 1. */
export function waveformFraction(clientX: number, rect: Pick<DOMRect, "left" | "width">): number {
    if (rect.width <= 0) return 0;
    return clamp((clientX - rect.left) / rect.width, 0, 1);
}

type SeekProps = Pick<
    React.HTMLAttributes<HTMLDivElement>,
    "onPointerDown" | "onPointerMove" | "onPointerUp" | "onPointerCancel" | "onMouseDown"
>;

/** Pointer handlers for the waveform: press to jump there, drag to scrub. */
export function cirqleWaveformSeek(playback: Playback): SeekProps {
    const seek = (ev: React.PointerEvent<HTMLDivElement>): void => {
        const fraction = waveformFraction(ev.clientX, ev.currentTarget.getBoundingClientRect());
        void playback.skipTo(fraction * playback.durationSeconds);
    };
    const release = (ev: React.PointerEvent<HTMLDivElement>): void => {
        if (ev.currentTarget.hasPointerCapture?.(ev.pointerId)) ev.currentTarget.releasePointerCapture(ev.pointerId);
    };
    return {
        onPointerDown: (ev) => {
            if (ev.button !== 0) return;
            ev.stopPropagation();
            ev.currentTarget.setPointerCapture?.(ev.pointerId);
            seek(ev);
        },
        onPointerMove: (ev) => {
            if (ev.currentTarget.hasPointerCapture?.(ev.pointerId)) seek(ev);
        },
        onPointerUp: release,
        onPointerCancel: release,
        // as Element's seek bar does: a press on the waveform is not a press on the message
        onMouseDown: (ev) => ev.stopPropagation(),
    };
}
