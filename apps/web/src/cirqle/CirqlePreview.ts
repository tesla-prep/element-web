/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// The line under a chat's name, as on WhatsApp: the last message that moved the
// chat (see CirqleActivity), never a bot's notice. "You: " for our own messages,
// the staff member's name for a colleague's, the sender's short name in groups,
// nothing in a private chat; photos, voice and files get an icon and a word.

import { EventType, M_POLL_START, type MatrixEvent, MsgType, type Room } from "matrix-js-sdk/src/matrix";

import { MessagePreviewStore } from "../stores/message-preview/MessagePreviewStore";
import { CirqleActivity } from "./CirqleActivity";
import { chatKind, stripNetworkSuffix } from "./CirqleInboxes";
import { isOurSide } from "./CirqleTimeline";
import { isHiddenForMe } from "./CirqleMessages";

function withCaption(label: string, content: Record<string, any>): string {
    const caption = content.filename && content.body !== content.filename ? content.body : undefined;
    return caption ? `${label.split(" ")[0]} ${caption}` : label;
}

/** What the message says, in a few words. */
export function previewText(event: MatrixEvent): string {
    if (event.isRedacted()) return "🚫 This message was deleted";
    const content = event.getContent();
    switch (event.getType()) {
        case EventType.Sticker:
            return "Sticker";
        case EventType.RoomMessageEncrypted:
            return "Encrypted message";
        case M_POLL_START.name:
        case M_POLL_START.altName:
            return `📊 ${MessagePreviewStore.instance.generatePreviewForEvent(event)}`;
    }
    switch (content.msgtype) {
        case MsgType.Image:
            return withCaption("📷 Photo", content);
        case MsgType.Video:
            return withCaption("🎥 Video", content);
        case MsgType.Audio:
            return content["org.matrix.msc3245.voice"] ? "🎤 Voice message" : "🎵 Audio";
        case MsgType.File:
            return `📄 ${content.filename ?? content.body ?? "File"}`;
        case MsgType.Location:
            return "📍 Location";
    }
    return MessagePreviewStore.instance.generatePreviewForEvent(event) || (content.body ?? "");
}

/** A sender as WhatsApp names them in a list: first name, or the formatted number. */
function shortName(room: Room, userId: string): string | undefined {
    const name = room.getMember(userId)?.rawDisplayName;
    if (!name || name === userId) return undefined;
    const bare = stripNetworkSuffix(name);
    return bare.startsWith("+") ? bare : bare.split(/\s+/)[0];
}

export function chatPreview(room: Room): string {
    const event = CirqleActivity.lastActivityEvent(room);
    if (!event) return "";
    if (isHiddenForMe(room.client, event)) return "🚫 You deleted this message for yourself";
    const text = previewText(event);
    const sender = event.getSender() ?? "";
    if (sender === room.client.getUserId()) return `You: ${text}`;
    if (!isOurSide(event, room.client) && chatKind(room) === "chat") return text;
    const name = shortName(room, sender);
    return name ? `${name}: ${text}` : text;
}
