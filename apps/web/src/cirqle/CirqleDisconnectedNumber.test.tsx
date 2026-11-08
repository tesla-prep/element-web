/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// @vitest-environment happy-dom

import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "test-utils-rtl";
import { createTestClient, mkStubRoom, stubClient } from "test-utils";

import MessageComposer from "../components/views/rooms/MessageComposer";
import MatrixClientContext from "../contexts/MatrixClientContext";
import { ScopedRoomContextProvider } from "../contexts/ScopedRoomContext";
import { TimelineRenderingType, type RoomContextType } from "../contexts/RoomContext";
import { RoomUploadContextProvider } from "../viewmodels/room/RoomUploadViewModel";
import { SDKContext } from "../contexts/SDKContext";
import { SDKContextClass } from "../contexts/SDKContextClass";
import ResizeNotifier from "../utils/ResizeNotifier";
import { RoomPermalinkCreator } from "../utils/permalinks/Permalinks";
import { type Inbox } from "./CirqleInboxes";

const number = vi.hoisted(() => ({ connected: true }));

vi.mock("./CirqleFeatures", async (original) => ({ ...(await original<object>()), isCirqleMessenger: () => true }));
vi.mock("./CirqleInboxes", async (original) => ({
    ...(await original<object>()),
    getInboxes: (): Inbox[] => [
        {
            spaceId: "!main1:server",
            network: "whatsapp",
            label: "Main #1",
            phone: "+1 646 331 3251",
            accountName: "wa-main1",
            childIds: new Set(["!chat:server"]),
            connected: number.connected,
            contactPhones: new Map(),
            ownUsers: new Set(),
        },
    ],
}));

describe("the message field in a chat of a disconnected number", () => {
    stubClient();
    const client = createTestClient();
    const room = mkStubRoom("!chat:server", "Anna", client);

    const renderComposer = (canSendMessages: boolean): void => {
        const context = {
            room,
            canSendMessages,
            narrow: false,
            timelineRenderingType: TimelineRenderingType.Room,
        } satisfies Partial<RoomContextType> as RoomContextType;
        render(
            <SDKContext.Provider value={SDKContextClass.instance}>
                <MatrixClientContext.Provider value={client}>
                    <ScopedRoomContextProvider {...context}>
                        <RoomUploadContextProvider>
                            <MessageComposer
                                room={room}
                                resizeNotifier={new ResizeNotifier()}
                                permalinkCreator={new RoomPermalinkCreator(room)}
                            />
                        </RoomUploadContextProvider>
                    </ScopedRoomContextProvider>
                </MatrixClientContext.Provider>
            </SDKContext.Provider>,
        );
    };

    it("is replaced by a note that the number needs to be reconnected", () => {
        number.connected = false;
        renderComposer(false);
        expect(screen.queryByRole("textbox")).toBeNull();
        expect(screen.getByText(/This number is disconnected and needs to be reconnected/)).toBeInTheDocument();
        expect(screen.queryByTitle("You write from this number")).toBeNull();
    });

    it("stays when the number is connected", () => {
        number.connected = true;
        renderComposer(true);
        expect(screen.getByRole("textbox")).toBeInTheDocument();
        expect(screen.getByTitle("You write from this number")).toHaveTextContent("Main #1");
        expect(screen.queryByText(/This number is disconnected/)).toBeNull();
    });
});
