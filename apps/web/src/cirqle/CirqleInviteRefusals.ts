/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// Add member: staff invite the relay bot's @newchat_ user of a contact into a
// group, the bot has the number add the real contact, and the @newchat_ user
// leaves with the outcome (`com.cirqle.add_member`: added, failed or unknown,
// and a message; older bots give only a reason when it failed). The bot posts
// nothing in the chat, which would reach the customers, and room state is
// hidden in CIRQLE, so a failure is shown here to whoever invited. With no
// answer in 70 seconds they hear that too.

import {
    EventType,
    type MatrixClient,
    type MatrixEvent,
    type Room,
    type RoomMember,
    RoomMemberEvent,
} from "matrix-js-sdk/src/matrix";

import Modal from "../Modal";
import ErrorDialog from "../components/views/dialogs/ErrorDialog";
import { isCirqleMessenger } from "./CirqleFeatures";
import { getInboxes, inboxesOf, networkOf, stripNetworkSuffix } from "./CirqleInboxes";

export const ADD_MEMBER_EVENT_FIELD = "com.cirqle.add_member";

const NEW_CHAT_USER = /^@newchat_/;
/** Older invites and leaves arrive again with the first sync after a reload. */
const RECENT_MS = 2 * 60 * 1000;
export const NO_ANSWER_MS = 70 * 1000;

interface AddMemberOutcome {
    outcome?: "added" | "failed" | "unknown";
    message?: string;
}

/** The older relay bot's reason, in English: "+7918… не найден" (not found) or "не получилось" (did not work). */
export function refusalText(reason: string, network: string): string {
    const notFound = reason.match(/^(.+?)\s+не найден/);
    if (notFound) return `${notFound[1]} is not on ${network}.`;
    if (reason.startsWith("не получилось")) return `${network} did not accept it.`;
    return reason;
}

/** What to tell the inviter about the @newchat_ user's leave; undefined when the contact was added. */
export function addMemberProblem(content: Record<string, unknown>, network: string): string | undefined {
    const result = content[ADD_MEMBER_EVENT_FIELD] as AddMemberOutcome | undefined;
    const reason = typeof content.reason === "string" ? content.reason : "";
    if (result?.outcome === "added") return undefined;
    if (result?.outcome) return result.message || reason || `${network} did not confirm it.`;
    return reason ? refusalText(reason, network) : undefined;
}

/**
 * Whether the contact of a @newchat_ user is already in the group: the
 * bridge's ghost for that LID or number, a member named by the number, or the
 * member an earlier Add member of the same contact added. Inviting them again
 * fails before the bridge sees it.
 */
export function isAlreadyInGroup(room: Room, newChatUser: string): boolean {
    const contact = newChatUser.match(/^@newchat_(whatsapp|telegram)_[^_]+_([^:]+):(.+)$/);
    if (!contact) return false;
    const [, network, id, server] = contact;
    const digits = id.startsWith("=") ? id.slice(1) : undefined;
    const added = room
        .getLiveTimeline()
        .getEvents()
        .filter((event) => event.getType() === EventType.RoomMember && event.getStateKey() === newChatUser)
        .map((event) => (event.getContent()[ADD_MEMBER_EVENT_FIELD] as { member?: string } | undefined)?.member);
    const ghosts = new Set([`@${network}_${digits ?? id}:${server}`, ...added]);
    return room
        .getJoinedMembers()
        .some((m) => ghosts.has(m.userId) || (!!digits && m.name.replace(/[^\d]/g, "").includes(digits)));
}

/** "Anna Petrova, +7918… · slava test" is "Anna Petrova, +7918…" */
function contactName(member: RoomMember): string {
    return member.name.replace(/\s·\s[^·]+$/, "");
}

/**
 * Add member offers the contacts of the group's own number. The relay bot's
 * people search returns every number's contacts, and inviting another number's
 * contact made the bot open a new group from that other number and close this one.
 */
export function isCirqleInvitable(client: MatrixClient, roomId: string | undefined, userId: string): boolean {
    if (!isCirqleMessenger() || !roomId) return true;
    const room = client.getRoom(roomId);
    if (!room || !networkOf(room)) return true;
    return inboxesOf(room, getInboxes(client)).some(
        (inbox) => !!inbox.accountName && userId.startsWith(`@newchat_${inbox.network}_${inbox.accountName}_`),
    );
}

/** Starts watching; returns the function that stops. */
export function watchCirqleInviteRefusals(client: MatrixClient): () => void {
    const waiting = new Map<string, number>();
    const tell = (member: RoomMember, description: string): void => {
        const room = client.getRoom(member.roomId);
        Modal.createDialog(ErrorDialog, {
            title: `Couldn't add ${contactName(member)}${room ? ` to ${stripNetworkSuffix(room.name)}` : ""}`,
            description,
        });
    };
    const onMembership = (event: MatrixEvent, member: RoomMember, oldMembership?: string): void => {
        if (!isCirqleMessenger() || !NEW_CHAT_USER.test(member.userId)) return;
        if (Date.now() - event.getTs() > RECENT_MS) return;
        const key = `${member.roomId}|${member.userId}`;
        const room = client.getRoom(member.roomId);
        const network = room && networkOf(room) === "telegram" ? "Telegram" : "WhatsApp";
        if (member.membership === "invite" && event.getSender() === client.getUserId()) {
            window.clearTimeout(waiting.get(key));
            const timer = window.setTimeout(() => {
                waiting.delete(key);
                tell(member, `No answer from ${network} yet. Check the members in Group info in a minute.`);
            }, NO_ANSWER_MS);
            waiting.set(key, timer);
            return;
        }
        if (member.membership !== "leave" || oldMembership !== "invite" || !waiting.has(key)) return;
        window.clearTimeout(waiting.get(key));
        waiting.delete(key);
        const problem = addMemberProblem(event.getContent(), network);
        if (problem) tell(member, room && isAlreadyInGroup(room, member.userId) ? "Already in the group." : problem);
    };
    client.on(RoomMemberEvent.Membership, onMembership);
    return () => {
        client.off(RoomMemberEvent.Membership, onMembership);
        for (const timer of waiting.values()) window.clearTimeout(timer);
    };
}
