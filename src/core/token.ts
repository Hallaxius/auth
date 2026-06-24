import type { DiscordClient } from "./client";
import type { AutoRefreshConfig, StoredUser } from "./types";

export interface RefreshDeps {
	client?: DiscordClient;
	clientId?: string;
	clientSecret?: string;
	autoRefresh?: AutoRefreshConfig;
}

/**
 * Attempts to refresh an expiring token.
 * Returns new stored user data if refreshed, null if expired and can't refresh,
 * or the original storedUser if refresh was not needed.
 */
export async function refreshTokenIfNeeded(
	storedUser: StoredUser,
	deps: RefreshDeps,
): Promise<{ storedUser: StoredUser; refreshed: boolean } | { storedUser: null; refreshed: false }> {
	const autoRefresh = deps.autoRefresh;
	if (!deps.client || !deps.clientId || !deps.clientSecret || !autoRefresh?.enabled) {
		return { storedUser, refreshed: false };
	}

	const thresholdSeconds = autoRefresh.thresholdSeconds ?? 300;
	if (storedUser.tokenExpiresAt >= Math.floor(Date.now() / 1000) + thresholdSeconds) {
		return { storedUser, refreshed: false };
	}

	try {
		const newTokens = await deps.client.refreshToken({
			clientId: deps.clientId,
			clientSecret: deps.clientSecret,
			refreshToken: storedUser.refreshToken,
		});
		return {
			storedUser: {
				...storedUser,
				accessToken: newTokens.access_token,
				refreshToken: newTokens.refresh_token,
				tokenExpiresAt: Math.floor(Date.now() / 1000) + newTokens.expires_in,
			},
			refreshed: true,
		};
	} catch {
		if (storedUser.tokenExpiresAt < Math.floor(Date.now() / 1000)) {
			return { storedUser: null, refreshed: false };
		}
		return { storedUser, refreshed: false };
	}
}
