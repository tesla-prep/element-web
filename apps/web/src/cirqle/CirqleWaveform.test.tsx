/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// @vitest-environment happy-dom

import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "test-utils-rtl";

import SdkConfig from "../SdkConfig";
import { type Playback } from "../audio/Playback";
import Waveform from "../components/views/audio_messages/Waveform";
import { CIRQLE_BRAND } from "./CirqleFeatures";
import { cirqleBarFill, cirqleWaveformSeek, waveformFraction } from "./CirqleWaveform";

const fills = (container: HTMLElement): string[] =>
    [...container.querySelectorAll<HTMLElement>(".mx_Waveform_bar")].map((bar) => bar.style.getPropertyValue("--fill"));

describe("the voice waveform fills as it plays", () => {
    it("leaves every bar grey before it plays and after it ends", () => {
        expect([0, 1, 2, 3].map((i) => cirqleBarFill(0, i, 4))).toEqual([0, 0, 0, 0]);
    });

    it("fills the played bars and the playing one part way", () => {
        expect([0, 1, 2, 3].map((i) => cirqleBarFill(0.6, i, 4))).toEqual([1, 1, 0.4, 0]);
        expect([0, 1, 2, 3].map((i) => cirqleBarFill(1, i, 4))).toEqual([1, 1, 1, 1]);
    });

    describe("in the CIRQLE build", () => {
        beforeEach(() => SdkConfig.put({ brand: CIRQLE_BRAND }));
        afterEach(() => SdkConfig.reset());

        it("gives each bar its fill", () => {
            const { container, rerender } = render(<Waveform relHeights={[0, 0.5, 1, 0.2]} progress={0} />);
            expect(fills(container)).toEqual(["0", "0", "0", "0"]);
            rerender(<Waveform relHeights={[0, 0.5, 1, 0.2]} progress={0.3} />);
            expect(fills(container)).toEqual(["1", "0.2", "0", "0"]);
        });
    });

    it("leaves stock Element's waveform as it was", () => {
        const { container } = render(<Waveform relHeights={[0, 1]} progress={0.5} />);
        expect(fills(container)).toEqual(["", ""]);
    });
});

describe("seeking on the waveform", () => {
    const rect = { left: 100, width: 200, top: 0, height: 30, right: 300, bottom: 30, x: 100, y: 0 };

    it("reads where the pointer is along it", () => {
        expect(waveformFraction(200, rect)).toBe(0.5);
        expect(waveformFraction(50, rect)).toBe(0);
        expect(waveformFraction(400, rect)).toBe(1);
    });

    it("jumps where it is pressed and follows a drag until it lets go", () => {
        const skipTo = vi.fn().mockResolvedValue(undefined);
        const playback = { skipTo, durationSeconds: 40 } as unknown as Playback;
        const parentDown = vi.fn();
        const { container } = render(
            <div onPointerDown={parentDown}>
                <div data-testid="wave" {...cirqleWaveformSeek(playback)} />
            </div>,
        );
        const wave = container.querySelector<HTMLElement>("[data-testid=wave]")!;
        wave.getBoundingClientRect = () => rect as DOMRect;
        let captured = false;
        wave.setPointerCapture = () => (captured = true);
        wave.hasPointerCapture = () => captured;
        wave.releasePointerCapture = () => (captured = false);

        fireEvent.pointerMove(wave, { clientX: 150, pointerId: 1 });
        expect(skipTo).not.toHaveBeenCalled();

        fireEvent.pointerDown(wave, { clientX: 200, pointerId: 1, button: 0 });
        expect(skipTo).toHaveBeenLastCalledWith(20);
        expect(parentDown).not.toHaveBeenCalled();

        fireEvent.pointerMove(wave, { clientX: 250, pointerId: 1 });
        expect(skipTo).toHaveBeenLastCalledWith(30);

        fireEvent.pointerUp(wave, { clientX: 250, pointerId: 1 });
        fireEvent.pointerMove(wave, { clientX: 120, pointerId: 1 });
        expect(skipTo).toHaveBeenCalledTimes(2);
    });
});
