import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { OidcConfig, OidcStateRecord } from "../../src";
import { startFakeOp, type FakeOp } from "../fixtures/fake-op";

const { oidc, ErrorCodes } = await import("../../src");

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
		discoveryUrl: op.baseUrl,
		clientId: CLIENT_ID,
		redirectUris: [REDIRECT],
		storage: {
			state: createStateStore(),
			jwks: createJwksStore(),
		},
		allowInsecureRequests: true,
		createSessionWithoutPassword: async (options) => {
			audit.sessions.push({ ...options });
			return { sessionToken: "session-st", idToken: "id-token-st" };
		},
		...overrides,
		audit,
		e2e: { op },
	} as Config;
}

async function authorizeAndGetParams(
	handlers: ReturnType<typeof oidc>,
	overrides?: Record<string, string>,
): Promise<{ state: string; nonce: string; url: URL }> {
	const query = new URLSearchParams({
		redirect_uri: REDIRECT,
		...(overrides ?? {}),
	});
	const res = await handlers.handleAuthorizeUrl(
		new Request(`https://auth.example.com/oidc/start?${query.toString()}`),
	);
	expect(res.status).toBe(200);
	const body = (await res.json()) as {
		url: string;
		state: string;
	};
	const url = new URL(body.url);
	return {
		state: body.state,
		nonce: url.searchParams.get("nonce") as string,
		url,
	};
}

