import type { DiscordClient } from "../core/client";
import { GuildRoleSync } from "../core/guild-sync";
import { MemoryCacheAdapter } from "../adapters/cache";
import { generatePKCE } from "../core/config";
import {
	generateState,
	type ValidatedState,
	validateState,
	consumeState,
	MemoryStateStore,
} from "../core/state";
import { StateReusedError, StateBindingError, DiscordAuthError, BruteForceBlockedError } from "../core/errors";
import { BruteForceProtection } from "../core/brute-force";
import { MemoryBruteForceStorage } from "../adapters/brute-force";
import type {
	DiscordTokenResponse,
	DiscordUser,
	InternalConfig,
	SessionData,
	SessionType,
	UserStorage,
} from "../core/types";
import { clearSessionCookie, parseCookies, setSessionCookie } from "./cookies";
import { signToken, verifyToken } from "./jwt";
import { MfaRequiredError } from "../core/errors";

const stateStore = new MemoryStateStore();

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
	if (sessionType === "server") {
		return null; // server sessions not supported in standalone mode
	}

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

function redirectResponse(url: string, cookies?: string[]): Response {
	const headers = new Headers();
	headers.set("Location", url);
	if (cookies) {
		for (const c of cookies) headers.append("Set-Cookie", c);
	}
	return new Response(null, { status: 302, headers });
}

function htmlResponse(body: string, status = 200): Response {
	return new Response(body, {
		status,
		headers: { "Content-Type": "text/html; charset=utf-8" },
	});
}

function jsonResponse(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "Content-Type": "application/json; charset=utf-8" },
	});
}

