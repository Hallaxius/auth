import { createLocalJWKSet, type JSONWebKeySet, jwtVerify } from "jose";
import {
	allowInsecureRequests,
	authorizationCodeGrant,
	buildAuthorizationUrl,
	ClientSecretPost,
	Configuration,
	calculatePKCECodeChallenge,
	discovery,
	type ExportedJWKSCache,
	enableNonRepudiationChecks,
	fetchUserInfo,
	getJwksCache,
	None,
	randomNonce,
	randomPKCECodeVerifier,
	randomState,
	type ServerMetadata,
	setJwksCache,
	skipSubjectCheck,
} from "openid-client";
import { AuthError, ConfigurationError, ErrorCodes } from "./errors";
import type { IOidcStateStore } from "./storage/interfaces";
import type {
	OidcConfig,
	OidcMappedUser,
	OidcStateRecord,
	OidcUserClaims,
} from "./types";
import { getRequestIP } from "./utils/ip";

const DEFAULT_STATE_TTL_SECONDS = 600;
const DEFAULT_JWKS_CACHE_TTL_SECONDS = 3600;
const BACKCHANNEL_EVENT = "http://schemas.openid.net/event/backchannel-logout";

export type OidcHandlers = {
	/** Builds the authorization URL (PKCE S256 + state + nonce; exact-match redirect whitelist). */
	handleAuthorizeUrl: (request: Request) => Promise<Response>;
	/** Exchanges the code — validates the ID token (iss/aud/exp/nonce/signature) and mints the session. */
	handleCallback: (request: Request) => Promise<Response>;
	/** Fetch mapped userinfo with an access token (RFC 9068 / userinfo endpoint). */
	handleUserInfo: (request: Request) => Promise<Response>;
	/** RFC 7009-style back-channel logout (`logout_token` validation + jti replay check). */
	handleBackchannelLogout: (request: Request) => Promise<Response>;
};

function json(data: Record<string, unknown>, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "Content-Type": "application/json; charset=utf-8" },
	});
}

function errorResponse(error: unknown): Response {
	if (error instanceof AuthError) {
		return json(
			{ error: error.message, code: error.code },
			error.statusCode ?? 500,
		);
	}
	throw error;
}

function parseJwtHeader(token: string): { typ?: string; kid?: string } | null {
	try {
		const base64 = token.split(".")[0] as string;
		const jsonStr = Buffer.from(base64, "base64url").toString("utf-8");
		return JSON.parse(jsonStr) as { typ?: string; kid?: string };
	} catch {
		return null;
	}
}

function decodeJwtClaims(token: string): Record<string, unknown> | null {
	try {
		const base64 = token.split(".")[1] as string;
		const jsonStr = Buffer.from(base64, "base64url").toString("utf-8");
		return JSON.parse(jsonStr) as Record<string, unknown>;
	} catch {
		return null;
	}
}

