import type { MemoryCacheAdapter } from "../adapters/cache/memory";
import type { DiscordClient } from "../internal/client";
import type { GuildRoleSyncConfig } from "../types";

interface CachedGuildData {
	roles: string[];
	permissions: string[];
	expiresAt: number;
}

export class GuildRoleSync {
	private config: GuildRoleSyncConfig;
	private client: DiscordClient;
	private cache: MemoryCacheAdapter;
	private botTokenHash: string | null = null;

	constructor(
		config: GuildRoleSyncConfig,
		client: DiscordClient,
		cache: MemoryCacheAdapter,
	) {
		this.config = config;
		this.client = client;
		this.cache = cache;
	}

	private async getBotTokenHash(): Promise<string> {
		if (this.botTokenHash) return this.botTokenHash;
		const encoder = new TextEncoder();
		const data = encoder.encode(this.config.botToken);
		const hashBuffer = await crypto.subtle.digest("SHA-256", data);
		const hashArray = new Uint8Array(hashBuffer);
		let result = "";
		for (const byte of hashArray) {
			result += byte.toString(16).padStart(2, "0");
		}
		this.botTokenHash = result.slice(0, 16);
		return this.botTokenHash;
	}

	private async getCacheKey(userId: string): Promise<string> {
		const botTokenHash = await this.getBotTokenHash();
		return `guild:${this.config.guildId}:bot:${botTokenHash}:user:${userId}`;
	}

	async syncUserRoles(userId: string, _accessToken: string): Promise<string[]> {
		const cacheKey = await this.getCacheKey(userId);
		const cached = await this.cache.get(cacheKey);
		if (cached) {
			const cachedData = cached.value as CachedGuildData;
			if (cachedData.expiresAt > Date.now()) {
				return cachedData.permissions;
			}
		}

		const discordRoleIds = await this.client.getGuildMemberRoles(
			this.config.guildId,
			userId,
			this.config.botToken,
		);
		const permissions = this.getMappedPermissions(discordRoleIds);

		const cachedData: CachedGuildData = {
			roles: discordRoleIds,
			permissions,
			expiresAt: Date.now() + this.config.cacheTtlMs,
		};
		await this.cache.set(cacheKey, cachedData, this.config.cacheTtlMs);
		return permissions;
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
