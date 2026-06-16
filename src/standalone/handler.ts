import type { DiscordClient } from "../core/client";
import { generatePKCE } from "../core/config";
import {
	generateState,
	type ValidatedState,
	validateState,
} from "../core/state";
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

	async function handleLogin(_request: Request): Promise<Response> {
		const pkceEnabled = !config.disablePKCE;

		// Generate code_verifier and code_challenge for PKCE
		let codeChallenge: string | undefined;
		let codeVerifier: string | undefined;

		if (pkceEnabled) {
			const pkce = await generatePKCE();
			codeChallenge = pkce.codeChallenge;
			codeVerifier = pkce.codeVerifier;
		}

		// Generate state with code_verifier (if PKCE enabled)
		const state = await generateState(config.session.secret, codeVerifier);

		// Store code_verifier in cookie as fallback
		const cookies: string[] = [];
		if (pkceEnabled && codeVerifier) {
			const pkceCookie = setSessionCookie(
				"discord-auth-pkce-verifier",
				codeVerifier,
				{ ...config.session, expiresIn: 600 }, // 10 minutes
			);
			cookies.push(pkceCookie);
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

		return redirectResponse(url, cookies.length > 0 ? cookies : undefined);
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

		// Validate state and extract code_verifier for PKCE
		const stateValidation: ValidatedState = await validateState(
			state,
			config.session.secret,
		);
		if (!stateValidation.valid) {
			return htmlResponse(
				"Invalid state parameter - possible CSRF attack",
				403,
			);
		}

		// Try to get code_verifier from state first, then from cookie
		let codeVerifier = stateValidation.codeVerifier;
		if (!codeVerifier && !config.disablePKCE) {
			const cookies = parseCookies(request);
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
					accessToken: tokens.access_token,
					refreshToken: tokens.refresh_token,
					tokenExpiresAt: expiresAt,
				});
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
		};

		if (storedUser?.roles) {
			sessionPayload.roles = storedUser.roles;
		}

		const sessionToken = await signToken(
			sessionPayload,
			config.session.secret,
			config.session.expiresIn ?? "7d",
		);

		const cookieName = config.session.cookieName ?? "discord-auth-session";
		const cookie = setSessionCookie(cookieName, sessionToken, config.session);

		if (config.callbacks.onSuccess) {
			const result = await config.callbacks.onSuccess(user, tokens);
			if (result?.redirect) {
				return redirectResponse(result.redirect, [cookie]);
			}
		}

		return redirectResponse("/", [cookie]);
	}

	async function handleLogout(request: Request): Promise<Response> {
		const cookieName = config.session.cookieName ?? "discord-auth-session";
		const cookies = parseCookies(request);
		const sessionToken = cookies[cookieName];

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
			clearSessionCookie(cookieName, config.session),
			clearSessionCookie("discord-auth-pkce-verifier", config.session),
		];

		return redirectResponse("/", clearCookies);
	}

	async function handleMe(request: Request): Promise<Response> {
		const cookieName = config.session.cookieName ?? "discord-auth-session";
		const cookies = parseCookies(request);
		const sessionToken = cookies[cookieName];

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