export function createHandlers(ctx: HandlerContext) {
	const { config, client, storage } = ctx;
	const sessionCookieName = config.session.cookieName;

	const bruteForceStorage = config.bruteForce.storage ?? new MemoryBruteForceStorage();
	const bruteForce = new BruteForceProtection(config.bruteForce, bruteForceStorage);

	async function handleLogin(request: Request): Promise<Response> {
		const pkceEnabled = !config.disablePKCE;

		// Generate code_verifier and code_challenge for PKCE
		let codeChallenge: string | undefined;
		let codeVerifier: string | undefined;

		if (pkceEnabled) {
			const pkce = await generatePKCE();
			codeChallenge = pkce.codeChallenge;
			codeVerifier = pkce.codeVerifier;
		}

		// Extract sessionId from session cookie if exists
		const cookies = parseCookies(request);
		const sessionId = cookies[sessionCookieName];

		// Extract userAgent from request headers
		const userAgent = request.headers.get("user-agent") ?? undefined;

		// Generate state with code_verifier (if PKCE enabled) and CSRF binding
		const state = await generateState(
			config.session.secret,
			codeVerifier,
			sessionId,
			userAgent,
			config.csrf,
		);

		// Store code_verifier in cookie as fallback
		const responseCookies: string[] = [];
		if (pkceEnabled && codeVerifier) {
			const pkceCookie = setSessionCookie(
				"discord-auth-pkce-verifier",
				codeVerifier,
				{ ...config.session, expiresIn: 600 }, // 10 minutes
			);
			responseCookies.push(pkceCookie);
		}

		const url = client.generateAuthUrl({
			clientId: config.clientId,
			redirectUri: config.redirectUri,
			scopes: config.scopes,
			state,
			prompt: config.prompt,
			codeChallenge,
			codeChallengeMethod: pkceEnabled ? "S256" : undefined,
		});

		return redirectResponse(url, responseCookies.length > 0 ? responseCookies : undefined);
	}

	async function handleCallback(request: Request): Promise<Response> {
		const url = new URL(request.url);
		const code = url.searchParams.get("code");
		const state = url.searchParams.get("state");

		if (!code) {
			return htmlResponse("Missing authorization code", 400);
		}

		if (!state) {
			return htmlResponse("Missing state parameter", 400);
		}

		// Extract sessionId from session cookie if exists
		const cookies = parseCookies(request);
		const sessionId = cookies[sessionCookieName];

		// Extract userAgent from request headers
		const userAgent = request.headers.get("user-agent") ?? undefined;

		// Validate state with enhanced CSRF protection
		let stateValidation: ValidatedState;
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
						const decoded = new TextDecoder().decode(new Uint8Array(atob(encoded.replace(/-/g, "+").replace(/_/g, "/")).split("").map(c => c.charCodeAt(0))));
						const payload = JSON.parse(decoded);
						if (payload.id && await stateStore.has(payload.id)) {
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
				csrfError = new Error("Invalid state parameter - possible CSRF attack");
			}
		}

		if (csrfError) {
			await config.callbacks.onError(csrfError, "callback");
			const statusCode = csrfError instanceof DiscordAuthError ? (csrfError.statusCode ?? 403) : 403;
			return htmlResponse(csrfError.message, statusCode);
		}

		// Try to get code_verifier from state first, then from cookie
		let codeVerifier = stateValidation.codeVerifier;
		if (!codeVerifier && !config.disablePKCE) {
			codeVerifier = cookies["discord-auth-pkce-verifier"];
		}

		let tokens: DiscordTokenResponse;
		try {
			tokens = await client.exchangeCode({
				clientId: config.clientId,
				clientSecret: config.clientSecret,
				code,
				redirectUri: config.redirectUri,
				codeVerifier: !config.disablePKCE ? codeVerifier : undefined,
			});
		} catch (err) {
			await config.callbacks.onError(err as Error, "callback");
			return htmlResponse("Failed to exchange authorization code", 500);
		}

		let user: DiscordUser;
		try {
			user = await client.getUser(tokens.access_token);
		} catch (err) {
			await config.callbacks.onError(err as Error, "callback");
			return htmlResponse("Failed to fetch user data", 500);
		}

		if (config.mfa.enabled && config.mfa.requireMfa && !user.mfa_enabled) {
			await config.callbacks.onError(new MfaRequiredError(), "callback");
			return htmlResponse("Multi-factor authentication is required", 403);
		}

		if (storage) {
			const expiresAt = Math.floor(Date.now() / 1000) + tokens.expires_in;
			const existing = await storage.findByDiscordId(user.id);

			if (!existing) {
				await storage.create({
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
			} else {
				await storage.update(user.id, {
					username: user.username,
					globalName: user.global_name,
					avatar: user.avatar,
					email: user.email,
					mfaEnabled: user.mfa_enabled,
					accessToken: tokens.access_token,
					refreshToken: tokens.refresh_token,
					tokenExpiresAt: expiresAt,
				});
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
			syncedPermissions = await guildSync.syncUserRoles(user.id, tokens.access_token);

			if (storage && syncedPermissions.length > 0) {
				const storedUser = await storage.findByDiscordId(user.id);
				if (storedUser) {
					const mergedRoles = Array.from(new Set([...storedUser.roles, ...syncedPermissions]));
					await storage.update(user.id, { roles: mergedRoles });
				}
			}
		}

		const storedUser = storage ? await storage.findByDiscordId(user.id) : null;

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

		const cookie = setSessionCookie(sessionCookieName, sessionToken, config.session);

		if (config.callbacks.onSuccess) {
			const result = await config.callbacks.onSuccess(user, tokens);
			if (result?.redirect) {
				return redirectResponse(result.redirect, [cookie]);
			}
		}

		return redirectResponse("/", [cookie]);
	}

	async function handleLogout(request: Request): Promise<Response> {
		const cookies = parseCookies(request);
		const sessionToken = cookies[sessionCookieName];

		// Revoke Discord token if storage is configured
		if (storage && sessionToken) {
			try {
				const userData = await verifySession(
					sessionToken,
					config.session.secret,
					config.session.type,
				);
				if (userData) {
					const stored = await storage.findByDiscordId(userData.discordId);
					if (stored?.accessToken) {
						await client.revokeToken({
							clientId: config.clientId,
							clientSecret: config.clientSecret,
							accessToken: stored.accessToken,
						});

						// Also remove from storage
						await storage.delete(stored.discordId);
					}
				}
			} catch {
				// revocation failed, proceed with logout
			}
		}

		// Clear cookies
		const clearCookies: string[] = [
			clearSessionCookie(sessionCookieName, config.session),
			clearSessionCookie("discord-auth-pkce-verifier", config.session),
		];

		return redirectResponse("/", clearCookies);
	}

	async function handleMe(request: Request): Promise<Response> {
		const cookies = parseCookies(request);
		const sessionToken = cookies[sessionCookieName];

		if (!sessionToken) {
			return jsonResponse({ error: "Unauthorized" }, 401);
		}

		const userData = await verifySession(
			sessionToken,
			config.session.secret,
			config.session.type,
		);

		if (!userData) {
			return jsonResponse({ error: "Session expired" }, 401);
		}

		if (!storage) {
			return jsonResponse(userData);
		}

		const stored = await storage.findByDiscordId(userData.discordId);
		if (!stored) {
			return jsonResponse({ error: "User not found" }, 404);
		}

		const { accessToken, refreshToken, ...safe } = stored;
		return jsonResponse(safe);
	}

	return { handleLogin, handleCallback, handleLogout, handleMe };
}
