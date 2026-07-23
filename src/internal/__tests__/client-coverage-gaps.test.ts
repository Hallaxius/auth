import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DiscordClient } from "../client";

describe("DiscordClient - coverage gaps", () => {
	let client: DiscordClient;
	const mockClientId = "test-client-id";
	const mockClientSecret = "test-client-secret";
	const originalFetch = global.fetch;

	beforeEach(() => {
		client = new DiscordClient({ clientId: mockClientId, clientSecret: mockClientSecret });
		vi.clearAllMocks();
		global.fetch = vi.fn<typeof fetch>();
	});

	afterEach(() => {
		global.fetch = originalFetch;
		vi.restoreAllMocks();
	});

	describe("getConnections - line 367-368", () => {
		it("throws error when fetch fails with non-ok response", async () => {
			const mockFetch = vi.fn(async () => {
				return new Response("Internal Server Error", {
					status: 500,
					statusText: "Internal Server Error",
				});
			});
			global.fetch = mockFetch;

			await expect(client.getUserConnections("valid-token")).rejects.toThrow(
				"Discord API request failed: 500",
			);
		});

		it("throws error when rate limit is hit", async () => {
			const mockFetch = vi.fn(async () => {
				return new Response("Rate limited", {
					status: 429,
					statusText: "Too Many Requests",
				});
			});
			global.fetch = mockFetch;

			await expect(client.getUserConnections("valid-token")).rejects.toThrow(
				"Discord API rate limit exceeded",
			);
		});
	});

	describe("getGuildMember - line 383-384", () => {
		it("throws error when fetch fails with non-ok response", async () => {
			const mockFetch = vi.fn(async () => {
				return new Response("Not Found", {
					status: 404,
					statusText: "Not Found",
				});
			});
			global.fetch = mockFetch;

			await expect(
				client.getGuildMember("guild-123", "user-456", "bot-token"),
			).rejects.toThrow("Discord API request failed: 404");
		});

		it("throws error with empty response body", async () => {
			const mockFetch = vi.fn(async () => {
				return new Response("", {
					status: 502,
					statusText: "Bad Gateway",
				});
			});
			global.fetch = mockFetch;

			await expect(
				client.getGuildMember("guild-123", "user-456", "bot-token"),
			).rejects.toThrow("Discord API request failed: 502");
		});
	});
});
