import { type CaptchaConfig, verifyCaptcha } from "./captcha";
import { deriveStateSecret, pkce, processConfig } from "./config";
import { BruteForceProtection } from "./credentials";
import {
	AuthError,
	type AuthError as AuthErrorType,
	ConfigurationError,
	ErrorCodes,
} from "./errors";
import { DiscordClient } from "./internal/client";
import {
	clearSessionCookie,
	createSessionCookie,
	defaultSameSite,
	parseCookies,
} from "./internal/cookies";
import {
	errorResponse,
	htmlResponse,
	jsonResponse,
	redirectResponse,
} from "./internal/http-utils";
import {
	expiresInToSeconds,
	revokeToken,
	signToken,
	verifyToken,
} from "./internal/jwt";
import {
	consumeState,
	generateState,
	type ValidatedState,
} from "./internal/state";
import { rateLimit } from "./rate-limit";
import type {
	BruteForceConfig,
	Callbacks,
	CookieOptions,
	CsrfConfig,
	DiscordMfaConfig,
	DiscordScope,
	DiscordTokenResponse,
	DiscordUser,
	GuildRoleSyncConfig,
	InternalConfig,
	RateLimitStorage,
	RoutesConfig,
	SafeStoredUser,
	SessionConfig,
	SessionData,
	StoredUser,
	TokenRevocationStorage,
	UserStorage,
} from "./types";
import { GuildRoleSync } from "./utils/guild";
import { getRequestIP } from "./utils/ip";
import { createSecurityLogger } from "./utils/logger";
import { isProduction } from "./utils/validation";

