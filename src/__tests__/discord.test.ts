import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { discord } from "../discord";
import type { StoredUser, UserStorage } from "../types";

const originalFetch = global.fetch;

function createMockDiscordClient() {
	return {
		async generateAuthUrl(params: {
			clientId: string;
			redirectUri: string;
			scopes: string[];
			state: string;
			codeChallenge?: string;
			codeChallengeMethod?: string;
		}) {
			return `https://discord.com/oauth2/authorize?client_id=${params.clientId}&redirect_uri=${encodeURIComponent(params.redirectUri)}&scope=${params.scopes.join("%20")}&state=${params.state}&response_type=code${params.codeChallenge ? `&code_challenge=${params.codeChallenge}&code_challenge_method=${params.codeChallengeMethod}` : ""}`;
		},

		async exchangeCode(params: {
			clientId: string;
			clientSecret: string;
			code: string;
			redirectUri: string;
			codeVerifier?: string;
		}) {
			if (params.code === "invalid-code") throw new Error("Invalid code");
			return {
				access_token: "access-token-123",
				token_type: "Bearer",
				expires_in: 3600,
				refresh_token: "refresh-token-123",
				scope: "identify email",
			};
		},

		async getUser(accessToken: string) {
			if (accessToken === "invalid-token") throw new Error("Invalid token");
			return {
				id: "discord-user-id",
				username: "testuser",
				discriminator: "0",
				global_name: "Test User",
				avatar: null,
				email: "test@example.com",
				verified: true,
				locale: "en-US",
				mfa_enabled: false,
				banner: null,
				banner_color: null,
				accent_color: null,
				premium_type: 0,
				public_flags: 0,
			};
		},

		async revokeToken(_params: {
			clientId: string;
			clientSecret: string;
			accessToken: string;
		}) {
			return;
		},

		async getUserGuilds(_accessToken: string) {
			return [];
		},

		async getUserConnections(_accessToken: string) {
			return [];
		},

		async getGuildMember(_guildId: string, _userId: string, _botToken: string) {
			throw new Error("Not implemented");
		},

		async getGuildMemberRoles(
			_guildId: string,
			_userId: string,
			_botToken: string,
		) {
			return [];
		},

		async addMember(_params: {
			guildId: string;
			userId: string;
			accessToken: string;
			botToken: string;
		}) {
			throw new Error("Not implemented");
		},

		async refreshToken(_params: {
			clientId: string;
			clientSecret: string;
			refreshToken: string;
		}) {
			throw new Error("Not implemented");
		},
	};
}

function mockDiscordFetch(
	_mockClient: ReturnType<typeof createMockDiscordClient>,
) {
	global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = input instanceof Request ? input.url : String(input);

		// Parse body - handle both JSON and form data
		let body: Record<string, string> = {};
		if (init?.body) {
			const bodyStr = String(init.body);
			if (bodyStr.startsWith("{")) {
				try {
					body = JSON.parse(bodyStr);
				} catch {
					body = {};
				}
			} else {
				// Handle form data (URLSearchParams)
				const params = new URLSearchParams(bodyStr);
				for (const [key, value] of params.entries()) {
					body[key] = value;
				}
			}
		}

		if (url.includes("/oauth2/token")) {
			if (body.code === "invalid-code") {
				return new Response(JSON.stringify({ error: "invalid_grant" }), {
					status: 400,
					headers: { "Content-Type": "application/json" },
				});
			}
			return new Response(
				JSON.stringify({
					access_token: "access-token-123",
					token_type: "Bearer",
					expires_in: 3600,
					refresh_token: "refresh-token-123",
					scope: "identify email",
				}),
				{
					status: 200,
					headers: { "Content-Type": "application/json" },
				},
			);
		}

		if (url.includes("/users/@me")) {
			// Check authorization header for invalid token
			const authHeader =
				init?.headers && typeof init.headers === "object"
					? (init.headers as Record<string, string>).authorization ||
						(init.headers as Record<string, string>).Authorization
					: "";
			if (authHeader?.includes("invalid-token")) {
				return new Response(JSON.stringify({ error: "Unauthorized" }), {
					status: 401,
					headers: { "Content-Type": "application/json" },
				});
			}
			return new Response(
				JSON.stringify({
					id: "discord-user-id",
					username: "testuser",
					discriminator: "0",
					global_name: "Test User",
					avatar: null,
					email: "test@example.com",
					verified: true,
					locale: "en-US",
					mfa_enabled: false,
					banner: null,
					banner_color: null,
					accent_color: null,
					premium_type: 0,
					public_flags: 0,
				}),
				{
					status: 200,
					headers: { "Content-Type": "application/json" },
				},
			);
		}

		if (url.includes("/oauth2/token/revoke")) {
			return new Response(null, { status: 200 });
		}

		if (url.includes("/users/@me/guilds")) {
			return new Response(JSON.stringify([]), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}

		if (url.includes("/users/@me/connections")) {
			return new Response(JSON.stringify([]), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}

		if (url.includes("/guilds/") && url.includes("/members/")) {
			return new Response(
				JSON.stringify({
					roles: ["role-1", "role-2"],
				}),
				{
					status: 200,
					headers: { "Content-Type": "application/json" },
				},
			);
		}

		return new Response(JSON.stringify({ error: "Not found" }), {
			status: 404,
		});
	});
}

