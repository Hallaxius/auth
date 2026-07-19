import { MemoryCacheAdapter } from "./adapters/cache/memory";
import { deriveStateSecret, generatePKCE, processConfig } from "./config";
import { DiscordClient } from "./internal/client";
import {
	clearSessionCookie,
	createSessionCookie,
	parseCookies,
} from "./internal/cookies";
import { signToken, verifyToken } from "./internal/jwt";
import {
	consumeState,
	generateState,
	MemoryStateStore,
	type ValidatedState,
	validateState,
} from "./internal/state";
import type {
	DiscordScope,
	DiscordTokenResponse,
	DiscordUser,
	GuildRoleSyncConfig,
	InternalConfig,
	SafeStoredUser,
	SessionData,
	SessionType,
	StoredUser,
	UserStorage,
} from "./types";

export class DiscordAuthError extends Error {
	readonly code: string;
	readonly cause?: Error;
	readonly statusCode?: number;

	constructor(
		code: string,
		message: string,
		options?: { cause?: Error; statusCode?: number },
	) {
		super(message);
		this.code = code;
		this.cause = options?.cause;
		this.statusCode = options?.statusCode;
		this.name = this.constructor.name;
		if (typeof Error.captureStackTrace === "function") {
			Error.captureStackTrace(this, this.constructor);
		}
	}
}

export class StateReusedError extends DiscordAuthError {
	constructor(
		message = "State parameter has already been used",
		options?: { cause?: Error },
	) {
		super("STATE_REUSED", message, { statusCode: 403, cause: options?.cause });
	}
}

export class StateBindingError extends DiscordAuthError {
	constructor(
		message = "State parameter binding validation failed",
		options?: { cause?: Error },
	) {
		super("STATE_BINDING_FAILED", message, {
			statusCode: 403,
			cause: options?.cause,
		});
	}
}

export class ConfigurationError extends DiscordAuthError {
	constructor(message = "Invalid configuration", options?: { cause?: Error }) {
		super("CONFIGURATION_ERROR", message, {
			statusCode: 500,
			cause: options?.cause,
		});
	}
}

export class MfaRequiredError extends DiscordAuthError {
	constructor(
		message = "Multi-factor authentication is required",
		options?: { cause?: Error },
	) {
		super("MFA_REQUIRED", message, { statusCode: 403, cause: options?.cause });
	}
}

export class RateLimitError extends DiscordAuthError {
	readonly retryAfter?: number;

	constructor(
		message = "Rate limit exceeded",
		options?: { retryAfter?: number; cause?: Error },
	) {
		super("RATE_LIMITED", message, {
			statusCode: 429,
			cause:
				options?.cause ??
				(options?.retryAfter
					? new Error(`Retry after ${options.retryAfter} seconds`)
					: undefined),
		});
		this.retryAfter = options?.retryAfter;
	}
}

export class TokenExpiredError extends DiscordAuthError {
	constructor(message = "Token has expired", options?: { cause?: Error }) {
		super("TOKEN_EXPIRED", message, { statusCode: 401, cause: options?.cause });
	}
}

interface CachedGuildData {
	roles: string[];
	permissions: string[];
	expiresAt: number;
}

class GuildRoleSync {
	private config: GuildRoleSyncConfig;
	private client: DiscordClient;
	private cache: MemoryCacheAdapter;

	constructor(
		config: GuildRoleSyncConfig,
		client: DiscordClient,
		cache: MemoryCacheAdapter,
	) {
		this.config = config;
		this.client = client;
		this.cache = cache;
	}

	private getCacheKey(userId: string): string {
		return `guild:${this.config.guildId}:user:${userId}`;
	}

	async syncUserRoles(userId: string, _accessToken: string): Promise<string[]> {
		const cacheKey = this.getCacheKey(userId);
		const cached = await this.cache.get(cacheKey);
		if (cached) {
			const cachedData = cached.value as CachedGuildData;
			if (cachedData.expiresAt > Date.now()) {
				return cachedData.permissions;
			}
		}

		const discordRoleIds = await this.client.getGuildMemberRoles(
			this.config.guildId,
			userId,
			this.config.botToken,
		);
		const permissions = this.getMappedPermissions(discordRoleIds);

		const cachedData: CachedGuildData = {
			roles: discordRoleIds,
			permissions,
			expiresAt: Date.now() + this.config.cacheTtlMs,
		};
		await this.cache.set(cacheKey, cachedData, this.config.cacheTtlMs);
		return permissions;
	}

	getMappedPermissions(discordRoleIds: string[]): string[] {
		const permissions = new Set<string>();
		for (const roleId of discordRoleIds) {
			const mapped = this.config.roleMap[roleId];
			if (mapped) {
				for (const perm of mapped) {
					permissions.add(perm);
				}
			}
		}
		return Array.from(permissions);
	}
}

