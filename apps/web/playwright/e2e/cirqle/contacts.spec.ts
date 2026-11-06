/*
Copyright 2026 CIRQLE.

SPDX-License-Identifier: AGPL-3.0-only
*/

// CIRQLE Contacts (VLA-864): a staff member adds a contact to the shared book and
// finds it in New chat. The relay bot's API (com.cirqle/contacts*, phone_book) is
// answered here, nothing reaches WhatsApp; the homeserver is the usual Synapse.

import { rejectToastIfExists } from "@element-hq/element-web-playwright-common";

import { test as base, expect } from "../../element-web-test";

const NAME = "qa-Alexandra Konstantinopolskaya-Vasilyeva Junior";
const NUMBER = "+1 469 555 0123";

interface Contact {
    number: string;
    name: string;
}

const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const test = base.extend<{ savedContacts: unknown[]; whatsappNumber: void }>({
    // The relay bot's shared book in memory; the fixture's value is what the client asked it to save
    savedContacts: async ({ page }, use) => {
        const book: Contact[] = [];
        const saved: unknown[] = [];
        await page.route("**/_matrix/client/unstable/com.cirqle/**", async (route) => {
            if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
            const path = new URL(route.request().url()).pathname.split("/com.cirqle/")[1];
            const body = route.request().postDataJSON() ?? {};
            let answer: object = {};
            if (path === "contacts") answer = { contacts: book, can_edit: true };
            if (path === "contacts/save") {
                saved.push(body);
                book.push({ number: "+" + body.number.replace(/\D/g, ""), name: body.name });
                answer = { contact: book.at(-1) };
            }
            if (path === "phone_book") {
                const userId = (c: Contact): string =>
                    `@newchat_whatsapp_${body.account}_=${c.number.slice(1)}:localhost`;
                answer = { contacts: book.map((c) => ({ user_id: userId(c), name: c.name, number: c.number })) };
            }
            await route.fulfill({ status: 200, headers: CORS, json: answer });
        });
        await use(saved);
    },
    // A WhatsApp number as the bridge and the relay bot leave it: its space, and its account user in it.
    // `user` signs the staff member in first, so the app's client exists
    whatsappNumber: [
        async ({ app, user, homeserver, request }, use) => {
            const account = await homeserver.registerUser("account_whatsapp_wa-qa", "qa-password", "qa-Main");
            const spaceId = await app.client.createSpace({
                name: "WhatsApp · qa-Main #1",
                topic: "qa-Main +14695550100",
                preset: "public_chat" as any,
                initial_state: [
                    {
                        type: "m.bridge",
                        state_key: "qa/whatsapp",
                        content: {
                            "bridgebot": "@whatsappbot:localhost",
                            "protocol": { id: "whatsapp" },
                            "com.beeper.room_type.v2": "personal_filtering_space",
                        },
                    },
                ],
            });
            await request.post(`${homeserver.baseUrl}/_matrix/client/v3/join/${encodeURIComponent(spaceId)}`, {
                headers: { Authorization: `Bearer ${account.accessToken}` },
                data: {},
            });
            await use();
        },
        { auto: true },
    ],
});

test.describe("CIRQLE Contacts", () => {
    test.use({ displayName: "qa-Staff", config: { brand: "CIRQLE Messenger" } });

    test("adds a contact on Contacts and offers it in New chat", async ({ page, savedContacts }) => {
        // Element's "Notifications" toast would cover the chat list
        await rejectToastIfExists(page, "Notifications", { timeout: 10000 });
        await page.getByRole("button", { name: "Contacts", exact: true }).click();
        await expect(page.getByRole("heading", { name: "Contacts" })).toBeVisible();
        await expect(page.getByText("No contacts yet")).toBeVisible();

        await page.getByRole("button", { name: "New contact" }).click();
        await page.getByLabel("Name").fill(NAME);
        await page.getByLabel("Phone number").fill(NUMBER);
        await page.getByRole("button", { name: "Save" }).click();

        const contacts = page.locator(".cirqle_Contacts");
        await expect(page.getByRole("heading", { name: "Contacts" })).toBeVisible();
        await expect(contacts.getByText(NAME)).toBeVisible();
        await expect(contacts.getByText(NUMBER)).toBeVisible();
        expect(savedContacts).toEqual([{ number: NUMBER, name: NAME }]);

        await page.getByRole("button", { name: "Back to chats" }).click();
        await page.locator(".cirqle_ChatList").getByRole("button", { name: "New chat", exact: true }).click();
        const newChat = page.locator(".cirqle_NewChat");
        await expect(newChat.getByRole("heading", { name: "New chat" })).toBeVisible();
        await expect(newChat.locator(".cirqle_NewChat_section", { hasText: "Contacts" })).toBeVisible();
        await expect(newChat.locator(".cirqle_NewChat_bookRow", { hasText: NAME })).toBeVisible();
        await page.screenshot({ path: test.info().outputPath("new-chat.png") });
    });
});
