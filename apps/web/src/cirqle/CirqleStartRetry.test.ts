/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "matrix-js-sdk/src/logger";

import SdkConfig from "../SdkConfig";
import { CIRQLE_BRAND, isCirqleDownloadFailure, reloadCirqleAfterDownloadFailure } from "./CirqleFeatures";

const NOW = 1_800_000_000_000;
const wasmAborted = new TypeError("WebAssembly compilation aborted: Network error: error");

describe("reloadCirqleAfterDownloadFailure", () => {
    let reload: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.spyOn(logger, "warn").mockImplementation(() => {});
        reload = vi.fn();
        Object.defineProperty(window, "location", { value: { ...window.location, reload }, configurable: true });
        sessionStorage.clear();
        SdkConfig.put({ brand: CIRQLE_BRAND });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        SdkConfig.reset();
        sessionStorage.clear();
    });

    it("tells a download that failed from other start errors", () => {
        expect(isCirqleDownloadFailure(wasmAborted)).toBe(true);
        expect(
            isCirqleDownloadFailure(Object.assign(new Error("section extends past end"), { name: "CompileError" })),
        ).toBe(true);
        expect(isCirqleDownloadFailure(new TypeError("Failed to fetch"))).toBe(true);
        expect(isCirqleDownloadFailure(new TypeError("Load failed"))).toBe(true);
        expect(isCirqleDownloadFailure(new Error("Error decrypting secret: bad MAC"))).toBe(false);
        expect(isCirqleDownloadFailure("WebAssembly")).toBe(false);
    });

    it("reloads the page instead of the dialog, twice at most within two minutes", () => {
        expect(reloadCirqleAfterDownloadFailure(wasmAborted, NOW)).toBe(true);
        vi.advanceTimersByTime(1000);
        expect(reload).toHaveBeenCalledTimes(1);
        expect(reloadCirqleAfterDownloadFailure(wasmAborted, NOW + 5000)).toBe(true);
        vi.advanceTimersByTime(3000);
        expect(reload).toHaveBeenCalledTimes(2);
        expect(reloadCirqleAfterDownloadFailure(wasmAborted, NOW + 10_000)).toBe(false);
        expect(reloadCirqleAfterDownloadFailure(wasmAborted, NOW + 3 * 60 * 1000)).toBe(true);
    });

    it("leaves other errors and stock Element to the dialog", () => {
        expect(reloadCirqleAfterDownloadFailure(new Error("Error decrypting secret"), NOW)).toBe(false);
        SdkConfig.reset();
        expect(reloadCirqleAfterDownloadFailure(wasmAborted, NOW)).toBe(false);
        vi.runAllTimers();
        expect(reload).not.toHaveBeenCalled();
    });
});
