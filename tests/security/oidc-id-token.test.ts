import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { OidcConfig, OidcStateRecord } from "../../src";
import { startFakeOp, type FakeOp } from "../fixtures/fake-op";

const { oidc, ErrorCodes } = await import("../../src");

const CLIENT_ID = "app-client";
const REDIRECT = "https://app.example.com/cb";
const NOW = Math.floor(Date.now() / 1000);

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

type Config = OidcConfig & { storage: { state: ReturnType<typeof createStateStore> } };

async function makeConfig(op: FakeOp): Promise<Config> {
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
			token_endpoint_auth_methods_supported: ["none"],
		},
		clientId: CLIENT_ID,
		redirectUris: [REDIRECT],
		allowInsecureRequests: true,
		storage: { state: createStateStore() },
	} as Config;
}

/** Starts an authorize + seed + callback against the OP using the GIVEN token response. */
async function runCallbackWith(
	op: FakeOp,
	craftIdToken: (claims: {
		sub: string;
		nonce: string;
		iss: string;
		aud: string;
	}) => Promise<string>,
	equalNonce = true,
): Promise<{ status: number; code?: string }> {
	const config = await makeConfig(op);
	const handlers = oidc(config);
	const authorizeRes = await handlers.handleAuthorizeUrl(
		new Request(
			`https://auth.example.com/oidc/start?redirect_uri=${encodeURIComponent(REDIRECT)}`,
		),
	);
	expect(authorizeRes.status).toBe(200);
	const { url, state } = (await authorizeRes.json()) as {
		url: string;
		state: string;
	};
	const nonce = new URL(url).searchParams.get("nonce") as string;

	await op.seed({
		code: "code-1",
		nonce,
		sub: "sub-123",
		clientId: CLIENT_ID,
		issuer: op.issuer,
	});

	const idToken = await craftIdToken({
		sub: "sub-123",
		nonce: equalNonce ? nonce : "attacker-nonce",
		iss: op.issuer,
		aud: CLIENT_ID,
	});
	op.setTokenResponse({
		access_token: "at-attack",
		token_type: "Bearer",
		expires_in: 3600,
		id_token: idToken,
	});

	const res = await handlers.handleCallback(
		new Request(`https://auth.example.com/oidc/callback?state=${state}&code=code-1`),
	);
	const body = (await res.json()) as { code?: string };
	return { status: res.status, code: body.code };
}

function b64url(input: object): string {
	return Buffer.from(JSON.stringify(input)).toString("base64url");
}

describe("OIDC ID Token Security Suite", () => {
	let op: FakeOp;

	beforeEach(async () => {
		op = await startFakeOp({ clientId: CLIENT_ID });
	});

	afterEach(() => {
		op.stop();
	});

	async function validClaims(base: {
		sub: string;
		nonce: string;
		iss: string;
		aud: string;
	}) {
		return {
			sub: base.sub,
			nonce: base.nonce,
			iss: base.iss,
			aud: base.aud,
			iat: NOW,
			exp: NOW + 300,
		};
	}

	test("an id_token with alg=none is rejected (401)", async () => {
		const result = await runCallbackWith(op, async (claims) => {
			const payload = b64url(await validClaims(claims));
			return `${b64url({ alg: "none", typ: "JWT" })}.${payload}.`;
		});
		expect(result.status).toBe(401);
		expect(result.code).toBe(ErrorCodes.INVALID_GRANT);
	});

	test("an id_token with a tampered signature is rejected (401)", async () => {
		const result = await runCallbackWith(op, async (claims) => {
			const token = await op.sign(await validClaims(claims), { typ: "JWT" });
			const [header, payload, signature] = token.split(".");
			const tamperedSignature =
				`${signature as string}${signature?.[0] === "A" ? "B" : "A"}`;
			return `${header as string}.${payload as string}.${tamperedSignature}`;
		});
		expect(result.status).toBe(401);
		expect(result.code).toBe(ErrorCodes.INVALID_GRANT);
	});

	test("an id_token from the wrong issuer is rejected (401)", async () => {
		const result = await runCallbackWith(op, async (claims) =>
			op.sign({ ...(await validClaims(claims)), iss: "https://evil.example.com" }),
		);
		expect(result.status).toBe(401);
		expect(result.code).toBe(ErrorCodes.INVALID_GRANT);
	});

	test("an id_token for a different audience is rejected (401)", async () => {
		const result = await runCallbackWith(op, async (claims) =>
			op.sign({ ...(await validClaims(claims)), aud: "attacker-app" }),
		);
		expect(result.status).toBe(401);
		expect(result.code).toBe(ErrorCodes.INVALID_GRANT);
	});

	test("an expired id_token is rejected (401)", async () => {
		const result = await runCallbackWith(op, async (claims) =>
			op.sign({ ...(await validClaims(claims)), exp: NOW - 60 }),
		);
		expect(result.status).toBe(401);
		expect(result.code).toBe(ErrorCodes.INVALID_GRANT);
	});

	test("an id_token with the wrong nonce is rejected (401)", async () => {
		const result = await runCallbackWith(op, async (claims) =>
			op.sign(await validClaims(claims)),
			false,
		);
		expect(result.status).toBe(401);
		expect(result.code).toBe(ErrorCodes.INVALID_GRANT);
	});

	test("a token with an unknown kid is rejected (401)", async () => {
		const result = await runCallbackWith(op, async (claims) => {
			const payload = b64url(await validClaims(claims));
			return `${b64url({ alg: "RS256", typ: "JWT", kid: "unknown-key" })}.${payload}.`;
		});
		expect(result.status).toBe(401);
		expect(result.code).toBe(ErrorCodes.INVALID_GRANT);
	});

	test("a token response without an id_token is rejected (401)", async () => {
		const result = await runCallbackWith(op, async () => {
			op.setTokenResponse({
				access_token: "at-no-idtoken",
				token_type: "Bearer",
				expires_in: 3600,
			});
			return "";
		});
		expect(result.status).toBe(401);
		expect(result.code).toBe(ErrorCodes.INVALID_GRANT);
	});

	test("signature verification actually hits the JWKS endpoint", async () => {
		const before = op.jwksFetchCount();
		await runCallbackWith(op, async (claims) =>
			op.sign(await validClaims(claims)),
		);
		expect(op.jwksFetchCount()).toBeGreaterThan(before);
	});

	test("a legitimately signed token still succeeds after the attacks", async () => {
		const result = await runCallbackWith(op, async (claims) =>
			op.sign(await validClaims(claims)),
		);
		expect(result.status).toBe(200);
	});
});