/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// @ts-ignore
import Recorder from "opus-recorder/dist/recorder.min.js";
import { useMockMediaDevices } from "test-utils";

import SdkConfig from "../SdkConfig";
import { VoiceRecording } from "../audio/VoiceRecording";
import { createAudioContext } from "../audio/compat";
import { CIRQLE_BRAND } from "./CirqleFeatures";
import {
    cirqleMicProblem,
    isSilentRecording,
    prepareCirqleRecorderContext,
    SILENT_MIC,
    takeCirqleRecorderContext,
} from "./CirqleMic";

vi.mock("opus-recorder/dist/recorder.min.js");
vi.mock("../audio/compat", () => ({ createAudioContext: vi.fn() }));
vi.mock("../MediaDeviceHandler");

function mockContext(): AudioContext {
    return {
        state: "suspended",
        sampleRate: 48000,
        resume: vi.fn().mockResolvedValue(undefined),
        suspend: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        createMediaStreamSource: vi.fn().mockReturnValue({ connect: vi.fn(), disconnect: vi.fn() }),
        createScriptProcessor: vi.fn().mockReturnValue({
            connect: vi.fn(),
            disconnect: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        }),
        destination: {},
    } as unknown as AudioContext;
}

describe("voice messages on a phone (CirqleMic)", () => {
    beforeEach(() => {
        SdkConfig.put({ brand: CIRQLE_BRAND });
    });

    afterEach(() => {
        takeCirqleRecorderContext();
        SdkConfig.reset();
        vi.unstubAllGlobals();
        vi.resetAllMocks();
    });

    it("tells a silent recording (Andrey's of 26.10: levels at zero but the click of the microphone) from speech", () => {
        // 4 s at 16 levels a second, as RecorderWorklet sends them
        const silent = Array.from({ length: 64 }, () => 0.00003);
        silent[8] = 0.027;
        silent[9] = 0.018;
        expect(isSilentRecording(silent)).toBe(true);
        const speech = Array.from({ length: 64 }, (_, i) => (i % 5 === 0 ? 0.001 : 0.05 + (i % 7) / 50));
        expect(isSilentRecording(speech)).toBe(false);
        expect(isSilentRecording([])).toBe(false);
    });

    it("says what is wrong with the microphone by the browser's error", () => {
        expect(cirqleMicProblem(new DOMException("denied", "NotAllowedError")).title).toBe("Microphone access is off");
        expect(cirqleMicProblem(new DOMException("in use", "NotReadableError")).title).toBe("The microphone is busy");
        expect(cirqleMicProblem(new DOMException("none", "NotFoundError")).title).toBe("No microphone found");
        const other = cirqleMicProblem(new TypeError("x"));
        expect(other.title).toBe("Unable to access your microphone");
        expect(other.description).toContain("(TypeError)");
        expect(SILENT_MIC.description).toContain("Nothing was sent");
    });

    it("makes the audio context in the tap, resumed and suspended there, and hands it over once", () => {
        const made: AudioContext[] = [];
        vi.stubGlobal(
            "AudioContext",
            vi.fn(function () {
                const context = mockContext();
                made.push(context);
                return context;
            }),
        );
        prepareCirqleRecorderContext();
        expect(made).toHaveLength(1);
        expect(made[0].resume).toHaveBeenCalled();
        expect(made[0].suspend).toHaveBeenCalled();
        expect(takeCirqleRecorderContext()).toBe(made[0]);
        expect(takeCirqleRecorderContext()).toBeUndefined();
        SdkConfig.reset();
        prepareCirqleRecorderContext();
        expect(made).toHaveLength(1);
    });

    describe("VoiceRecording", () => {
        let track: { stop: ReturnType<typeof vi.fn> };

        beforeEach(() => {
            useMockMediaDevices();
            track = { stop: vi.fn() };
            vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue({
                getTracks: () => [track],
            } as unknown as MediaStream);
        });

        it("records into the context made in the tap", async () => {
            const prepared = mockContext();
            vi.stubGlobal(
                "AudioContext",
                vi.fn(function () {
                    return prepared;
                }),
            );
            vi.mocked(Recorder).prototype.start = vi.fn().mockResolvedValue(undefined);
            prepareCirqleRecorderContext();
            await new VoiceRecording().start();
            expect(createAudioContext).not.toHaveBeenCalled();
            expect(prepared.createMediaStreamSource).toHaveBeenCalled();
        });

        it("lets the microphone go when the recorder fails to start, so iOS does not keep it in use", async () => {
            const context = mockContext();
            vi.mocked(createAudioContext).mockReturnValue(context);
            vi.mocked(Recorder).prototype.start = vi
                .fn()
                .mockRejectedValue(new DOMException("The AudioContext was not allowed to start", "NotAllowedError"));
            vi.mocked(Recorder).prototype.close = vi.fn();
            await expect(new VoiceRecording().start()).rejects.toThrow("not allowed");
            expect(track.stop).toHaveBeenCalled();
            expect(context.close).toHaveBeenCalled();
        });
    });
});
