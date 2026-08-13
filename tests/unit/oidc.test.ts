import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type {
	CreateSessionWithoutPasswordOptions,
	OidcConfig,
	OidcMappedUser,
	OidcStateRecord,
	OidcUserClaims,
} from "../../src";
import { startFakeOp, type FakeOp } from "../fixtures/fake-op";

const { oidc, ErrorCodes, ConfigurationError } = await import("../../src");

const CLIENT_ID = "app-client";
const REDIRECT = "https://app.example.com/cb";

function createStateStore() {
	const store = new Map<string, OidcStateRecord>();
	return {
		map: store,
		async set(state: string, record: OidcStateRecord) {
			store.set(state, { ...record });
		},
		async getAndConsume(state: string): Promise<OidcStateRecord | null> {
			const entry = store.get(state);
			if (!entry) return null;
			store.delete(state);
			return { ...entry };
		},
	};
}

function createJwksStore() {
	const store = new Map<string, { keys: unknown; ttlSeconds?: number }>();
	return {
		map: store,
		async get(issuer: string) {
			return store.get(issuer) ?? null;
		},
		async set(issuer: string, jwks: { keys: unknown }, ttlSeconds?: number) {
			store.set(issuer, { keys: jwks.keys, ttlSeconds });
		},
	};
}

function createRevocationStore() {
	const revoked = new Set<string>();
	return {
		revoked,
		async isRevoked(jti: string) {
			return revoked.has(jti);
		},
		async revoke(jti: string, ttlSeconds?: number) {
			revoked.add(jti);
		},
	};
}

type Config = OidcConfig & {
	storage: {
		state: ReturnType<typeof createStateStore>;
		jwks: ReturnType<typeof createJwksStore>;
	};
	audit: { sessions: Array<Record<string, unknown>> };
	e2e: { op: FakeOp };
};

async function makeConfig(op: FakeOp, overrides?: Partial<OidcConfig>): Promise<Config> {
	const audit = { sessions: [] as Array<Record<string, unknown>> };
	return {
		serverMetadata: {
			issuer: op.issuer,
			authorization_endpoint: `${op.baseUrl}/authorize`,
			token_endpoint: `${op.baseUrl}/token`,
			userinfo_endpoint: `${op.baseUrl}/userinfo`,
			jwks_uri: `${op.baseUrl}/jwks`,
			scopes_supported: ["openid", "profile", "email"],
			response_types_supported: ["code"],
			subject_types_supported: ["public"],
			id_token_signing_alg_values_supported: ["RS256"],
			code_challenge_methods_supported: ["S256"],
			token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
			backchannel_logout_supported: true,
		},
		clientId: CLIENT_ID,
		redirectUris: [REDIRECT],
		storage: {
			state: createStateStore(),
			jwks: createJwksStore(),
		},
		allowInsecureRequests: true,
		createSessionWithoutPassword: async (
			options: CreateSessionWithoutPasswordOptions,
		) => {
			audit.sessions.push({ ...options });
			return { sessionToken: "session-st", idToken: "id-token-st" };
		},
		...overrides,
		audit,
		e2e: { op },
	} as Config;
}

function mapUser(
	mapped: OidcMappedUser | null,
): OidcConfig["mapUser"] {
	return (async (_claims: OidcUserClaims) => mapped) as unknown as OidcConfig["mapUser"];
}

function getWithQuery(url: string): Request {
	return new Request(url, { method: "GET" });
}

function authorizeRequest(body: Record<string, unknown> = {}): Request {
	return new Request("https://auth.example.com/oidc/authorize", {
		method: "POST",
		body: JSON.stringify(body),
		headers: { "Content-Type": "application/json" },
	});
}

const BACKCHANNEL_EVENT = "http://schemas.openid.net/event/backchannel-logout";

