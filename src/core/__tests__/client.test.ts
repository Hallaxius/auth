import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { DiscordClient } from "../client";

const CLIENT_ID = "test-client-id-123";
const CLIENT_SECRET = "test-client-secret";
const REDIRECT_URI = "https://example.com/callback";

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
	originalFetch = globalThis.fetch;
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});

function mockFetch(
	response: unknown,
	status = 200,
	headers: Record<string, string> = {},
) {
	globalThis.fetch = mock(async () => {
		return {
			ok: status >= 200 && status < 300,
			status,
			headers: new Headers(headers),
			json: async () => response,
			text: async () => JSON.stringify(response),
		} as Response;
	}) as unknown as typeof globalThis.fetch;
}

describe("DiscordClient", () => {
	const client = new DiscordClient(CLIENT_ID, CLIENT_SECRET);

	describe("generateAuthUrl", () => {
		it("includes all required query parameters", () => {
			const url = client.generateAuthUrl({
				clientId: CLIENT_ID,
				redirectUri: REDIRECT_URI,
				scopes: ["identify", "email"],
				state: "test-state-123",
			});

			const parsed = new URL(url);
			expect(parsed.origin + parsed.pathname).toBe(
				"https://discord.com/oauth2/authorize",
			);
			expect(parsed.searchParams.get("client_id")).toBe(CLIENT_ID);
			expect(parsed.searchParams.get("redirect_uri")).toBe(REDIRECT_URI);
			expect(parsed.searchParams.get("response_type")).toBe("code");
			expect(parsed.searchParams.get("scope")).toBe("identify email");
			expect(parsed.searchParams.get("state")).toBe("test-state-123");
		});

		it("includes prompt when provided", () => {
			const url = client.generateAuthUrl({
				clientId: CLIENT_ID,
				redirectUri: REDIRECT_URI,
				scopes: ["identify"],
				state: "test",
				prompt: "consent",
			});

			const parsed = new URL(url);
			expect(parsed.searchParams.get("prompt")).toBe("consent");
		});

		it("defaults response_type to code", () => {
			const url = client.generateAuthUrl({
				clientId: CLIENT_ID,
				redirectUri: REDIRECT_URI,
				scopes: ["identify"],
				state: "test",
			});

			const parsed = new URL(url);
			expect(parsed.searchParams.get("response_type")).toBe("code");
		});
	});

	describe("exchangeCode", () => {
		it("exchanges a code for tokens", async () => {
			const expectedResponse = {
				access_token: "access-123",
				token_type: "Bearer",
				expires_in: 604800,
				refresh_token: "refresh-456",
				scope: "identify email",
			};

			mockFetch(expectedResponse);

			const result = await client.exchangeCode({
				clientId: CLIENT_ID,
				clientSecret: CLIENT_SECRET,
				code: "auth-code-xyz",
				redirectUri: REDIRECT_URI,
			});

			expect(result.access_token).toBe("access-123");
			expect(result.refresh_token).toBe("refresh-456");
		});

		it("throws on non-ok response", async () => {
			mockFetch({ error: "invalid_grant" }, 400);

			expect(
				client.exchangeCode({
					clientId: CLIENT_ID,
					clientSecret: CLIENT_SECRET,
					code: "bad-code",
					redirectUri: REDIRECT_URI,
				}),
			).rejects.toThrow();
		});
	});

	describe("refreshToken", () => {
		it("refreshes tokens", async () => {
			const expectedResponse = {
				access_token: "new-access-789",
				token_type: "Bearer",
				expires_in: 604800,
				refresh_token: "new-refresh-000",
				scope: "identify",
			};

			mockFetch(expectedResponse);

			const result = await client.refreshToken({
				clientId: CLIENT_ID,
				clientSecret: CLIENT_SECRET,
				refreshToken: "old-refresh-token",
			});

			expect(result.access_token).toBe("new-access-789");
		});

		it("passes scopes when provided", async () => {
			mockFetch({
				access_token: "new-access",
				refresh_token: "new-refresh",
				scope: "identify email",
				expires_in: 604800,
				token_type: "Bearer",
			});

			await client.refreshToken({
				clientId: CLIENT_ID,
				clientSecret: CLIENT_SECRET,
				refreshToken: "refresh-token",
				scopes: ["identify", "email"],
			});

			// scopes should be in the request body sent to Discord
			// we just verify no error is thrown
		});

		it("throws on non-ok response", async () => {
			mockFetch({ error: "invalid_token" }, 401);

			expect(
				client.refreshToken({
					clientId: CLIENT_ID,
					clientSecret: CLIENT_SECRET,
					refreshToken: "bad-token",
				}),
			).rejects.toThrow();
		});
	});

	describe("revokeToken", () => {
		it("revokes a token", async () => {
			mockFetch({}, 200);

			await expect(
				client.revokeToken({
					clientId: CLIENT_ID,
					clientSecret: CLIENT_SECRET,
					accessToken: "token-to-revoke",
				}),
			).resolves.toBeUndefined();
		});

		it("throws on non-ok response", async () => {
			mockFetch({ error: "invalid_token" }, 400);

			expect(
				client.revokeToken({
					clientId: CLIENT_ID,
					clientSecret: CLIENT_SECRET,
					accessToken: "bad-token",
				}),
			).rejects.toThrow();
		});
	});

	describe("getUser", () => {
		it("returns user data", async () => {
			const expectedUser = {
				id: "123456789",
				username: "testuser",
				discriminator: "0",
				global_name: "Test User",
				avatar: "abc123",
				email: "test@example.com",
				verified: true,
				locale: "en-US",
				mfa_enabled: false,
				banner: null,
				banner_color: null,
				accent_color: null,
				premium_type: 0,
				public_flags: 0,
				avatar_decoration: null,
			};

			mockFetch(expectedUser);

			const result = await client.getUser("valid-access-token");
			expect(result.id).toBe("123456789");
			expect(result.username).toBe("testuser");
			expect(result.global_name).toBe("Test User");
			expect(result.email).toBe("test@example.com");
		});

		it("throws on non-ok response", async () => {
			mockFetch({ message: "401: Unauthorized" }, 401);

			expect(client.getUser("invalid-token")).rejects.toThrow();
		});
	});

	describe("getUserGuilds", () => {
		it("returns an array of guilds", async () => {
			const expectedGuilds = [
				{ id: "guild-1", name: "Test Server", owner: true },
				{ id: "guild-2", name: "Another Server", owner: false },
			];

			mockFetch(expectedGuilds);

			const result = await client.getUserGuilds("valid-access-token");
			expect(result).toHaveLength(2);
			expect(result[0].id).toBe("guild-1");
			expect(result[1].name).toBe("Another Server");
		});
	});

	describe("getUserConnections", () => {
		it("returns an array of connections", async () => {
			const expectedConnections = [
				{ id: "conn-1", name: "GitHub", type: "github", verified: true },
			];

			mockFetch(expectedConnections);

			const result = await client.getUserConnections("valid-access-token");
			expect(result).toHaveLength(1);
			expect(result[0].type).toBe("github");
		});
	});

	describe("addMember", () => {
		const GUILD_ID = "guild-123";
		const USER_ID = "user-456";
		const ACCESS_TOKEN = "user-access-token";
		const BOT_TOKEN = "bot-token-789";

		it("succeeds on 201 (member created)", async () => {
			mockFetch({}, 201);

			await expect(
				client.addMember({
					guildId: GUILD_ID,
					userId: USER_ID,
					accessToken: ACCESS_TOKEN,
					botToken: BOT_TOKEN,
				}),
			).resolves.toBeUndefined();
		});

		it("succeeds on 204 (already a member)", async () => {
			mockFetch({}, 204);

			await expect(
				client.addMember({
					guildId: GUILD_ID,
					userId: USER_ID,
					accessToken: ACCESS_TOKEN,
					botToken: BOT_TOKEN,
				}),
			).resolves.toBeUndefined();
		});

		it("sends nick and roles when provided", async () => {
			globalThis.fetch = mock(async (_url: RequestInfo, init?: RequestInit) => {
				const body = JSON.parse(init?.body as string);
				expect(body.nick).toBe("Test User");
				expect(body.roles).toEqual(["role-1", "role-2"]);
				return {
					ok: true,
					status: 201,
					headers: new Headers({}),
					json: async () => ({}),
					text: async () => "",
				} as Response;
			}) as unknown as typeof globalThis.fetch;

			await client.addMember({
				guildId: GUILD_ID,
				userId: USER_ID,
				accessToken: ACCESS_TOKEN,
				botToken: BOT_TOKEN,
				nick: "Test User",
				roles: ["role-1", "role-2"],
			});
		});

		it("throws on non-ok response", async () => {
			mockFetch({ message: "Missing Permissions" }, 403);

			await expect(
				client.addMember({
					guildId: GUILD_ID,
					userId: USER_ID,
					accessToken: ACCESS_TOKEN,
					botToken: BOT_TOKEN,
				}),
			).rejects.toThrow();
		});
	});
});
