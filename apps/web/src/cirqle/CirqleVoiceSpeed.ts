/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// Voice message speed, as on WhatsApp: 1× → 1.5× → 2× → 1×, kept for every voice
// message in this browser. The button is CirqleVoiceSpeedButton.

const SPEED_KEY = "cirqle_voice_speed";
export const VOICE_SPEEDS = [1, 1.5, 2];

export function cirqleVoiceSpeed(): number {
    const speed = Number(localStorage.getItem(SPEED_KEY));
    return VOICE_SPEEDS.includes(speed) ? speed : 1;
}

/** Moves to the next speed, keeps it and returns it. */
export function cycleCirqleVoiceSpeed(): number {
    const next = VOICE_SPEEDS[(VOICE_SPEEDS.indexOf(cirqleVoiceSpeed()) + 1) % VOICE_SPEEDS.length];
    localStorage.setItem(SPEED_KEY, String(next));
    return next;
}