class MockStorage implements UserStorage {
	private users = new Map<string, StoredUser>();

	async findByDiscordId(discordId: string): Promise<StoredUser | null> {
		return this.users.get(discordId) ?? null;
	}

	async create(data: StoredUser): Promise<StoredUser> {
		this.users.set(data.discordId, data);
		return data;
	}

	async update(
		discordId: string,
		data: Partial<StoredUser>,
	): Promise<StoredUser> {
		const existing = this.users.get(discordId);
		if (!existing) throw new Error("User not found");
		const updated = { ...existing, ...data };
		this.users.set(discordId, updated);
		return updated;
	}

	async delete(discordId: string): Promise<void> {
		this.users.delete(discordId);
	}
}

function createMockConfig(
	overrides: Partial<{
		storage: UserStorage;
		clientId: string;
		clientSecret: string;
		secret: string;
		callbackUrl: string;
		redirectUri: string;
		scopes: string[];
		pkce: boolean;
		csrf: {
			enabled: boolean;
			ttlMs: number;
			singleUse: boolean;
			bindToSession: boolean;
			bindToUserAgent: boolean;
		};
	}> &
		Record<string, unknown> = {},
) {
	return {
		clientId: "test-client-id",
		clientSecret: "test-client-secret",
		secret: "test-secret-key-32-chars-long!!",
		redirectUri: "http://localhost:3000/auth/callback",
		scopes: ["identify", "email"],
		pkce: true,
		csrf: {
			enabled: true,
			ttlMs: 300000,
			singleUse: true,
			bindToSession: true,
			bindToUserAgent: true,
		},
		...overrides,
	};
}

