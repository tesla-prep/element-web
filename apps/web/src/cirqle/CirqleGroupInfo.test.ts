/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { memberSubline, membersLabel } from "./CirqleGroupInfo";

describe("membersLabel", () => {
    it("counts members in English", () => {
        expect(membersLabel(1)).toBe("1 member");
        expect(membersLabel(0)).toBe("0 members");
        expect(membersLabel(3)).toBe("3 members");
    });
});

describe("memberSubline", () => {
    it("shows a member's number under their name, but not twice for someone named by it", () => {
        expect(memberSubline("Nellie", "+1 929 991 7911")).toBe("+1 929 991 7911");
        expect(memberSubline("+1 201 315 5404", "+1 201 315 5404")).toBeUndefined();
        expect(memberSubline("+12013155404", "+1 201 315 5404")).toBeUndefined();
        expect(memberSubline("Nellie", undefined)).toBeUndefined();
    });
});