describe("oidc", () => {
	let op: FakeOp;
	let config: ReturnType<typeof makeConfig> extends Promise<infer T> ? T : never;
	let handlers: ReturnType<typeof oidc>;

	beforeEach(async () => {
		op = await startFakeOp({ clientId: CLIENT_ID });
		config = await makeConfig(op);
		handlers = oidc(config);
	});

	afterEach(() => {
		op.stop();
	});

	describe("configuration errors", () => {
		test("throws ConfigurationError when serverMetadata/discoveryUrl, clientId, redirectUris or storage.state are missing", () => {
			expect(() => oidc({ ...config, serverMetadata: undefined })).toThrow(
				ConfigurationError,
			);
			expect(() => oidc({ ...config, clientId: "" })).toThrow(
				ConfigurationError,
			);
			expect(() => oidc({ ...config, redirectUris: [] })).toThrow(
				ConfigurationError,
			);
			expect(() =>
				oidc({
					...config,
					storage: { state: undefined as never },
				}),
			).toThrow(ConfigurationError);
		});
	});

	describe("authorize URL", () => {
		test("GET without redirect_uri: 400", async () => {
			const res = await handlers.handleAuthorizeUrl(
				getWithQuery("https://auth.example.com/oidc/authorize"),
			);
			expect(res.status).toBe(400);
		});

		test("non-whitelisted redirect_uri: 400", async () => {
			const res = await handlers.handleAuthorizeUrl(
				getWithQuery(
					"https://auth.example.com/oidc/authorize?redirect_uri=https://evil.example.com",
				),
			);
			expect(res.status).toBe(400);
		});

		test("POST builds the authorization URL with state, nonce and PKCE S256", async () => {
			const res = await handlers.handleAuthorizeUrl(
				authorizeRequest({ redirectUri: REDIRECT }),
			);
			expect(res.status).toBe(200);
			const body = (await res.json()) as {
				url: string;
				state: string;
				expiresInSeconds: number;
			};
			expect(body.expiresInSeconds).toBe(600);
			const params = new URL(body.url).searchParams;
			expect(params.get("response_type")).toBe("code");
			expect(params.get("redirect_uri")).toBe(REDIRECT);
			expect(params.get("state")).toBe(body.state);
			expect(params.get("nonce")).toBeString();
			expect(params.get("code_challenge")).toBeString();
			expect(params.get("code_challenge_method")).toBe("S256");

			const record = config.storage.state.map.get(body.state);
			expect(record).toBeDefined();
			expect(record!.nonce).toBe(params.get("nonce") as string);
			expect(record!.redirectUri).toBe(REDIRECT);
			expect(record!.userId).toBeNull();
			expect(typeof record!.codeVerifier).toBe("string");
		});

		test("userId and tenantId are captured into the state record", async () => {
			config = await makeConfig(op, {
				tenantIdFromRequest: async () => "tenant-x",
			});
			handlers = oidc(config);
			const res = await handlers.handleAuthorizeUrl(
				authorizeRequest({ redirectUri: REDIRECT, userId: "user-9" }),
			);
			expect(res.status).toBe(200);
			const { state } = (await res.json()) as { state: string };
			expect(config.storage.state.map.get(state)).toMatchObject({
				userId: "user-9",
				tenantId: "tenant-x",
			});
		});
	});

	describe("callback", () => {
		async function authorizeAndGetParams(): Promise<{
			state: string;
			nonce: string;
		}> {
			const res = await handlers.handleAuthorizeUrl(
				authorizeRequest({ redirectUri: REDIRECT }),
			);
			const { url, state } = (await res.json()) as { url: string; state: string };
			const nonce = new URL(url).searchParams.get("nonce") as string;
			return { state, nonce };
		}

		test("exchanges the code and mints a session", async () => {
			const { state, nonce } = await authorizeAndGetParams();
			await op.seed({
				code: "code-1",
				nonce,
				sub: "sub-123",
				clientId: CLIENT_ID,
				issuer: op.issuer,
			});
			const res = await handlers.handleCallback(
				getWithQuery(
					`https://auth.example.com/oidc/callback?state=${state}&code=code-1`,
				),
			);
			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({
				sessionToken: "session-st",
				idToken: "id-token-st",
			});
			expect(config.audit.sessions).toHaveLength(1);
			expect(config.audit.sessions[0]).toMatchObject({
				userId: "sub-123",
				tenantId: undefined,
			});
		});

		test("persists the JWKS cache after a successful exchange", async () => {
			const { state, nonce } = await authorizeAndGetParams();
			await op.seed({
				code: "code-1",
				nonce,
				sub: "sub-123",
				clientId: CLIENT_ID,
				issuer: op.issuer,
			});
			await handlers.handleCallback(
				getWithQuery(
					`https://auth.example.com/oidc/callback?state=${state}&code=code-1`,
				),
			);
			expect(config.storage.jwks.map.has(op.issuer)).toBe(true);
		});

		test("mapUser replaces the session subject and is echoed back", async () => {
			config = await makeConfig(
				op,
				{
					mapUser: mapUser({
						userId: "local-1",
						roles: ["admin"],
					} as unknown as OidcMappedUser),
				},
			);
			handlers = oidc(config);
			const { state, nonce } = await authorizeAndGetParams();
			await op.seed({
				code: "code-1",
				nonce,
				sub: "sub-123",
				clientId: CLIENT_ID,
				issuer: op.issuer,
			});
			const res = await handlers.handleCallback(
				getWithQuery(
					`https://auth.example.com/oidc/callback?state=${state}&code=code-1`,
				),
			);
			expect(res.status).toBe(200);
			const body = (await res.json()) as { user: Record<string, unknown> };
			expect(body.user).toEqual({ userId: "local-1", roles: ["admin"] });
			expect(config.audit.sessions[0]).toMatchObject({ userId: "local-1" });
		});

		test("mapUser returning null: 401 INVALID_GRANT", async () => {
			config = await makeConfig(op, { mapUser: mapUser(null) });
			handlers = oidc(config);
			const { state, nonce } = await authorizeAndGetParams();
			await op.seed({
				code: "code-1",
				nonce,
				sub: "sub-123",
				clientId: CLIENT_ID,
				issuer: op.issuer,
			});
			const res = await handlers.handleCallback(
				getWithQuery(
					`https://auth.example.com/oidc/callback?state=${state}&code=code-1`,
				),
			);
			expect(res.status).toBe(401);
			expect(((await res.json()) as { code: string }).code).toBe(
				ErrorCodes.INVALID_GRANT,
			);
		});

		test("failed code exchange: 401 INVALID_GRANT", async () => {
			const { state } = await authorizeAndGetParams();
			op.failTokenRequests(1);
			const res = await handlers.handleCallback(
				getWithQuery(
					`https://auth.example.com/oidc/callback?state=${state}&code=bad-code`,
				),
			);
			expect(res.status).toBe(401);
			expect(((await res.json()) as { code: string }).code).toBe(
				ErrorCodes.INVALID_GRANT,
			);
		});

		test("reusing a consumed state: 401 INVALID_STATE", async () => {
			const { state } = await authorizeAndGetParams();
			op.failTokenRequests(1);
			const first = await handlers.handleCallback(
				getWithQuery(
					`https://auth.example.com/oidc/callback?state=${state}&code=code-1`,
				),
			);
			expect(first.status).toBe(401);
			const replay = await handlers.handleCallback(
				getWithQuery(
					`https://auth.example.com/oidc/callback?state=${state}&code=code-1`,
				),
			);
			expect(replay.status).toBe(401);
			expect(((await replay.json()) as { code: string }).code).toBe(
				ErrorCodes.INVALID_STATE,
			);
		});

		test("missing state or code: 400", async () => {
			const res = await handlers.handleCallback(
				getWithQuery("https://auth.example.com/oidc/callback"),
			);
			expect(res.status).toBe(400);
		});
	});

	describe("userinfo", () => {
		test("GET without a bearer token: 401 INVALID_TOKEN", async () => {
			const res = await handlers.handleUserInfo(
				getWithQuery("https://auth.example.com/oidc/userinfo"),
			);
			expect(res.status).toBe(401);
			expect(((await res.json()) as { code: string }).code).toBe(
				ErrorCodes.INVALID_TOKEN,
			);
		});

		test("returns the raw userinfo when no mapUser is configured", async () => {
			const res = await handlers.handleUserInfo(
				new Request("https://auth.example.com/oidc/userinfo", {
					headers: { Authorization: "Bearer at-1" },
				}),
			);
			expect(res.status).toBe(200);
			const body = (await res.json()) as { user: { sub: string; email: string } };
			expect(body.user.email).toBe("user@op.example");
		});

		test("POST with accessToken in the body works too", async () => {
			const res = await handlers.handleUserInfo(
				new Request("https://auth.example.com/oidc/userinfo", {
					method: "POST",
					body: JSON.stringify({ accessToken: "at-1" }),
					headers: { "Content-Type": "application/json" },
				}),
			);
			expect(res.status).toBe(200);
		});

		test("mapUser rewrites the userinfo payload", async () => {
			config = await makeConfig(op, {
				mapUser: mapUser({
					userId: "u-1",
					email: "mapped@example.com",
				} as unknown as OidcMappedUser),
			});
			handlers = oidc(config);
			const res = await handlers.handleUserInfo(
				new Request("https://auth.example.com/oidc/userinfo", {
					headers: { Authorization: "Bearer at-1" },
				}),
			);
			expect(res.status).toBe(200);
			const body = (await res.json()) as { user: Record<string, unknown> };
			expect(body.user).toEqual({ userId: "u-1", email: "mapped@example.com" });
		});
	});

	describe("backchannel logout (RFC 7009-adjacent)", () => {
		function logoutRequest(
			body: string,
			contentType = "application/x-www-form-urlencoded",
		): Request {
			return new Request("https://auth.example.com/oidc/logout", {
				method: "POST",
				body,
				headers: { "Content-Type": contentType },
			});
		}

		test("rejects non-POST with 405", async () => {
			const res = await handlers.handleBackchannelLogout(
				getWithQuery("https://auth.example.com/oidc/logout"),
			);
			expect(res.status).toBe(405);
		});

		test("missing logout_token: 400 INVALID_TOKEN", async () => {
			const res = await handlers.handleBackchannelLogout(logoutRequest(""));
			expect(res.status).toBe(400);
			expect(((await res.json()) as { code: string }).code).toBe(
				ErrorCodes.INVALID_TOKEN,
			);
		});

		test("a plain JWT (typ != logout+jwt) is rejected", async () => {
			const token = await op.sign({ sub: "sub-123" }, { typ: "JWT" });
			const res = await handlers.handleBackchannelLogout(
				logoutRequest(`logout_token=${encodeURIComponent(token)}`),
			);
			expect(res.status).toBe(400);
			expect(((await res.json()) as { code: string }).code).toBe(
				ErrorCodes.INVALID_TOKEN,
			);
		});

		test("logout+jwt without the backchannel event claim is rejected", async () => {
			const token = await op.sign(
				{ sub: "sub-123", events: {} },
				{ typ: "logout+jwt" },
			);
			const res = await handlers.handleBackchannelLogout(
				logoutRequest(`logout_token=${encodeURIComponent(token)}`),
			);
			expect(res.status).toBe(400);
		});

		test("a valid logout token revokes the jti and prevents replay", async () => {
			config = await makeConfig(op, {
				logout: { tokenRevocationStorage: createRevocationStore() },
			});
			handlers = oidc(config);
			const token = await op.sign(
				{
					sub: "sub-123",
					jti: "jti-1",
					events: { [BACKCHANNEL_EVENT]: {} },
				},
				{ typ: "logout+jwt" },
			);
			const res = await handlers.handleBackchannelLogout(
				logoutRequest(`logout_token=${encodeURIComponent(token)}`),
			);
			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({ success: true });

			const replay = await handlers.handleBackchannelLogout(
				logoutRequest(`logout_token=${encodeURIComponent(token)}`),
			);
			expect(replay.status).toBe(400);
			expect(((await replay.json()) as { code: string }).code).toBe(
				ErrorCodes.STATE_REUSED,
			);
		});

		test("a token with a tampered payload fails signature validation: 401", async () => {
			config = await makeConfig(op, {
				logout: { tokenRevocationStorage: createRevocationStore() },
			});
			handlers = oidc(config);
			const token = await op.sign(
				{
					sub: "sub-123",
					jti: "jti-2",
					events: { [BACKCHANNEL_EVENT]: {} },
				},
				{ typ: "logout+jwt" },
			);
			const [header, , signature] = token.split(".");
			const tamperedPayload = Buffer.from(
				JSON.stringify({
					sub: "attacker",
					jti: "jti-2",
					events: { [BACKCHANNEL_EVENT]: {} },
				}),
			).toString("base64url");
			const tampered = `${header as string}.${tamperedPayload}.${signature as string}`;
			const res = await handlers.handleBackchannelLogout(
				logoutRequest(`logout_token=${encodeURIComponent(tampered)}`),
			);
			expect(res.status).toBe(401);
			expect(((await res.json()) as { code: string }).code).toBe(
				ErrorCodes.INVALID_TOKEN,
			);
		});
	});
});