describe("discord - OAuth2 flow integration", () => {
	let storage: MockStorage;
	let config: ReturnType<typeof createMockConfig>;
	let handlers: Awaited<ReturnType<typeof discord>>;

	beforeEach(() => {
		storage = new MockStorage();
		config = createMockConfig({ storage });
		mockDiscordFetch(createMockDiscordClient());
	});

	afterEach(async () => {
		if (handlers?.dispose) await handlers.dispose();
		global.fetch = originalFetch;
	});

	test("handleLogin returns redirect to Discord with PKCE and state", async () => {
		handlers = await discord(config);
		const request = new Request("http://localhost/auth/login");
		const response = await handlers.handleLogin(request);

		expect(response.status).toBe(302);
		const location = response.headers.get("Location");
		expect(location).toContain("discord.com/oauth2/authorize");
		expect(location).toContain("client_id=test-client-id");
		expect(location).toContain("redirect_uri=");
		expect(location).toContain("state=");
		expect(location).toContain("code_challenge=");
		expect(location).toContain("code_challenge_method=S256");
	});

	test("handleLogin returns redirect with state in URL (no cookie)", async () => {
		handlers = await discord(config);
		const request = new Request("http://localhost/auth/login", {
			headers: { "user-agent": "TestBrowser/1.0" },
		});
		const response = await handlers.handleLogin(request);

		expect(response.status).toBe(302);
		const location = response.headers.get("Location");
		expect(location).toContain("state=");
		// handleLogin does not set cookies; session cookie is set in handleCallback
		const setCookie = response.headers.get("Set-Cookie");
		expect(setCookie).toBeNull();
	});

	test("handleCallback with valid code and state completes OAuth flow", async () => {
		handlers = await discord(config);

		const loginRequest = new Request("http://localhost/auth/login", {
			headers: { "user-agent": "TestBrowser/1.0" },
		});
		const loginResponse = await handlers.handleLogin(loginRequest);
		const stateCookie = loginResponse.headers.get("Set-Cookie");

		const loginUrl = new URL(loginResponse.headers.get("Location")!);
		const state = loginUrl.searchParams.get("state");
		expect(state).toBeTruthy();

		const callbackRequest = new Request(
			`http://localhost/auth/callback?code=valid-code&state=${state}`,
			{ headers: { Cookie: stateCookie ?? "" } },
		);
		const callbackResponse = await handlers.handleCallback(callbackRequest);

		expect(callbackResponse.status).toBe(302);
		expect(callbackResponse.headers.get("Location")).toBe("/");

		const sessionCookie = callbackResponse.headers.get("Set-Cookie");
		expect(sessionCookie).toContain("discord-auth-session=");
		expect(sessionCookie).toContain("HttpOnly");
	});

	test("handleCallback rejects invalid state (CSRF protection)", async () => {
		handlers = await discord(config);

		const loginRequest = new Request("http://localhost/auth/login");
		const loginResponse = await handlers.handleLogin(loginRequest);
		const stateCookie = loginResponse.headers.get("Set-Cookie");

		const callbackRequest = new Request(
			"http://localhost/auth/callback?code=valid-code&state=invalid-state",
			{ headers: { Cookie: stateCookie ?? "" } },
		);
		const callbackResponse = await handlers.handleCallback(callbackRequest);

		expect(callbackResponse.status).toBe(403);
	});

	test("handleCallback rejects replayed state (single-use)", async () => {
		handlers = await discord(config);

		const loginRequest = new Request("http://localhost/auth/login");
		const loginResponse = await handlers.handleLogin(loginRequest);
		const stateCookie = loginResponse.headers.get("Set-Cookie");

		const loginUrl = new URL(loginResponse.headers.get("Location")!);
		const state = loginUrl.searchParams.get("state")!;

		const callbackRequest1 = new Request(
			`http://localhost/auth/callback?code=valid-code&state=${state}`,
			{ headers: { Cookie: stateCookie ?? "" } },
		);
		await handlers.handleCallback(callbackRequest1);

		const callbackRequest2 = new Request(
			`http://localhost/auth/callback?code=valid-code&state=${state}`,
			{ headers: { Cookie: stateCookie ?? "" } },
		);
		const callbackResponse2 = await handlers.handleCallback(callbackRequest2);

		expect(callbackResponse2.status).toBe(403);
	});

	test("handleCallback stores user in storage", async () => {
		handlers = await discord(config);

		const loginRequest = new Request("http://localhost/auth/login");
		const loginResponse = await handlers.handleLogin(loginRequest);
		const stateCookie = loginResponse.headers.get("Set-Cookie");

		const loginUrl = new URL(loginResponse.headers.get("Location")!);
		const state = loginUrl.searchParams.get("state")!;

		const callbackRequest = new Request(
			`http://localhost/auth/callback?code=valid-code&state=${state}`,
			{ headers: { Cookie: stateCookie ?? "" } },
		);
		await handlers.handleCallback(callbackRequest);

		const user = await storage.findByDiscordId("discord-user-id");
		expect(user).not.toBeNull();
		expect(user?.username).toBe("testuser");
		expect(user?.email).toBe("test@example.com");
	});

	test("handleMe returns session data with valid cookie", async () => {
		handlers = await discord(config);

		const loginRequest = new Request("http://localhost/auth/login");
		const loginResponse = await handlers.handleLogin(loginRequest);
		const stateCookie = loginResponse.headers.get("Set-Cookie");

		const loginUrl = new URL(loginResponse.headers.get("Location")!);
		const state = loginUrl.searchParams.get("state")!;

		const callbackRequest = new Request(
			`http://localhost/auth/callback?code=valid-code&state=${state}`,
			{ headers: { Cookie: stateCookie ?? "" } },
		);
		const callbackResponse = await handlers.handleCallback(callbackRequest);
		const sessionCookie = callbackResponse.headers.get("Set-Cookie");

		const meRequest = new Request("http://localhost/auth/me", {
			headers: { Cookie: sessionCookie ?? "" },
		});
		const meResponse = await handlers.handleMe(meRequest);

		expect(meResponse.status).toBe(200);
		const user = await meResponse.json();
		expect(user.discordId).toBe("discord-user-id");
		expect(user.username).toBe("testuser");
	});

	test("handleMe returns 401 without session cookie", async () => {
		handlers = await discord(config);
		const meRequest = new Request("http://localhost/auth/me");
		const meResponse = await handlers.handleMe(meRequest);
		expect(meResponse.status).toBe(401);
	});

	test("handleLogout clears session and revokes tokens", async () => {
		handlers = await discord(config);

		const loginRequest = new Request("http://localhost/auth/login");
		const loginResponse = await handlers.handleLogin(loginRequest);
		const stateCookie = loginResponse.headers.get("Set-Cookie");

		const loginUrl = new URL(loginResponse.headers.get("Location")!);
		const state = loginUrl.searchParams.get("state")!;

		const callbackRequest = new Request(
			`http://localhost/auth/callback?code=valid-code&state=${state}`,
			{ headers: { Cookie: stateCookie ?? "" } },
		);
		const callbackResponse = await handlers.handleCallback(callbackRequest);
		const sessionCookie = callbackResponse.headers.get("Set-Cookie");

		const logoutRequest = new Request("http://localhost/auth/logout", {
			method: "POST",
			headers: { Cookie: sessionCookie ?? "" },
		});
		const logoutResponse = await handlers.handleLogout(logoutRequest);

		expect(logoutResponse.status).toBe(302);
		const clearCookie = logoutResponse.headers.get("Set-Cookie");
		expect(clearCookie).toContain("discord-auth-session=");
		expect(clearCookie).toContain("Max-Age=0");
	});

	test("withAuth passes user context to handler", async () => {
		handlers = await discord(config);

		const loginRequest = new Request("http://localhost/auth/login");
		const loginResponse = await handlers.handleLogin(loginRequest);
		const stateCookie = loginResponse.headers.get("Set-Cookie");

		const loginUrl = new URL(loginResponse.headers.get("Location")!);
		const state = loginUrl.searchParams.get("state")!;

		const callbackRequest = new Request(
			`http://localhost/auth/callback?code=valid-code&state=${state}`,
			{ headers: { Cookie: stateCookie ?? "" } },
		);
		const callbackResponse = await handlers.handleCallback(callbackRequest);
		const sessionCookie = callbackResponse.headers.get("Set-Cookie");

		const protectedHandler = handlers.withAuth(async (_request, ctx) => {
			return new Response(JSON.stringify({ user: ctx.user.discordId }), {
				headers: { "Content-Type": "application/json" },
			});
		});

		const protectedRequest = new Request("http://localhost/protected", {
			headers: { Cookie: sessionCookie ?? "" },
		});
		const protectedResponse = await protectedHandler(protectedRequest);
		expect(protectedResponse.status).toBe(200);
		const body = await protectedResponse.json();
		expect(body.user).toBe("discord-user-id");
	});

	test("withAuth returns 401 without valid session", async () => {
		handlers = await discord(config);

		const protectedHandler = handlers.withAuth(async () => new Response("OK"));

		const request = new Request("http://localhost/protected");
		const response = await protectedHandler(request);
		expect(response.status).toBe(401);
	});

	test("getSession returns null for invalid session", async () => {
		handlers = await discord(config);
		const request = new Request("http://localhost/auth/me", {
			headers: { Cookie: "discord-auth-session=invalid-token" },
		});
		const session = await handlers.getSession(request);
		expect(session).toBeNull();
	});

	test("callback without storage still creates session", async () => {
		const configNoStorage = createMockConfig({ storage: undefined });
		handlers = await discord(configNoStorage);

		const loginRequest = new Request("http://localhost/auth/login");
		const loginResponse = await handlers.handleLogin(loginRequest);
		const stateCookie = loginResponse.headers.get("Set-Cookie");

		const loginUrl = new URL(loginResponse.headers.get("Location")!);
		const state = loginUrl.searchParams.get("state")!;

		const callbackRequest = new Request(
			`http://localhost/auth/callback?code=valid-code&state=${state}`,
			{ headers: { Cookie: stateCookie ?? "" } },
		);
		const callbackResponse = await handlers.handleCallback(callbackRequest);

		expect(callbackResponse.status).toBe(302);
	});

	test("handleLogout returns 405 for non-POST request", async () => {
		handlers = await discord(config);
		const response = await handlers.handleLogout(
			new Request("http://localhost/auth/logout"),
		);
		expect(response.status).toBe(405);
	});

	test("callback propagates non-AuthError (exchangeCode throws)", async () => {
		handlers = await discord(config);

		const loginResponse = await handlers.handleLogin(
			new Request("http://localhost/auth/login"),
		);
		const stateCookie = loginResponse.headers.get("Set-Cookie");
		const loginUrl = new URL(loginResponse.headers.get("Location")!);
		const state = loginUrl.searchParams.get("state")!;

		const callbackRequest = new Request(
			`http://localhost/auth/callback?code=invalid-code&state=${state}`,
			{ headers: { Cookie: stateCookie ?? "" } },
		);
		const callbackResponse = await handlers.handleCallback(callbackRequest);

		expect(callbackResponse.status).toBe(500);
	});

	test("callback with onSuccess redirect", async () => {
		handlers = await discord(
			createMockConfig({
				callbacks: {
					onSuccess: async () => ({ redirect: "/dashboard" }),
				},
			}),
		);

		const loginResponse = await handlers.handleLogin(
			new Request("http://localhost/auth/login"),
		);
		const stateCookie = loginResponse.headers.get("Set-Cookie");
		const loginUrl = new URL(loginResponse.headers.get("Location")!);
		const state = loginUrl.searchParams.get("state")!;

		const callbackRequest = new Request(
			`http://localhost/auth/callback?code=valid-code&state=${state}`,
			{ headers: { Cookie: stateCookie ?? "" } },
		);
		const callbackResponse = await handlers.handleCallback(callbackRequest);

		expect(callbackResponse.status).toBe(302);
		expect(callbackResponse.headers.get("Location")).toBe("/dashboard");
	});

	test("callback throws on missing clientId/clientSecret in config", async () => {
		await expect(
			discord(createMockConfig({ clientId: "", clientSecret: "" })),
		).rejects.toThrow("discord() requires clientId and clientSecret");
	});

	test("callback updates existing user in storage", async () => {
		handlers = await discord(config);

		const login1 = await handlers.handleLogin(
			new Request("http://localhost/auth/login"),
		);
		const stateCookie1 = login1.headers.get("Set-Cookie");
		const url1 = new URL(login1.headers.get("Location")!);
		const state1 = url1.searchParams.get("state")!;

		await handlers.handleCallback(
			new Request(
				`http://localhost/auth/callback?code=valid-code&state=${state1}`,
				{ headers: { Cookie: stateCookie1 ?? "" } },
			),
		);

		const user = await storage.findByDiscordId("discord-user-id");
		expect(user).not.toBeNull();
		expect(user?.username).toBe("testuser");

		const login2 = await handlers.handleLogin(
			new Request("http://localhost/auth/login"),
		);
		const stateCookie2 = login2.headers.get("Set-Cookie");
		const url2 = new URL(login2.headers.get("Location")!);
		const state2 = url2.searchParams.get("state")!;

		await handlers.handleCallback(
			new Request(
				`http://localhost/auth/callback?code=valid-code&state=${state2}`,
				{ headers: { Cookie: stateCookie2 ?? "" } },
			),
		);

		const updatedUser = await storage.findByDiscordId("discord-user-id");
		expect(updatedUser).not.toBeNull();
	});

	test("factory throw without clientId and clientSecret", async () => {
		await expect(discord({} as never)).rejects.toThrow(
			"discord() requires clientId and clientSecret",
		);
	});

	test("CSRF non-CSRF mode invalid state", async () => {
		handlers = await discord(
			createMockConfig({
				csrf: {
					enabled: false,
					ttlMs: 300000,
					singleUse: false,
					bindToSession: false,
					bindToUserAgent: false,
				},
			}),
		);

		const callbackResponse = await handlers.handleCallback(
			new Request(
				"http://localhost/auth/callback?code=valid-code&state=invalid-state",
			),
		);

		expect(callbackResponse.status).toBe(403);
	});

	test("CSRF mode state binding failed (no HMAC match)", async () => {
		handlers = await discord(config);

		const loginResponse = await handlers.handleLogin(
			new Request("http://localhost/auth/login"),
		);
		const stateCookie = loginResponse.headers.get("Set-Cookie");

		const craftedState = "eyJpZCI6InNvbWUtaWQifQ.abc123";

		const callbackResponse = await handlers.handleCallback(
			new Request(
				`http://localhost/auth/callback?code=valid-code&state=${craftedState}`,
				{ headers: { Cookie: stateCookie ?? "" } },
			),
		);

		expect(callbackResponse.status).toBe(403);
	});

	test("CSRF mode state decode failure (catch block)", async () => {
		handlers = await discord(config);

		const loginResponse = await handlers.handleLogin(
			new Request("http://localhost/auth/login"),
		);
		const stateCookie = loginResponse.headers.get("Set-Cookie");

		const brokenState = "!!!.abc123";

		const callbackResponse = await handlers.handleCallback(
			new Request(
				`http://localhost/auth/callback?code=valid-code&state=${brokenState}`,
				{ headers: { Cookie: stateCookie ?? "" } },
			),
		);

		expect(callbackResponse.status).toBe(403);
	});

	test("MFA required when enabled and user has mfa disabled", async () => {
		handlers = await discord(
			createMockConfig({
				mfa: { enabled: true, requireMfa: true },
			}),
		);

		const loginResponse = await handlers.handleLogin(
			new Request("http://localhost/auth/login"),
		);
		const stateCookie = loginResponse.headers.get("Set-Cookie");
		const loginUrl = new URL(loginResponse.headers.get("Location")!);
		const state = loginUrl.searchParams.get("state")!;

		const callbackResponse = await handlers.handleCallback(
			new Request(
				`http://localhost/auth/callback?code=valid-code&state=${state}`,
				{ headers: { Cookie: stateCookie ?? "" } },
			),
		);

		expect(callbackResponse.status).toBe(403);
	});

	test("guild role sync enabled adds permissions to session", async () => {
		const guildStorage = new MockStorage();
		handlers = await discord(
			createMockConfig({
				storage: guildStorage,
				guildRoleSync: {
					enabled: true,
					syncOnLogin: true,
					guildId: "guild-1",
					botToken: "bot-token-1",
					roleMap: { "role-1": ["admin"], "role-2": ["moderator"] },
				},
				scopes: ["identify", "email", "guilds.members.read"],
			}),
		);

		const loginResponse = await handlers.handleLogin(
			new Request("http://localhost/auth/login"),
		);
		const stateCookie = loginResponse.headers.get("Set-Cookie");
		const loginUrl = new URL(loginResponse.headers.get("Location")!);
		const state = loginUrl.searchParams.get("state")!;

		const callbackResponse = await handlers.handleCallback(
			new Request(
				`http://localhost/auth/callback?code=valid-code&state=${state}`,
				{ headers: { Cookie: stateCookie ?? "" } },
			),
		);

		expect(callbackResponse.status).toBe(302);
	});
});
