import { jwt } from "@elysiajs/jwt";
import { Elysia } from "elysia";
import { DiscordClient } from "../core/client";
import { generatePKCE, processConfig } from "../core/config";
import {
	type CallbackContext,
	createTypedCallbackRoute,
	createTypedErrorRoute,
	createTypedLoginRoute,
	createTypedRouteHandlers,
	type InferScopes,
	type LoginContext,
	type TypedRouteHandlers,
} from "../core/route-helpers";
import { createSessionAdapter } from "../core/session";
import { generateState, validateState } from "../core/state";
import type {
	DiscordAuthConfig,
	DiscordScope,
	DiscordTokenResponse,
	DiscordUser,
	InternalConfig,
} from "../core/types";
import { signToken } from "../standalone/jwt";

const DEFAULT_SCOPES: DiscordScope[] = ["identify"];

import {
	createMiddlewares,
	type MiddlewareDeps,
} from "../standalone/middleware";
import { createAuthGuard, createOptionalAuthGuard } from "./guard";
import { createMeRoute } from "./me";
import { createRoleGuard } from "./role-guard";
import {
	createAuthRoutes,
	createLoginRedirectRoute,
	type RouteContext,
} from "./routes";

export function discordAuth<Config extends DiscordAuthConfig>(config: Config) {
	if (!config.clientId) {
		throw new Error(
			"Missing required configuration: 'clientId' is required. " +
				"Get it from https://discord.com/developers/applications/{app-id}",
		);
	}

	if (!config.clientSecret) {
		throw new Error(
			"Missing required configuration: 'clientSecret' is required. " +
				"Get it from https://discord.com/developers/applications/{app-id}",
		);
	}

	if (!config.session?.secret) {
		throw new Error(
			"Missing required configuration: 'session.secret' is required. " +
				"Generate a strong secret (min 32 chars): crypto.randomUUID() + crypto.randomUUID()",
		);
	}

	const internalConfig = processConfig(config);
	const client = new DiscordClient(config.clientId, config.clientSecret);
	const rawSessionAdapter = createSessionAdapter(config.session);
	const sessionAdapter = rawSessionAdapter;
	const cookieName =
		internalConfig.session.cookieName ?? "discord-auth-session";
	const storage = internalConfig.storage;

	const routeContext: RouteContext = {
		config: internalConfig,
		client,
		sessionAdapter,
		storage,
	};

	const guardDeps = {
		sessionType: config.session.type,
		sessionAdapter,
		storage,
		client,
		clientId: config.clientId,
		clientSecret: config.clientSecret,
		cookieName,
		pkceEnabled: !config.disablePKCE,
		jwtSecret: config.session.secret,
		autoRefresh: internalConfig.autoRefresh,
	};

	const _middlewareDeps: MiddlewareDeps = {
		secret: config.session.secret,
		sessionType: config.session.type,
		cookieName,
		storage,
		client,
		clientId: config.clientId,
		clientSecret: config.clientSecret,
		autoRefresh: internalConfig.autoRefresh,
	};

	const expiresIn =
		typeof config.session.expiresIn === "number"
			? config.session.expiresIn
			: undefined;

	const jwtExp =
		typeof config.session.expiresIn === "string"
			? config.session.expiresIn
			: expiresIn
				? `${expiresIn}s`
				: "7d";

	const macros: Record<string, any> = {
		auth: createAuthGuard(guardDeps),
		optionalAuth: createOptionalAuthGuard(guardDeps),
	};

	if (storage) {
		macros.requireRole = (roles: string[]) => createRoleGuard(roles, storage);
	}

	const app = new Elysia({ name: "discord-auth" })
		.use(
			jwt({
				name: "discord-auth-jwt",
				secret: config.session.secret,
				exp: jwtExp,
			}),
		)
		.use(createLoginRedirectRoute(routeContext))
		.use(createAuthRoutes(routeContext))
		.macro(macros);

	if (storage) {
		app.use(createMeRoute(internalConfig.meRoute, storage));
	}

	const appWithMiddlewares = app as typeof app & {
		discordAuth: {
			config: Config;
			scopes: InferScopes<Config>;
			routes: TypedRouteHandlers<Config>;
		};
		middlewares: typeof createMiddlewares;
	};

	appWithMiddlewares.middlewares = createMiddlewares;

	return appWithMiddlewares;
}