describe("OIDC Client - Integration Tests", () => {
	let op: FakeOp;

	beforeEach(async () => {
		op = await startFakeOp({ clientId: CLIENT_ID });
	});

	afterEach(() => {
		op.stop();
	});

	test("authorize URL is built from the discovered endpoints (GET, PKCE S256)", async () => {
		const config = await makeConfig(op);
		const handlers = oidc(config);
		const { url } = await authorizeAndGetParams(handlers);

		expect(url.origin).toBe(op.baseUrl);
		expect(url.pathname).toBe("/authorize");
		expect(url.searchParams.get("response_type")).toBe("code");
		expect(url.searchParams.get("client_id")).toBe(CLIENT_ID);
		expect(url.searchParams.get("redirect_uri")).toBe(REDIRECT);
		expect(url.searchParams.get("scope")).toContain("openid");
		expect(url.searchParams.get("code_challenge_method")).toBe("S256");
		expect(url.searchParams.get("code_challenge")).toBeString();
	});

	test("full happy path: authorize -> code exchange -> session minted", async () => {
		const config = await makeConfig(op);
		const handlers = oidc(config);
		const { state, nonce } = await authorizeAndGetParams(handlers);

		await op.seed({
			code: "code-1",
			nonce,
			sub: "sub-123",
			clientId: CLIENT_ID,
			issuer: op.issuer,
		});

		const res = await handlers.handleCallback(
			new Request(`https://auth.example.com/oidc/callback?state=${state}&code=code-1`),
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { sessionToken: string };
		expect(body.sessionToken).toBe("session-st");
		expect(config.audit.sessions[0]).toMatchObject({
			userId: "sub-123",
			tenantId: undefined,
		});
		expect(config.storage.state.map.size).toBe(0);
	});

	test("the ID token signature is verified against the discovered JWKS (RS256)", async () => {
		const config = await makeConfig(op);
		const handlers = oidc(config);
		const { state, nonce } = await authorizeAndGetParams(handlers);

		await op.seed({
			code: "code-1",
			nonce,
			sub: "sub-123",
			clientId: CLIENT_ID,
			issuer: op.issuer,
		});
		const res = await handlers.handleCallback(
			new Request(`https://auth.example.com/oidc/callback?state=${state}&code=code-1`),
		);
		expect(res.status).toBe(200);
		expect(op.jwksFetchCount()).toBeGreaterThanOrEqual(1);
	});

	test("JWKS cache is persisted and reused across exchanges", async () => {
		const config = await makeConfig(op);
		const handlers = oidc(config);
		const { state, nonce } = await authorizeAndGetParams(handlers);

		await op.seed({
			code: "code-1",
			nonce,
			sub: "sub-123",
			clientId: CLIENT_ID,
			issuer: op.issuer,
		});
		const first = await handlers.handleCallback(
			new Request(`https://auth.example.com/oidc/callback?state=${state}&code=code-1`),
		);
		expect(first.status).toBe(200);
		expect(config.storage.jwks.map.has(op.issuer)).toBe(true);

		const fetchesAfterFirst = op.jwksFetchCount();
		const { state: state2, nonce: nonce2 } = await authorizeAndGetParams(handlers);
		await op.seed({
			code: "code-2",
			nonce: nonce2,
			sub: "sub-123",
			clientId: CLIENT_ID,
			issuer: op.issuer,
		});
		const second = await handlers.handleCallback(
			new Request(
				`https://auth.example.com/oidc/callback?state=${state2}&code=code-2`,
			),
		);
		expect(second.status).toBe(200);
		expect(op.jwksFetchCount()).toBe(fetchesAfterFirst);
	});

	test("an id_token with the wrong audience is rejected (real HTTP exchange)", async () => {
		const config = await makeConfig(op);
		const handlers = oidc(config);
		const { state, nonce } = await authorizeAndGetParams(handlers);

		await op.seed(
			{
				code: "code-bad-aud",
				nonce,
				sub: "sub-123",
				clientId: CLIENT_ID,
				issuer: op.issuer,
			},
			{ aud: "someone-else" },
		);
		const res = await handlers.handleCallback(
			new Request(
				`https://auth.example.com/oidc/callback?state=${state}&code=code-bad-aud`,
			),
		);
		expect(res.status).toBe(401);
		expect(((await res.json()) as { code: string }).code).toBe(
			ErrorCodes.INVALID_GRANT,
		);
	});

	test("a wrong code is rejected with 401 INVALID_GRANT", async () => {
		const config = await makeConfig(op);
		const handlers = oidc(config);
		const { state, nonce } = await authorizeAndGetParams(handlers);

		await op.seed({
			code: "code-right",
			nonce,
			sub: "sub-123",
			clientId: CLIENT_ID,
			issuer: op.issuer,
		});
		const res = await handlers.handleCallback(
			new Request(
				`https://auth.example.com/oidc/callback?state=${state}&code=code-wrong`,
			),
		);
		expect(res.status).toBe(401);
		expect(((await res.json()) as { code: string }).code).toBe(
			ErrorCodes.INVALID_GRANT,
		);
	});

	test("a consumed state cannot be replayed", async () => {
		const config = await makeConfig(op);
		const handlers = oidc(config);
		const { state, nonce } = await authorizeAndGetParams(handlers);

		await op.seed({
			code: "code-1",
			nonce,
			sub: "sub-123",
			clientId: CLIENT_ID,
			issuer: op.issuer,
		});
		const first = await handlers.handleCallback(
			new Request(`https://auth.example.com/oidc/callback?state=${state}&code=code-1`),
		);
		expect(first.status).toBe(200);

		const replay = await handlers.handleCallback(
			new Request(`https://auth.example.com/oidc/callback?state=${state}&code=code-1`),
		);
		expect(replay.status).toBe(401);
		expect(((await replay.json()) as { code: string }).code).toBe(
			ErrorCodes.INVALID_STATE,
		);
	});

	test("userinfo is fetched from the discovered endpoint with the access token", async () => {
		const config = await makeConfig(op);
		const handlers = oidc(config);
		const res = await handlers.handleUserInfo(
			new Request("https://auth.example.com/oidc/userinfo", {
				headers: { Authorization: "Bearer any-token" },
			}),
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { user: Record<string, unknown> };
		expect(body.user).toMatchObject({
			sub: "op-subject",
			email: "user@op.example",
		});
	});
});