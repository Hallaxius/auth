import { afterEach, beforeEach, describe, expect, test, vi } from "bun:test";
import { AuthError, ErrorCodes } from "../../errors";
import type { UserStorage } from "../../types";
import { DiscordClient } from "../client";

const ORIGINAL_FETCH = global.fetch;

function mockFetch(
	response:
		| Response
		| ((url: string, init?: RequestInit) => Response | Promise<Response>),
) {
	if (response instanceof Response) {
		global.fetch = async () => response;
	} else {
		global.fetch = response as typeof global.fetch;
	}
}

describe("DiscordClient", () => {
	let client: DiscordClient;

	beforeEach(() => {
		client = new DiscordClient("test-client-id", "test-client-secret");
	});

	afterEach(() => {
		global.fetch = ORIGINAL_FETCH;
	});

	describe("generateAuthUrl", () => {
		test("generates basic auth URL", () => {
			const url = client.generateAuthUrl({
				clientId: "client-1",
				redirectUri: "http://localhost/callback",
				scopes: ["identify", "email"],
				state: "state-123",
			});
			expect(url).toContain("discord.com/oauth2/authorize");
			expect(url).toContain("client_id=client-1");
			expect(url).toContain("redirect_uri=");
			expect(url).toContain("state=state-123");
		});

		test("includes PKCE params when provided", () => {
			const url = client.generateAuthUrl({
				clientId: "client-1",
				redirectUri: "http://localhost/callback",
				scopes: ["identify"],
				state: "state-1",
				codeChallenge: "challenge-123",
				codeChallengeMethod: "S256",
			});
			expect(url).toContain("code_challenge=challenge-123");
			expect(url).toContain("code_challenge_method=S256");
		});

		test("includes prompt param when provided", () => {
			const url = client.generateAuthUrl({
				clientId: "client-1",
				redirectUri: "http://localhost/callback",
				scopes: ["identify"],
				state: "state-1",
				prompt: "consent",
			});
			expect(url).toContain("prompt=consent");
		});
	});

	describe("exchangeCode", () => {
		test("exchanges code successfully", async () => {
			mockFetch(
				new Response(
					JSON.stringify({
						access_token: "at-123",
						token_type: "Bearer",
						expires_in: 3600,
						refresh_token: "rt-123",
						scope: "identify",
					}),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				),
			);
			const result = await client.exchangeCode({
				clientId: "client-1",
				clientSecret: "secret",
				code: "code-123",
				redirectUri: "http://localhost/callback",
			});
			expect(result.access_token).toBe("at-123");
		});

		test("throws on exchange failure", async () => {
			mockFetch(new Response("bad request", { status: 400 }));
			await expect(
				client.exchangeCode({
					clientId: "c",
					clientSecret: "s",
					code: "bad",
					redirectUri: "http://localhost/callback",
				}),
			).rejects.toThrow("Discord API request failed: 400 bad request");
		});
	});

	describe("refreshToken", () => {
		test("refreshes token successfully", async () => {
			mockFetch(
				new Response(
					JSON.stringify({
						access_token: "new-at",
						token_type: "Bearer",
						expires_in: 3600,
						refresh_token: "new-rt",
						scope: "identify",
					}),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				),
			);
			const result = await client.refreshToken({
				clientId: "c",
				clientSecret: "s",
				refreshToken: "old-rt",
			});
			expect(result.access_token).toBe("new-at");
		});

		test("throws on refresh failure", async () => {
			mockFetch(new Response("invalid grant", { status: 400 }));
			await expect(
				client.refreshToken({
					clientId: "c",
					clientSecret: "s",
					refreshToken: "bad",
				}),
			).rejects.toThrow("Discord API request failed: 400 invalid grant");
		});
	});

	describe("getUser", () => {
		test("gets user successfully", async () => {
			mockFetch(
				new Response(
					JSON.stringify({
						id: "user-1",
						username: "testuser",
						global_name: null,
						avatar: null,
						email: "test@example.com",
						verified: true,
						locale: "en-US",
						mfa_enabled: false,
					}),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				),
			);
			const user = await client.getUser("token");
			expect(user.id).toBe("user-1");
		});

		test("throws on 401", async () => {
			mockFetch(new Response("unauthorized", { status: 401 }));
			await expect(client.getUser("bad-token")).rejects.toThrow(
				"Discord API request failed: 401 unauthorized",
			);
		});
	});

	describe("fetchWithRateLimitHandling", () => {
		test("returns response on success", async () => {
			mockFetch(new Response("ok", { status: 200 }));
			const res = await client.fetchWithRateLimitHandling("http://example.com");
			expect(res.status).toBe(200);
		});

		test("throws RATE_LIMITED on 429", async () => {
			mockFetch(
				new Response("rate limited", {
					status: 429,
					headers: { "Retry-After": "5" },
				}),
			);
			try {
				await client.fetchWithRateLimitHandling("http://example.com");
			} catch (e) {
				expect(e).toBeInstanceOf(AuthError);
				expect((e as AuthError).code).toBe(ErrorCodes.RATE_LIMITED);
			}
		});

		test("throws error on non-ok response", async () => {
			mockFetch(new Response("not found", { status: 404 }));
			await expect(
				client.fetchWithRateLimitHandling("http://example.com"),
			).rejects.toThrow("Discord API request failed: 404 not found");
		});

		test("handles network timeout", async () => {
			global.fetch = async () => {
				throw new DOMException("Timeout", "AbortError");
			};
			try {
				await client.fetchWithRateLimitHandling("http://example.com");
			} catch (e) {
				expect(e).toBeInstanceOf(AuthError);
				expect((e as AuthError).code).toBe(ErrorCodes.NETWORK_ERROR);
			}
		});

		test("handles generic network error", async () => {
			global.fetch = async () => {
				throw new Error("Network failure");
			};
			try {
				await client.fetchWithRateLimitHandling("http://example.com");
			} catch (e) {
				expect(e).toBeInstanceOf(AuthError);
				expect((e as AuthError).code).toBe(ErrorCodes.UPSTREAM_ERROR);
			}
		});
	});

	describe("fetchWithAutoRefresh", () => {
		test("returns result on first try", async () => {
			const result = await client.fetchWithAutoRefresh(
				"at",
				"rt",
				async () => "success",
			);
			expect(result).toBe("success");
		});

		test("refreshes token on 401 and retries", async () => {
			let attempts = 0;
			client.refreshToken = async () => ({
				access_token: "new-at",
				refresh_token: "new-rt",
				expires_in: 3600,
				token_type: "Bearer",
				scope: "identify",
			});
			const result = await client.fetchWithAutoRefresh("at", "rt", async () => {
				attempts++;
				if (attempts === 1)
					throw Object.assign(new Error("token expired"), {
						status: 401,
						code: "TOKEN_EXPIRED",
					});
				return "success";
			});
			expect(result).toBe("success");
			expect(attempts).toBe(2);
		});

		test("throws on non-expired errors", async () => {
			await expect(
				client.fetchWithAutoRefresh("at", "rt", async () => {
					throw new Error("other error");
				}),
			).rejects.toThrow("other error");
		});

		test("throws TOKEN_EXPIRED when refresh fails", async () => {
			client.refreshToken = async () => {
				throw new Error("refresh failed");
			};
			await expect(
				client.fetchWithAutoRefresh("at", "rt", async () => {
					throw Object.assign(new Error("token expired"), {
						status: 401,
						code: "TOKEN_EXPIRED",
					});
				}),
			).rejects.toThrow("Token has expired and could not be refreshed");
		});
	});

	describe("revokeToken", () => {
		test("revokes token successfully", async () => {
			mockFetch(new Response(null, { status: 200 }));
			await expect(
				client.revokeToken({
					clientId: "c",
					clientSecret: "s",
					accessToken: "at",
				}),
			).resolves.toBeUndefined();
		});

		test("throws on failure", async () => {
			mockFetch(new Response("error", { status: 400 }));
			await expect(
				client.revokeToken({
					clientId: "c",
					clientSecret: "s",
					accessToken: "bad",
				}),
			).rejects.toThrow("Discord API request failed: 400 error");
		});
	});

	describe("addMember", () => {
		test("adds member successfully", async () => {
			mockFetch(new Response(null, { status: 201 }));
			await expect(
				client.addMember({
					guildId: "g1",
					userId: "u1",
					accessToken: "at",
					botToken: "bt",
				}),
			).resolves.toBeUndefined();
		});

		test("accepts 204 as success", async () => {
			mockFetch(new Response(null, { status: 204 }));
			await expect(
				client.addMember({
					guildId: "g1",
					userId: "u1",
					accessToken: "at",
					botToken: "bt",
				}),
			).resolves.toBeUndefined();
		});

		test("throws on failure", async () => {
			mockFetch(new Response("forbidden", { status: 403 }));
			await expect(
				client.addMember({
					guildId: "g1",
					userId: "u1",
					accessToken: "at",
					botToken: "bt",
				}),
			).rejects.toThrow("Discord API request failed: 403 forbidden");
		});
	});

	describe("removeMember", () => {
		test("removes member successfully", async () => {
			mockFetch(new Response(null, { status: 204 }));
			await expect(
				client.removeMember({ guildId: "g1", userId: "u1", botToken: "bt" }),
			).resolves.toBeUndefined();
		});

		test("throws on failure", async () => {
			mockFetch(new Response("error", { status: 500 }));
			await expect(
				client.removeMember({ guildId: "g1", userId: "u1", botToken: "bt" }),
			).rejects.toThrow("Discord API request failed: 500 error");
		});
	});

	describe("getUserGuilds", () => {
		test("returns guilds successfully", async () => {
			mockFetch(
				new Response(JSON.stringify([{ id: "g1", name: "test-guild" }]), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			);
			const guilds = await client.getUserGuilds("token");
			expect(guilds).toHaveLength(1);
			expect(guilds[0].id).toBe("g1");
		});

		test("throws on failure", async () => {
			mockFetch(new Response("error", { status: 401 }));
			await expect(client.getUserGuilds("bad-token")).rejects.toThrow(
				"Discord API request failed: 401 error",
			);
		});
	});

	describe("getUserConnections", () => {
		test("returns connections successfully", async () => {
			mockFetch(
				new Response(
					JSON.stringify([{ id: "c1", type: "github", name: "testuser" }]),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				),
			);
			const connections = await client.getUserConnections("token");
			expect(connections).toHaveLength(1);
			expect(connections[0].type).toBe("github");
		});

		test("throws on failure", async () => {
			mockFetch(new Response("error", { status: 401 }));
			await expect(client.getUserConnections("bad-token")).rejects.toThrow(
				"Discord API request failed: 401 error",
			);
		});
	});

	describe("getGuildMember", () => {
		test("returns guild member successfully", async () => {
			mockFetch(
				new Response(
					JSON.stringify({
						user: { id: "u1" },
						roles: ["role-1"],
						mute: false,
						deaf: false,
						joined_at: "2024-01-01T00:00:00Z",
					}),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				),
			);
			const member = await client.getGuildMember("g1", "u1", "bt");
			expect(member.user.id).toBe("u1");
		});

		test("throws on failure", async () => {
			mockFetch(new Response("not found", { status: 404 }));
			await expect(client.getGuildMember("g1", "u1", "bt")).rejects.toThrow(
				"Discord API request failed: 404 not found",
			);
		});
	});

	describe("getGuildMemberRoles", () => {
		test("returns roles for existing member", async () => {
			mockFetch(
				new Response(
					JSON.stringify({
						user: { id: "u1" },
						roles: ["role-1", "role-2"],
						mute: false,
						deaf: false,
						joined_at: "2024-01-01T00:00:00Z",
					}),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				),
			);
			const roles = await client.getGuildMemberRoles("g1", "u1", "bt");
			expect(roles).toEqual(["role-1", "role-2"]);
		});

		test("throws on error", async () => {
			mockFetch(new Response("not found", { status: 404 }));
			await expect(
				client.getGuildMemberRoles("g1", "u1", "bt"),
			).rejects.toThrow("Discord API request failed: 404 not found");
		});
	});

	describe("fetchWithAutoRefresh with storage", () => {
		test("updates storage on token refresh", async () => {
			const mockStorage: UserStorage = {
				findByDiscordId: async () => null,
				create: async () => null as never,
				update: async () => null as never,
				delete: async () => {},
			};
			const updateSpy = vi.fn().mockResolvedValue(null as never);
			mockStorage.update = updateSpy;

			client.refreshToken = async () => ({
				access_token: "new-at",
				refresh_token: "new-rt",
				expires_in: 3600,
				token_type: "Bearer",
				scope: "identify",
			});

			let callCount = 0;
			const result = await client.fetchWithAutoRefresh(
				"at",
				"rt",
				async (token) => {
					callCount++;
					if (callCount === 1) {
						throw Object.assign(new Error("token expired"), {
							status: 401,
							code: "TOKEN_EXPIRED",
						});
					}
					return token;
				},
				{ storage: mockStorage, userId: "user-1" },
			);

			expect(result).toBe("new-at");
			expect(callCount).toBe(2);
			expect(updateSpy).toHaveBeenCalled();
		});
	});
});
