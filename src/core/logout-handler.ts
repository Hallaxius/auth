import type { DiscordClient } from "./client";
import type { SessionData, UserStorage } from "./types";

/**
 * Shared logout logic: revoke the Discord access token and remove the
 * stored user. Errors are swallowed so that cookie-clearing and redirect
 * still proceed even when revocation fails.
 */
export async function revokeAndCleanup(params: {
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
	} catch {
		// revocation failed, proceed with logout
	}
}
