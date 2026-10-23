/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// @vitest-environment happy-dom

import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventType, type MatrixClient, type MatrixEvent, Room, RoomMember } from "matrix-js-sdk/src/matrix";
import { KnownMembership } from "matrix-js-sdk/src/types";
import { fireEvent, render, screen } from "test-utils-rtl";
import { mkEvent, stubClient } from "test-utils";

import MatrixClientContext from "../contexts/MatrixClientContext";
import { SDKContext } from "../contexts/SDKContext";
import { SDKContextClass } from "../contexts/SDKContextClass";
import { RoomNotifState } from "../RoomNotifs";
import { RightPanelPhases } from "../stores/right-panel/RightPanelStorePhases";
import { DefaultTagID } from "../stores/room-list-v3/skip-list/tag";
import { tagRoom } from "../utils/room/tagRoom";
import DMRoomMap from "../utils/DMRoomMap";
import { cirqleRightPanelCard } from "./CirqleRightPanel";
import { CirqleContactInfo } from "./CirqleContactInfo";
import { CirqleGroupInfo } from "./CirqleGroupInfo";
import { CirqleMemberCard } from "./CirqleMemberCard";
import { type Inbox } from "./CirqleInboxes";

const SERVER = "matrix.cirqlecirqle.com";
const ME = `@vchizhov:${SERVER}`;
const WA_BOT = `@whatsappbot:${SERVER}`;
const TG_BOT = `@telegrambot:${SERVER}`;

const DM = `!dm:${SERVER}`;
const TG_DM = `!tg-dm:${SERVER}`;
const GROUP = `!group:${SERVER}`;
const CHANNEL = `!channel:${SERVER}`;
const STAFF_ROOM = `!staff:${SERVER}`;

const mocked = vi.hoisted(() => ({
    notifications: "all_messages" as string,
    setNotifications: (_state: string): void => {},
}));

vi.mock("./useCirqleChats", () => ({
    useCirqleInboxes: (): Inbox[] => [
        {
            spaceId: "!space:server",
            network: "whatsapp",
            label: "slava test",
            phone: "+1 302 618 0314",
            accountName: "wa-efa4b19c",
            childIds: new Set([DM, GROUP, CHANNEL]),
            ownUsers: new Set(),
        },
    ],
}));

vi.mock("../hooks/useRoomNotificationState", () => ({
    useNotificationState: () => [mocked.notifications, mocked.setNotifications],
}));

vi.mock("../utils/room/tagRoom", () => ({ tagRoom: vi.fn() }));

type Network = "whatsapp" | "telegram";

function bridged(client: MatrixClient, roomId: string, name: string, network: Network, content: object): Room {
    const bot = network === "whatsapp" ? WA_BOT : TG_BOT;
    const state: MatrixEvent[] = [
        mkEvent({ type: EventType.RoomCreate, room: roomId, user: bot, skey: "", content: {}, event: true }),
        mkEvent({ type: EventType.RoomName, room: roomId, user: bot, skey: "", content: { name }, event: true }),
        mkEvent({
            type: "m.bridge",
            room: roomId,
            user: bot,
            skey: `${SERVER}/${network}`,
            content: { bridgebot: bot, protocol: { id: network }, ...content },
            event: true,
        }),
    ];
    const room = new Room(roomId, client, ME);
    room.currentState.setStateEvents(state);
    room.recalculate();
    vi.spyOn(room, "getMyMembership").mockReturnValue(KnownMembership.Join);
    return room;
}

