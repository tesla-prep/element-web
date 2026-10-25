/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    ConditionKind,
    type IPushRule,
    type IPushRules,
    type MatrixClient,
    MatrixEvent,
    Method,
    PushRuleActionName,
} from "matrix-js-sdk/src/matrix";
import { PushProcessor } from "matrix-js-sdk/src/pushprocessor";
import { stubClient } from "test-utils";

import { type Inbox } from "./CirqleInboxes";
import { OURS_RULE, syncCirqlePushRules } from "./CirqlePushRules";

const inboxes = vi.hoisted(() => ({ list: [] as Inbox[] }));
vi.mock("./CirqleInboxes", async (original) => ({
    ...(await original<typeof import("./CirqleInboxes")>()),
    getInboxes: () => inboxes.list,
}));

const SERVER = "matrix.org";
const OWN_GHOST = `@whatsapp_79181888877:${SERVER}`;
const ROOM = "!chat:matrix.org";

function inbox(ownUsers: string[]): Inbox {
    return {
        spaceId: "!space:matrix.org",
        network: "whatsapp",
        label: "Main #1",
        childIds: new Set([ROOM]),
        connected: true,
        contactPhones: new Map(),
        ownUsers: new Set(ownUsers),
    };
}

/** The defaults that matter here, as tuwunel lists them (user rules go before them). */
function serverDefaults(): IPushRules["global"] {
    const rule = (rule_id: string, conditions: IPushRule["conditions"], actions: IPushRule["actions"]): IPushRule => ({
        rule_id,
        conditions,
        actions,
        default: true,
        enabled: true,
    });
    return {
        override: [
            { ...rule(".m.rule.master", [], []), enabled: false },
            rule(
                ".m.rule.suppress_notices",
                [{ kind: ConditionKind.EventMatch, key: "content.msgtype", pattern: "m.notice" }],
                [],
            ),
            rule(
                ".m.rule.member_event",
                [{ kind: ConditionKind.EventMatch, key: "type", pattern: "m.room.member" }],
                [],
            ),
            rule(".m.rule.reaction", [{ kind: ConditionKind.EventMatch, key: "type", pattern: "m.reaction" }], []),
            rule(
                ".m.rule.suppress_edits",
                [{ kind: ConditionKind.EventPropertyIs, key: "content.m\\.relates_to.rel_type", value: "m.replace" }],
                [],
            ),
        ],
        underride: [
            rule(
                ".m.rule.message",
                [{ kind: ConditionKind.EventMatch, key: "type", pattern: "m.room.message" }],
                [PushRuleActionName.Notify],
            ),
        ],
    };
}

/**
 * The homeserver's push rule API as tuwunel answers it: a new rule goes first among
 * the user's own rules of its kind (after .m.rule.master), or right after ?after=.
 */
function fakeServer(client: MatrixClient, global: IPushRules["global"]): ReturnType<typeof vi.fn> {
    const requests = vi.fn();
    const list = (kind: string): IPushRule[] => ((global as Record<string, IPushRule[]>)[kind] ??= []);
    client.getPushRules = vi.fn(async () => {
        client.pushRules = structuredClone({ global });
        return client.pushRules;
    });
    const authedRequest = vi.fn(async (method: Method, path: string, query?: { after?: string }, body?: any) => {
        requests(method, path, query);
        const [, , , kind, id] = path.split("/");
        const ruleId = decodeURIComponent(id);
        const rules = list(kind).filter((rule) => rule.rule_id !== ruleId);
        const at = query?.after
            ? rules.findIndex((rule) => rule.rule_id === query.after) + 1
            : rules[0]?.rule_id === ".m.rule.master"
              ? 1
              : 0;
        rules.splice(at, 0, {
            rule_id: ruleId,
            conditions: body.conditions,
            actions: body.actions,
            default: false,
            enabled: true,
        });
        (global as Record<string, IPushRule[]>)[kind] = rules;
        return {};
    });
    Object.assign(client, { http: { authedRequest } });
    client.deletePushRule = vi.fn(async (_scope: string, kind: string, ruleId: string) => {
        requests(Method.Delete, `/pushrules/global/${kind}/${ruleId}`);
        (global as Record<string, IPushRule[]>)[kind] = list(kind).filter((rule) => rule.rule_id !== ruleId);
        return {};
    });
    return requests;
}

