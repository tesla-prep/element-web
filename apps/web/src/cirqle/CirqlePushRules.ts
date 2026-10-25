/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// Who notifies: only customers. The homeserver evaluates these push rules both
// for the push it sends (Web Push, CirqlePush) and for the unread counts it keeps,
// so the service worker never gets a push it would have to hide (Safari revokes
// such subscriptions, Chrome shows "updated in the background") and a chat is
// not unread because a colleague, the number itself or a bot wrote in it.
//
//   override   com.cirqle.own.<ghost>             the number's own ghost (sent from the phone)   quiet
//   ...        Element's mutes, notices, edits, reactions, mentions (they come first)
//   underride  com.cirqle.customer.<network>.<type>  @whatsapp_*, @telegram_* messages          notify
//   underride  com.cirqle.ours                     everything else: staff, service users, bots   quiet
//
// "Ours" is everyone who is not a bridge ghost, as on the timeline
// (CirqleTimeline.isOurSide), so a new colleague or service user needs no rule.
// Only rules whose id starts with "com.cirqle." are ever changed.

import {
    ConditionKind,
    type IPushRule,
    type MatrixClient,
    Method,
    type PushRuleAction,
    PushRuleActionName,
    type PushRuleCondition,
    PushRuleKind,
    TweakName,
} from "matrix-js-sdk/src/matrix";

import { getInboxes } from "./CirqleInboxes";

const PREFIX = "com.cirqle.";
export const OURS_RULE = "com.cirqle.ours";
const OWN_PREFIX = "com.cirqle.own.";
const NETWORKS = ["whatsapp", "telegram"];
/** What a customer writes: messages, media, voice, stickers, polls. Not reactions, edits, deletes or room changes. */
const MESSAGE_TYPES = ["m.room.message", "m.sticker", "org.matrix.msc3381.poll.start", "m.poll.start"];

export interface CirqlePushRule {
    ruleId: string;
    conditions: PushRuleCondition[];
    actions: PushRuleAction[];
}

const QUIET: PushRuleAction[] = [];
const NOTIFY: PushRuleAction[] = [PushRuleActionName.Notify, { set_tweak: TweakName.Sound, value: "default" }];

function senderIs(pattern: string): PushRuleCondition {
    return { kind: ConditionKind.EventMatch, key: "sender", pattern };
}

export function customerRules(client: MatrixClient): CirqlePushRule[] {
    return NETWORKS.flatMap((network) =>
        MESSAGE_TYPES.map((type) => ({
            ruleId: `${PREFIX}customer.${network}.${type}`,
            conditions: [
                { kind: ConditionKind.EventMatch, key: "type", pattern: type },
                senderIs(`@${network}_*:${client.getDomain()}`),
            ],
            actions: NOTIFY,
        })),
    );
}

export const OURS: CirqlePushRule = { ruleId: OURS_RULE, conditions: [], actions: QUIET };

/** The numbers' own ghosts: what an owner sends from the phone is ours, though it comes from a bridge user. */
export function ownGhostRules(client: MatrixClient): CirqlePushRule[] {
    const ghosts = new Set(getInboxes(client).flatMap((inbox) => [...inbox.ownUsers]));
    return [...ghosts].sort().map((userId) => ({
        ruleId: OWN_PREFIX + userId,
        conditions: [senderIs(userId)],
        actions: QUIET,
    }));
}

/** JSON with sorted keys: the server may give a rule's objects back in another key order. */
function canonical(value: unknown): string {
    return JSON.stringify(value, (_key, inner) =>
        inner && typeof inner === "object" && !Array.isArray(inner)
            ? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => a.localeCompare(b)))
            : inner,
    );
}

function matches(have: IPushRule | undefined, want: CirqlePushRule): boolean {
    return (
        !!have &&
        have.enabled !== false &&
        canonical(have.conditions ?? []) === canonical(want.conditions) &&
        canonical(have.actions) === canonical(want.actions)
    );
}

async function put(client: MatrixClient, kind: PushRuleKind, rule: CirqlePushRule, after?: string): Promise<void> {
    await client.http.authedRequest(
        Method.Put,
        `/pushrules/global/${kind}/${encodeURIComponent(rule.ruleId)}`,
        after ? { after } : undefined,
        { conditions: rule.conditions, actions: rule.actions },
    );
}

/** Adds what is missing or changed, removes our rules nobody needs any more. */
async function syncKind(
    client: MatrixClient,
    kind: PushRuleKind,
    have: IPushRule[],
    want: CirqlePushRule[],
    keep: (ruleId: string) => boolean,
): Promise<boolean> {
    let changed = false;
    for (const rule of want) {
        if (
            matches(
                have.find((existing) => existing.rule_id === rule.ruleId),
                rule,
            )
        )
            continue;
        await put(client, kind, rule);
        changed = true;
    }
    for (const existing of have) {
        if (!existing.rule_id.startsWith(PREFIX) || keep(existing.rule_id)) continue;
        if (want.some((rule) => rule.ruleId === existing.rule_id)) continue;
        await client.deletePushRule("global", kind, existing.rule_id);
        changed = true;
    }
    return changed;
}

export async function syncCirqlePushRules(client: MatrixClient): Promise<void> {
    const rules = (await client.getPushRules()).global;
    await syncKind(client, PushRuleKind.Override, rules.override ?? [], ownGhostRules(client), () => false);

    const customers = customerRules(client);
    let underride = rules.underride ?? [];
    if (await syncKind(client, PushRuleKind.Underride, underride, customers, (id) => id === OURS_RULE)) {
        underride = (await client.getPushRules()).global.underride ?? [];
    }
    // A new rule goes in first, so the customers' rules always end up before the quiet one;
    // the quiet one itself goes in right after the last of them.
    const ids = underride.map((rule) => rule.rule_id);
    const lastCustomer = Math.max(...customers.map((rule) => ids.indexOf(rule.ruleId)));
    const oursAt = ids.indexOf(OURS_RULE);
    if (oursAt > lastCustomer && matches(underride[oursAt], OURS)) return;
    if (oursAt >= 0) await client.deletePushRule("global", PushRuleKind.Underride, OURS_RULE);
    await put(client, PushRuleKind.Underride, OURS, ids[lastCustomer]);
}

/** Changes when a number's own ghosts change, so the override rules follow. */
export function ownGhostsKey(client: MatrixClient): string {
    return ownGhostRules(client)
        .map((rule) => rule.ruleId)
        .join(",");
}
