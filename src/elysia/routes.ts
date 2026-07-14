import { Elysia } from "elysia";
import { MemoryBruteForceStorage } from "../adapters/brute-force";
import { BruteForceProtection } from "../core/brute-force";
import { revokeAndCleanup } from "../core/logout-handler";
import type { DiscordClient } from "../core/client";
import { generatePKCE } from "../core/config";
import { handleOAuthCallback } from "../core/callback-handler";
import {
	BruteForceBlockedError,
	ConfigurationError,
	DiscordAuthError,
	StateBindingError,
	StateReusedError,
} from "../core/errors";
import {
	consumeState,
	generateState,
	MemoryStateStore,
	validateState,
} from "../core/state";
import type {
	InternalConfig,
	SessionAdapter,
	SessionData,
	UserStorage,
} from "../core/types";
import { parseExpiresIn } from "../core/utils";

export interface RouteContext {
	config: InternalConfig;
	client: DiscordClient;
	sessionAdapter: SessionAdapter;
	storage?: UserStorage;
}

export function createAuthRoutes(context: RouteContext) {
	const { config, client, sessionAdapter, storage } = context;
	const { routes } = config;

	// Per-instance state store â€” each auth config gets its own isolated store
	const stateStore = new MemoryStateStore();

	const bruteForceStorage =
		config.bruteForce.storage ?? new MemoryBruteForceStorage();
	const bruteForce = new BruteForceProtection(
		config.bruteForce,
		bruteForceStorage,
	);

	return new Elysia({ name: "discord-auth-routes" })
		.get(routes.callback, async (ctx: any) => {
			const { query, cookie, jwt, request } = ctx;
			const cookieName = config.session.cookieName ?? "discord-auth-session";
			const code = query.code as string | undefined;
			const state = query.state as string | undefined;

			if (!code) {
				await config.callbacks.onError(
					new Error("Missing authorization code"),
					"callback",
				);
				ctx.status = 400;
				return "Missing authorization code";
			}

			if (!state) {
				await config.callbacks.onError(
					new Error("Missing state parameter"),
					"callback",
				);
				ctx.status = 400;
				return "Missing state parameter";
			}

			const bruteForceKey = BruteForceProtection.extractKey(request);

			if (config.bruteForce.enabled) {
				const blocked = await bruteForce.isBlocked(bruteForceKey);
				if (blocked) {
					const retryAfter = Math.ceil(
						config.bruteForce.blockDurationMs / 1000,
					);
					await config.callbacks.onError(
						new BruteForceBlockedError(
							"Too many attempts, please try again later",
							{ retryAfter },
						),
						"callback",
					);
					ctx.status = 429;
					ctx.set.headers = { "Retry-After": String(retryAfter) };
					return "Too many attempts, please try again later";
				}
			}

			// Extract sessionId from session cookie if exists
			const sessionCookie = cookie[cookieName];
			const sessionId = sessionCookie?.value;

			// Extract userAgent from request headers
			const userAgent = request.headers.get("user-agent") ?? undefined;

			// Validate state with enhanced CSRF protection
			let stateValidation: { valid: boolean; codeVerifier?: string };
			let csrfError: Error | null = null;

			if (config.csrf.enabled) {
				stateValidation = await consumeState(
					state,
					config.session.secret,
					sessionId,
					userAgent,
					config.csrf,
					stateStore,
				);

				if (!stateValidation.valid) {
					// Determine specific error type
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
				// Fallback to old validateState behavior when CSRF is disabled
				stateValidation = await validateState(state, config.session.secret);
				if (!stateValidation.valid) {
					csrfError = new Error(
						"Invalid state parameter - possible CSRF attack",
					);
				}
			}

			if (csrfError) {
				if (config.bruteForce.enabled) {
					await bruteForce.recordAttempt(bruteForceKey, false);
				}
				await config.callbacks.onError(csrfError, "callback");
				ctx.status =
					csrfError instanceof DiscordAuthError
						? (csrfError.statusCode ?? 403)
						: 403;
				return csrfError.message;
			}

			// Attempt to get code_verifier from state first, then from cookie
			let codeVerifier = stateValidation.codeVerifier;
			if (!codeVerifier && !config.disablePKCE) {
				const pkceCookie = cookie["discord-auth-pkce-verifier"];
				codeVerifier = pkceCookie?.value;

				// Clear PKCE cookie after use
				if (pkceCookie?.value) {
					cookie["discord-auth-pkce-verifier"].remove();
				}
			}

		let callbackResult;
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
			if (config.bruteForce.enabled) {
				await bruteForce.recordAttempt(bruteForceKey, false);
			}
			await config.callbacks.onError(err as Error, "callback");
			ctx.status = err instanceof DiscordAuthError
				? (err.statusCode ?? 500)
				: 500;
			return err instanceof DiscordAuthError
				? err.message
				: "Authentication failed";
		}

		const { user, tokens, syncedPermissions, storedUser } = callbackResult;

		let sessionToken: string;

		if (config.session.type === "server") {
			const roles = storedUser?.roles;
			sessionToken = await sessionAdapter.create(user, tokens, roles);
		} else {
			const payload: Record<string, unknown> = {
				discordId: user.id,
				username: user.username,
				globalName: user.global_name,
				avatar: user.avatar,
				email: user.email,
				locale: user.locale,
				mfaEnabled: user.mfa_enabled,
			};

			if (storedUser?.roles) {
				payload.roles = storedUser.roles;
			}

			if (syncedPermissions.length > 0) {
				payload.permissions = syncedPermissions;
			}

			sessionToken = await jwt.sign(payload);
		}

			cookie[cookieName].set({
				value: sessionToken,
				httpOnly: config.session.httpOnly ?? true,
				secure: config.session.secure ?? false,
				sameSite: config.session.sameSite ?? "lax",
				path: config.session.cookiePath ?? "/",
				maxAge: parseExpiresIn(config.session.expiresIn),
			});

			if (config.bruteForce.enabled) {
				await bruteForce.recordAttempt(bruteForceKey, true);
			}

			if (config.callbacks.onSuccess) {
				const result = await config.callbacks.onSuccess(user, tokens);
				if (result?.redirect) {
					return ctx.redirect(result.redirect);
				}
			}

			return ctx.redirect("/");
		})
		.get(routes.logout, async (ctx: any) => {
			const cookieName = config.session.cookieName ?? "discord-auth-session";
			const sessionCookie = ctx.cookie[cookieName];

			// Clear server-side session
			if (config.session.type === "server" && sessionCookie?.value) {
				await sessionAdapter.destroy(sessionCookie.value);
			}

			// Revoke Discord token and clean up storage if configured
			if (storage && sessionCookie?.value) {
				let userData: SessionData | null =
					config.session.type === "server"
						? await sessionAdapter.verify(sessionCookie.value)
						: null;

				// For JWT, try to extract from cookie or request
				if (!userData && config.session.type !== "server") {
					try {
						const jwtPayload = await (ctx as any).jwt.verify(
							sessionCookie.value,
						);
						if (jwtPayload) {
							userData = {
								discordId: jwtPayload.discordId as string,
								username: jwtPayload.username as string,
								globalName: jwtPayload.globalName as string | null,
								avatar: jwtPayload.avatar as string | null,
								email: jwtPayload.email as string | null,
								locale: jwtPayload.locale as string,
								roles: jwtPayload.roles as string[] | undefined,
							};
						}
					} catch {
						// Ignore JWT verification error
					}
				}

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

			// Clear PKCE cookie
			ctx.cookie["discord-auth-pkce-verifier"].remove();

			// Clear session cookie
			ctx.cookie[cookieName].remove();
			return ctx.redirect("/");
		});
}

export function createLoginRedirectRoute(context: RouteContext) {
	const { config, client } = context;
	const { routes } = config;
	const pkceEnabled = !config.disablePKCE;

	const loginRedirect = async (ctx: any) => {
		const redirectUri = config.redirectUri;
		if (!redirectUri) {
			throw new ConfigurationError(
				"redirectUri is required — set DISCORD_REDIRECT_URI env var or provide redirectUri in config",
			);
		}

		// Generate code_verifier and code_challenge for PKCE
		let codeChallenge: string | undefined;
		let codeVerifier: string | undefined;

		if (pkceEnabled) {
			const pkce = await generatePKCE();
			codeChallenge = pkce.codeChallenge;
			codeVerifier = pkce.codeVerifier;
		}

		// Extract sessionId from session cookie if exists
		const cookieName = config.session.cookieName ?? "discord-auth-session";
		const sessionCookie = ctx.cookie[cookieName];
		const sessionId = sessionCookie?.value;

		// Extract userAgent from request headers
		const userAgent = ctx.request.headers.get("user-agent") ?? undefined;

		// Generate state with code_verifier (if PKCE enabled) and CSRF binding
		const state = await generateState(
			config.session.secret,
			codeVerifier,
			sessionId,
			userAgent,
			config.csrf,
		);

		// Store code_verifier in cookie (as fallback for state validation)
		// The state already contains the code_verifier, but the cookie serves as backup
		if (pkceEnabled && codeVerifier) {
			const cookieName = "discord-auth-pkce-verifier";
			ctx.cookie[cookieName].set({
				value: codeVerifier,
				httpOnly: true,
				secure: config.session.secure ?? false,
				sameSite: config.session.sameSite ?? "lax",
				path: config.session.cookiePath ?? "/",
				maxAge: 600, // 10 minutes - state lifetime
			});
		}

		const url = client.generateAuthUrl({
			clientId: config.clientId,
			redirectUri: redirectUri,
			scopes: config.scopes,
			state,
			prompt: config.prompt,
			codeChallenge,
			codeChallengeMethod: pkceEnabled ? "S256" : undefined,
		});

		return ctx.redirect(url);
	};

	return new Elysia({ name: "discord-auth-login" }).get(
		routes.prefix,
		loginRedirect,
	);
}