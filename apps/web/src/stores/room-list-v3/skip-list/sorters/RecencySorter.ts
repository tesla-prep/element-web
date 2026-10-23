/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import type { Room } from "matrix-js-sdk/src/matrix";
import { type Sorter, SortingAlgorithm } from ".";
import { BaseRecencySorter } from "./BaseRecencySorter";
import { DefaultTagID } from "../tag";

export class RecencySorter extends BaseRecencySorter implements Sorter {
    public get type(): SortingAlgorithm.Recency {
        return SortingAlgorithm.Recency;
    }

    /**
     * This sorter sorts rooms by recency, with low priority rooms at the bottom of the list.
     * CIRQLE: muted chats keep their place by recency, as on WhatsApp.
     *
     * For two rooms A and B:
     * - If getScore(A) - getScore(B) > 0, A should come after B
     * - If getScore(A) - getScore(B) < 0, A should come before B
     * - If getScore(A) - getScore(B) = 0, no special ordering needed, just use recency
     */
    protected getScore(room: Room): number {
        return room.tags[DefaultTagID.LowPriority] ? 2 : 0;
    }
}
