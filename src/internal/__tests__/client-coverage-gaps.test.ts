import { beforeEach, describe, expect, it, vi } from "vitest";
import { DiscordClient } from "../client";

describe("DiscordClient - coverage gaps", () => {
	let client: DiscordClient;
	const mockClientId = "test-client-id";
	const mockClientSecret = "test-client-secret";

	beforeEach(() => {
		client = new DiscordClient(mockClientId, mockClientSecret);
		vi.clearAllMocks();
	});

	describe("getConnections - line 367-368", () => {
		it("throws error when fetch fails with non-ok response", async () => {
			const mockFetch = vi.fn(async () => {
				return new Response("Internal Server Error", {
					status: 500,
					statusText: "Internal Server Error",
				});
			});
			vi.stubGlobal("fetch", mockFetch);

			await expect(client.getUserConnections("valid-token")).rejects.toThrow(
				"Discord API request failed: 500",
			);

			vi.unstubAllGlobals();
		});

		it("throws error when rate limit is hit", async () => {
			const mockFetch = vi.fn(async () => {
				return new Response("Rate limited", {
					status: 429,
					statusText: "Too Many Requests",
				});
			});
			vi.stubGlobal("fetch", mockFetch);

			await expect(client.getUserConnections("valid-token")).rejects.toThrow(
				"Discord API rate limit exceeded",
			);

			vi.unstubAllGlobals();
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
			vi.stubGlobal("fetch", mockFetch);

			await expect(
				client.getGuildMember("guild-123", "user-456", "bot-token"),
			).rejects.toThrow("Discord API request failed: 404");

			vi.unstubAllGlobals();
		});

		it("throws error with empty response body", async () => {
			const mockFetch = vi.fn(async () => {
				return new Response("", {
					status: 502,
					statusText: "Bad Gateway",
				});
			});
			vi.stubGlobal("fetch", mockFetch);

			await expect(
				client.getGuildMember("guild-123", "user-456", "bot-token"),
			).rejects.toThrow("Discord API request failed: 502");

			vi.unstubAllGlobals();
		});
	});
});
