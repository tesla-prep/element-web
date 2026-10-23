/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// @vitest-environment happy-dom

import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "test-utils-rtl";
import { SimpleObservable } from "matrix-widget-api";

import { type IRecordingUpdate, RecordingState, VoiceRecording } from "../audio/VoiceRecording";
import { type VoiceMessageRecording } from "../audio/VoiceMessageRecording";
import { Playback } from "../audio/Playback";
import { createAudioContext } from "../audio/compat";
import { UPDATE_EVENT } from "../stores/AsyncStore";
import { CirqleVoiceRecorder } from "./CirqleVoiceRecorder";

vi.mock("../audio/compat", () => ({
    createAudioContext: vi.fn(),
    decodeOgg: vi.fn().mockResolvedValue({}),
}));

vi.mock("../WorkerManager", () => ({
    WorkerManager: vi.fn(function () {
        return { call: vi.fn().mockResolvedValue({ waveform: [0, 1] }) };
    }),
}));

function fakeRecorder(): VoiceMessageRecording {
    const liveData = new SimpleObservable<IRecordingUpdate>();
    const playback = new Playback(new ArrayBuffer(8), [0.2, 0.8]);
    return { liveData, isPaused: false, getPlayback: () => playback } as unknown as VoiceMessageRecording;
}

describe("CirqleVoiceRecorder", () => {
    const handlers = { onDelete: vi.fn(), onPause: vi.fn(), onResume: vi.fn() };

    beforeEach(() => {
        vi.mocked(createAudioContext).mockReturnValue({
            decodeAudioData: vi.fn().mockResolvedValue({ duration: 4, getChannelData: () => new Float32Array() }),
            suspend: vi.fn(),
            resume: vi.fn(),
            currentTime: 0,
        } as unknown as AudioContext);
        Object.values(handlers).forEach((fn) => fn.mockClear());
    });

    it("records with delete, a red dot, the time, the waveform and pause", () => {
        const { container } = render(
            <CirqleVoiceRecorder
                recorder={fakeRecorder()}
                phase={RecordingState.Started}
                uploadFailed={false}
                {...handlers}
            />,
        );
        expect(screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual([
            "Delete voice message",
            "Pause",
        ]);
        expect(container.querySelector(".cirqle_VoiceRecorder_dot")).not.toBeNull();
        expect(container.querySelector(".mx_Clock")?.textContent).toBe("00:00");
        expect(container.querySelector(".mx_Waveform")).not.toBeNull();

        fireEvent.click(screen.getByRole("button", { name: "Pause" }));
        expect(handlers.onPause).toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "Delete voice message" }));
        expect(handlers.onDelete).toHaveBeenCalled();
    });

    it("plays back what was recorded while paused and continues it from the microphone", () => {
        const { container } = render(
            <CirqleVoiceRecorder
                recorder={fakeRecorder()}
                phase={RecordingState.Paused}
                uploadFailed={false}
                {...handlers}
            />,
        );
        expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
        expect(container.querySelector(".cirqle_VoiceRecorder_dot")).toBeNull();
        expect(screen.queryByRole("button", { name: "Pause" })).toBeNull();

        fireEvent.click(screen.getByRole("button", { name: "Continue recording" }));
        expect(handlers.onResume).toHaveBeenCalled();
    });

    it("offers no way to continue once the recording has ended", () => {
        render(
            <CirqleVoiceRecorder
                recorder={fakeRecorder()}
                phase={RecordingState.Ended}
                uploadFailed={false}
                {...handlers}
            />,
        );
        expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Continue recording" })).toBeNull();
    });

    it("keeps delete away while uploading and says so when the upload failed", () => {
        const { rerender } = render(
            <CirqleVoiceRecorder
                recorder={fakeRecorder()}
                phase={RecordingState.Uploading}
                uploadFailed={false}
                {...handlers}
            />,
        );
        expect(screen.getByRole("button", { name: "Delete voice message" })).toHaveProperty("disabled", true);

        rerender(
            <CirqleVoiceRecorder
                recorder={fakeRecorder()}
                phase={RecordingState.Ended}
                uploadFailed={true}
                {...handlers}
            />,
        );
        expect(screen.getByRole("status").textContent).toBe("Not sent, try again");
    });
});

describe("pausing a voice recording", () => {
    let recording: VoiceRecording;
    let recorder: { pause: ReturnType<typeof vi.fn>; resume: ReturnType<typeof vi.fn> };
    let context: { suspend: ReturnType<typeof vi.fn>; resume: ReturnType<typeof vi.fn> };
    let states: string[];

    beforeEach(() => {
        recording = new VoiceRecording();
        recorder = { pause: vi.fn().mockResolvedValue(undefined), resume: vi.fn() };
        context = { suspend: vi.fn().mockResolvedValue(undefined), resume: vi.fn().mockResolvedValue(undefined) };
        Object.assign(recording, { recorder, recorderContext: context, recording: true });
        states = [];
        recording.on(UPDATE_EVENT, (state: string) => states.push(state));
    });

    it("flushes what was encoded and stops the clock, then adds to the same message", async () => {
        await recording.pause();
        expect(recorder.pause).toHaveBeenCalledWith(true);
        expect(context.suspend).toHaveBeenCalled();
        expect(recording.isPaused).toBe(true);
        expect(recording.isRecording).toBe(true);

        await recording.resume();
        expect(context.resume).toHaveBeenCalled();
        expect(recorder.resume).toHaveBeenCalled();
        expect(recording.isPaused).toBe(false);
        expect(states).toEqual([RecordingState.Paused, RecordingState.Started]);
    });

    it("does nothing when there is no recording or it is already paused", async () => {
        await recording.resume();
        expect(recorder.resume).not.toHaveBeenCalled();
        await recording.pause();
        await recording.pause();
        expect(recorder.pause).toHaveBeenCalledTimes(1);

        Object.assign(recording, { recording: false, paused: false });
        await recording.pause();
        expect(recorder.pause).toHaveBeenCalledTimes(1);
    });
});