export function oidc(config: OidcConfig) {
	if (!config.discoveryUrl && !config.serverMetadata) {
		throw new ConfigurationError(
			"oidc() requires `discoveryUrl` (or static `serverMetadata` for test doubles / private OPs).",
		);
	}
	if (!config.clientId) {
		throw new ConfigurationError("oidc() requires `clientId`.");
	}
	if (!config.redirectUris?.length) {
		throw new ConfigurationError(
			"oidc() requires `redirectUris` (exact-match whitelist, RFC 9700).",
		);
	}
	const storage = config.storage;
	if (!storage?.state) {
		throw new ConfigurationError(
			"oidc() requires `storage.state` (single-use state + PKCE records).",
		);
	}
	const stateStorage: IOidcStateStore = storage.state;
	const stateTtlSeconds = config.stateTtlSeconds ?? DEFAULT_STATE_TTL_SECONDS;
	const scope = config.scope ?? "openid profile email";
	const usePkce = config.usePkce ?? true;
	const clientSecret = config.clientSecret;
	const clientAuthentication = clientSecret
		? ClientSecretPost(clientSecret)
		: None();
	const jwksCacheStore = config.storage?.jwks;
	const jwksCacheTtl =
		config.logout?.jtiTtlSeconds ?? DEFAULT_JWKS_CACHE_TTL_SECONDS;
	const trustProxy = config.trustProxy ?? false;
	const jtiTtlSeconds = config.logout?.jtiTtlSeconds ?? 3600;

	let configurationPromise: Promise<Configuration> | null = null;

	function discoverIssuer(): Promise<Configuration> {
		if (!configurationPromise) {
			configurationPromise = (async () => {
				if (config.serverMetadata) {
					const built = new Configuration(
						config.serverMetadata as ServerMetadata,
						config.clientId,
						clientSecret,
						clientAuthentication,
					);
					if (config.allowInsecureRequests) {
						allowInsecureRequests(built);
					}
					// openid-client only verifies ID-token *signatures* opt-in —
					// always verify (claims validation alone is not enough for an auth library).
					enableNonRepudiationChecks(built);
					await seedJwksCache(built);
					return built;
				}
				const discovered = await discovery(
					new URL(config.discoveryUrl as string),
					config.clientId,
					clientSecret,
					clientAuthentication,
					config.allowInsecureRequests
						? { execute: [allowInsecureRequests] }
						: undefined,
				);
				enableNonRepudiationChecks(discovered);
				await seedJwksCache(discovered);
				return discovered;
			})();
		}
		return configurationPromise;
	}

	async function seedJwksCache(configuration: Configuration): Promise<void> {
		if (!jwksCacheStore) return;
		try {
			const issuer = configuration.serverMetadata().issuer as string;
			const cached = await jwksCacheStore.get(issuer);
			if (cached?.keys) {
				setJwksCache(configuration, cached.keys as ExportedJWKSCache);
			}
		} catch {
			// Best-effort cache seeding — never blocks the flow.
		}
	}

	async function persistJwksCache(configuration: Configuration): Promise<void> {
		if (!jwksCacheStore) return;
		try {
			const issuer = configuration.serverMetadata().issuer as string;
			const cache = getJwksCache(configuration);
			if (cache) {
				await jwksCacheStore.set(
					issuer,
					cache as unknown as Record<string, unknown>,
					jwksCacheTtl,
				);
			}
		} catch {
			// Best-effort — never blocks the flow.
		}
	}

	function invalidState(): AuthError {
		return new AuthError(ErrorCodes.INVALID_STATE, "Invalid or expired state", {
			statusCode: 401,
		});
	}

	async function handleAuthorizeUrl(request: Request): Promise<Response> {
		if (request.method !== "GET" && request.method !== "POST") {
			return json({ error: "Method not allowed" }, 405);
		}
		try {
			const url = new URL(request.url);
			const body =
				request.method === "POST"
					? ((await request.json()) as Record<string, unknown>)
					: {};
			const redirectUri =
				(typeof body.redirectUri === "string" && body.redirectUri) ||
				url.searchParams.get("redirect_uri");
			if (typeof redirectUri !== "string") {
				return json({ error: "redirect_uri is required" }, 400);
			}
			if (!config.redirectUris.includes(redirectUri)) {
				return json({ error: "redirect_uri is not in the whitelist" }, 400);
			}
			const userId =
				(typeof body.userId === "string" && body.userId) ||
				url.searchParams.get("user_id") ||
				url.searchParams.get("userId") ||
				null;
			const tenantId = (await config.tenantIdFromRequest?.(request)) ?? null;

			const configuration = await discoverIssuer();
			const state = randomState();
			const nonce = randomNonce();
			const codeVerifier = usePkce ? randomPKCECodeVerifier() : "";
			const codeChallenge = usePkce
				? await calculatePKCECodeChallenge(codeVerifier)
				: "";
			const record: OidcStateRecord = {
				nonce,
				codeVerifier,
				redirectUri,
				tenantId,
				userId,
				expiresAt: Date.now() + stateTtlSeconds * 1000,
				createdAt: Date.now(),
			};
			await stateStorage.set(state, record);

			const parameters = new URLSearchParams({
				redirect_uri: redirectUri,
				response_type: "code",
				scope,
				state,
				nonce,
			});
			if (usePkce) {
				parameters.set("code_challenge", codeChallenge);
				parameters.set("code_challenge_method", "S256");
			}
			const authorizationUrl = buildAuthorizationUrl(configuration, parameters);
			return json({
				url: authorizationUrl.toString(),
				state,
				expiresInSeconds: stateTtlSeconds,
			});
		} catch (error) {
			return errorResponse(error);
		}
	}

	async function handleCallback(request: Request): Promise<Response> {
		if (request.method !== "GET" && request.method !== "POST") {
			return json({ error: "Method not allowed" }, 405);
		}
		try {
			const url = new URL(request.url);
			const state = url.searchParams.get("state");
			const code = url.searchParams.get("code");
			if (typeof state !== "string" || typeof code !== "string") {
				return json({ error: "state and code are required" }, 400);
			}
			const record = await stateStorage.getAndConsume(state);
			if (!record || record.expiresAt < Date.now()) {
				throw invalidState();
			}

			const configuration = await discoverIssuer();
			const tokenEndpointParameters = new URLSearchParams({
				redirect_uri: record.redirectUri,
			});
			if (usePkce) {
				tokenEndpointParameters.set("code_verifier", record.codeVerifier);
			}
			let tokens: Awaited<ReturnType<typeof authorizationCodeGrant>>;
			try {
				tokens = await authorizationCodeGrant(
					configuration,
					url,
					{
						expectedState: state,
						expectedNonce: record.nonce,
					},
					tokenEndpointParameters,
				);
			} catch (cause) {
				throw new AuthError(
					ErrorCodes.INVALID_GRANT,
					"Code exchange or ID token validation failed",
					{
						statusCode: 401,
						cause: cause instanceof Error ? cause : undefined,
					},
				);
			}
			const claims = tokens.claims();
			if (!claims || typeof claims.sub !== "string") {
				throw new AuthError(
					ErrorCodes.INVALID_GRANT,
					"ID token is missing (or missing `sub`)",
					{ statusCode: 401 },
				);
			}
			await persistJwksCache(configuration);

			const oidcClaims = claims as unknown as OidcUserClaims;
			let mapped: OidcMappedUser | null = null;
			let userId = oidcClaims.sub as string;
			if (config.mapUser) {
				mapped = await config.mapUser(oidcClaims);
				if (!mapped) {
					throw new AuthError(
						ErrorCodes.INVALID_GRANT,
						"Claims could not be mapped to a local user",
						{ statusCode: 401 },
					);
				}
				userId = mapped.userId;
			}

			const ip = await getRequestIP(request, { trustProxy });
			if (config.createSessionWithoutPassword) {
				const session = await config.createSessionWithoutPassword({
					userId,
					tenantId: record.tenantId ?? undefined,
					ip,
					userAgent: request.headers.get("user-agent") ?? undefined,
				});
				return json({
					sessionToken: session.sessionToken,
					idToken: session.idToken,
					...(mapped ? { user: mapped } : {}),
				});
			}
			return json({
				success: true,
				userId,
				...(mapped ? { user: mapped } : {}),
			});
		} catch (error) {
			return errorResponse(error);
		}
	}

	async function handleUserInfo(request: Request): Promise<Response> {
		if (request.method !== "GET" && request.method !== "POST") {
			return json({ error: "Method not allowed" }, 405);
		}
		try {
			const body =
				request.method === "POST"
					? ((await request.json()) as Record<string, unknown>)
					: {};
			const bearer = request.headers
				.get("authorization")
				?.match(/^Bearer\s+(.+)$/i)?.[1];
			const accessToken =
				(typeof body.accessToken === "string" && body.accessToken) || bearer;
			if (typeof accessToken !== "string" || accessToken.length === 0) {
				throw new AuthError(
					ErrorCodes.INVALID_TOKEN,
					"Access token is required",
					{ statusCode: 401 },
				);
			}
			const configuration = await discoverIssuer();
			let userinfo: unknown;
			try {
				userinfo = await fetchUserInfo(
					configuration,
					accessToken,
					skipSubjectCheck,
				);
			} catch (cause) {
				throw new AuthError(
					ErrorCodes.INVALID_TOKEN,
					"Invalid or expired access token",
					{
						statusCode: 401,
						cause: cause instanceof Error ? cause : undefined,
					},
				);
			}
			const mapped = config.mapUser
				? await config.mapUser(userinfo as OidcUserClaims)
				: null;
			return json({
				user: mapped ?? (userinfo as OidcUserClaims),
			});
		} catch (error) {
			return errorResponse(error);
		}
	}

	async function handleBackchannelLogout(request: Request): Promise<Response> {
		if (request.method !== "POST") {
			return json({ error: "Method not allowed" }, 405);
		}
		try {
			const contentType = request.headers.get("content-type") ?? "";
			let logoutToken: string | undefined;
			if (contentType.includes("application/x-www-form-urlencoded")) {
				const form = new URLSearchParams(await request.text());
				logoutToken = form.get("logout_token") ?? undefined;
			} else if (contentType.includes("application/json")) {
				const body = (await request.json()) as {
					logout_token?: string;
				};
				logoutToken = body.logout_token;
			}
			if (typeof logoutToken !== "string" || logoutToken.length === 0) {
				throw new AuthError(
					ErrorCodes.INVALID_TOKEN,
					"logout_token is required",
					{ statusCode: 400 },
				);
			}

			const header = parseJwtHeader(logoutToken);
			if (header?.typ !== "logout+jwt") {
				throw new AuthError(
					ErrorCodes.INVALID_TOKEN,
					"logout_token must be a logout+jwt",
					{ statusCode: 400 },
				);
			}
			const claims = decodeJwtClaims(logoutToken);
			if (!claims) {
				throw new AuthError(
					ErrorCodes.INVALID_TOKEN,
					"Malformed logout_token",
					{ statusCode: 400 },
				);
			}
			const events = claims.events as Record<string, unknown> | undefined;
			const sessionId = claims.sid as string | undefined;
			const subject = claims.sub as string | undefined;
			if (
				!events?.[BACKCHANNEL_EVENT] ||
				(typeof subject !== "string" && typeof sessionId !== "string")
			) {
				throw new AuthError(
					ErrorCodes.INVALID_TOKEN,
					"logout_token is missing required claims",
					{ statusCode: 400 },
				);
			}

			const revocation = config.logout?.tokenRevocationStorage;
			const jti = claims.jti as string | undefined;
			if (revocation) {
				if (jti && (await revocation.isRevoked(jti))) {
					throw new AuthError(
						ErrorCodes.STATE_REUSED,
						"logout_token replay detected",
						{ statusCode: 400 },
					);
				}
			}

			const configuration = await discoverIssuer();
			try {
				const jwksUri = configuration.serverMetadata().jwks_uri;
				if (jwksUri) {
					const response = await fetch(jwksUri);
					const jwks = (await response.json()) as {
						keys: unknown[];
					};
					const keySet = createLocalJWKSet(jwks as unknown as JSONWebKeySet);
					await jwtVerify(logoutToken, keySet, {
						algorithms: [
							"RS256",
							"RS384",
							"RS512",
							"PS256",
							"PS384",
							"PS512",
							"ES256",
							"ES384",
							"ES512",
							"EdDSA",
						],
					});
				}
			} catch (cause) {
				throw new AuthError(
					ErrorCodes.INVALID_TOKEN,
					"logout_token signature is invalid",
					{
						statusCode: 401,
						cause: cause instanceof Error ? cause : undefined,
					},
				);
			}

			if (revocation && jti) {
				await revocation.revoke(jti, jtiTtlSeconds);
			}
			return json({ success: true });
		} catch (error) {
			return errorResponse(error);
		}
	}

	return {
		handleAuthorizeUrl,
		handleCallback,
		handleUserInfo,
		handleBackchannelLogout,
	};
}
