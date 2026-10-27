/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import SdkConfig from "../SdkConfig";
import { getStoredSessionVars } from "../Lifecycle";
import { CIRQLE_BRAND, cirqleMovedHomeserverUrl } from "./CirqleFeatures";

const NEW = "https://chat.cirqlecirqle.com";
const OLD = "https://matrix.cirqlecirqle.com";

describe("cirqleMovedHomeserverUrl", () => {
    beforeEach(() => {
        localStorage.clear();
        SdkConfig.put({
            brand: CIRQLE_BRAND,
            default_server_config: { "m.homeserver": { base_url: NEW, server_name: "matrix.cirqlecirqle.com" } },
            cirqle_moved_homeservers: [OLD],
        } as Parameters<typeof SdkConfig.put>[0]);
    });

    afterEach(() => {
        SdkConfig.reset();
        localStorage.clear();
    });

    it("moves a session signed in at the old address, with or without a trailing slash, and stores it", () => {
        expect(cirqleMovedHomeserverUrl(OLD)).toBe(NEW);
        expect(localStorage.getItem("mx_hs_url")).toBe(NEW);
        expect(cirqleMovedHomeserverUrl(OLD + "/")).toBe(NEW);
    });

    it("leaves other addresses and sessions already moved alone", () => {
        expect(cirqleMovedHomeserverUrl(NEW)).toBe(NEW);
        expect(cirqleMovedHomeserverUrl("https://matrix.org")).toBe("https://matrix.org");
        expect(cirqleMovedHomeserverUrl(null)).toBeNull();
        expect(localStorage.getItem("mx_hs_url")).toBeNull();
    });

    it("does nothing without the list in config.json", () => {
        SdkConfig.reset();
        SdkConfig.put({ default_server_config: { "m.homeserver": { base_url: NEW } } });
        expect(cirqleMovedHomeserverUrl(OLD)).toBe(OLD);
    });

    it("is what a restored session gets, with its token and device unchanged", async () => {
        localStorage.setItem("mx_hs_url", OLD);
        localStorage.setItem("mx_user_id", "@vchizhov:matrix.cirqlecirqle.com");
        localStorage.setItem("mx_device_id", "DEVICE");
        const vars = await getStoredSessionVars();
        expect(vars.hsUrl).toBe(NEW);
        expect(vars.userId).toBe("@vchizhov:matrix.cirqlecirqle.com");
        expect(vars.deviceId).toBe("DEVICE");
    });
});
