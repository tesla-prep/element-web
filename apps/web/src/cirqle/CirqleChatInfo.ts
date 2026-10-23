/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// Every way into Element's room settings (the header avatar, a topic's edit
// link) opens the chat's own info panel instead: Contact info, Group info or
// Channel info, where nothing renames the customer's group on WhatsApp.

import { SDKContextClass } from "../contexts/SDKContextClass";
import { RightPanelPhases } from "../stores/right-panel/RightPanelStorePhases";

export function openCirqleChatInfo(roomId?: string): void {
    const sdk = SDKContextClass.instance;
    sdk.rightPanelStore.setCard(
        { phase: RightPanelPhases.RoomSummary },
        true,
        roomId ?? sdk.roomViewStore.getRoomId() ?? undefined,
    );
}
