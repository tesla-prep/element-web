/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// @vitest-environment happy-dom

import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "test-utils-rtl";

import SdkConfig from "../SdkConfig";
import { Playback, PlaybackState } from "../audio/Playback";
import { createAudioContext } from "../audio/compat";
import { CIRQLE_BRAND } from "./CirqleFeatures";
import { cirqleVoiceSpeed, cycleCirqleVoiceSpeed } from "./CirqleVoiceSpeed";
import { CirqleVoiceSpeedButton } from "./CirqleVoiceSpeedButton";

vi.mock("../audio/compat", () => ({
    createAudioContext: vi.fn(),
    decodeOgg: vi.fn(),
}));

vi.mock("../WorkerManager", () => ({
    WorkerManager: vi.fn(function () {
        return { call: vi.fn().mockResolvedValue({ waveform: [0, 1] }) };
    }),
}));

describe("voice message speed", () => {
    beforeEach(() => localStorage.removeItem("cirqle_voice_speed"));

    it("goes 1× → 1.5× → 2× → 1× and stays for the next voice message", () => {
        expect(cirqleVoiceSpeed()).toBe(1);
        expect(cycleCirqleVoiceSpeed()).toBe(1.5);
        expect(cycleCirqleVoiceSpeed()).toBe(2);
        expect(cirqleVoiceSpeed()).toBe(2);
        expect(cycleCirqleVoiceSpeed()).toBe(1);
    });

    it("plays at 1× when the stored speed is not one it offers", () => {
        localStorage.setItem("cirqle_voice_speed", "3");
        expect(cirqleVoiceSpeed()).toBe(1);
    });

    it("shows the button only while the message plays or is paused part way, and speeds it up", () => {
        const setPlaybackRate = vi.fn();
        const playback = { setPlaybackRate } as unknown as Playback;
        const { rerender } = render(<CirqleVoiceSpeedButton playback={playback} phase={PlaybackState.Stopped} />);
        expect(screen.queryByRole("button")).toBeNull();

        rerender(<CirqleVoiceSpeedButton playback={playback} phase={PlaybackState.Playing} />);
        fireEvent.click(screen.getByRole("button", { name: "Playback speed 1×" }));
        expect(screen.getByRole("button").textContent).toBe("1.5×");
        expect(setPlaybackRate).toHaveBeenCalledWith(1.5);

        rerender(<CirqleVoiceSpeedButton playback={playback} phase={PlaybackState.Paused} />);
        expect(screen.getByRole("button").textContent).toBe("1.5×");
    });
});

describe("a voice message in CIRQLE plays through an audio element", () => {
    let play: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        SdkConfig.put({ brand: CIRQLE_BRAND });
        localStorage.setItem("cirqle_voice_speed", "1.5");
        vi.mocked(createAudioContext).mockReturnValue({
            decodeAudioData: vi.fn().mockResolvedValue({ duration: 20, getChannelData: () => new Float32Array(4) }),
            suspend: vi.fn(),
            resume: vi.fn(),
            currentTime: 0,
        } as unknown as AudioContext);
        play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
        vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    });

    afterEach(() => {
        SdkConfig.reset();
        localStorage.removeItem("cirqle_voice_speed");
        vi.restoreAllMocks();
    });

    async function prepared(): Promise<{ playback: Playback; element: HTMLAudioElement }> {
        const playback = new Playback(new ArrayBuffer(16));
        await playback.prepare();
        const element = (playback as unknown as { element: HTMLAudioElement }).element;
        return { playback, element };
    }

    it("plays at the chosen speed, keeping the pitch", async () => {
        const { playback, element } = await prepared();
        expect(playback.durationSeconds).toBe(20);
        await playback.play();
        expect(play).toHaveBeenCalled();
        expect(element.playbackRate).toBe(1.5);
        expect(element.preservesPitch).not.toBe(false);
        expect(playback.currentState).toBe(PlaybackState.Playing);

        playback.setPlaybackRate(2);
        expect(element.playbackRate).toBe(2);
    });

    it("seeks to where the waveform was clicked and reads the time from the element", async () => {
        const { playback, element } = await prepared();
        await playback.skipTo(12);
        expect(element.currentTime).toBe(12);
        expect(playback.timeSeconds).toBe(12);
        expect(playback.currentState).toBe(PlaybackState.Paused);

        await playback.skipTo(99);
        expect(element.currentTime).toBe(20);
    });

    it("goes back to the start when the message ends", async () => {
        const { playback, element } = await prepared();
        await playback.play();
        element.currentTime = 20;
        element.dispatchEvent(new Event("ended"));
        await Promise.resolve();
        expect(playback.currentState).toBe(PlaybackState.Stopped);
        expect(element.currentTime).toBe(0);
    });
});
