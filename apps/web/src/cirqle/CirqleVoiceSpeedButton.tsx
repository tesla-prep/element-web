/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// The speed button on a voice message, as on WhatsApp: it shows while the message
// plays or is paused part way, in the timeline and in the recorder.

import React, { type JSX, useState } from "react";

import { type Playback, PlaybackState } from "../audio/Playback";
import { cirqleVoiceSpeed, cycleCirqleVoiceSpeed } from "./CirqleVoiceSpeed";

export function CirqleVoiceSpeedButton({
    playback,
    phase,
}: {
    playback: Playback;
    phase: PlaybackState;
}): JSX.Element | null {
    const [, setSpeed] = useState(cirqleVoiceSpeed);
    if (phase !== PlaybackState.Playing && phase !== PlaybackState.Paused) return null;

    const speed = cirqleVoiceSpeed();
    const onClick = (): void => {
        const next = cycleCirqleVoiceSpeed();
        playback.setPlaybackRate(next);
        setSpeed(next);
    };
    return (
        <button type="button" className="cirqle_VoiceSpeed" aria-label={`Playback speed ${speed}×`} onClick={onClick}>
            {speed}×
        </button>
    );
}
