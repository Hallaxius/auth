import { MemoryCacheAdapter } from "../adapters/cache";
import type { DiscordClient } from "./client";
import { ConfigurationError, MfaRequiredError } from "./errors";
import { GuildRoleSync } from "./guild-sync";
import type {
	DiscordTokenResponse,
	DiscordUser,
	InternalConfig,
	StoredUser,
	UserStorage,
} from "./types";

/**
 * Input parameters for the shared OAuth2 callback handler.
 *
 * State validation, brute force checks, and code verifier extraction
 * are the caller's responsibility (framework-specific) and are NOT
 * performed here. The caller passes the already-resolved `codeVerifier`.
 */
export interface CallbackContext {
	config: InternalConfig;
	client: DiscordClient;
	storage?: UserStorage;
	code: string;
	/** PKCE code_verifier already extracted from state/cookie by the caller. */
	codeVerifier?: string;
	/** Session ID (from session cookie) — reserved for future use. */
	sessionId?: string;
	/** User-Agent header value — reserved for future use. */
	userAgent?: string;
}

/**
 * Output of the shared OAuth2 callback handler.
 */
export interface CallbackResult {
	user: DiscordUser;
	tokens: DiscordTokenResponse;
	syncedPermissions: string[];
	/** Stored user after upsert + optional role sync; undefined when no storage configured. */
	storedUser?: StoredUser;
}

/**
 * Shared OAuth2 callback logic used by both the Elysia plugin and the
 * standalone handler. Performs:
 *  1. redirectUri validation
 *  2. Token exchange via `client.exchangeCode()`
 *  3. User fetch via `client.getUser()`
 *  4. MFA requirement check
 *  5. Storage upsert (create/update user)
 *  6. Guild role sync (if enabled + syncOnLogin + has scope)
 *
 * Does NOT perform: state validation, brute force checks, session token
 * creation, or cookie setting. Those remain in the framework-specific files.
 * On failure, throws — callers decide how to record/respond.
 */
export async function handleOAuthCallback(
	ctx: CallbackContext,
): Promise<CallbackResult> {
	const { config, client, storage, code, codeVerifier } = ctx;

	// 1. Require explicit redirectUri — no header-based auto-detection (security fix)
	if (!config.redirectUri) {
		throw new ConfigurationError(
			"redirectUri is required — set DISCORD_REDIRECT_URI env var or provide redirectUri in config",
		);
	}
	const redirectUri = config.redirectUri;

	// 2. Token exchange
	const tokens = await client.exchangeCode({
		clientId: config.clientId,
		clientSecret: config.clientSecret,
		code,
		redirectUri,
		codeVerifier: !config.disablePKCE ? codeVerifier : undefined,
	});

	// 3. User fetch
	const user = await client.getUser(tokens.access_token);

	// 4. MFA check
	if (config.mfa.enabled && config.mfa.requireMfa && !user.mfa_enabled) {
		throw new MfaRequiredError();
	}

	// 5. Storage upsert
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

	// 6. Guild role sync
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
		syncedPermissions = await guildSync.syncUserRoles(
			user.id,
			tokens.access_token,
		);

		if (storage && syncedPermissions.length > 0) {
			const storedUser = await storage.findByDiscordId(user.id);
			if (storedUser) {
				const mergedRoles = Array.from(
					new Set([...storedUser.roles, ...syncedPermissions]),
				);
				await storage.update(user.id, { roles: mergedRoles });
			}
		}
	}

	// Fetch the final stored user (post-sync) so callers can use roles
	const found = storage ? await storage.findByDiscordId(user.id) : null;
	const storedUser: StoredUser | undefined = found ?? undefined;

	return { user, tokens, syncedPermissions, storedUser };
}
