import { MemoryCacheAdapter } from "./adapters/cache/memory";
import { deriveStateSecret, pkce, processConfig } from "./config";
import {
	AuthError,
	type AuthError as AuthErrorType,
	ErrorCodes,
} from "./errors";
import { DiscordClient } from "./internal/client";
import {
	clearSessionCookie,
	createSessionCookie,
	parseCookies,
} from "./internal/cookies";
import {
	htmlResponse,
	jsonResponse,
	redirectResponse,
} from "./internal/http-utils";
import { signToken, verifyToken } from "./internal/jwt";
import {
	base64URLDecode,
	consumeState,
	generateState,
	MemoryStateStore,
	type ValidatedState,
	validateState,
} from "./internal/state";
import type {
	AutoRefreshConfig,
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
	RoutesConfig,
	SafeStoredUser,
	SessionData,
	StoredUser,
	UserStorage,
} from "./types";
import { GuildRoleSync } from "./utils/guild";

const globalCacheAdapter = new MemoryCacheAdapter();

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
		throw new AuthError(
			ErrorCodes.CONFIGURATION_ERROR,
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
		const guildSync = new GuildRoleSync(
			config.guildRoleSync,
			client,
			globalCacheAdapter,
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
		console.error(
			"[discord] Failed to revoke token:",
			err instanceof Error ? err.message : err,
		);
	}
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

function isSafeRedirect(target: string, allowedOrigins?: string[]): boolean {
	if (typeof target !== "string" || target.length === 0) return false;
	if (target.startsWith("//")) return false;
	if (/^[a-z][a-z0-9+.-]*:/i.test(target)) {
		try {
			const url = new URL(target);
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
	if (!target.startsWith("/")) return false;
	if (target.includes("\\")) return false;
	return true;
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
	const stateStore = new MemoryStateStore();
	const cookieName = config.session.cookieName ?? "discord-auth-session";
	const cookiePath = config.session.cookiePath ?? "/";
	const sameSite = config.session.sameSite ?? "lax";
	const secure =
		config.session.secure ??
		(typeof process !== "undefined"
			? process.env.NODE_ENV === "production"
			: false);
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
			const pkcePair = await pkce.create();
			codeChallenge = pkcePair.challenge;
			codeVerifier = pkcePair.verifier;
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
		const error = url.searchParams.get("error");

		if (error === "interaction_required" || error === "login_required") {
			const promptNoneError = new AuthError(
				ErrorCodes.INTERACTION_REQUIRED,
				"User interaction required - prompt=none not allowed",
				{ statusCode: 401 },
			);
			await config.callbacks.onError(promptNoneError, "callback");
			return htmlResponse(promptNoneError.message, 401);
		}

		if (!code) return htmlResponse("Missing authorization code", 400);
		if (!state) return htmlResponse("Missing state parameter", 400);

		const cookies = parseCookies(request);
		const sessionId = cookies[sessionCookieName];
		const userAgent = request.headers.get("user-agent") ?? undefined;

		let stateValidation: ValidatedState;
		let csrfError: AuthErrorType | null = null;

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
						const encoded = parts[0] as string;
						const decoded = new TextDecoder().decode(base64URLDecode(encoded));
						const payload = JSON.parse(decoded);
						if (payload.id && (await stateStore.has(payload.id))) {
							csrfError = new AuthError(
								ErrorCodes.STATE_REUSED,
								"State parameter has already been used",
								{ statusCode: 403 },
							);
						} else {
							csrfError = new AuthError(
								ErrorCodes.STATE_BINDING_FAILED,
								"State parameter binding validation failed",
								{ statusCode: 403 },
							);
						}
					} catch {
						csrfError = new AuthError(
							ErrorCodes.STATE_BINDING_FAILED,
							"State parameter binding validation failed",
							{ statusCode: 403 },
						);
					}
				} else {
					csrfError = new AuthError(
						ErrorCodes.STATE_BINDING_FAILED,
						"State parameter binding validation failed",
						{ statusCode: 403 },
					);
				}
			}
		} else {
			stateValidation = await validateState(state, config.stateSecret);
			if (!stateValidation.valid) {
				csrfError = new AuthError(
					ErrorCodes.INVALID_STATE,
					"Invalid state parameter - possible CSRF attack",
					{ statusCode: 403 },
				);
			}
		}

		if (csrfError) {
			await config.callbacks.onError(csrfError, "callback");
			const statusCode = csrfError.statusCode ?? 403;
			return htmlResponse(csrfError.message, statusCode);
		}

		const codeVerifier = stateValidation.codeVerifier;

		if (codeVerifier && !config.disablePKCE) {
			const verifierValid = /^[A-Za-z0-9\-._~]{43,128}$/.test(codeVerifier);
			if (!verifierValid) {
				const csrfError = new AuthError(
					ErrorCodes.INVALID_CODE_VERIFIER,
					"Invalid code_verifier format",
					{ statusCode: 400 },
				);
				await config.callbacks.onError(csrfError, "callback");
				return htmlResponse(csrfError.message, 400);
			}
		}

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
				err instanceof AuthError ? (err.statusCode ?? 500) : 500;
			const message =
				err instanceof AuthError ? err.message : "Authentication failed";
			return htmlResponse(message, statusCode);
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
			const payload = await verifyToken<Record<string, unknown>>(
				sessionToken,
				config.session.secret,
			);
			if (payload) {
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
		const cookies = parseCookies(request);
		const sessionToken = cookies[sessionCookieName];

		if (!sessionToken) return jsonResponse({ error: "Unauthorized" }, 401);

		const payload = await verifyToken<Record<string, unknown>>(
			sessionToken,
			config.session.secret,
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
	}

	return {
		handleLogin,
		handleCallback,
		handleLogout,
		handleMe,
		dispose: () => stateStore.dispose(),
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
	pkce?: boolean;
	redirectUri?: string;
	disablePKCE?: boolean;
	autoRefresh?: Partial<AutoRefreshConfig>;
	bruteForce?: Partial<BruteForceConfig>;
	mfa?: Partial<DiscordMfaConfig>;
	guildRoleSync?: Partial<GuildRoleSyncConfig>;
	csrf?: Partial<CsrfConfig>;
	callbacks?: Callbacks;
	stateSecret?: string;
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
		disablePKCE = false,
		autoRefresh,
		bruteForce,
		mfa,
		guildRoleSync,
		csrf,
		callbacks,
		stateSecret,
	} = config;

	if (!clientId || !clientSecret) {
		throw new Error("discord() requires clientId and clientSecret");
	}
	if (!secret) {
		throw new Error("discord() requires a secret");
	}

	const client = new DiscordClient(clientId, clientSecret);

	const derivedStateSecret = stateSecret ?? (await deriveStateSecret(secret));

	const internalConfig = await processConfig({
		clientId,
		clientSecret,
		secret,
		callbackUrl,
		session: { type: "jwt", secret, cookieName: COOKIE_NAME },
		scopes,
		prompt,
		routes: { callback: callbackUrl, ...routes },
		storage,
		redirectUri,
		disablePKCE,
		autoRefresh,
		bruteForce,
		mfa,
		guildRoleSync,
		csrf,
		callbacks,
		stateSecret: derivedStateSecret,
	});

	const { handleLogin, handleCallback, handleLogout, handleMe, dispose } =
		createHandlers({ config: internalConfig, client, storage });

	const getSessionHelper = (request: Request) =>
		getSessionFromRequest(request, { secret, cookieName: COOKIE_NAME });

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

export { AuthStrategy } from "./types";
