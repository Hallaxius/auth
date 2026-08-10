import type { DiscordClient } from "../internal/client";
import type { GuildRoleSyncConfig } from "../types";

export class GuildRoleSync {
	private config: GuildRoleSyncConfig;
	private client: DiscordClient;

	constructor(config: GuildRoleSyncConfig, client: DiscordClient) {
		this.config = config;
		this.client = client;
	}

	async syncUserRoles(userId: string, _accessToken: string): Promise<string[]> {
		const discordRoleIds = await this.client.getGuildMemberRoles(
			this.config.guildId,
			userId,
			this.config.botToken,
		);
		return this.getMappedPermissions(discordRoleIds);
	}

	getMappedPermissions(discordRoleIds: string[]): string[] {
		const permissions = new Set<string>();
		for (const roleId of discordRoleIds) {
			const mapped = this.config.roleMap[roleId];
			if (mapped) {
				for (const perm of mapped) {
					permissions.add(perm);
				}
			}
		}
		return Array.from(permissions);
	}

	async hasRole(userId: string, roleId: string): Promise<boolean> {
		const permissions = await this.syncUserRoles(userId, "");
		return permissions.includes(roleId);
	}

	async hasAnyRole(userId: string, roleIds: string[]): Promise<boolean> {
		const permissions = await this.syncUserRoles(userId, "");
		return roleIds.some((roleId) => permissions.includes(roleId));
	}

	async hasMember(userId: string): Promise<boolean> {
		try {
			await this.client.getGuildMember(
				this.config.guildId,
				userId,
				this.config.botToken,
			);
			return true;
		} catch {
			return false;
		}
	}

	async join(
		userId: string,
		accessToken: string,
		options?: { nick?: string; roles?: string[] },
	): Promise<void> {
		await this.client.addMember({
			guildId: this.config.guildId,
			userId,
			accessToken,
			botToken: this.config.botToken,
			nick: options?.nick,
			roles: options?.roles,
		});
	}

	async revoke(userId: string): Promise<void> {
		await this.client.removeMember({
			guildId: this.config.guildId,
			userId,
			botToken: this.config.botToken,
		});
	}
}
