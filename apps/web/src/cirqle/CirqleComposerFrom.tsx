/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// Over the message field: the number a message goes out from, in its messenger's
// colour, so staff see which number they write from, under All numbers too.

import React, { type JSX } from "react";
import { type Room } from "matrix-js-sdk/src/matrix";

import { inboxesOf } from "./CirqleInboxes";
import { useCirqleInboxes } from "./useCirqleChats";

export function CirqleComposerFrom({ room }: { room: Room }): JSX.Element | null {
    const own = inboxesOf(room, useCirqleInboxes()).filter((inbox) => inbox.connected);
    if (!own.length) return null;
    return (
        <div className="cirqle_ComposerFrom" title="You write from this number">
            {own.map((inbox) => (
                <span key={inbox.spaceId} className={`cirqle_ComposerFrom_number cirqle_ComposerFrom_${inbox.network}`}>
                    <span className={`cirqle_dot cirqle_dot_${inbox.network}`} />
                    {[inbox.label, inbox.phone].filter(Boolean).join(" · ")}
                </span>
            ))}
        </div>
    );
}
