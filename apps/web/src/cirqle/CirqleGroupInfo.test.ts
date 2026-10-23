/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { membersLabel } from "./CirqleGroupInfo";

describe("membersLabel", () => {
    it("counts members in English", () => {
        expect(membersLabel(1)).toBe("1 member");
        expect(membersLabel(0)).toBe("0 members");
        expect(membersLabel(3)).toBe("3 members");
    });
});
