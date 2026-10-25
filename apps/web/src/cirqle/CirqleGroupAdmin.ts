/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// Group admins, as WhatsApp has them. The bridge mirrors a group's WhatsApp
// admins as Matrix power levels: 50 for an admin, 75 for the group's creator
// (WhatsApp's "super admin", who can't be dismissed). Our number is an admin
// when its account user has 50 or more; only then does Group info offer
// Make group admin, Dismiss as admin and Remove, and only then may a customer's
// message be deleted for everyone.
//
// Make group admin and Dismiss as admin go through the relay bot
// (POST /_matrix/client/unstable/com.cirqle/group_admin), which has the bridge
// promote or demote the person on WhatsApp through our admin number; WhatsApp's
// change then comes back as the person's new power level. Matrix itself can't
// do it: a number with 50 may not lower another admin's 50.

import { type MatrixClient, MatrixError, Method, type Room, type RoomMember } from "matrix-js-sdk/src/matrix";
import { logger } from "matrix-js-sdk/src/logger";

import Modal from "../Modal";
import ErrorDialog from "../components/views/dialogs/ErrorDialog";
import Spinner from "../components/views/elements/Spinner";
import { chatKind, type Inbox, inboxesOf, memberName, networkOf, stripNetworkSuffix } from "./CirqleInboxes";

export const ADMIN_LEVEL = 50;
export const CREATOR_LEVEL = 75;

/** The relay bot waits for WhatsApp's answer, then for the new power level. */
const GROUP_ADMIN_TIMEOUT_MS = 60 * 1000;

const WHATSAPP_GHOST = /^@whatsapp_/;

function levelOf(room: Room, userId: string): number {
    return room.getMember(userId)?.powerLevel ?? 0;
}

/** A connected number of ours in this group that is one of its admins. */
export function ourAdminNumber(room: Room, inboxes: Inbox[]): Inbox | undefined {
    if (chatKind(room) !== "group") return undefined;
    return inboxesOf(room, inboxes).find(
        (inbox) => inbox.connected && !!inbox.accountUserId && levelOf(room, inbox.accountUserId) >= ADMIN_LEVEL,
    );
}

export function isGroupAdmin(member: RoomMember): boolean {
    return member.powerLevel >= ADMIN_LEVEL;
}

/** Whether Make group admin or Dismiss as admin is offered for this person: a WhatsApp member, not us, not the creator. */
export function canChangeGroupAdmin(room: Room, member: RoomMember, inboxes: Inbox[]): boolean {
    if (networkOf(room) !== "whatsapp" || !ourAdminNumber(room, inboxes)) return false;
    if (!WHATSAPP_GHOST.test(member.userId)) return false;
    if (inboxes.some((inbox) => inbox.ownUsers.has(member.userId))) return false;
    return member.powerLevel < CREATOR_LEVEL;
}

export async function setGroupAdmin(
    client: MatrixClient,
    room: Room,
    member: RoomMember,
    admin: boolean,
): Promise<void> {
    const spinner = Modal.createDialog(Spinner, undefined, "mx_Dialog_spinner");
    try {
        await client.http.authedRequest(
            Method.Post,
            "/com.cirqle/group_admin",
            undefined,
            { room_id: room.roomId, user_id: member.userId, admin },
            { prefix: "/_matrix/client/unstable", localTimeoutMs: GROUP_ADMIN_TIMEOUT_MS },
        );
    } catch (e) {
        logger.error("CIRQLE group admin change failed", e);
        const name = stripNetworkSuffix(memberName(member));
        Modal.createDialog(ErrorDialog, {
            title: admin ? `Couldn't make ${name} a group admin` : `Couldn't dismiss ${name} as admin`,
            description: reasonOf(e),
        });
    } finally {
        spinner.close();
    }
}

/** The relay bot's refusal as it is; before the server knows the route, the homeserver says "unrecognized". */
function reasonOf(e: unknown): string {
    if (e instanceof MatrixError && (e.errcode === "M_UNRECOGNIZED" || e.httpStatus === 404)) {
        return "This isn't available yet: the server needs an update.";
    }
    if (e instanceof MatrixError && e.data.error) return e.data.error;
    return e instanceof Error ? e.message : String(e);
}