const logger = createSecurityLogger("discord");
interface CallbackContext {
	config: InternalConfig;
	client: DiscordClient;
	storage: UserStorage;
	code: string;
	codeVerifier?: string;
	sessionId?: string;
	userAgent?: string;
}
interface CallbackResult {
	user: DiscordUser;
	tokens: DiscordTokenResponse;
	syncedPermissions: string[];
	storedUser?: StoredUser;
}
async function handleOAuthCallback(
	ctx: CallbackContext,
): Promise<CallbackResult> {
	const { config, client, storage, code, codeVerifier } = ctx;
	if (!config.redirectUri) {
		throw new AuthError(
			ErrorCodes.CONFIGURATION_ERROR,
			"redirectUri is required - set DISCORD_REDIRECT_URI env var or provide redirectUri in config",
		);
	}
	const redirectUri = config.redirectUri;
	const tokens = await client.exchangeCode({
		clientId: config.clientId,
		clientSecret: config.clientSecret,
		code,
		redirectUri,
		codeVerifier,
	});
	const user = await client.getUser(tokens.access_token);
	if (config.mfa.enabled && config.mfa.requireMfa && !user.mfa_enabled) {
		throw new AuthError(
			ErrorCodes.MFA_REQUIRED,
			"Multi-factor authentication is required",
			{
				statusCode: 403,
			},
		);
	}
	let storedUser: StoredUser | null = null;
	if (storage) {
		const expiresAt = Math.floor(Date.now() / 1000) + tokens.expires_in;
		const existing = await storage.findByDiscordId(user.id);
		if (!existing) {
			const created = await storage.create({
				discordId: user.id,
				username: user.username,
				globalName: user.global_name,
				avatar: user.avatar,
				email: user.email,
				locale: user.locale,
				roles: ["user"],
				mfaEnabled: user.mfa_enabled,
				accessToken: tokens.access_token,
				refreshToken: tokens.refresh_token,
				tokenExpiresAt: expiresAt,
			});
			storedUser = created;
		} else {
			const updated = await storage.update(user.id, {
				username: user.username,
				globalName: user.global_name,
				avatar: user.avatar,
				email: user.email,
				mfaEnabled: user.mfa_enabled,
				accessToken: tokens.access_token,
				refreshToken: tokens.refresh_token,
				tokenExpiresAt: expiresAt,
			});
			storedUser = updated;
		}
	}
	let syncedPermissions: string[] = [];
	if (
		config.guildRoleSync.enabled &&
		config.guildRoleSync.syncOnLogin &&
		config.scopes.includes("guilds.members.read")
	) {
		const guildSync = new GuildRoleSync(config.guildRoleSync, client);
		syncedPermissions = await guildSync.syncUserRoles(
			user.id,
			tokens.access_token,
		);
		if (storedUser && syncedPermissions.length > 0) {
			const mergedRoles = Array.from(
				new Set([...storedUser.roles, ...syncedPermissions]),
			);
			storedUser = await storage.update(user.id, { roles: mergedRoles });
		}
	}
	return {
		user,
		tokens,
		syncedPermissions,
		storedUser: storedUser ?? undefined,
	};
}
async function revokeTokenOnly(params: {
	storage: UserStorage;
	client: DiscordClient;
	clientId: string;
	clientSecret: string;
	sessionData: SessionData;
}): Promise<void> {
	const { storage, client, clientId, clientSecret, sessionData } = params;
	try {
		const stored = await storage.findByDiscordId(sessionData.discordId);
		if (stored?.accessToken) {
			await client.revokeToken({
				clientId,
				clientSecret,
				accessToken: stored.accessToken,
			});
		}
	} catch (err) {
		logger.error("Token revocation failed for Discord user", {
			discordId: sessionData.discordId,
			error: err instanceof Error ? err.message : String(err),
		});
	}
}
async function getSessionFromRequest(
	request: Request,
	config: { secret: string; cookieName?: string },
	revocationStorage?: TokenRevocationStorage,
): Promise<SessionData | null> {
	const cookieName = config.cookieName ?? "discord-auth-session";
	const cookies = parseCookies(request);
	const token = cookies[cookieName];
	if (!token) return null;
	const payload = await verifyToken<Record<string, unknown>>(
		token,
		config.secret,
		revocationStorage,
	);
	if (!payload) return null;
	return {
		discordId: payload.discordId as string,
		username: payload.username as string,
		globalName: (payload.globalName as string) ?? null,
		avatar: (payload.avatar as string) ?? null,
		email: (payload.email as string) ?? null,
		locale: payload.locale as string,
		roles: (payload.roles as string[]) ?? undefined,
	};
}
function isSafeRedirect(target: string, allowedOrigins?: string[]): boolean {
	if (typeof target !== "string" || target.length === 0) return false;
	if (target.includes("\\")) return false;
	if (target.includes("%5c") || target.includes("%5C")) return false;
	if (/^\s*\/\//.test(target)) return false;
	if (target.startsWith("/")) {
		try {
			const parsed = new URL(target, "http://localhost");
			if (parsed.hostname !== "localhost") return false;
			if (!parsed.pathname || parsed.pathname.includes("\\")) return false;
			return true;
		} catch {
			return false;
		}
	}
	if (/^[a-z][a-z0-9+.-]*:/i.test(target)) {
		try {
			const url = new URL(target);
			if (url.protocol !== "https:") return false;
			if (allowedOrigins && allowedOrigins.length > 0) {
				return allowedOrigins.some((origin) => {
					const allowedUrl = new URL(origin);
					return (
						url.origin === allowedUrl.origin &&
						url.protocol === allowedUrl.protocol
					);
				});
			}
			return false;
		} catch {
			return false;
		}
	}
	return false;
}
function sanitizeRedirect(
	target: string | undefined | null,
	allowedOrigins?: string[],
): string {
	if (target && isSafeRedirect(target, allowedOrigins)) return target;
	return "/";
}
interface HandlerContext {
	config: InternalConfig;
	client: DiscordClient;
	storage?: UserStorage;
}
function createHandlers(ctx: HandlerContext) {
	const { config, client, storage } = ctx;
	if (!storage) {
		throw new ConfigurationError(
			"STORAGE REQUIRED: External storage is mandatory for serverless deployments. " +
				"Use Redis, Database, or KV storage. In-memory storage is not supported.",
		);
	}
	const cookieName = config.session.cookieName ?? "discord-auth-session";
	const cookiePath = config.session.cookiePath ?? "/";
	const sameSite = config.session.sameSite ?? defaultSameSite();
	const secure = config.session.secure ?? isProduction();
	const httpOnly = config.session.httpOnly ?? true;
	const sessionCookieName = cookieName;
	const expiresInSeconds = expiresInToSeconds(config.session.expiresIn ?? "7d");
	const sessionConfig = {
		cookieName,
		cookiePath,
		maxAge: expiresInSeconds,
		sameSite: sameSite ?? defaultSameSite(),
		secure,
		httpOnly,
	};
	const sessionRevocationStorage = config.sessionRevocationStorage;
	const meRateLimiter = config.meRateLimitStorage
		? rateLimit({
				maxRequests: 10,
				windowMs: 60 * 1000,
				storage: config.meRateLimitStorage,
				keyBy: async (req) => {
					const ip = await getRequestIP(req);
					return `me:${ip}`;
				},
			})
		: undefined;
	const loginRateLimiter = config.meRateLimitStorage
		? rateLimit({
				maxRequests: 10,
				windowMs: 60 * 1000,
				storage: config.meRateLimitStorage,
				keyBy: async (req) => {
					const ip = await getRequestIP(req, { trustProxy: true });
					return `login:${ip}`;
				},
			})
		: undefined;
	const bruteForceEnabled = config.bruteForce.enabled !== false;
	if (bruteForceEnabled && !config.bruteForce.storage) {
		logger.warn(
			"bruteForce protection is enabled without a storage. Falling back to in-memory store. " +
				"This is NOT suitable for production, serverless, or multi-process deployments. " +
				"Provide a `bruteForce.storage` implementing BruteForceStorage (e.g. Redis, Database, KV), " +
				"or explicitly set `bruteForce.enabled: false`.",
		);
	}
	const bruteForce = bruteForceEnabled
		? new BruteForceProtection(config.bruteForce, config.bruteForce.storage)
		: undefined;
	async function handleLogin(request: Request): Promise<Response> {
		if (loginRateLimiter) {
			const rateLimitResult = await loginRateLimiter.check(request);
			if (!rateLimitResult.allowed) {
				const headers = new Headers({
					"Content-Type": "application/json; charset=utf-8",
					"Retry-After": String(Math.ceil(rateLimitResult.retryAfter! / 1000)),
					"RateLimit-Limit": String(rateLimitResult.limit),
					"RateLimit-Remaining": String(rateLimitResult.remaining),
					"RateLimit-Reset": String(Math.ceil(rateLimitResult.resetAt / 1000)),
				});
				return new Response(JSON.stringify({ error: "Too many requests" }), {
					status: 429,
					headers,
				});
			}
		}
		const cookies = parseCookies(request);
		const sessionId = cookies[sessionCookieName];
		const userAgent = request.headers.get("user-agent") ?? undefined;
		const pkcePair = await pkce.create();
		const state = await generateState(
			config.stateSecret,
			pkcePair.verifier,
			sessionId,
			userAgent,
			config.csrf,
		);
		const url = client.generateAuthUrl({
			clientId: config.clientId,
			redirectUri: config.redirectUri,
			scopes: config.scopes,
			state,
			prompt: config.prompt,
			codeChallenge: pkcePair.challenge,
			codeChallengeMethod: pkcePair.codeChallengeMethod,
		});
		return redirectResponse(url);
	}
	async function handleCallback(request: Request): Promise<Response> {
		const url = new URL(request.url);
		const code = url.searchParams.get("code");
		const state = url.searchParams.get("state");
		const error = url.searchParams.get("error");
		const errorDescription = url.searchParams.get("error_description");
		if (error) {
			const errorMap: Record<string, { message: string; status: number }> = {
				interaction_required: {
					message: "User interaction required",
					status: 401,
				},
				login_required: { message: "Login required", status: 401 },
				access_denied: { message: "Access denied by user", status: 403 },
				invalid_scope: {
					message: "Invalid OAuth2 scope requested",
					status: 400,
				},
				invalid_request: {
					message: "Invalid request parameters",
					status: 400,
				},
				unauthorized_client: { message: "Client not authorized", status: 403 },
				unsupported_response_type: {
					message: "Unsupported response type",
					status: 400,
				},
				server_error: { message: "Discord server error", status: 502 },
				temporarily_unavailable: {
					message: "Discord temporarily unavailable",
					status: 503,
				},
			};
			const errorInfo = errorMap[error] ?? {
				message: "OAuth2 error occurred",
				status: 400,
			};
			logger.error("Discord OAuth error", {
				error,
				errorDescription,
			});
			const authErr = new AuthError(
				error === "interaction_required" || error === "login_required"
					? ErrorCodes.INTERACTION_REQUIRED
					: ErrorCodes.UPSTREAM_ERROR,
				errorInfo.message,
				{ statusCode: errorInfo.status },
			);
			await config.callbacks.onError(authErr, "callback");
			return htmlResponse(authErr.message, errorInfo.status);
		}
		if (!code) return htmlResponse("Missing authorization code", 400);
		if (!state) return htmlResponse("Missing state parameter", 400);
		const cookies = parseCookies(request);
		const sessionId = cookies[sessionCookieName];
		const userAgent = request.headers.get("user-agent") ?? undefined;
		let stateValidation: ValidatedState;
		let csrfError: AuthErrorType | null = null;
		stateValidation = await consumeState(
			state,
			config.stateSecret,
			sessionId,
			userAgent,
			config.csrf,
			config.csrf.storage,
		);
		if (!stateValidation.valid) {
			csrfError = new AuthError(
				ErrorCodes.INVALID_STATE,
				"Invalid state parameter",
				{ statusCode: 403 },
			);
		}
		if (csrfError) {
			await config.callbacks.onError(csrfError, "callback");
			const statusCode = csrfError.statusCode ?? 403;
			return htmlResponse(csrfError.message, statusCode);
		}
		if (config.captcha?.enabled) {
			const ip = await getRequestIP(request, { trustProxy: true });
			const captchaToken = request.headers.get("x-captcha-response");
			if (!captchaToken) {
				const captchaErr = new AuthError(
					ErrorCodes.CAPTCHA_FAILED,
					"Captcha token is required but was not provided",
					{ statusCode: 403 },
				);
				await config.callbacks.onError(captchaErr, "callback");
				return errorResponse(captchaErr, 403);
			}
			const captchaResult = await verifyCaptcha(
				config.captcha as NonNullable<typeof config.captcha>,
				captchaToken,
				{ remoteip: ip },
			);
			if (!captchaResult.success) {
				const captchaErr = new AuthError(
					ErrorCodes.CAPTCHA_FAILED,
					captchaResult.message ?? "Captcha verification failed",
					{ statusCode: 403 },
				);
				await config.callbacks.onError(captchaErr, "callback");
				return errorResponse(captchaErr, 403);
			}
		}
		if (loginRateLimiter) {
			const rateLimitResult = await loginRateLimiter.check(request);
			if (!rateLimitResult.allowed) {
				const headers = new Headers({
					"Content-Type": "application/json; charset=utf-8",
					"Retry-After": String(Math.ceil(rateLimitResult.retryAfter! / 1000)),
					"RateLimit-Limit": String(rateLimitResult.limit),
					"RateLimit-Remaining": String(rateLimitResult.remaining),
					"RateLimit-Reset": String(Math.ceil(rateLimitResult.resetAt / 1000)),
				});
				return new Response(JSON.stringify({ error: "Too many requests" }), {
					status: 429,
					headers,
				});
			}
		}
		if (bruteForce) {
			const ip = await getRequestIP(request, { trustProxy: true });
			const blockKey = `discord:${ip}`;
			if (await bruteForce.isBlocked(blockKey)) {
				const retryAfter = await bruteForce.getRetryAfter(blockKey);
				const blockErr = new AuthError(
					ErrorCodes.BRUTE_FORCE_BLOCKED,
					"Too many attempts. Try again later.",
					{
						statusCode: 429,
						retryable: true,
						retryAfter,
					},
				);
				await config.callbacks.onError(blockErr, "callback");
				return htmlResponse(blockErr.message, 429);
			}
		}
		let callbackResult: CallbackResult;
		try {
			callbackResult = await handleOAuthCallback({
				config,
				client,
				storage: storage!,
				code,
				codeVerifier: stateValidation.codeVerifier,
				sessionId,
				userAgent,
			});
		} catch (err) {
			if (bruteForce && err instanceof AuthError && err.statusCode === 401) {
				await bruteForce.recordAttempt(
					`discord:${await getRequestIP(request, { trustProxy: true })}`,
				);
			}
			await config.callbacks.onError(err as Error, "callback");
			const statusCode =
				err instanceof AuthError ? (err.statusCode ?? 500) : 500;
			const message =
				err instanceof AuthError ? err.message : "Authentication failed";
			return htmlResponse(message, statusCode);
		}
		const { user, tokens, syncedPermissions, storedUser } = callbackResult;
		if (bruteForce) {
			await bruteForce.recordAttempt(
				`discord:${await getRequestIP(request, { trustProxy: true })}`,
				true,
			);
		}
		const sessionPayload: Record<string, unknown> = {
			discordId: user.id,
			username: user.username,
			globalName: user.global_name,
			avatar: user.avatar,
			email: user.email,
			locale: user.locale,
			mfaEnabled: user.mfa_enabled,
		};
		if (storedUser?.roles) {
			sessionPayload.roles = storedUser.roles;
		}
		if (syncedPermissions.length > 0) {
			sessionPayload.permissions = syncedPermissions;
		}
		const sessionToken = await signToken(
			sessionPayload,
			config.session.secret,
			config.session.expiresIn ?? "15m",
		);
		const cookie = createSessionCookie(
			sessionCookieName,
			sessionToken,
			sessionConfig,
		);
		if (config.callbacks.onSuccess) {
			const result = await config.callbacks.onSuccess(user, tokens);
			if (result?.redirect) {
				return redirectResponse(sanitizeRedirect(result.redirect), [cookie]);
			}
		}
		return redirectResponse("/", [cookie]);
	}
	async function handleLogout(request: Request): Promise<Response> {
		if (request.method !== "POST") {
			return jsonResponse({ error: "Method not allowed" }, 405);
		}
		const cookies = parseCookies(request);
		const sessionToken = cookies[sessionCookieName];
		if (storage && sessionToken) {
			const payload = await verifyToken<Record<string, unknown>>(
				sessionToken,
				config.session.secret,
				sessionRevocationStorage,
			);
			if (payload) {
				if (sessionRevocationStorage) {
					await revokeToken(
						sessionToken,
						config.session.secret,
						sessionRevocationStorage,
					);
				}
				const userData: SessionData = {
					discordId: payload.discordId as string,
					username: payload.username as string,
					globalName: (payload.globalName as string) ?? null,
					avatar: (payload.avatar as string) ?? null,
					email: (payload.email as string) ?? null,
					locale: payload.locale as string,
					roles: (payload.roles as string[]) ?? undefined,
				};
				await revokeTokenOnly({
					storage,
					client,
					clientId: config.clientId,
					clientSecret: config.clientSecret,
					sessionData: userData,
				});
			}
		}
		const clearCookies: string[] = [
			clearSessionCookie(sessionCookieName, sessionConfig),
		];
		const url = new URL(request.url);
		const requestedRedirect = url.searchParams.get("redirect");
		const safeRedirect = sanitizeRedirect(requestedRedirect);
		return redirectResponse(safeRedirect, clearCookies);
	}
	async function handleMe(request: Request): Promise<Response> {
		if (meRateLimiter) {
			const rateLimitResult = await meRateLimiter.check(request);
			if (!rateLimitResult.allowed) {
				const headers = new Headers({
					"Content-Type": "application/json; charset=utf-8",
					"Retry-After": String(Math.ceil(rateLimitResult.retryAfter! / 1000)),
					"RateLimit-Limit": String(rateLimitResult.limit),
					"RateLimit-Remaining": String(rateLimitResult.remaining),
					"RateLimit-Reset": String(Math.ceil(rateLimitResult.resetAt / 1000)),
				});
				return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
					status: 429,
					headers,
				});
			}
		}
		const cookies = parseCookies(request);
		const sessionToken = cookies[sessionCookieName];
		if (!sessionToken) return jsonResponse({ error: "Unauthorized" }, 401);
		try {
			const payload = await verifyToken<Record<string, unknown>>(
				sessionToken,
				config.session.secret,
				sessionRevocationStorage,
			);
			if (!payload) return jsonResponse({ error: "Session expired" }, 401);
			const sessionData: SessionData = {
				discordId: payload.discordId as string,
				username: payload.username as string,
				globalName: (payload.globalName as string) ?? null,
				avatar: (payload.avatar as string) ?? null,
				email: (payload.email as string) ?? null,
				locale: payload.locale as string,
				roles: (payload.roles as string[]) ?? undefined,
			};
			if (!storage) return jsonResponse(sessionData);
			const stored = await storage.findByDiscordId(sessionData.discordId);
			if (!stored) return jsonResponse({ error: "User not found" }, 404);
			const { accessToken, refreshToken, ...safe } = stored;
			return jsonResponse(safe);
		} catch (error) {
			logger.error("handleMe error", {
				error: error instanceof Error ? error.message : String(error),
			});
			return jsonResponse({ error: "Internal server error" }, 500);
		}
	}
	return {
		handleLogin,
		handleCallback,
		handleLogout,
		handleMe,
		dispose: () => {},
	};
}
export interface DiscordFactoryConfig {
	clientId: string;
	clientSecret: string;
	secret: string;
	callbackUrl: string;
	scopes?: DiscordScope[];
	prompt?: "consent" | "none";
	storage?: UserStorage;
	routes?: RoutesConfig;
	cookies?: CookieOptions;
	session?: SessionConfig;
	redirectUri?: string;
	bruteForce?: Partial<BruteForceConfig>;
	mfa?: Partial<DiscordMfaConfig>;
	guildRoleSync?: Partial<GuildRoleSyncConfig>;
	csrf?: Partial<CsrfConfig>;
	callbacks?: Callbacks;
	stateSecret?: string;
	captcha?: CaptchaConfig;
	meRateLimitStorage?: RateLimitStorage;
	sessionRevocationStorage?: TokenRevocationStorage;
}
export type AuthHandler = (
	request: Request,
	ctx: { user: SessionData; storedUser: SafeStoredUser | null },
) => Response | Promise<Response>;
export interface DiscordAuthResult {
	handleLogin: (request: Request) => Promise<Response>;
	handleCallback: (request: Request) => Promise<Response>;
	handleLogout: (request: Request) => Promise<Response>;
	handleMe: (request: Request) => Promise<Response>;
	getSession: (request: Request) => Promise<SessionData | null>;
	withAuth: (handler: AuthHandler) => (request: Request) => Promise<Response>;
	dispose?: () => void;
}
const COOKIE_NAME = "discord-auth-session";
export async function discord(
	config: DiscordFactoryConfig,
): Promise<DiscordAuthResult> {
	const {
		clientId,
		clientSecret,
		secret,
		callbackUrl,
		scopes,
		prompt,
		storage,
		routes,
		redirectUri,
		bruteForce,
		mfa,
		guildRoleSync,
		csrf,
		callbacks,
		stateSecret,
		meRateLimitStorage,
		sessionRevocationStorage,
		captcha,
	} = config;
	const client = new DiscordClient({ clientId, clientSecret });
	const derivedStateSecret = stateSecret ?? (await deriveStateSecret(secret));
	const internalConfig = await processConfig({
		clientId,
		clientSecret,
		secret,
		callbackUrl,
		session: {
			type: "jwt",
			secret,
			cookieName: COOKIE_NAME,
			...config.session,
			// Merge top-level `cookies` config (secure, sameSite) — session properties take precedence
			...(config.cookies
				? {
						secure: config.session?.secure ?? config.cookies.secure,
						sameSite: config.session?.sameSite ?? config.cookies.sameSite,
					}
				: {}),
		},
		scopes,
		prompt,
		routes: { ...routes, callback: callbackUrl },
		storage,
		redirectUri,
		bruteForce,
		mfa,
		guildRoleSync,
		csrf,
		callbacks,
		stateSecret: derivedStateSecret,
		meRateLimitStorage,
		sessionRevocationStorage,
		captcha,
	});
	const { handleLogin, handleCallback, handleLogout, handleMe, dispose } =
		createHandlers({ config: internalConfig, client, storage });
	const getSessionHelper = (request: Request) =>
		getSessionFromRequest(
			request,
			{ secret, cookieName: COOKIE_NAME },
			internalConfig.sessionRevocationStorage,
		);
	return {
		handleLogin,
		handleCallback,
		handleLogout,
		handleMe,
		dispose,
		getSession: getSessionHelper,
		withAuth:
			(handler: AuthHandler) =>
			async (request: Request): Promise<Response> => {
				const session = await getSessionHelper(request);
				if (!session) {
					return new Response(JSON.stringify({ error: "Unauthorized" }), {
						status: 401,
						headers: { "Content-Type": "application/json" },
					});
				}
				let storedUser: SafeStoredUser | null = null;
				if (storage) {
					const stored = await storage.findByDiscordId(session.discordId);
					if (stored) {
						const {
							accessToken: _accessToken,
							refreshToken: _refreshToken,
							...safe
						} = stored;
						storedUser = safe;
					}
				}
				return handler(request, { user: session, storedUser });
			},
	};
}
