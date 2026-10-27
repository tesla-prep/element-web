/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// @vitest-environment happy-dom

import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MatrixEvent } from "matrix-js-sdk/src/matrix";
import { fireEvent, render, screen, waitFor } from "test-utils-rtl";
import { stubClient } from "test-utils";
import { ActionBarAction } from "@element-hq/web-shared-components";

import SdkConfig from "../SdkConfig";
import { getCommand } from "../slash-commands/SlashCommands";
import { Tab } from "../components/structures/TabbedView";
import { UserTab } from "../components/views/dialogs/UserTab";
import { CIRQLE_BRAND, cirqlePollTotal, isCirqleHiddenCommand } from "./CirqleFeatures";
import { cirqleActionBarActions, cirqleMayDelete } from "./CirqleMessages";
import { CirqlePreferencesTab, cirqleUserTabs } from "./CirqleSettings";
import MatrixClientContext from "../contexts/MatrixClientContext";
import PlatformPeg from "../PlatformPeg";
import type BasePlatform from "../BasePlatform";
import { CirqleDeleteDialog } from "./CirqleDeleteDialog";
import { MainGrouper } from "../components/structures/grouper/MainGrouper";
import type MessagePanel from "../components/structures/MessagePanel";
import { getRedactedBodyViewModelProps } from "../viewmodels/room/timeline/event-tile/EventTileRedactedBodyState";

const ROOM = "!room:server";

function message(sender: string): MatrixEvent {
    return new MatrixEvent({ type: "m.room.message", sender, room_id: ROOM, event_id: "$m", content: { body: "hi" } });
}

describe("CIRQLE without stock Element's extras", () => {
    beforeEach(() => {
        stubClient();
        SdkConfig.put({ brand: CIRQLE_BRAND });
    });

    afterEach(() => {
        SdkConfig.reset();
    });

    it("keeps only the slash commands that change how a message reads", () => {
        for (const command of [
            "roomname",
            "topic",
            "roomavatar",
            "remove",
            "op",
            "devtools",
            "converttodm",
            "msg",
            "join",
            "part",
            "invite",
            "nick",
            "me",
            "help",
        ]) {
            expect(isCirqleHiddenCommand(command)).toBe(true);
        }
        for (const command of ["plain", "shrug", "tableflip", "unflip", "lenny"]) {
            expect(isCirqleHiddenCommand(command)).toBe(false);
        }
        expect(getCommand(ROOM, "/roomname New name")).toEqual({});
        expect(getCommand(ROOM, "/devtools")).toEqual({});
        expect(getCommand(ROOM, "/shrug ok").cmd?.command).toBe("shrug");
    });

    it("leaves stock Element alone outside the CIRQLE build", () => {
        SdkConfig.reset();
        expect(isCirqleHiddenCommand("roomname")).toBe(false);
        expect(getCommand(ROOM, "/roomname New name").cmd?.command).toBe("roomname");
        const actions = [ActionBarAction.Reply, ActionBarAction.ReplyInThread];
        expect(cirqleActionBarActions(actions)).toEqual(actions);
        expect(cirqleMayDelete(stubClient(), message("@colleague:server"))).toBe(true);
    });

    it("deletes our own messages only", () => {
        const client = stubClient();
        expect(cirqleMayDelete(client, message(client.getSafeUserId()))).toBe(true);
        expect(cirqleMayDelete(client, message("@whatsapp_lid-5000:server"))).toBe(false);
        expect(cirqleMayDelete(client, message("@colleague:server"))).toBe(false);
    });

    it("has no Reply in thread or Pin on the hover bar", () => {
        expect(
            cirqleActionBarActions([
                ActionBarAction.React,
                ActionBarAction.Reply,
                ActionBarAction.ReplyInThread,
                ActionBarAction.Edit,
                ActionBarAction.Pin,
                ActionBarAction.Options,
            ]),
        ).toEqual([ActionBarAction.React, ActionBarAction.Reply, ActionBarAction.Edit, ActionBarAction.Options]);
    });

    it("shows the settings tabs staff need, with a short Preferences", () => {
        const ids = [
            UserTab.Account,
            UserTab.SessionManager,
            UserTab.Appearance,
            UserTab.Notifications,
            UserTab.Preferences,
            UserTab.Keyboard,
            UserTab.Sidebar,
            UserTab.Security,
            UserTab.Encryption,
            UserTab.Labs,
            UserTab.Help,
        ];
        const stock = ids.map((id) => new Tab(id, "common|preferences", null, <div key={id}>{id}</div>));
        const tabs = cirqleUserTabs(stock);
        // No Sessions (QR sign-in, verification), Keyboard (calls, stickers) or Help (crypto versions)
        expect(tabs.map((tab) => tab.id)).toEqual([UserTab.Account, UserTab.Notifications, UserTab.Preferences]);

        render(tabs.find((tab) => tab.id === UserTab.Preferences)!.body);
        expect(screen.getByText("Typing")).toBeTruthy();
        expect(screen.queryByText(UserTab.Preferences)).toBeNull();
        expect(screen.queryByText(/read receipts/i)).toBeNull();
        expect(screen.queryByText(/typing notifications/i)).toBeNull();
        expect(screen.queryByText(/language/i)).toBeNull();
    });

    it("keeps Help's Clear cache and reload, under Preferences, for support", async () => {
        const client = stubClient();
        const deleteAllData = vi.fn().mockResolvedValue(undefined);
        (client as any).store = { deleteAllData };
        (client as any).stopClient = vi.fn();
        const reload = vi.fn();
        const platform = vi.spyOn(PlatformPeg, "get").mockReturnValue({ reload } as unknown as BasePlatform);
        render(
            <MatrixClientContext.Provider value={client}>
                <CirqlePreferencesTab />
            </MatrixClientContext.Provider>,
        );
        fireEvent.click(screen.getByRole("button", { name: "Clear cache and reload" }));
        expect(client.stopClient).toHaveBeenCalled();
        await waitFor(() => expect(reload).toHaveBeenCalled());
        expect(deleteAllData).toHaveBeenCalled();
        platform.mockRestore();
    });

    it('shows each deleted message as WhatsApp\'s "This message was deleted", not folded into a summary', () => {
        const deleted = new MatrixEvent({
            type: "m.room.message",
            sender: "@whatsapp_lid-5000:server",
            room_id: ROOM,
            event_id: "$d",
            content: {},
            unsigned: { redacted_because: { sender: "@vchizhov:server", origin_server_ts: 1 } as any },
        });
        expect(deleted.isRedacted()).toBe(true);
        expect(MainGrouper.canStartGroup({} as MessagePanel, { event: deleted, shouldShow: true })).toBe(false);
        expect(getRedactedBodyViewModelProps(deleted, false).text).toBe("This message was deleted");
        SdkConfig.reset();
        expect(MainGrouper.canStartGroup({} as MessagePanel, { event: deleted, shouldShow: true })).toBe(true);
        expect(getRedactedBodyViewModelProps(deleted, false).text).not.toBe("This message was deleted");
    });

    it("counts poll votes and sends voting to the phone", () => {
        expect(cirqlePollTotal(1)).toBe("1 vote · Vote on the phone");
        expect(cirqlePollTotal(0)).toBe("0 votes · Vote on the phone");
    });

    it("asks to delete for everyone, without a reason", () => {
        render(<CirqleDeleteDialog event={message("@me:server")} onFinished={() => {}} />);
        expect(screen.getByText("Delete for everyone?")).toBeTruthy();
        expect(screen.getByRole("button", { name: "Delete for everyone" })).toBeTruthy();
        expect(screen.queryByRole("textbox")).toBeNull();
    });
});
