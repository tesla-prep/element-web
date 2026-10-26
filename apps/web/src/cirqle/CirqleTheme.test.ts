/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { describe, expect, it, vi } from "vitest";
import { logger } from "matrix-js-sdk/src/logger";

import { cirqleThemeStillLoading } from "./CirqleFeatures";

describe("cirqleThemeStillLoading", () => {
    it("lets the app start when setTheme gave up polling (rejected with nothing)", () => {
        const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
        expect(() => cirqleThemeStillLoading(undefined)).not.toThrow();
        expect(warn).toHaveBeenCalled();
    });

    it("keeps a real stylesheet error", () => {
        const event = new Event("error");
        expect(() => cirqleThemeStillLoading(event)).toThrow();
    });

    it("turns the polling rejection of setTheme into a start", async () => {
        vi.spyOn(logger, "warn").mockImplementation(() => {});
        await expect(Promise.reject(undefined).catch(cirqleThemeStillLoading)).resolves.toBeUndefined();
    });
});