interface CallbackContext {
	config: InternalConfig;
	client: DiscordClient;
	storage?: UserStorage;
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
		throw new ConfigurationError(
			"redirectUri is required — set DISCORD_REDIRECT_URI env var or provide redirectUri in config",
		);
	}
	const redirectUri = config.redirectUri;

	const tokens = await client.exchangeCode({
		clientId: config.clientId,
		clientSecret: config.clientSecret,
		code,
		redirectUri,
		codeVerifier: !config.disablePKCE ? codeVerifier : undefined,
	});

	const user = await client.getUser(tokens.access_token);

	if (config.mfa.enabled && config.mfa.requireMfa && !user.mfa_enabled) {
		throw new MfaRequiredError();
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
		const guildSync = new GuildRoleSync(
			config.guildRoleSync,
			client,
			new MemoryCacheAdapter(),
		);
		syncedPermissions = await guildSync.syncUserRoles(
			user.id,
			tokens.access_token,
		);
		if (storage && storedUser && syncedPermissions.length > 0) {
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

async function revokeAndCleanup(params: {
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
			await storage.delete(stored.discordId);
		}
	} catch {}
}

async function getSessionFromRequest(
	request: Request,
	config: { secret: string; cookieName?: string },
): Promise<SessionData | null> {
	const cookieName = config.cookieName ?? "discord-auth-session";
	const cookies = parseCookies(request);
	const token = cookies[cookieName];
	if (!token) return null;

	const payload = await verifyToken<Record<string, unknown>>(
		token,
		config.secret,
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

function isPublicPath(path: string, patterns: string[]): boolean {
	for (const pattern of patterns) {
		if (pattern.endsWith("/*")) {
			const prefix = pattern.slice(0, -2);
			if (
				path === prefix ||
				path.startsWith(`${prefix}/`) ||
				path === `${prefix}/`
			) {
				return true;
			}
		} else if (path === pattern) {
			return true;
		}
	}
	return false;
}

function _requiredRole(
	path: string,
	roleMap: Record<string, string[]>,
): string[] | null {
	for (const [pattern, roles] of Object.entries(roleMap)) {
		if (pattern.endsWith("/*")) {
			const prefix = pattern.slice(0, -2);
			if (path === prefix || path.startsWith(`${prefix}/`)) {
				return roles;
			}
		} else if (path === pattern) {
			return roles;
		}
	}
	return null;
}

function redirect(url: string): Response {
	return new Response(null, { status: 302, headers: { Location: url } });
}

function _denied(message = "Forbidden"): Response {
	return new Response(JSON.stringify({ error: message }), {
		status: 403,
		headers: { "Content-Type": "application/json" },
	});
}

interface HandlerContext {
	config: InternalConfig;
	client: DiscordClient;
	storage?: UserStorage;
}

async function verifySession(
	token: string,
	secret: string,
	sessionType: SessionType,
): Promise<SessionData | null> {
	if (sessionType === "server") return null;

	const payload = await verifyToken<Record<string, unknown>>(token, secret);
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

function isProductionSecureDefault(): boolean {
	const nodeEnv = process.env.NODE_ENV;
	return nodeEnv === "production";
}

function redirectResponse(url: string, cookies?: string[]): Response {
	const headers = new Headers();
	headers.set("Location", url);
	if (cookies) {
		for (const c of cookies) headers.append("Set-Cookie", c);
	}
	return new Response(null, { status: 302, headers });
}

function isSafeRedirect(target: string): boolean {
	if (typeof target !== "string" || target.length === 0) return false;
	if (target.startsWith("//")) return false;
	if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return false;
	if (!target.startsWith("/")) return false;
	if (target.includes("\\")) return false;
	return true;
}

function sanitizeRedirect(target: string | undefined | null): string {
	if (target && isSafeRedirect(target)) return target;
	return "/";
}

function htmlResponse(
	body: string,
	status = 200,
	cookies?: string[],
): Response {
	const headers = new Headers({ "Content-Type": "text/html; charset=utf-8" });
	if (cookies) {
		for (const c of cookies) headers.append("Set-Cookie", c);
	}
	return new Response(body, { status, headers });
}

function jsonResponse(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "Content-Type": "application/json; charset=utf-8" },
	});
}

function createHandlers(ctx: HandlerContext) {
	const { config, client, storage } = ctx;
	const stateStore = new MemoryStateStore();
	const cookieName = config.session.cookieName ?? "discord-auth-session";
	const cookiePath = config.session.cookiePath ?? "/";
	const sameSite = config.session.sameSite ?? "lax";
	const secure = config.session.secure ?? isProductionSecureDefault();
	const httpOnly = config.session.httpOnly ?? true;
	const sessionCookieName = cookieName;

	const sessionConfig = {
		cookieName,
		cookiePath,
		sameSite,
		secure,
		httpOnly,
	};

	async function handleLogin(request: Request): Promise<Response> {
		const pkceEnabled = !config.disablePKCE;
		let codeChallenge: string | undefined;
		let codeVerifier: string | undefined;

		if (pkceEnabled) {
			const pkce = await generatePKCE();
			codeChallenge = pkce.codeChallenge;
			codeVerifier = pkce.codeVerifier;
		}

		const cookies = parseCookies(request);
		const sessionId = cookies[sessionCookieName];
		const userAgent = request.headers.get("user-agent") ?? undefined;

		const state = await generateState(
			config.stateSecret,
			codeVerifier,
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
			codeChallenge,
			codeChallengeMethod: pkceEnabled ? "S256" : undefined,
		});

		return redirectResponse(url);
	}

	async function handleCallback(request: Request): Promise<Response> {
		const url = new URL(request.url);
		const code = url.searchParams.get("code");
		const state = url.searchParams.get("state");

		if (!code) return htmlResponse("Missing authorization code", 400);
		if (!state) return htmlResponse("Missing state parameter", 400);

		const cookies = parseCookies(request);
		const sessionId = cookies[sessionCookieName];
		const userAgent = request.headers.get("user-agent") ?? undefined;

		let stateValidation: ValidatedState;
		let csrfError: Error | null = null;

		if (config.csrf.enabled) {
			stateValidation = await consumeState(
				state,
				config.stateSecret,
				sessionId,
				userAgent,
				config.csrf,
				stateStore,
			);

			if (!stateValidation.valid) {
				const parts = state.split(".");
				if (parts.length === 2) {
					try {
						const [encoded] = parts;
						const decoded = new TextDecoder().decode(
							new Uint8Array(
								atob(encoded.replace(/-/g, "+").replace(/_/g, "/"))
									.split("")
									.map((c) => c.charCodeAt(0)),
							),
						);
						const payload = JSON.parse(decoded);
						if (payload.id && (await stateStore.has(payload.id))) {
							csrfError = new StateReusedError();
						} else {
							csrfError = new StateBindingError();
						}
					} catch {
						csrfError = new StateBindingError();
					}
				} else {
					csrfError = new StateBindingError();
				}
			}
		} else {
			stateValidation = await validateState(state, config.stateSecret);
			if (!stateValidation.valid) {
				csrfError = new Error("Invalid state parameter - possible CSRF attack");
			}
		}

		if (csrfError) {
			await config.callbacks.onError(csrfError, "callback");
			const statusCode =
				csrfError instanceof DiscordAuthError
					? (csrfError.statusCode ?? 403)
					: 403;
			return htmlResponse(csrfError.message, statusCode);
		}

		const codeVerifier = stateValidation.codeVerifier;

		let callbackResult: CallbackResult;
		try {
			callbackResult = await handleOAuthCallback({
				config,
				client,
				storage,
				code,
				codeVerifier,
				sessionId,
				userAgent,
			});
		} catch (err) {
			await config.callbacks.onError(err as Error, "callback");
			const statusCode =
				err instanceof DiscordAuthError ? (err.statusCode ?? 500) : 500;
			return htmlResponse(
				err instanceof DiscordAuthError ? err.message : "Authentication failed",
				statusCode,
			);
		}

		const { user, tokens, syncedPermissions, storedUser } = callbackResult;

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
			config.session.expiresIn ?? "7d",
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
			const userData = await verifySession(
				sessionToken,
				config.session.secret,
				config.session.type,
			);
			if (userData) {
				await revokeAndCleanup({
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
		const cookies = parseCookies(request);
		const sessionToken = cookies[sessionCookieName];

		if (!sessionToken) return jsonResponse({ error: "Unauthorized" }, 401);

		const userData = await verifySession(
			sessionToken,
			config.session.secret,
			config.session.type,
		);
		if (!userData) return jsonResponse({ error: "Session expired" }, 401);

		if (!storage) return jsonResponse(userData);

		const stored = await storage.findByDiscordId(userData.discordId);
		if (!stored) return jsonResponse({ error: "User not found" }, 404);

		const { accessToken, refreshToken, ...safe } = stored;
		return jsonResponse(safe);
	}

	return {
		handleLogin,
		handleCallback,
		handleLogout,
		handleMe,
		dispose: () => stateStore.dispose(),
	};
}

interface EdgeAuthConfig {
	secret: string;
	cookieName?: string;
	loginUrl?: string;
	publicPaths?: string[];
}

function middlewareAuth(config: EdgeAuthConfig) {
	const loginUrl = config.loginUrl ?? "/auth/discord";
	const publicPaths = config.publicPaths ?? [];
	const cookieConfigs = [
		{
			name: config.cookieName ?? "discord-auth-session",
			secret: config.secret,
		},
	];

	return async function authMiddleware(
		request: Request,
	): Promise<Response | undefined> {
		const url = new URL(request.url);
		const path = url.pathname;

		if (isPublicPath(path, publicPaths)) {
			return undefined;
		}

		for (const cookie of cookieConfigs) {
			const user = await getSessionFromRequest(request, {
				secret: cookie.secret,
				cookieName: cookie.name,
			});
			if (user) {
				return undefined;
			}
		}

		return redirect(`${loginUrl}?redirect=${encodeURIComponent(path)}`);
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
	meRoute?: string;
	redirectUri?: string;
	disablePKCE?: boolean;
	stateSecret?: string;
	publicPaths?: string[];
	loginUrl?: string;
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
	middleware: (request: Request) => Promise<Response | undefined>;
	getSession: (request: Request) => Promise<SessionData | null>;
	withAuth: (handler: AuthHandler) => (request: Request) => Promise<Response>;
	withOptionalAuth: (
		handler: (
			request: Request,
			ctx: { user: SessionData | null; storedUser: SafeStoredUser | null },
		) => Response | Promise<Response>,
	) => (request: Request) => Promise<Response>;
	withRole: (
		...roles: string[]
	) => (handler: AuthHandler) => (request: Request) => Promise<Response>;
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
		meRoute = "/auth/me",
		redirectUri,
		disablePKCE = false,
		publicPaths = ["/", "/auth/*", "/api/auth/*"],
		loginUrl = "/auth/discord",
	} = config;

	if (!clientId || !clientSecret) {
		throw new Error("discord() requires clientId and clientSecret");
	}
	if (!secret) {
		throw new Error("discord() requires a secret");
	}

	const client = new DiscordClient(clientId, clientSecret);

	const stateSecret = config.stateSecret ?? (await deriveStateSecret(secret));

	const internalConfig = await processConfig({
		clientId,
		clientSecret,
		session: { type: "jwt", secret, cookieName: COOKIE_NAME },
		scopes: scopes as DiscordScope[] | undefined,
		prompt,
		routes: { callback: callbackUrl },
		storage,
		meRoute,
		redirectUri,
		disablePKCE,
		stateSecret,
	});

	const { handleLogin, handleCallback, handleLogout, handleMe, dispose } =
		createHandlers({ config: internalConfig, client, storage });

	const middleware = middlewareAuth({
		secret,
		cookieName: COOKIE_NAME,
		loginUrl,
		publicPaths,
	});

	const getSessionHelper = (request: Request) =>
		getSessionFromRequest(request, { secret, cookieName: COOKIE_NAME });

	return {
		handleLogin,
		handleCallback,
		handleLogout,
		handleMe,
		dispose,
		middleware,
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
		withOptionalAuth:
			(
				handler: (
					request: Request,
					ctx: { user: SessionData | null; storedUser: SafeStoredUser | null },
				) => Response | Promise<Response>,
			) =>
			async (request: Request): Promise<Response> => {
				const session = await getSessionHelper(request);
				let storedUser: SafeStoredUser | null = null;
				if (storage && session) {
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
		withRole:
			(...roles: string[]) =>
			(handler: AuthHandler) =>
			async (request: Request): Promise<Response> => {
				const session = await getSessionHelper(request);
				if (!session) {
					return new Response(JSON.stringify({ error: "Unauthorized" }), {
						status: 401,
						headers: { "Content-Type": "application/json" },
					});
				}
				if (!storage) {
					return new Response(
						JSON.stringify({ error: "Storage not configured for role checks" }),
						{
							status: 500,
							headers: { "Content-Type": "application/json" },
						},
					);
				}
				const stored = await storage.findByDiscordId(session.discordId);
				if (!stored) {
					return new Response(JSON.stringify({ error: "User not found" }), {
						status: 404,
						headers: { "Content-Type": "application/json" },
					});
				}
				const hasRole = roles.some((r) => stored.roles.includes(r));
				if (!hasRole) {
					return new Response(JSON.stringify({ error: "Forbidden" }), {
						status: 403,
						headers: { "Content-Type": "application/json" },
					});
				}
				const {
					accessToken: _accessToken,
					refreshToken: _refreshToken,
					...safe
				} = stored;
				return handler(request, { user: session, storedUser: safe });
			},
	};
}
