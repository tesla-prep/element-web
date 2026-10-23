/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// Recording a voice message, WhatsApp Web style: while it records, the whole
// composer row is this panel (the input and the emoji go away, see _chat.pcss):
// delete, a red dot with the running time, the live waveform and pause. Paused,
// the part recorded so far plays back and the microphone continues it. The send
// button beside the panel is the composer's own.

import React, { type JSX } from "react";
import { MediaBody } from "@element-hq/web-shared-components";
import { DeleteIcon, MicOnSolidIcon, PauseSolidIcon } from "@vector-im/compound-design-tokens/assets/web/icons";

import { RecordingState } from "../audio/VoiceRecording";
import { type VoiceMessageRecording } from "../audio/VoiceMessageRecording";
import LiveRecordingClock from "../components/views/audio_messages/LiveRecordingClock";
import LiveRecordingWaveform from "../components/views/audio_messages/LiveRecordingWaveform";
import RecordingPlayback, { PlaybackLayout } from "../components/views/audio_messages/RecordingPlayback";
import InlineSpinner from "../components/views/elements/InlineSpinner";

interface Props {
    recorder: VoiceMessageRecording;
    phase: RecordingState;
    uploadFailed: boolean;
    onDelete: () => void;
    onPause: () => void;
    onResume: () => void;
}

export function CirqleVoiceRecorder({
    recorder,
    phase,
    uploadFailed,
    onDelete,
    onPause,
    onResume,
}: Props): JSX.Element {
    const uploading = phase === RecordingState.Uploading;
    const live = phase === RecordingState.Started;

    return (
        <div className="cirqle_VoiceRecorder" role="group" aria-label="Voice message">
            <button
                type="button"
                className="cirqle_VoiceRecorder_button"
                aria-label="Delete voice message"
                disabled={uploading}
                onClick={onDelete}
            >
                <DeleteIcon />
            </button>
            {live ? (
                <MediaBody className="mx_VoiceMessagePrimaryContainer cirqle_VoiceRecorder_live">
                    <span className="cirqle_VoiceRecorder_dot" aria-hidden />
                    <LiveRecordingClock recorder={recorder} />
                    <LiveRecordingWaveform recorder={recorder} />
                </MediaBody>
            ) : (
                <RecordingPlayback playback={recorder.getPlayback()} layout={PlaybackLayout.Composer} />
            )}
            {uploading && <InlineSpinner size={20} />}
            {uploadFailed && !uploading && (
                <span className="cirqle_VoiceRecorder_failed" role="status">
                    Not sent, try again
                </span>
            )}
            {live && (
                <button
                    type="button"
                    className="cirqle_VoiceRecorder_button cirqle_VoiceRecorder_red"
                    aria-label="Pause"
                    onClick={onPause}
                >
                    <PauseSolidIcon />
                </button>
            )}
            {phase === RecordingState.Paused && (
                <button
                    type="button"
                    className="cirqle_VoiceRecorder_button cirqle_VoiceRecorder_red"
                    aria-label="Continue recording"
                    onClick={onResume}
                >
                    <MicOnSolidIcon />
                </button>
            )}
        </div>
    );
}
