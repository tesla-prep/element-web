/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// The left column: the chat or channel list, or the New chat or New group panel in its place.

import React, { type JSX } from "react";

import { CirqleChatList } from "./CirqleChatList";
import { CirqleNewChat } from "./CirqleNewChat";
import { CirqleNewGroup } from "./CirqleNewGroup";
import { useCirqleUi } from "./CirqleUiStore";

export function CirqleLeftColumn(): JSX.Element {
    const { section, panel } = useCirqleUi();
    if (panel === "newChat") return <CirqleNewChat />;
    if (panel === "newGroup") return <CirqleNewGroup />;
    return <CirqleChatList section={section} />;
}
