/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// The left column: the chat or channel list, or the New chat, New group or New channel panel in its place.

import React, { type JSX } from "react";

import { CirqleChatList } from "./CirqleChatList";
import { CirqleNewChat } from "./CirqleNewChat";
import { CirqleNewGroup } from "./CirqleNewGroup";
import { CirqleNewChannel } from "./CirqleNewChannel";
import { useCirqleUi } from "./CirqleUiStore";

export function CirqleLeftColumn(): JSX.Element {
    const { section, panel } = useCirqleUi();
    if (panel === "newChat") return <CirqleNewChat />;
    if (panel === "newGroup") return <CirqleNewGroup />;
    if (panel === "newChannel") return <CirqleNewChannel />;
    return <CirqleChatList section={section} />;
}
