import { DiscordClient } from "../core/client";
import {
	ConfigurationError,
	GuildJoinError,
	StorageError,
} from "../core/errors";
import type {
	DiscordAuthConfig,
	DiscordUser,
	UserStorage,
} from "../core/types";

/**
 * Generates a cryptographically secure random secret for JWT or state signing
 * Uses Web Crypto API for edge compatibility
 */
export function generateSecureSecret(length: number = 32): string {
	const array = new Uint8Array(length);
	crypto.getRandomValues(array);
	return btoa(String.fromCharCode(...Array.from(array)))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

/**
 * Validates DiscordAuthConfig for common configuration errors
 * Throws ConfigurationError with helpful messages
 */
export function validateConfig(config: DiscordAuthConfig): void {
	if (!config.clientId) {
		throw new ConfigurationError(
			"Missing required configuration: 'clientId' is required. Get it from https://discord.com/developers/applications",
		);
	}

	if (!config.clientSecret) {
		throw new ConfigurationError(
			"Missing required configuration: 'clientSecret' is required. Get it from https://discord.com/developers/applications",
		);
	}

	if (!config.session?.secret) {
		throw new ConfigurationError(
			"Missing required configuration: 'session.secret' is required. Generate a strong secret (min 32 chars): crypto.randomUUID() + crypto.randomUUID()",
		);
	}

	if (config.session?.secret?.length < 32) {
		throw new ConfigurationError(
			"session.secret must be at least 32 characters long for security",
		);
	}

	if (config.scopes && config.scopes.length === 0) {
		throw new ConfigurationError("scopes array must not be empty if provided");
	}

	if (config.redirectUri && typeof config.redirectUri !== "string") {
		throw new ConfigurationError("redirectUri must be a string");
	}

	if (config.meRoute && typeof config.meRoute !== "string") {
		throw new ConfigurationError("meRoute must be a string");
	}

	if (config.prompt && !["consent", "none"].includes(config.prompt)) {
		throw new ConfigurationError("prompt must be either 'consent' or 'none'");
	}

	if (
		config.session?.type &&
		!["jwt", "server"].includes(config.session.type)
	) {
		throw new ConfigurationError(
			"session.type must be either 'jwt' or 'server'",
		);
	}

	if (
		config.session?.sameSite &&
		!["lax", "strict", "none"].includes(config.session.sameSite)
	) {
		throw new ConfigurationError(
			"session.sameSite must be one of: 'lax', 'strict', 'none'",
		);
	}
}

/**
 * Checks if a Discord user has a specific role in a guild
 * Requires bot token with appropriate permissions
 */
export async function hasRoleInGuild(
	userId: string,
	guildId: string,
	roleId: string,
	botToken: string,
	clientId: string,
	clientSecret: string,
): Promise<boolean> {
	const client = new DiscordClient(clientId, clientSecret);

	try {
		const member = await client.getGuildMember(guildId, userId, botToken);
		return member.roles.includes(roleId);
	} catch {
		return false;
	}
}

/**
 * Checks if a Discord user has any of the specified roles in a guild
 * Requires bot token with appropriate permissions
 */
export async function hasAnyRoleInGuild(
	userId: string,
	guildId: string,
	roleIds: string[],
	botToken: string,
	clientId: string,
	clientSecret: string,
): Promise<boolean> {
	const client = new DiscordClient(clientId, clientSecret);

	try {
		const member = await client.getGuildMember(guildId, userId, botToken);
		return roleIds.some((roleId) => member.roles.includes(roleId));
	} catch {
		return false;
	}
}

/**
 * Revokes a user's session and tokens from storage
 * Also revokes the Discord token if configured
 */
export async function revokeUserSession(
	discordId: string,
	storage: UserStorage,
	clientId: string,
	clientSecret: string,
): Promise<void> {
	const client = new DiscordClient(clientId, clientSecret);

	try {
		const user = await storage.findByDiscordId(discordId);

		if (user) {
			await storage.delete(discordId);

			try {
				await client.revokeToken({
					clientId,
					clientSecret,
					accessToken: user.accessToken,
				});
			} catch (revokeError) {
				console.warn(
					`Failed to revoke Discord token for user ${discordId}:`,
					revokeError,
				);
			}
		}
	} catch (error) {
		throw new StorageError(`Failed to revoke user session: ${error}`);
	}
}

/**
 * Synchronizes user roles from Discord to your storage
 * Useful for keeping roles up-to-date when they change in Discord
 */
export async function syncUserRoles(
	discordId: string,
	guildId: string,
	botToken: string,
	storage: UserStorage,
	clientId: string,
	clientSecret: string,
): Promise<string[]> {
	const client = new DiscordClient(clientId, clientSecret);

	try {
		const user = await storage.findByDiscordId(discordId);

		if (!user) {
			throw new StorageError(`User with discordId ${discordId} not found`);
		}

		const member = await client.getGuildMember(guildId, discordId, botToken);

		const updatedUser = await storage.update(discordId, {
			roles: member.roles,
		});

		return updatedUser.roles;
	} catch (error) {
		throw new StorageError(`Failed to sync user roles: ${error}`);
	}
}

/**
 * Automatically adds a user to a Discord guild after authentication
 * Requires guilds.join scope and bot token
 */
export async function autoJoinGuild(params: {
	guildId: string;
	userId: string;
	accessToken: string;
	botToken: string;
	nick?: string;
	roles?: string[];
	clientId: string;
	clientSecret: string;
}): Promise<void> {
	const client = new DiscordClient(params.clientId, params.clientSecret);

	try {
		await client.addMember({
			guildId: params.guildId,
			userId: params.userId,
			accessToken: params.accessToken,
			botToken: params.botToken,
			nick: params.nick,
			roles: params.roles,
		});
	} catch (error) {
		throw new GuildJoinError(
			`Failed to add user ${params.userId} to guild ${params.guildId}: ${error}`,
		);
	}
}

/**
 * Gets a Discord guild member's information
 * Note: This requires the bot to be in the guild and have appropriate permissions
 */
export interface GuildMember {
	user: DiscordUser;
	nick: string | null;
	roles: string[];
	joinedAt: string;
	premiumSince: string | null;
	deaf: boolean;
	mute: boolean;
	pending: boolean;
}

/**
 * Checks if a user is in a specific guild
 */
export async function isUserInGuild(
	userId: string,
	guildId: string,
	botToken: string,
	clientId: string,
	clientSecret: string,
): Promise<boolean> {
	const client = new DiscordClient(clientId, clientSecret);

	try {
		await client.getGuildMember(guildId, userId, botToken);
		return true;
	} catch {
		return false;
	}
}
