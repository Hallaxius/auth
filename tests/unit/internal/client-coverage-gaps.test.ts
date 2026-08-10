import { afterEach, beforeEach, describe, expect, it, jest, mock } from "bun:test";
import { DiscordClient } from "../../../src/";

describe("DiscordClient - coverage gaps", () => {
	let client: DiscordClient;
	const mockClientId = "test-client-id";
	const mockClientSecret = "test-client-secret";
	const originalFetch = global.fetch;

	beforeEach(() => {
		client = new DiscordClient({
			clientId: mockClientId,
			clientSecret: mockClientSecret,
		});
		mock.clearAllMocks();
		global.fetch = mock() as unknown as typeof fetch;
	});

	afterEach(() => {
		global.fetch = originalFetch;
		jest.restoreAllMocks();
	});

	describe("getConnections - line 367-368", () => {
		it("throws error when fetch fails with non-ok response", async () => {
			const mockFetch = mock(async () => {
				return new Response("Internal Server Error", {
					status: 500,
					statusText: "Internal Server Error",
				});
			}) as unknown as typeof fetch;
			global.fetch = mockFetch;

			await expect(client.getUserConnections("valid-token")).rejects.toThrow(
				"Discord API request failed: 500",
			);
		});

		it("throws error when rate limit is hit", async () => {
			const mockFetch = mock(async () => {
				return new Response("Rate limited", {
					status: 429,
					statusText: "Too Many Requests",
				});
			}) as unknown as typeof fetch;
			global.fetch = mockFetch;

			await expect(client.getUserConnections("valid-token")).rejects.toThrow(
				"Discord API rate limit exceeded",
			);
		});
	});

	describe("getGuildMember - line 383-384", () => {
		it("throws error when fetch fails with non-ok response", async () => {
			const mockFetch = mock(async () => {
				return new Response("Not Found", {
					status: 404,
					statusText: "Not Found",
				});
			}) as unknown as typeof fetch;
			global.fetch = mockFetch;

			await expect(
				client.getGuildMember("guild-123", "user-456", "bot-token"),
			).rejects.toThrow("Discord API request failed: 404");
		});

		it("throws error with empty response body", async () => {
			const mockFetch = mock(async () => {
				return new Response("", {
					status: 502,
					statusText: "Bad Gateway",
				});
			}) as unknown as typeof fetch;
			global.fetch = mockFetch;

			await expect(
				client.getGuildMember("guild-123", "user-456", "bot-token"),
			).rejects.toThrow("Discord API request failed: 502");
		});
	});
});
