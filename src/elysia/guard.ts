import { jwtVerify } from "jose";
import type { DiscordClient } from "../core/client";
import { TokenExpiredError } from "../core/errors";
import type {
	AutoRefreshConfig,
	SessionAdapter,
	SessionData,
	SessionType,
	StoredUser,
	UserStorage,
} from "../core/types";
import type { GuildRoleSyncConfig } from "../core/types";

export interface GuardDeps {
	sessionType: SessionType;
	sessionAdapter: SessionAdapter;
	storage?: UserStorage;
	client?: DiscordClient;
	clientId?: string;
	clientSecret?: string;
	cookieName: string;
	pkceEnabled?: boolean;
	jwtSecret?: string;
	autoRefresh?: AutoRefreshConfig;
}

export interface AuthContext {
	user: SessionData;
	storedUser: {
		id: string;
		discordId: string;
		username: string;
		globalName: string | null;
		avatar: string | null;
		email: string | null;
		locale: string;
		roles: string[];
		permissions: string[];
		tokenExpiresAt: number;
		createdAt: Date;
		updatedAt: Date;
	} | null;
	permissions: string[];
	hasPermission: (permission: string) => boolean;
	guildRoleSync?: GuildRoleSyncConfig;
}

type GuardResolveContext = {
	jwt: {
		sign: (payload: Record<string, unknown>) => Promise<string>;
		verify: (token?: string) => Promise<Record<string, unknown> | false>;
	};
	cookie: Record<string, { value: string }>;
	status: (code: number, body?: string) => void;
};

export function createAuthGuard(deps: GuardDeps) {
	const autoRefresh = deps.autoRefresh ?? { enabled: true, thresholdSeconds: 300, maxRetries: 1 };
	return {
		async resolve({ jwt, cookie, status }: GuardResolveContext) {
			const sessionCookie = cookie[deps.cookieName];
			if (!sessionCookie?.value) {
				return status(401, "Unauthorized");
			}

			let userData: SessionData | null = null;

			if (deps.sessionType === "server") {
				userData = await deps.sessionAdapter.verify(sessionCookie.value);
			} else {
				try {
					// Use jose directly for compatibility with signTestJwt
					if (deps.jwtSecret) {
						const key = new TextEncoder().encode(deps.jwtSecret);
						const { payload } = await jwtVerify(sessionCookie.value, key);
						userData = {
							discordId: payload.discordId as string,
							username: payload.username as string,
							globalName: (payload.globalName as string | null) ?? null,
							avatar: (payload.avatar as string | null) ?? null,
							email: (payload.email as string | null) ?? null,
							locale: payload.locale as string,
							roles: (payload.roles as string[] | undefined) ?? undefined,
						};
					} else {
						const payload = await jwt.verify(sessionCookie.value);
						if (payload) {
							userData = {
								discordId: payload.discordId as string,
								username: payload.username as string,
								globalName: (payload.globalName as string | null) ?? null,
								avatar: (payload.avatar as string | null) ?? null,
								email: (payload.email as string | null) ?? null,
								locale: payload.locale as string,
								roles: (payload.roles as string[] | undefined) ?? undefined,
							};
						}
					}
				} catch {
					// Invalid token - do nothing
				}
			}

			if (!userData) {
				return status(401, "Session expired");
			}

			let storedUser: StoredUser | null = null;
			if (deps.storage && deps.client && deps.clientId && deps.clientSecret && autoRefresh.enabled) {
				storedUser = await deps.storage.findByDiscordId(userData.discordId);

				// Auto-refresh: thresholdSeconds before token expires
				if (
					storedUser &&
					storedUser.tokenExpiresAt < Math.floor(Date.now() / 1000) + autoRefresh.thresholdSeconds
				) {
					try {
						const newTokens = await deps.client.refreshToken({
							clientId: deps.clientId,
							clientSecret: deps.clientSecret,
							refreshToken: storedUser.refreshToken,
						});
						await deps.storage.update(storedUser.discordId, {
							accessToken: newTokens.access_token,
							refreshToken: newTokens.refresh_token,
							tokenExpiresAt:
								Math.floor(Date.now() / 1000) + newTokens.expires_in,
						});
						storedUser = await deps.storage.findByDiscordId(userData.discordId);
					} catch (_err) {
						// refresh failed, proceed with current data
						// If token already expired, throw error
						if (
							storedUser &&
							storedUser.tokenExpiresAt < Math.floor(Date.now() / 1000)
						) {
							throw new TokenExpiredError(
								"Session token has expired and could not be refreshed",
							);
						}
					}
				}
			}

			const safeStoredUser = storedUser
				? {
						id: storedUser.id,
						discordId: storedUser.discordId,
						username: storedUser.username,
						globalName: storedUser.globalName,
						avatar: storedUser.avatar,
						email: storedUser.email,
						locale: storedUser.locale,
						roles: storedUser.roles,
						tokenExpiresAt: storedUser.tokenExpiresAt,
						createdAt: storedUser.createdAt,
						updatedAt: storedUser.updatedAt,
					}
				: null;

			return {
				user: userData,
				storedUser: safeStoredUser,
			};
		},
	};
}

