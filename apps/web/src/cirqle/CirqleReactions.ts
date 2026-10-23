/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// Reactions as WhatsApp has them: one per person on a message, and our number
// is one person. A staff member's reaction reaches WhatsApp as the number's
// (the relay bot mirrors it from the number's account), so Element counted it
// twice ("2"), and a second one sat beside the first while WhatsApp replaced
// it. Here our side shows its latest reaction once, and picking another one
// takes the staff member's previous reaction back.

import { EventType, type MatrixClient, type MatrixEvent, RelationType } from "matrix-js-sdk/src/matrix";

import { isCirqleMessenger } from "./CirqleFeatures";
import { isOurSide } from "./CirqleTimeline";

interface ReactionGroup {
    content: string;
    events: MatrixEvent[];
}

/** Our side's latest reaction among these: the one the customer sees from the number. */
export function latestOurReaction(reactions: Iterable<MatrixEvent>, client: MatrixClient): MatrixEvent | undefined {
    let latest: MatrixEvent | undefined;
    for (const event of reactions) {
        if (!event.isRedacted() && isOurSide(event, client) && (!latest || event.getTs() > latest.getTs()))
            latest = event;
    }
    return latest;
}

export function cirqleReactionGroups<G extends ReactionGroup>(groups: G[], client: MatrixClient | null): G[] {
    if (!isCirqleMessenger() || !client) return groups;
    const ours = (event: MatrixEvent): boolean => isOurSide(event, client);
    const latest = latestOurReaction(
        groups.flatMap((group) => group.events),
        client,
    );
    const ourKey = latest?.getRelation()?.key;
    return groups
        .map((group) => {
            const theirs = group.events.filter((event) => !ours(event));
            if (!latest || group.content !== ourKey) return { ...group, events: theirs };
            const mine = group.events.find((event) => event.getSender() === client.getUserId() && !event.isRedacted());
            return { ...group, events: [...theirs, mine ?? latest] };
        })
        .filter((group) => group.events.length > 0);
}

/** Before reacting with `key`: our own other reactions to the message are taken back, as WhatsApp replaces them. */
export function cirqleReplaceOwnReaction(client: MatrixClient, event: MatrixEvent, key: string): void {
    if (!isCirqleMessenger()) return;
    const room = client.getRoom(event.getRoomId());
    const relations = room?.relations.getChildEventsForEvent(
        event.getId()!,
        RelationType.Annotation,
        EventType.Reaction,
    );
    const mine = relations?.getAnnotationsBySender()?.[client.getSafeUserId()];
    for (const reaction of mine ?? []) {
        if (reaction.isRedacted() || reaction.getRelation()?.key === key) continue;
        void client.redactEvent(event.getRoomId()!, reaction.getId()!);
    }
}
