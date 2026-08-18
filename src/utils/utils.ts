import { AuthError, ErrorCodes } from "../errors";
import { DiscordClient } from "../internal/client";
import type { UserStorage } from "../types";
import { secret as secretFn } from "./env";
import { createSecurityLogger } from "./logger";
import { validateConfig } from "./validation";

const logger = createSecurityLogger("utils");

export { secretFn as secret, validateConfig, validateConfig as validate };

export async function hasRole(
	userId: string,
	guildId: string,
	roleId: string,
	botToken: string,
	clientId: string,
	clientSecret: string,
): Promise<boolean> {
	const client = new DiscordClient({ clientId, clientSecret });

	try {
		const member = await client.getGuildMember(guildId, userId, botToken);
		return member.roles.includes(roleId);
	} catch {
		return false;
	}
}

export async function hasAnyRole(
	userId: string,
	guildId: string,
	roleIds: string[],
	botToken: string,
	clientId: string,
	clientSecret: string,
): Promise<boolean> {
	const client = new DiscordClient({ clientId, clientSecret });

	try {
		const member = await client.getGuildMember(guildId, userId, botToken);
		return roleIds.some((roleId) => member.roles.includes(roleId));
	} catch {
		return false;
	}
}

export async function hasMember(
	userId: string,
	guildId: string,
	botToken: string,
	clientId: string,
	clientSecret: string,
): Promise<boolean> {
	const client = new DiscordClient({ clientId, clientSecret });

	try {
		await client.getGuildMember(guildId, userId, botToken);
		return true;
	} catch {
		return false;
	}
}

export async function sync(
	discordId: string,
	guildId: string,
	botToken: string,
	storage: UserStorage,
	clientId: string,
	clientSecret: string,
): Promise<string[]> {
	const client = new DiscordClient({ clientId, clientSecret });

	try {
		const user = await storage.findByDiscordId(discordId);

		if (!user) {
			throw new AuthError(
				ErrorCodes.STORAGE_READ_ERROR,
				`User with discordId ${discordId} not found`,
			);
		}

		const member = await client.getGuildMember(guildId, discordId, botToken);

		const updatedUser = await storage.update(discordId, {
			roles: member.roles,
		});

		return updatedUser.roles;
	} catch (error) {
		throw new AuthError(
			ErrorCodes.STORAGE_WRITE_ERROR,
			`Failed to sync user roles: ${error}`,
		);
	}
}

export async function join(params: {
	guildId: string;
	userId: string;
	accessToken: string;
	botToken: string;
	nick?: string;
	roles?: string[];
	clientId: string;
	clientSecret: string;
}): Promise<void> {
	const client = new DiscordClient({
		clientId: params.clientId,
		clientSecret: params.clientSecret,
	});

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
		throw new AuthError(
			ErrorCodes.GUILD_JOIN_ERROR,
			`Failed to add user ${params.userId} to guild ${params.guildId}: ${error}`,
		);
	}
}

export async function revoke(
	discordId: string,
	storage: UserStorage,
	clientId: string,
	clientSecret: string,
): Promise<void> {
	const client = new DiscordClient({ clientId, clientSecret });

	try {
		const user = await storage.findByDiscordId(discordId);

		if (user) {
			try {
				await client.revokeToken({
					clientId,
					clientSecret,
					accessToken: user.accessToken,
				});
			} catch (revokeError) {
				logger.warn("Failed to revoke Discord token for user", {
					discordId,
					error:
						revokeError instanceof Error
							? revokeError.message
							: String(revokeError),
				});
			}

			await storage.delete(discordId);
		}
	} catch (error) {
		throw new AuthError(
			ErrorCodes.STORAGE_WRITE_ERROR,
			`Failed to revoke user session: ${error}`,
		);
	}
}