describe("Push rules: only customers notify", () => {
    let client: MatrixClient;
    let global: IPushRules["global"];
    let requests: ReturnType<typeof vi.fn>;

    const notifies = (
        sender: string,
        content: Record<string, unknown> = { msgtype: "m.text", body: "hi" },
        type = "m.room.message",
    ): boolean => {
        const event = new MatrixEvent({ type, sender, room_id: ROOM, event_id: "$e", content });
        client.pushRules = structuredClone({ global });
        return new PushProcessor(client).actionsForEvent(event).notify;
    };

    beforeEach(() => {
        client = stubClient();
        inboxes.list = [inbox([OWN_GHOST])];
        global = serverDefaults();
        requests = fakeServer(client, global);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("notifies for a customer's messages and nothing else", async () => {
        await syncCirqlePushRules(client);

        expect(notifies("@whatsapp_79161234567:matrix.org")).toBe(true);
        expect(notifies("@whatsapp_lid-500012345:matrix.org", { msgtype: "m.image", body: "a.jpg" })).toBe(true);
        expect(notifies("@telegram_4830:matrix.org")).toBe(true);
        expect(notifies("@whatsapp_79161234567:matrix.org", { body: "😀" }, "m.sticker")).toBe(true);
        expect(notifies("@whatsapp_79161234567:matrix.org", {}, "org.matrix.msc3381.poll.start")).toBe(true);

        // our side: a colleague, the number itself from the phone, service users, the bridge bots
        expect(notifies("@anna:matrix.org")).toBe(false);
        expect(notifies(OWN_GHOST)).toBe(false);
        expect(notifies("@relay-bot:matrix.org")).toBe(false);
        expect(notifies("@account_whatsapp_wa-01d17870:matrix.org")).toBe(false);
        expect(notifies("@newchat_79161234567:matrix.org")).toBe(false);
        expect(notifies("@respond-io:matrix.org")).toBe(false);
        expect(notifies("@learning-center:matrix.org")).toBe(false);
        expect(notifies("@whatsappbot:matrix.org")).toBe(false);
        expect(notifies("@telegrambot:matrix.org", { msgtype: "m.text", body: "Connected" })).toBe(false);

        // a customer's edits, reactions and room changes stay quiet, as before
        const edit = { "msgtype": "m.text", "body": "* hi", "m.relates_to": { rel_type: "m.replace", event_id: "$1" } };
        expect(notifies("@whatsapp_79161234567:matrix.org", edit)).toBe(false);
        expect(notifies("@whatsapp_79161234567:matrix.org", { "m.relates_to": {} }, "m.reaction")).toBe(false);
        expect(notifies("@whatsapp_79161234567:matrix.org", { name: "New name" }, "m.room.name")).toBe(false);
    });

    it("leaves a muted chat muted", async () => {
        global.override!.splice(1, 0, {
            rule_id: ROOM,
            conditions: [{ kind: ConditionKind.EventMatch, key: "room_id", pattern: ROOM }],
            actions: [],
            default: false,
            enabled: true,
        });

        await syncCirqlePushRules(client);

        expect(notifies("@whatsapp_79161234567:matrix.org")).toBe(false);
        expect(global.override!.map((rule) => rule.rule_id)).toContain(ROOM);
    });

    it("puts the quiet rule after every customer rule", async () => {
        await syncCirqlePushRules(client);

        const ids = global.underride!.map((rule) => rule.rule_id);
        const customers = ids.filter((id) => id.startsWith("com.cirqle.customer."));
        expect(customers).toHaveLength(8);
        expect(ids.indexOf(OURS_RULE)).toBe(customers.length);
        expect(ids.slice(customers.length + 1)).toEqual([".m.rule.message"]);
    });

    it("changes nothing once the rules are in place", async () => {
        await syncCirqlePushRules(client);
        requests.mockClear();

        await syncCirqlePushRules(client);

        expect(requests).not.toHaveBeenCalled();
    });

    it("follows the numbers' own ghosts and touches no rule of anyone else", async () => {
        await syncCirqlePushRules(client);
        global.override!.push({
            rule_id: "my.keyword",
            conditions: [{ kind: ConditionKind.EventMatch, key: "content.body", pattern: "urgent" }],
            actions: [PushRuleActionName.Notify],
            default: false,
            enabled: true,
        });
        const other = `@whatsapp_lid-77:${SERVER}`;
        inboxes.list = [inbox([other])];

        await syncCirqlePushRules(client);

        const overrides = global.override!.map((rule) => rule.rule_id);
        expect(overrides).toContain("com.cirqle.own." + other);
        expect(overrides).not.toContain("com.cirqle.own." + OWN_GHOST);
        expect(overrides).toContain("my.keyword");
        expect(notifies(OWN_GHOST)).toBe(true);
        expect(notifies(other)).toBe(false);
    });

    it("moves the quiet rule back behind the customers when it got ahead of them", async () => {
        await syncCirqlePushRules(client);
        const ours = global.underride!.find((rule) => rule.rule_id === OURS_RULE)!;
        global.underride = [ours, ...global.underride!.filter((rule) => rule !== ours)];
        expect(notifies("@whatsapp_79161234567:matrix.org")).toBe(false);

        await syncCirqlePushRules(client);

        expect(notifies("@whatsapp_79161234567:matrix.org")).toBe(true);
        expect(requests).toHaveBeenCalledWith(Method.Put, "/pushrules/global/underride/com.cirqle.ours", {
            after: expect.stringMatching(/^com\.cirqle\.customer\./),
        });
    });
});