export function createAuthRoutesTyped<Config extends DiscordAuthConfig>(
	context: RouteContext & { config: InternalConfig },
): TypedRouteHandlers<Config> {
	const { config, client, sessionAdapter, storage } = context;
	const { routes } = config;

	const _callbackContext: CallbackContext<Config> = {
		config,
		client,
		sessionAdapter,
		storage,
		scopes: (config.scopes ?? DEFAULT_SCOPES) as DiscordScope[],
	};

	const _loginContext: LoginContext<Config> = {
		config,
		client,
		scopes: (config.scopes ?? DEFAULT_SCOPES) as DiscordScope[],
	};

	const callbackHandler = createTypedCallbackRoute<Config>(
		async (query, _ctx) => {
			const code = query.code;
			const state = query.state;

			if (!code) {
				await config.callbacks.onError(
					new Error("Missing authorization code"),
					"callback",
				);
				return new Response("Missing authorization code", { status: 400 });
			}

			if (!state) {
				await config.callbacks.onError(
					new Error("Missing state parameter"),
					"callback",
				);
				return new Response("Missing state parameter", { status: 400 });
			}

			const stateValidation = await validateState(state, config.session.secret);
			if (!stateValidation.valid) {
				await config.callbacks.onError(
					new Error("Invalid state parameter - possible CSRF attack"),
					"callback",
				);
				return new Response("Invalid state parameter", { status: 403 });
			}

			const redirectUri = config.redirectUri;

			let tokens: DiscordTokenResponse;
			try {
				tokens = await client.exchangeCode({
					clientId: config.clientId,
					clientSecret: config.clientSecret,
					code,
					redirectUri: redirectUri,
					codeVerifier: !config.disablePKCE
						? stateValidation.codeVerifier
						: undefined,
				});
			} catch (err) {
				await config.callbacks.onError(err as Error, "callback");
				return new Response("Failed to exchange authorization code", {
					status: 500,
				});
			}

			let user: DiscordUser;
			try {
				user = await client.getUser(tokens.access_token);
			} catch (err) {
				await config.callbacks.onError(err as Error, "callback");
				return new Response("Failed to fetch user data", { status: 500 });
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

			let _sessionToken: string;

			if (config.session.type === "server") {
				let roles: string[] | undefined;
				if (storage) {
					const storedUser = await storage.findByDiscordId(user.id);
					roles = storedUser?.roles;
				}
				_sessionToken = await sessionAdapter.create(user, tokens, roles);
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

				_sessionToken = await signToken(
					payload,
					config.session.secret,
					typeof config.session.expiresIn === "string"
						? config.session.expiresIn
						: config.session.expiresIn
							? `${config.session.expiresIn}s`
							: "7d",
				);
			}

			if (config.callbacks.onSuccess) {
				const result = await config.callbacks.onSuccess(user, tokens);
				if (result?.redirect) {
					return Response.redirect(result.redirect);
				}
			}

			return Response.redirect("/");
		},
	);

	const loginHandler = createTypedLoginRoute<Config>(async (_query, _ctx) => {
		const redirectUri = config.redirectUri;

		const pkceEnabled = !config.disablePKCE;
		let codeChallenge: string | undefined;
		let codeVerifier: string | undefined;

		if (pkceEnabled) {
			const pkce = await generatePKCE();
			codeChallenge = pkce.codeChallenge;
			codeVerifier = pkce.codeVerifier;
		}

		const state = await generateState(config.session.secret, codeVerifier);

		const url = client.generateAuthUrl({
			clientId: config.clientId,
			redirectUri: redirectUri,
			scopes: config.scopes,
			state,
			prompt: config.prompt,
			codeChallenge,
			codeChallengeMethod: pkceEnabled ? "S256" : undefined,
		});

		return Response.redirect(url);
	});

	const errorHandler = createTypedErrorRoute<Config>(async (query, _ctx) => {
		await config.callbacks.onError(
			new Error(query.error_description ?? query.error),
			"auth",
		);
		return new Response(`Authentication error: ${query.error}`, {
			status: 400,
		});
	});

	return createTypedRouteHandlers(callbackHandler, loginHandler, errorHandler);
}

// =============================================================================
// v1.1.0: Factory + Presets + Type Helpers
// =============================================================================

// Explicit factory for compatibility with config object
export function from(config: DiscordAuthConfig): Elysia {
	const app = discordAuth(config);
	return app as unknown as Elysia;
}

// Preset Options types
export interface SpaPresetOpts {
	clientId: string;
	clientSecret: string;
	secret: string;
	redirectUri?: string;
	scopes?: import("../core/types").DiscordScope[];
	prompt?: "consent" | "none";
}

export interface ServerPresetOpts {
	clientId: string;
	clientSecret: string;
	secret: string;
	storage: any;
	redirectUri?: string;
	scopes?: import("../core/types").DiscordScope[];
	prompt?: "consent" | "none";
}

export interface NextjsPresetOpts {
	clientId: string;
	clientSecret: string;
	secret: string;
	redirectUri?: string;
	scopes?: import("../core/types").DiscordScope[];
	prompt?: "consent" | "none";
}

export interface EdgePresetOpts {
	clientId: string;
	clientSecret: string;
	secret: string;
	redirectUri?: string;
	scopes?: import("../core/types").DiscordScope[];
	prompt?: "consent" | "none";
}

// Ready presets
export const presets = {
	/**
	 * SPA (React, Vue, Svelte, etc.)
	 * - secure: false (for http://localhost in dev)
	 * - sameSite: "lax" (flexible)
	 * - PKCE: enabled (required)
	 * - Session: JWT
	 */
	spa: (opts: SpaPresetOpts): Elysia => {
		const app = discordAuth({
			clientId: opts.clientId,
			clientSecret: opts.clientSecret,
			redirectUri: opts.redirectUri,
			scopes: opts.scopes as import("../core/types").DiscordScope[],
			prompt: opts.prompt,
			session: {
				type: "jwt",
				secret: opts.secret,
				secure: false,
				sameSite: "lax",
			},
			disablePKCE: false,
		});
		return app as unknown as Elysia;
	},

	/**
	 * Server-side (Traditional Backend)
	 * - secure: true (HTTPS)
	 * - Session: server-side adapter
	 * - Storage: required for auto-refresh
	 */
	server: (opts: ServerPresetOpts): Elysia => {
		const app = discordAuth({
			clientId: opts.clientId,
			clientSecret: opts.clientSecret,
			redirectUri: opts.redirectUri,
			scopes: opts.scopes as import("../core/types").DiscordScope[],
			prompt: opts.prompt,
			session: {
				type: "server",
				secret: opts.secret,
				secure: true,
				sameSite: "lax",
			},
			storage: opts.storage,
			disablePKCE: false,
		});
		return app as unknown as Elysia;
	},

	/**
	 * Next.js App Router / Middleware
	 * - secure: true (HTTPS)
	 * - redirectUri: auto-detect via headers or NEXT_PUBLIC_APP_URL
	 */
	nextjs: (opts: NextjsPresetOpts): Elysia => {
		const app = discordAuth({
			clientId: opts.clientId,
			clientSecret: opts.clientSecret,
			redirectUri: opts.redirectUri,
			scopes: opts.scopes as import("../core/types").DiscordScope[],
			prompt: opts.prompt,
			session: {
				type: "jwt",
				secret: opts.secret,
				secure: true,
				sameSite: "lax",
			},
			disablePKCE: false,
		});
		return app as unknown as Elysia;
	},

	/**
	 * Edge Runtime (Cloudflare Workers, Deno, etc.)
	 * - Header-based auth (no cookies)
	 * - JWT session
	 */
	edge: (opts: EdgePresetOpts): Elysia => {
		const app = discordAuth({
			clientId: opts.clientId,
			clientSecret: opts.clientSecret,
			redirectUri: opts.redirectUri,
			scopes: opts.scopes as import("../core/types").DiscordScope[],
			prompt: opts.prompt,
			session: {
				type: "jwt",
				secret: opts.secret,
				secure: true,
				sameSite: "lax",
				cookieName: "__discord-auth-session",
			},
			disablePKCE: false,
		});
		return app as unknown as Elysia;
	},
};

// Type helpers for automatic inference
export type InferSession<T extends Elysia> =
	T extends Elysia<any, infer Decorators, any, any, any>
		? Decorators extends {
				decorator: {
					"discord-auth-jwt": { verify: (token: string) => Promise<infer P> };
				};
			}
			? P extends { discordId: string }
				? P
				: never
			: never
		: never;

export type InferUser<T extends Elysia> = InferSession<T>;
export type InferStoredUser<T extends Elysia> =
	InferSession<T> extends {
		discordId: string;
		accessToken?: string;
		refreshToken?: string;
	}
		? Omit<InferSession<T>, "accessToken" | "refreshToken">
		: never;

import { SignJWT } from "jose";

// Helper to generate JWT in E2E tests using the same mechanism as @elysiajs/jwt plugin
// (which uses jose internally with HS256 and TextEncoder for the secret)
export async function signTestJwt(
	payload: Record<string, unknown>,
	secret: string,
	exp: string | number = "1h",
): Promise<string> {
	const key = new TextEncoder().encode(secret);
	const token = new SignJWT(payload as any)
		.setProtectedHeader({ alg: "HS256", typ: "JWT" })
		.setIssuedAt();

	if (typeof exp === "string") {
		token.setExpirationTime(exp);
	} else if (typeof exp === "number") {
		token.setExpirationTime(`${exp}s`);
	}

	return token.sign(key);
}