describe("CIRQLE right panel", () => {
    let client: MatrixClient;
    let dm: Room;
    let tgDm: Room;
    let group: Room;
    let channel: Room;
    let staffRoom: Room;

    beforeEach(() => {
        client = stubClient();
        vi.mocked(client.getUserId).mockReturnValue(ME);
        vi.mocked(client.getSafeUserId).mockReturnValue(ME);
        DMRoomMap.makeShared(client);
        dm = bridged(client, DM, "Janaki (WA)", "whatsapp", {
            "channel": { id: "15557093423@s.whatsapp.net" },
            "com.beeper.room_type": "dm",
        });
        tgDm = bridged(client, TG_DM, "Olga", "telegram", {
            "channel": { id: "user:429896795" },
            "com.beeper.room_type": "dm",
        });
        group = bridged(client, GROUP, "Frisco parents", "whatsapp", { channel: { id: "120363425399214516@g.us" } });
        channel = bridged(client, CHANNEL, "CIRQLE news", "whatsapp", { channel: { id: "120363@newsletter" } });
        staffRoom = new Room(STAFF_ROOM, client, ME);
        mocked.notifications = RoomNotifState.AllMessages;
        mocked.setNotifications = vi.fn();
        vi.mocked(tagRoom).mockClear();
    });

    const panel = (element: React.ReactElement): void => {
        render(
            <MatrixClientContext.Provider value={client}>
                <SDKContext.Provider value={SDKContextClass.instance}>{element}</SDKContext.Provider>
            </MatrixClientContext.Provider>,
        );
    };
    const buttons = (): string[] =>
        Array.from(document.querySelectorAll("button")).map((b) => b.getAttribute("aria-label") ?? b.textContent ?? "");
    const close = vi.fn();

    describe("picks the card", () => {
        it.each([
            ["a WhatsApp private chat", () => dm, CirqleContactInfo],
            ["a Telegram private chat", () => tgDm, CirqleContactInfo],
            ["a group", () => group, CirqleGroupInfo],
            ["a channel", () => channel, CirqleGroupInfo],
        ])("shows our info panel for %s, from the room summary and from People", (_name, room, component) => {
            for (const phase of [RightPanelPhases.RoomSummary, RightPanelPhases.MemberList]) {
                expect(cirqleRightPanelCard(phase, room(), {}, close)?.type).toBe(component);
            }
        });

        it("leaves Element's panels for a room no bridge runs", () => {
            expect(cirqleRightPanelCard(RightPanelPhases.RoomSummary, staffRoom, {}, close)).toBeUndefined();
            expect(cirqleRightPanelCard(RightPanelPhases.MemberList, staffRoom, {}, close)).toBeUndefined();
        });

        it("leaves Element's file panel, which Media, links and docs opens", () => {
            expect(cirqleRightPanelCard(RightPanelPhases.FilePanel, dm, {}, close)).toBeUndefined();
        });

        it("shows the member card for Element's user info, in a chat or on its own", () => {
            const member = new RoomMember(DM, `@whatsapp_15557093423:${SERVER}`);
            expect(cirqleRightPanelCard(RightPanelPhases.MemberInfo, dm, { member }, close)?.type).toBe(
                CirqleMemberCard,
            );
            expect(cirqleRightPanelCard(RightPanelPhases.MemberInfo, staffRoom, { member }, close)?.type).toBe(
                CirqleMemberCard,
            );
            expect(cirqleRightPanelCard(RightPanelPhases.MemberInfo, undefined, { member }, close)?.type).toBe(
                CirqleMemberCard,
            );
        });
    });

    describe("Contact info", () => {
        it("names the customer without (WA), with the number and the number we write from", () => {
            panel(<CirqleContactInfo room={dm} />);
            expect(screen.getByRole("heading", { name: "Janaki" })).toBeInTheDocument();
            expect(screen.getByText("+1 555 709 3423")).toBeInTheDocument();
            expect(screen.getByText("WhatsApp · from slava test")).toBeInTheDocument();
        });

        it("does not take a Telegram id for a phone number", () => {
            panel(<CirqleContactInfo room={tgDm} />);
            expect(screen.queryByText(/429896795/)).not.toBeInTheDocument();
            expect(screen.getByText("Telegram")).toBeInTheDocument();
        });

        it("offers only favourite, mute and media", () => {
            panel(<CirqleContactInfo room={dm} />);
            expect(buttons()).toEqual([
                "Close contact info",
                "Add to favourites",
                "Mute notifications",
                "Media, links and docs",
            ]);
        });

        it("adds to and removes from favourites with Element's own room tag", () => {
            panel(<CirqleContactInfo room={dm} />);
            fireEvent.click(screen.getByRole("button", { name: "Add to favourites" }));
            expect(tagRoom).toHaveBeenCalledWith(dm, DefaultTagID.Favourite);
        });

        it("says Remove from favourites for a favourite", () => {
            dm.tags = { [DefaultTagID.Favourite]: {} };
            panel(<CirqleContactInfo room={dm} />);
            expect(screen.getByRole("button", { name: "Remove from favourites" })).toBeInTheDocument();
        });

        it("mutes and unmutes the chat's notifications", () => {
            panel(<CirqleContactInfo room={dm} />);
            const mute = screen.getByRole("switch", { name: "Mute notifications" });
            expect(mute).toHaveAttribute("aria-checked", "false");
            fireEvent.click(mute);
            expect(mocked.setNotifications).toHaveBeenCalledWith(RoomNotifState.Mute);
        });

        it("unmutes a muted chat back to the default", () => {
            mocked.notifications = RoomNotifState.Mute;
            panel(<CirqleContactInfo room={dm} />);
            const mute = screen.getByRole("switch", { name: "Mute notifications" });
            expect(mute).toHaveAttribute("aria-checked", "true");
            fireEvent.click(mute);
            expect(mocked.setNotifications).toHaveBeenCalledWith(RoomNotifState.AllMessages);
        });

        it("opens Element's file panel on top of itself, so its back arrow returns here", () => {
            const pushCard = vi
                .spyOn(SDKContextClass.instance.rightPanelStore, "pushCard")
                .mockImplementation(() => {});
            panel(<CirqleContactInfo room={dm} />);
            fireEvent.click(screen.getByRole("button", { name: "Media, links and docs" }));
            expect(pushCard).toHaveBeenCalledWith({ phase: RightPanelPhases.FilePanel }, true, DM);
        });
    });

    describe("Group info", () => {
        it("has favourite, mute, media and Add member, but no Leave group", () => {
            panel(<CirqleGroupInfo room={group} />);
            expect(buttons()).toEqual([
                "Close group info",
                "Add to favourites",
                "Mute notifications",
                "Media, links and docs",
                "Add member",
            ]);
        });

        it("has no Add member or Leave channel in a channel", () => {
            panel(<CirqleGroupInfo room={channel} />);
            expect(screen.getByText("Channel info")).toBeInTheDocument();
            expect(buttons()).toEqual([
                "Close group info",
                "Add to favourites",
                "Mute notifications",
                "Media, links and docs",
            ]);
        });
    });
});
