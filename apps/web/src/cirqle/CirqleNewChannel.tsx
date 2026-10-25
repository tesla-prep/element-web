/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// New channel panel, in place of the chat list, like New group: the WhatsApp
// number the channel belongs to, and its name. Create is one public createRoom
// inside that number's space, which the relay bot answers with the real
// WhatsApp channel (the bridge's create_group/channel) and its room; when
// WhatsApp refuses (some numbers can't have channels), the bot says so and no
// room is left behind. Telegram channels are made on the phone.

import React, { type JSX, useState } from "react";
import { MatrixError, Preset, Visibility } from "matrix-js-sdk/src/matrix";
import { logger } from "matrix-js-sdk/src/logger";

import { useMatrixClientContext } from "../contexts/MatrixClientContext";
import { SDKContextClass } from "../contexts/SDKContextClass";
import dis from "../dispatcher/dispatcher";
import { Action } from "../dispatcher/actions";
import { type ViewRoomPayload } from "../dispatcher/payloads/ViewRoomPayload";
import Modal from "../Modal";
import ErrorDialog from "../components/views/dialogs/ErrorDialog";
import { BackIcon } from "./CirqleIcons";
import { inboxOption } from "./CirqleNewChat";
import { CirqleUiStore } from "./CirqleUiStore";
import { useCirqleInboxes } from "./useCirqleChats";

/** WhatsApp's limit on a channel name (the bridge's channel capability). */
export const CHANNEL_NAME_MAX_LENGTH = 100;

export function CirqleNewChannel(): JSX.Element {
    const client = useMatrixClientContext();
    // Channels are WhatsApp's, and a disconnected number creates nothing
    const inboxes = useCirqleInboxes().filter((inbox) => inbox.network === "whatsapp" && inbox.connected);
    const activeSpace = SDKContextClass.instance.spaceStore.activeSpace;
    const [fromId, setFromId] = useState<string | undefined>(
        () => inboxes.find((inbox) => inbox.spaceId === activeSpace)?.spaceId,
    );
    // As in New group: no number is assumed under All numbers
    const from = inboxes.find((inbox) => inbox.spaceId === fromId) ?? (inboxes.length === 1 ? inboxes[0] : undefined);
    const [name, setName] = useState("");
    const [creating, setCreating] = useState(false);
    const title = name.trim();

    const create = async (): Promise<void> => {
        if (!title || !from || creating) return;
        setCreating(true);
        try {
            const { room_id: roomId } = await client.createRoom({
                name: title,
                visibility: Visibility.Public,
                preset: Preset.PublicChat,
                initial_state: [
                    {
                        type: "m.space.parent",
                        state_key: from.spaceId,
                        content: { via: [client.getDomain() ?? ""], canonical: true },
                    },
                ],
            });
            CirqleUiStore.showSection("channels");
            dis.dispatch<ViewRoomPayload>({ action: Action.ViewRoom, room_id: roomId, metricsTrigger: "Created" });
        } catch (e) {
            logger.error("CIRQLE new channel failed", e);
            setCreating(false);
            Modal.createDialog(ErrorDialog, {
                title: "Couldn't create the channel",
                description:
                    e instanceof MatrixError && e.data.error
                        ? e.data.error
                        : e instanceof Error
                          ? e.message
                          : String(e),
            });
        }
    };

    return (
        <section className="cirqle_NewChat cirqle_NewGroup" aria-labelledby="cirqle_NewChannel_title">
            <div className="cirqle_NewChat_header">
                <button
                    type="button"
                    className="cirqle_iconButton cirqle_iconButton_green cirqle_NewChat_back"
                    aria-label="Back"
                    disabled={creating}
                    onClick={() => CirqleUiStore.closePanel()}
                >
                    <BackIcon />
                </button>
                <h2 id="cirqle_NewChannel_title" className="cirqle_NewChat_title">
                    New channel
                </h2>
            </div>
            {inboxes.length === 0 ? (
                <p className="cirqle_NewChat_hint" role="status">
                    No connected WhatsApp number: channels are WhatsApp's.
                </p>
            ) : (
                <>
                    <div className="cirqle_NewChat_from">
                        <label htmlFor="cirqle_NewChannel_from">Channel of</label>
                        <select
                            id="cirqle_NewChannel_from"
                            value={from?.spaceId ?? ""}
                            disabled={creating}
                            onChange={(ev) => setFromId(ev.target.value)}
                        >
                            {!from && (
                                <option value="" disabled>
                                    Choose a number
                                </option>
                            )}
                            {inboxes.map((inbox) => (
                                <option key={inbox.spaceId} value={inbox.spaceId}>
                                    {inboxOption(inbox)}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="cirqle_NewGroup_nameField">
                        <label htmlFor="cirqle_NewChannel_name">Channel name</label>
                        <input
                            id="cirqle_NewChannel_name"
                            autoFocus
                            maxLength={CHANNEL_NAME_MAX_LENGTH}
                            value={name}
                            disabled={creating}
                            onChange={(ev) => setName(ev.target.value)}
                            onKeyDown={(ev) => {
                                if (ev.key === "Enter") void create();
                                if (ev.key === "Escape") CirqleUiStore.closePanel();
                            }}
                        />
                        <span className="cirqle_NewGroup_count">{CHANNEL_NAME_MAX_LENGTH - name.length}</span>
                    </div>
                    <p className="cirqle_NewGroup_summary">
                        {from
                            ? `A WhatsApp channel of ${from.label}. Anyone can find and follow it on WhatsApp; staff post to it from here.`
                            : "Choose the number the channel belongs to"}
                    </p>
                    {creating && (
                        <p className="cirqle_NewGroup_creating" role="status">
                            Creating channel…
                        </p>
                    )}
                    <button
                        type="button"
                        className="cirqle_NewGroup_create"
                        disabled={!title || !from || creating}
                        onClick={() => void create()}
                    >
                        Create
                    </button>
                </>
            )}
        </section>
    );
}
