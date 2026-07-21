import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DiscordClient } from "../client";

vi.stubGlobal("fetch", vi.fn());

describe("DiscordClient - Full Coverage", () => {
	let client: DiscordClient;
	const mockClientId = "test-client-id";
	const mockClientSecret = "test-client-secret";

	beforeEach(() => {
		client = new DiscordClient(mockClientId, mockClientSecret);
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("exchangeCode", () => {
		it("exchanges code successfully", async () => {
			const mockTokenResponse = {
				access_token: "access-123",
				refresh_token: "refresh-456",
				expires_in: 3600,
				token_type: "Bearer",
			};

			(global.fetch as any).mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve(mockTokenResponse),
				headers: new Headers(),
			});

			const result = await client.exchangeCode({
				clientId: mockClientId,
				clientSecret: mockClientSecret,
				grantType: "authorization_code",
				code: "auth-code-123",
				redirectUri: "https://example.com/callback",
			});

			expect(result).toEqual(mockTokenResponse);
			expect(global.fetch).toHaveBeenCalledWith(
				"https://discord.com/api/v10/oauth2/token",
				expect.objectContaining({ method: "POST" }),
			);
		});

		it("includes code_verifier when provided", async () => {
			const mockTokenResponse = {
				access_token: "access-123",
				refresh_token: "refresh-456",
				expires_in: 3600,
			};

			(global.fetch as any).mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve(mockTokenResponse),
				headers: new Headers(),
			});

			await client.exchangeCode({
				clientId: mockClientId,
				clientSecret: mockClientSecret,
				code: "code-123",
				redirectUri: "https://example.com",
				codeVerifier: "verifier-abc",
			});

			const callArgs = (global.fetch as any).mock.calls[0];
			const body = callArgs[1]?.body as URLSearchParams;
			expect(body.get("code_verifier")).toBe("verifier-abc");
		});

		it("throws error on failed exchange", async () => {
			(global.fetch as any).mockResolvedValueOnce({
				ok: false,
				status: 400,
				text: () => Promise.resolve("Invalid code"),
				headers: new Headers(),
			});

			await expect(
				client.exchangeCode({
					clientId: mockClientId,
					clientSecret: mockClientSecret,
					code: "invalid-code",
					redirectUri: "https://example.com",
				}),
			).rejects.toThrow("Discord API request failed: 400 Invalid code");
		});
	});

	describe("fetchWithRateLimitHandling", () => {
		it("handles successful request", async () => {
			const mockResponse = { data: "test" };
			(global.fetch as any).mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve(mockResponse),
				headers: new Headers(),
			});

			const res = await client.fetchWithRateLimitHandling(
				"https://discord.com/api/test",
			);
			expect(res.ok).toBe(true);
		});

		it("handles timeout error", async () => {
			const abortError = new Error("Timeout");
			abortError.name = "AbortError";
			(global.fetch as any).mockRejectedValueOnce(abortError);

			await expect(
				client.fetchWithRateLimitHandling("https://discord.com/api/test"),
			).rejects.toThrow("Discord API request timed out");
		});

		it("handles network error", async () => {
			(global.fetch as any).mockRejectedValueOnce(new Error("Network error"));

			await expect(
				client.fetchWithRateLimitHandling("https://discord.com/api/test"),
			).rejects.toThrow("Discord API request failed");
		});

		it("handles 429 rate limit with Retry-After header", async () => {
			(global.fetch as any).mockResolvedValueOnce({
				ok: false,
				status: 429,
				headers: new Headers({ "Retry-After": "60" }),
				text: () => Promise.resolve("Rate limited"),
			});

			await expect(
				client.fetchWithRateLimitHandling("https://discord.com/api/test"),
			).rejects.toThrow("Discord API rate limit exceeded, retry after 60000ms");
		});

		it("handles global rate limit", async () => {
			(global.fetch as any).mockResolvedValueOnce({
				ok: false,
				status: 429,
				headers: new Headers({
					"X-RateLimit-Global": "true",
					"X-RateLimit-Reset": String(Math.floor(Date.now() / 1000 + 30)),
				}),
				text: () => Promise.resolve("Global rate limited"),
			});

			await expect(
				client.fetchWithRateLimitHandling("https://discord.com/api/test"),
			).rejects.toThrow("Discord API rate limit exceeded");
		});

		it("handles rate limit with X-RateLimit-Remaining = 0", async () => {
			(global.fetch as any).mockResolvedValueOnce({
				ok: false,
				status: 403,
				headers: new Headers({
					"X-RateLimit-Remaining": "0",
					"Retry-After": "30",
				}),
				text: () => Promise.resolve("Rate limited"),
			});

			await expect(
				client.fetchWithRateLimitHandling("https://discord.com/api/test"),
			).rejects.toThrow("Discord API rate limit exceeded, retry after 30000ms");
		});

		it("handles rate limit using X-RateLimit-Reset for retry time", async () => {
			const resetTime = Math.floor(Date.now() / 1000 + 45);
			(global.fetch as any).mockResolvedValueOnce({
				ok: false,
				status: 429,
				headers: new Headers({
					"X-RateLimit-Reset": String(resetTime),
				}),
				text: () => Promise.resolve("Rate limited"),
			});

			await expect(
				client.fetchWithRateLimitHandling("https://discord.com/api/test"),
			).rejects.toThrow("Discord API rate limit exceeded");
		});

		it("handles non-OK response with error text", async () => {
			(global.fetch as any).mockResolvedValueOnce({
				ok: false,
				status: 500,
				headers: new Headers(),
				text: () => Promise.resolve("Internal server error"),
			});

			await expect(
				client.fetchWithRateLimitHandling("https://discord.com/api/test"),
			).rejects.toThrow(
				"Discord API request failed: 500 Internal server error",
			);
		});

		it("handles non-OK response when text() fails", async () => {
			(global.fetch as any).mockResolvedValueOnce({
				ok: false,
				status: 500,
				headers: new Headers(),
				text: () => Promise.reject(new Error("Cannot read text")),
			});

			await expect(
				client.fetchWithRateLimitHandling("https://discord.com/api/test"),
			).rejects.toThrow("Discord API request failed: 500 Unknown error");
		});
	});

	describe("refreshToken", () => {
		it("refreshes token successfully", async () => {
			const mockResponse = {
				access_token: "new-access-123",
				refresh_token: "new-refresh-456",
				expires_in: 3600,
			};

			(global.fetch as any).mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve(mockResponse),
				headers: new Headers(),
			});

			const result = await client.refreshToken({
				clientId: mockClientId,
				clientSecret: mockClientSecret,
				refreshToken: "old-refresh-token",
			});

			expect(result).toEqual(mockResponse);
		});

		it("includes scopes when provided", async () => {
			(global.fetch as any).mockResolvedValueOnce({
				ok: true,
				json: () =>
					Promise.resolve({
						access_token: "new-access",
						refresh_token: "new-refresh",
						expires_in: 3600,
					}),
				headers: new Headers(),
			});

			await client.refreshToken({
				clientId: mockClientId,
				clientSecret: mockClientSecret,
				refreshToken: "old-token",
				scopes: ["identify", "email"],
			});

			const callArgs = (global.fetch as any).mock.calls[0];
			const body = callArgs[1]?.body as URLSearchParams;
			expect(body.get("scope")).toBe("identify email");
		});

		it("throws error on failed refresh", async () => {
			(global.fetch as any).mockResolvedValueOnce({
				ok: false,
				status: 401,
				text: () => Promise.resolve("Invalid refresh token"),
				headers: new Headers(),
			});

			await expect(
				client.refreshToken({
					clientId: mockClientId,
					clientSecret: mockClientSecret,
					refreshToken: "invalid-token",
				}),
			).rejects.toThrow(
				"Discord API request failed: 401 Invalid refresh token",
			);
		});
	});

	describe("fetchWithAutoRefresh", () => {
		it("succeeds on first try", async () => {
			const mockResult = { data: "success" };
			const requestFn = vi.fn().mockResolvedValueOnce(mockResult);

			const result = await client.fetchWithAutoRefresh(
				"access-token-123",
				"refresh-token-456",
				requestFn,
			);

			expect(result).toEqual(mockResult);
			expect(requestFn).toHaveBeenCalledTimes(1);
			expect(requestFn).toHaveBeenCalledWith("access-token-123");
		});

		it("refreshes token on 401 expired error and retries", async () => {
			const mockNewTokens = {
				access_token: "new-access-789",
				refresh_token: "new-refresh-012",
				expires_in: 3600,
			};

			const expiredError = {
				code: "TOKEN_EXPIRED",
				message: "Token has expired",
				status: 401,
			};

			const mockResult = { data: "success-after-refresh" };

			(global.fetch as any).mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve(mockNewTokens),
				headers: new Headers(),
			});

			const requestFn = vi
				.fn()
				.mockRejectedValueOnce(expiredError)
				.mockResolvedValueOnce(mockResult);

			const result = await client.fetchWithAutoRefresh(
				"expired-access",
				"valid-refresh",
				requestFn,
			);

			expect(result).toEqual(mockResult);
			expect(requestFn).toHaveBeenCalledTimes(2);
			expect(requestFn).toHaveBeenNthCalledWith(1, "expired-access");
			expect(requestFn).toHaveBeenNthCalledWith(2, "new-access-789");
		});

		it("updates storage on successful refresh", async () => {
			const mockNewTokens = {
				access_token: "new-access",
				refresh_token: "new-refresh",
				expires_in: 3600,
			};

			(global.fetch as any).mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve(mockNewTokens),
				headers: new Headers(),
			});

			const mockStorage = {
				update: vi.fn().mockResolvedValue(undefined),
			};

			const expiredError = { code: "TOKEN_EXPIRED", status: 401 };
			const requestFn = vi
				.fn()
				.mockRejectedValueOnce(expiredError)
				.mockResolvedValueOnce({ data: "success" });

			await client.fetchWithAutoRefresh("expired", "refresh", requestFn, {
				storage: mockStorage as any,
				userId: "user-123",
			});

			expect(mockStorage.update).toHaveBeenCalledWith(
				"user-123",
				expect.objectContaining({
					accessToken: "new-access",
					refreshToken: "new-refresh",
					tokenExpiresAt: expect.any(Number),
				}),
			);
		});

		it("throws TOKEN_EXPIRED after max retries exceeded", async () => {
			(global.fetch as any).mockRejectedValueOnce(
				new Error("Refresh token invalid"),
			);

			const expiredError = { code: "TOKEN_EXPIRED", status: 401 };
			const requestFn = vi.fn().mockRejectedValue(expiredError);

			await expect(
				client.fetchWithAutoRefresh("expired", "invalid-refresh", requestFn, {
					maxRetries: 0,
				}),
			).rejects.toThrow("Token has expired and could not be refreshed");
		});

		it("continues on refresh failure and retries", async () => {
			const expiredError = { code: "TOKEN_EXPIRED", status: 401 };

			(global.fetch as any).mockRejectedValueOnce(new Error("Refresh failed"));

			const mockResult = { data: "success" };
			const requestFn = vi
				.fn()
				.mockRejectedValueOnce(expiredError)
				.mockRejectedValueOnce(expiredError)
				.mockResolvedValueOnce(mockResult);

			const result = await client.fetchWithAutoRefresh(
				"expired",
				"refresh",
				requestFn,
				{ maxRetries: 2 },
			);

			expect(result).toEqual(mockResult);
		});

		it("throws original error on non-expired 401", async () => {
			const nonExpiredError = new Error("Invalid token");
			(nonExpiredError as any).status = 401;

			const requestFn = vi.fn().mockRejectedValueOnce(nonExpiredError);

			await expect(
				client.fetchWithAutoRefresh("invalid-token", "refresh", requestFn),
			).rejects.toThrow("Invalid token");
		});

		it("throws error when all retries exhausted", async () => {
			const persistentError = new Error("Persistent failure");

			const requestFn = vi.fn().mockRejectedValue(persistentError);

			await expect(
				client.fetchWithAutoRefresh("token", "refresh", requestFn, {
					maxRetries: 2,
				}),
			).rejects.toThrow("Persistent failure");
		});
	});

	describe("revokeToken", () => {
		it("revokes token successfully", async () => {
			(global.fetch as any).mockResolvedValueOnce({
				ok: true,
				headers: new Headers(),
			});

			await expect(
				client.revokeToken({
					clientId: mockClientId,
					clientSecret: mockClientSecret,
					accessToken: "token-to-revoke",
				}),
			).resolves.toBeUndefined();
		});

		it("throws error on failed revoke", async () => {
			(global.fetch as any).mockResolvedValueOnce({
				ok: false,
				status: 400,
				text: () => Promise.resolve("Invalid token"),
				headers: new Headers(),
			});

			await expect(
				client.revokeToken({
					clientId: mockClientId,
					clientSecret: mockClientSecret,
					accessToken: "invalid-token",
				}),
			).rejects.toThrow("Discord API request failed: 400 Invalid token");
		});
	});

	describe("addMember", () => {
		it("adds member with minimal params", async () => {
			(global.fetch as any).mockResolvedValueOnce({
				ok: true,
				status: 201,
				headers: new Headers(),
			});

			await expect(
				client.addMember({
					accessToken: "bot-token",
					guildId: "guild-123",
					userId: "user-456",
					botToken: "bot-token",
				}),
			).resolves.toBeUndefined();
		});

		it("adds member with nick", async () => {
			(global.fetch as any).mockResolvedValueOnce({
				ok: true,
				status: 204,
				headers: new Headers(),
			});

			await client.addMember({
				accessToken: "access-123",
				guildId: "guild-123",
				userId: "user-456",
				botToken: "bot-token",
				nick: "Cool Nickname",
			});

			const callArgs = (global.fetch as any).mock.calls[0];
			const body = JSON.parse((callArgs[1]?.body as string) || "{}");
			expect(body.nick).toBe("Cool Nickname");
		});

		it("adds member with roles", async () => {
			(global.fetch as any).mockResolvedValueOnce({
				ok: true,
				status: 201,
				headers: new Headers(),
			});

			await client.addMember({
				accessToken: "access-123",
				guildId: "guild-123",
				userId: "user-456",
				botToken: "bot-token",
				roles: ["role-1", "role-2"],
			});

			const callArgs = (global.fetch as any).mock.calls[0];
			const body = JSON.parse((callArgs[1]?.body as string) || "{}");
			expect(body.roles).toEqual(["role-1", "role-2"]);
		});

		it("throws error on failed add member", async () => {
			(global.fetch as any).mockResolvedValueOnce({
				ok: false,
				status: 403,
				text: () => Promise.resolve("Missing permissions"),
				headers: new Headers(),
			});

			await expect(
				client.addMember({
					accessToken: "access-123",
					guildId: "guild-123",
					userId: "user-456",
					botToken: "bot-token",
				}),
			).rejects.toThrow("Discord API request failed: 403 Missing permissions");
		});
	});

	describe("removeMember", () => {
		it("removes member successfully", async () => {
			(global.fetch as any).mockResolvedValueOnce({
				ok: true,
				status: 204,
				headers: new Headers(),
			});

			await expect(
				client.removeMember({
					guildId: "guild-123",
					userId: "user-456",
					botToken: "bot-token",
				}),
			).resolves.toBeUndefined();
		});

		it("throws error on failed remove", async () => {
			(global.fetch as any).mockResolvedValueOnce({
				ok: false,
				status: 404,
				text: () => Promise.resolve("Member not found"),
				headers: new Headers(),
			});

			await expect(
				client.removeMember({
					guildId: "guild-123",
					userId: "unknown-user",
					botToken: "bot-token",
				}),
			).rejects.toThrow("Discord API request failed: 404 Member not found");
		});
	});

	describe("getUser", () => {
		it("gets user successfully", async () => {
			const mockUser = {
				id: "user-123",
				username: "testuser",
				discriminator: "1234",
				avatar: "avatar-hash",
			};

			(global.fetch as any).mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve(mockUser),
				headers: new Headers(),
			});

			const result = await client.getUser("access-token-123");
			expect(result).toEqual(mockUser);
		});

		it("throws error on failed get user", async () => {
			(global.fetch as any).mockResolvedValueOnce({
				ok: false,
				status: 401,
				text: () => Promise.resolve("Invalid access token"),
				headers: new Headers(),
			});

			await expect(client.getUser("invalid-token")).rejects.toThrow(
				"Discord API request failed: 401 Invalid access token",
			);
		});
	});

	describe("getUserGuilds", () => {
		it("gets guilds successfully", async () => {
			const mockGuilds = [
				{ id: "guild-1", name: "Guild 1" },
				{ id: "guild-2", name: "Guild 2" },
			];

			(global.fetch as any).mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve(mockGuilds),
				headers: new Headers(),
			});

			const result = await client.getUserGuilds("access-token-123");
			expect(result).toEqual(mockGuilds);
		});

		it("throws error on failed get guilds", async () => {
			(global.fetch as any).mockResolvedValueOnce({
				ok: false,
				status: 401,
				text: () => Promise.resolve("Invalid token"),
				headers: new Headers(),
			});

			await expect(client.getUserGuilds("invalid-token")).rejects.toThrow(
				"Discord API request failed: 401 Invalid token",
			);
		});
	});

	describe("getUserConnections", () => {
		it("gets connections successfully", async () => {
			const mockConnections = [
				{ id: "conn-1", type: "discord", name: "Discord" },
				{ id: "conn-2", type: "twitch", name: "Twitch" },
			];

			(global.fetch as any).mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve(mockConnections),
				headers: new Headers(),
			});

			const result = await client.getUserConnections("access-token-123");
			expect(result).toEqual(mockConnections);
		});

		it("throws error on failed get connections", async () => {
			(global.fetch as any).mockResolvedValueOnce({
				ok: false,
				status: 401,
				text: () => Promise.resolve("Unauthorized"),
				headers: new Headers(),
			});

			await expect(client.getUserConnections("invalid-token")).rejects.toThrow(
				"Discord API request failed: 401 Unauthorized",
			);
		});
	});

	describe("getGuildMember", () => {
		it("gets guild member successfully", async () => {
			const mockMember = {
				user: { id: "user-123", username: "member" },
				roles: ["role-1"],
				nick: "Member Nick",
			};

			(global.fetch as any).mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve(mockMember),
				headers: new Headers(),
			});

			const result = await client.getGuildMember(
				"guild-123",
				"user-456",
				"bot-token",
			);
			expect(result).toEqual(mockMember);
		});

		it("throws error on failed get member", async () => {
			(global.fetch as any).mockResolvedValueOnce({
				ok: false,
				status: 404,
				text: () => Promise.resolve("Member not found"),
				headers: new Headers(),
			});

			await expect(
				client.getGuildMember("guild-123", "unknown-user", "bot-token"),
			).rejects.toThrow("Discord API request failed: 404 Member not found");
		});
	});

	describe("getGuildMemberRoles", () => {
		it("gets guild member roles successfully", async () => {
			const mockMember = {
				user: { id: "user-123" },
				roles: ["role-1", "role-2", "role-3"],
			};

			(global.fetch as any).mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve(mockMember),
				headers: new Headers(),
			});

			const result = await client.getGuildMemberRoles(
				"guild-123",
				"user-456",
				"bot-token",
			);
			expect(result).toEqual(["role-1", "role-2", "role-3"]);
		});

		it("throws error when getGuildMember fails", async () => {
			(global.fetch as any).mockResolvedValueOnce({
				ok: false,
				status: 403,
				text: () => Promise.resolve("Forbidden"),
				headers: new Headers(),
			});

			await expect(
				client.getGuildMemberRoles("guild-123", "user-456", "bot-token"),
			).rejects.toThrow("Discord API request failed: 403 Forbidden");
		});
	});
});
