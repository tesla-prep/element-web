/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// Recording a voice message on a phone. Three things Element leaves to chance:
//
// - the audio context is made inside the tap on the microphone, before the
//   permission prompt: iOS lets a context start only within the tap, and one made
//   once the microphone is open takes whatever rate the capture is running at;
// - a recording that heard nothing (every level at zero: iOS gave the page a
//   silent microphone, as with a Bluetooth headset or screen recording holding it)
//   is not sent as a voice message nobody can hear;
// - the dialog says what is wrong with the microphone, by the browser's error.

import { isCirqleMessenger } from "./CirqleFeatures";

let prepared: AudioContext | undefined;

/**
 * First thing in the tap on the microphone, before anything is awaited. Resumed in
 * the tap, so iOS lets it run later, and suspended at once, so its clock (the
 * recording's time) does not count the permission prompt; the recorder resumes it.
 */
export function prepareCirqleRecorderContext(): void {
    if (!isCirqleMessenger() || !window.AudioContext) return;
    void prepared?.close();
    prepared = new AudioContext();
    prepared.resume().catch(() => {});
    prepared.suspend().catch(() => {});
}

/** The context made in the tap, once; undefined when there is none. */
export function takeCirqleRecorderContext(): AudioContext | undefined {
    const context = prepared;
    prepared = undefined;
    return context?.state === "closed" ? undefined : context;
}

/** About −54 dBFS: speech and a room's own noise reach it, a microphone iOS silenced stays far below. */
export const SILENT_LEVEL = 0.002;

/**
 * The recording's levels (0–1, 16 a second, see RecorderWorklet) stayed under
 * {@link SILENT_LEVEL} nine times out of ten: the click of the microphone
 * switching on does not make a silent recording a voice message.
 */
export function isSilentRecording(amplitudes: number[]): boolean {
    if (!amplitudes.length) return false;
    const sorted = [...amplitudes].sort((a, b) => a - b);
    return sorted[Math.floor((sorted.length - 1) * 0.9)] < SILENT_LEVEL;
}

export interface MicProblem {
    title: string;
    description: string;
}

export const SILENT_MIC: MicProblem = {
    title: "The microphone recorded silence",
    description:
        "Nothing was sent. The phone gave CIRQLE a silent microphone: a call, screen recording with the " +
        "microphone on, or a Bluetooth headset may be holding it. Finish that or disconnect the headset, then try again.",
};

/** What to tell staff when the microphone could not be used, by the browser's error. */
export function cirqleMicProblem(error: unknown): MicProblem {
    const name = error instanceof Error || error instanceof DOMException ? error.name : "";
    switch (name) {
        case "NotAllowedError":
        case "SecurityError":
            return {
                title: "Microphone access is off",
                description:
                    "Allow the microphone for CIRQLE and try again. On iPhone: Settings → Apps → Safari → Microphone " +
                    "(for the app on the Home Screen too), or aA → Website Settings in Safari.",
            };
        case "NotReadableError":
        case "AbortError":
        case "InvalidStateError":
            return {
                title: "The microphone is busy",
                description:
                    "Another app is using it: a call, a voice memo, or screen recording with the microphone on. " +
                    "Finish that and try again.",
            };
        case "NotFoundError":
        case "OverconstrainedError":
            return {
                title: "No microphone found",
                description: "Connect a microphone or check the sound settings, then try again.",
            };
        default:
            return {
                title: "Unable to access your microphone",
                description: `Try again. If it keeps failing, reload CIRQLE.${name ? ` (${name})` : ""}`,
            };
    }
}