export function createOptionalAuthGuard(deps: GuardDeps) {
	const autoRefresh = deps.autoRefresh ?? { enabled: true, thresholdSeconds: 300, maxRetries: 1 };
	return {
		async resolve({ jwt, cookie }: GuardResolveContext) {
			const sessionCookie = cookie[deps.cookieName];
			if (!sessionCookie?.value) {
				return { user: null, storedUser: null };
			}

			let userData: SessionData | null = null;

			if (deps.sessionType === "server") {
				userData = await deps.sessionAdapter.verify(sessionCookie.value);
			} else {
				try {
					// Use jose directly for compatibility with signTestJwt
					if (deps.jwtSecret) {
						const key = new TextEncoder().encode(deps.jwtSecret);
						const { payload } = await jwtVerify(sessionCookie.value, key);
						userData = {
							discordId: payload.discordId as string,
							username: payload.username as string,
							globalName: (payload.globalName as string | null) ?? null,
							avatar: (payload.avatar as string | null) ?? null,
							email: (payload.email as string | null) ?? null,
							locale: payload.locale as string,
							roles: (payload.roles as string[] | undefined) ?? undefined,
						};
					} else {
						const payload = await jwt.verify(sessionCookie.value);
						if (payload) {
							userData = {
								discordId: payload.discordId as string,
								username: payload.username as string,
								globalName: (payload.globalName as string | null) ?? null,
								avatar: (payload.avatar as string | null) ?? null,
								email: (payload.email as string | null) ?? null,
								locale: payload.locale as string,
								roles: (payload.roles as string[] | undefined) ?? undefined,
							};
						}
					}
				} catch {
					// Invalid token - do nothing
				}
			}

			if (!userData) {
				return { user: null, storedUser: null };
			}

			let storedUser: StoredUser | null = null;
			if (deps.storage && deps.client && deps.clientId && deps.clientSecret && autoRefresh.enabled) {
				storedUser = await deps.storage.findByDiscordId(userData.discordId);

				// Auto-refresh: thresholdSeconds before token expires
				if (
					storedUser &&
					storedUser.tokenExpiresAt < Math.floor(Date.now() / 1000) + autoRefresh.thresholdSeconds
				) {
					try {
						const newTokens = await deps.client.refreshToken({
							clientId: deps.clientId,
							clientSecret: deps.clientSecret,
							refreshToken: storedUser.refreshToken,
						});
						await deps.storage.update(storedUser.discordId, {
							accessToken: newTokens.access_token,
							refreshToken: newTokens.refresh_token,
							tokenExpiresAt:
								Math.floor(Date.now() / 1000) + newTokens.expires_in,
						});
						storedUser = await deps.storage.findByDiscordId(userData.discordId);
					} catch (_err) {
						// refresh failed, proceed with current data
						// If token already expired, do not throw error (optional auth)
					}
				}
			}

			const safeStoredUser = storedUser
				? {
						id: storedUser.id,
						discordId: storedUser.discordId,
						username: storedUser.username,
						globalName: storedUser.globalName,
						avatar: storedUser.avatar,
						email: storedUser.email,
						locale: storedUser.locale,
						roles: storedUser.roles,
						tokenExpiresAt: storedUser.tokenExpiresAt,
						createdAt: storedUser.createdAt,
						updatedAt: storedUser.updatedAt,
					}
				: null;

			return {
				user: userData,
				storedUser: safeStoredUser,
			};
		},
	};
}
