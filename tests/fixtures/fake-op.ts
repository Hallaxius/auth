import { exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";

export type OpSeed = {
	code: string;
	nonce: string;
	sub: string;
	clientId: string;
	issuer: string;
};

export type OpOverrides = {
	iss?: string;
	aud?: string;
	expOffsetS?: number;
	iatOffsetS?: number;
	extra?: Record<string, unknown>;
};

export type FakeOp = {
	baseUrl: string;
	issuer: string;
	publicJwk: JWK;
	/** Test-only: bind a code to the claims the token endpoint will sign. */
	seed: (seed: OpSeed, overrides?: OpOverrides) => Promise<void>;
	/** Number of requests the /jwks endpoint received (kid-refetch detection). */
	jwksFetchCount: () => number;
	/** Make the next N token requests fail with an OAuth error response. */
	failTokenRequests: (count?: number) => void;
	/** Replace the token endpoint response entirely. */
	setTokenResponse: (body: Record<string, unknown>, status?: number) => void;
	/** Restore the default (seeded) token endpoint behavior. */
	clearTokenOverride: () => void;
	/** Sign arbitrary JWT claims with the OP's key (logout tokens, etc.). */
	sign: (
		claims: Record<string, unknown>,
		opts?: { alg?: string; typ?: string },
	) => Promise<string>;
	stop: () => void;
};

function json(body: Record<string, unknown>, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json; charset=utf-8" },
	});
}

export async function startFakeOp(
	opts: { clientId: string; sub?: string } & Partial<OpOverrides>,
): Promise<FakeOp> {
	const { privateKey, publicKey } = await generateKeyPair("RS256");
	const publicJwk = await exportJWK(publicKey);
	const seeds = new Map<string, { seed: OpSeed; overrides: OpOverrides }>();
	const failCount = { remaining: 0 };
	const overrideTokenResponse = {
		body: null as Record<string, unknown> | null,
		status: 200,
	};
	let jwksFetches = 0;

	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		async fetch(request) {
			const url = new URL(request.url);
			const issuer = `${url.protocol}//${url.host}`;

			if (url.pathname === "/.well-known/openid-configuration") {
				return json({
					issuer,
					authorization_endpoint: `${issuer}/authorize`,
					token_endpoint: `${issuer}/token`,
					userinfo_endpoint: `${issuer}/userinfo`,
					jwks_uri: `${issuer}/jwks`,
					response_types_supported: ["code"],
					subject_types_supported: ["public"],
					id_token_signing_alg_values_supported: ["RS256"],
					code_challenge_methods_supported: ["S256"],
					backchannel_logout_supported: true,
					backchannel_logout_session_supported: true,
					scopes_supported: ["openid", "profile", "email"],
					token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
				});
			}

			if (url.pathname === "/jwks") {
				jwksFetches++;
				return json({ keys: [publicJwk] });
			}

			if (url.pathname === "/_seed") {
				const body = (await request.json()) as {
					seed: OpSeed;
					overrides?: OpOverrides;
				};
				seeds.set(body.seed.code, {
					seed: body.seed,
					overrides: body.overrides ?? {},
				});
				return json({ ok: true });
			}

			if (url.pathname === "/token") {
				if (overrideTokenResponse.body) {
					return json(overrideTokenResponse.body, overrideTokenResponse.status);
				}
				if (failCount.remaining > 0) {
					failCount.remaining--;
					return json(
						{ error: "invalid_grant", error_description: "Simulated failure" },
						400,
					);
				}
				const form = new URLSearchParams(await request.text());
				const code = form.get("code");
				const entry = code ? seeds.get(code) : undefined;
				if (!entry) {
					return json(
						{ error: "invalid_grant", error_description: "Unknown code" },
						400,
					);
				}
				const { seed, overrides } = entry;
				const now = Math.floor(Date.now() / 1000);
				const idToken = await new SignJWT({
					sub: opts.sub ?? seed.sub,
					nonce: seed.nonce,
					...overrides.extra,
				})
					.setProtectedHeader({ alg: "RS256", typ: "JWT" })
					.setIssuer(overrides.iss ?? opts.iss ?? seed.issuer)
					.setAudience(overrides.aud ?? opts.aud ?? seed.clientId)
					.setIssuedAt(now + (overrides.iatOffsetS ?? opts.iatOffsetS ?? 0))
					.setExpirationTime(
						now + (overrides.expOffsetS ?? opts.expOffsetS ?? 300),
					)
					.sign(privateKey);
				return json({
					access_token: `at-${code}`,
					token_type: "Bearer",
					expires_in: 3600,
					id_token: idToken,
				});
			}

			if (url.pathname === "/userinfo") {
				const auth = request.headers.get("authorization") ?? "";
				if (!auth.startsWith("Bearer ")) {
					return json({ error: "invalid_token" }, 401);
				}
				const sub = opts.sub ?? "op-subject";
				return json({
					sub,
					email: "user@op.example",
					email_verified: true,
					name: "OP User",
					preferred_username: "opus",
				});
			}

			return json({ error: "not_found" }, 404);
		},
	});

	const baseUrl = `http://127.0.0.1:${server.port}`;

	return {
		baseUrl,
		issuer: baseUrl,
		publicJwk,
		async seed(seed, overrides) {
			await fetch(`${baseUrl}/_seed`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ seed, overrides }),
			});
		},
		jwksFetchCount: () => jwksFetches,
		failTokenRequests(count = 1) {
			failCount.remaining = count;
		},
		setTokenResponse(body, status = 200) {
			overrideTokenResponse.body = body;
			overrideTokenResponse.status = status;
		},
		clearTokenOverride() {
			overrideTokenResponse.body = null;
			overrideTokenResponse.status = 200;
		},
		async sign(claims, opts = {}) {
			return new SignJWT(claims)
				.setProtectedHeader({ alg: opts.alg ?? "RS256", typ: opts.typ ?? "JWT" })
				.sign(privateKey);
		},
		stop: () => {
			server.stop();
		},
	};
}