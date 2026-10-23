/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// The composer row, WhatsApp style: emoji, + (attach), the input and the
// microphone. Element keeps the voice message button in its "more" menu; here it
// moves next to the input (CSS puts it last and makes it the round green button).

import React, { type ReactNode } from "react";

const VOICE_KEY = "voice_message_send";

export function cirqleComposerButtons(main: ReactNode[], more: ReactNode[]): [ReactNode[], ReactNode[]] {
    const isVoice = (node: ReactNode): boolean => React.isValidElement(node) && node.key === VOICE_KEY;
    const voice = more.find(isVoice);
    if (!React.isValidElement<{ className?: string }>(voice)) return [main, more];
    const mic = React.cloneElement(voice, { className: "mx_MessageComposer_button cirqle_mic" });
    return [[...main, mic], more.filter((node) => !isVoice(node))];
}
