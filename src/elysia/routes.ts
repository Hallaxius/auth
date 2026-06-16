import { Elysia } from "elysia";
import type { DiscordClient } from "../core/client";
import { generatePKCE } from "../core/config";
import { generateState, validateState } from "../core/state";
import type {
	DiscordTokenResponse,
	DiscordUser,
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

	return new Elysia({ name: "discord-auth-routes" })
		.get(routes.callback, async (ctx: any) => {
			const { query, cookie, jwt } = ctx;
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

			// Validate state and extract code_verifier for PKCE
			const stateValidation = await validateState(state, config.session.secret);
			if (!stateValidation.valid) {
				await config.callbacks.onError(
					new Error("Invalid state parameter - possible CSRF attack"),
					"callback",
				);
				ctx.status = 403;
				return "Invalid state parameter";
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

			// Use the same redirectUri as login (auto-detect if necessary)
			let redirectUri = config.redirectUri;
			if (!redirectUri) {
				const proto =
					ctx.request.headers.get("x-forwarded-proto") ??
					ctx.request.headers.get("X-Forwarded-Proto") ??
					"https";
				const host =
					ctx.request.headers.get("host") ?? ctx.request.headers.get("Host");
				if (host) {
					redirectUri = `${proto}://${host}${routes.prefix}/callback`;
				}
			}

			let tokens: DiscordTokenResponse;
			try {
				tokens = await client.exchangeCode({
					clientId: config.clientId,
					clientSecret: config.clientSecret,
					code,
					redirectUri: redirectUri,
					codeVerifier: !config.disablePKCE ? codeVerifier : undefined,
				});
			} catch (err) {
				await config.callbacks.onError(err as Error, "callback");
				ctx.status = 500;
				return "Failed to exchange authorization code";
			}

			let user: DiscordUser;
			try {
				user = await client.getUser(tokens.access_token);
			} catch (err) {
				await config.callbacks.onError(err as Error, "callback");
				ctx.status = 500;
				return "Failed to fetch user data";
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

			let sessionToken: string;

			if (config.session.type === "server") {
				let roles: string[] | undefined;
				if (storage) {
					const storedUser = await storage.findByDiscordId(user.id);
					roles = storedUser?.roles;
				}
				sessionToken = await sessionAdapter.create(user, tokens, roles);
			} else {
				const payload: Record<string, unknown> = {
					discordId: user.id,
					username: user.username,
					globalName: user.global_name,
					avatar: user.avatar,
					email: user.email,
					locale: user.locale,
				};

				if (storage) {
					const storedUser = await storage.findByDiscordId(user.id);
					if (storedUser?.roles) {
						payload.roles = storedUser.roles;
					}
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

			// Revoke Discord token if storage is configured
			if (storage && sessionCookie?.value) {
				try {
					let userData: SessionData | null =
						config.session.type === "server"
							? await sessionAdapter.verify(sessionCookie.value)
							: null;

					// For JWT, try to extract from cookie or request
					if (!userData && config.session.type !== "server") {
						// Attempt to verify JWT token
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
		// Generate redirectUri - auto-detect if not provided
		let redirectUri = config.redirectUri;
		if (!redirectUri) {
			// Auto-detect via request headers (for Next.js, Cloudflare, etc.)
			const proto =
				ctx.request.headers.get("x-forwarded-proto") ??
				ctx.request.headers.get("X-Forwarded-Proto") ??
				"https";
			const host =
				ctx.request.headers.get("host") ?? ctx.request.headers.get("Host");
			if (host) {
				redirectUri = `${proto}://${host}${routes.prefix}/callback`;
			}
		}

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
