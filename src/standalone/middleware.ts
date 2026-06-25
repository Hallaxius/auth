import type { DiscordClient } from "../core/client";
import { refreshTokenIfNeeded } from "../core/token";
import type {
	AutoRefreshConfig,
	SafeStoredUser,
	SessionData,
	SessionType,
	UserStorage,
} from "../core/types";
import { parseCookies } from "./cookies";
import { verifyToken } from "./jwt";

export type AuthHandler = (
	request: Request,
	context: {
		user: SessionData | null;
		storedUser: SafeStoredUser | null;
	},
) => Response | Promise<Response>;

export interface MiddlewareDeps {
	secret: string;
	sessionType: SessionType;
	cookieName: string;
	storage?: UserStorage;
	client?: DiscordClient;
	clientId?: string;
	clientSecret?: string;
	autoRefresh?: AutoRefreshConfig;
}

function jsonResponse(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "Content-Type": "application/json; charset=utf-8" },
	});
}

export function createMiddlewares(deps: MiddlewareDeps) {
	const autoRefresh = deps.autoRefresh ?? {
		enabled: true,
		thresholdSeconds: 300,
		maxRetries: 1,
	};

	function withAuth(handler: AuthHandler) {
		return async (request: Request): Promise<Response> => {
			const cookies = parseCookies(request);
			const sessionToken = cookies[deps.cookieName];
			if (!sessionToken) {
				return jsonResponse({ error: "Unauthorized" }, 401);
			}

			const payload = await verifyToken<Record<string, unknown>>(
				sessionToken,
				deps.secret,
			);
			if (!payload) {
				return jsonResponse({ error: "Session expired" }, 401);
			}

			const user: SessionData | null = {
				discordId: payload.discordId as string,
				username: payload.username as string,
				globalName: (payload.globalName as string) ?? null,
				avatar: (payload.avatar as string) ?? null,
				email: (payload.email as string) ?? null,
				locale: payload.locale as string,
				roles: (payload.roles as string[]) ?? undefined,
			};

			let storedUser: SafeStoredUser | null = null;
			if (
				deps.storage &&
				deps.client &&
				deps.clientId &&
				deps.clientSecret &&
				autoRefresh?.enabled
			) {
				const stored = await deps.storage.findByDiscordId(user.discordId);
				if (stored) {
					const result = await refreshTokenIfNeeded(stored, {
						client: deps.client,
						clientId: deps.clientId,
						clientSecret: deps.clientSecret,
						autoRefresh,
					});
					if (result.refreshed && result.storedUser) {
						await deps.storage.update(result.storedUser.discordId, {
							accessToken: result.storedUser.accessToken,
							refreshToken: result.storedUser.refreshToken,
							tokenExpiresAt: result.storedUser.tokenExpiresAt,
						});
						const updated = await deps.storage.findByDiscordId(user.discordId);
						if (updated) {
							const { accessToken: _, refreshToken: __, ...safe } = updated;
							storedUser = safe;
						}
					} else if (!result.storedUser) {
						return jsonResponse(
							{ error: "Session token has expired and could not be refreshed" },
							401,
						);
					} else {
						const { accessToken, refreshToken, ...safe } = stored;
						storedUser = safe;
					}
				}
			} else if (deps.storage) {
				const stored = await deps.storage.findByDiscordId(user.discordId);
				if (stored) {
					const { accessToken, refreshToken, ...safe } = stored;
					storedUser = safe;
				}
			}

			return handler(request, { user, storedUser });
		};
	}

	function withOptionalAuth(handler: AuthHandler) {
		return async (request: Request): Promise<Response> => {
			const cookies = parseCookies(request);
			const sessionToken = cookies[deps.cookieName];
			if (!sessionToken) {
				return handler(request, {
					user: null,
					storedUser: null,
				});
			}

			const payload = await verifyToken<Record<string, unknown>>(
				sessionToken,
				deps.secret,
			);

			if (!payload) {
				return handler(request, {
					user: null,
					storedUser: null,
				});
			}

			const user: SessionData | null = {
				discordId: payload.discordId as string,
				username: payload.username as string,
				globalName: (payload.globalName as string) ?? null,
				avatar: (payload.avatar as string) ?? null,
				email: (payload.email as string) ?? null,
				locale: payload.locale as string,
				roles: (payload.roles as string[]) ?? undefined,
			};

			let storedUser: SafeStoredUser | null = null;
			if (
				deps.storage &&
				deps.client &&
				deps.clientId &&
				deps.clientSecret &&
				autoRefresh?.enabled
			) {
				const stored = await deps.storage.findByDiscordId(user.discordId);
				if (stored) {
					const result = await refreshTokenIfNeeded(stored, {
						client: deps.client,
						clientId: deps.clientId,
						clientSecret: deps.clientSecret,
						autoRefresh,
					});
					if (result.refreshed && result.storedUser) {
						await deps.storage.update(result.storedUser.discordId, {
							accessToken: result.storedUser.accessToken,
							refreshToken: result.storedUser.refreshToken,
							tokenExpiresAt: result.storedUser.tokenExpiresAt,
						});
						const updated = await deps.storage.findByDiscordId(user.discordId);
						if (updated) {
							const { accessToken: _, refreshToken: __, ...safe } = updated;
							storedUser = safe;
						}
					} else if (result.storedUser) {
						const { accessToken, refreshToken, ...safe } = stored;
						storedUser = safe;
					}
					// if result.storedUser is null (expired), proceed without storedUser
				}
			} else if (deps.storage) {
				const stored = await deps.storage.findByDiscordId(user.discordId);
				if (stored) {
					const { accessToken, refreshToken, ...safe } = stored;
					storedUser = safe;
				}
			}

			return handler(request, { user, storedUser });
		};
	}

	function withRole(...roles: string[]) {
		return (handler: AuthHandler) => {
			return async (request: Request): Promise<Response> => {
				const cookies = parseCookies(request);
				const sessionToken = cookies[deps.cookieName];
				if (!sessionToken) {
					return jsonResponse({ error: "Unauthorized" }, 401);
				}

				const payload = await verifyToken<Record<string, unknown>>(
					sessionToken,
					deps.secret,
				);
				if (!payload) {
					return jsonResponse({ error: "Session expired" }, 401);
				}

				const user: SessionData | null = {
					discordId: payload.discordId as string,
					username: payload.username as string,
					globalName: (payload.globalName as string) ?? null,
					avatar: (payload.avatar as string) ?? null,
					email: (payload.email as string) ?? null,
					locale: payload.locale as string,
					roles: (payload.roles as string[]) ?? undefined,
				};

				if (!deps.storage) {
					return jsonResponse({ error: "Storage not configured" }, 500);
				}

				const stored = await deps.storage.findByDiscordId(user.discordId);
				const hasRole = roles.some((r) => stored?.roles.includes(r));
				if (!hasRole) {
					return jsonResponse({ error: "Forbidden" }, 403);
				}

				if (!stored) {
					return jsonResponse({ error: "User not found" }, 404);
				}
				const { accessToken, refreshToken, ...safe } = stored;
				return handler(request, { user, storedUser: safe });
			};
		};
	}

	return { withAuth, withOptionalAuth, withRole };
}

// v1.1.0: Alias to simplify API
export const middlewares = createMiddlewares;
