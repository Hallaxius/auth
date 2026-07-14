import type { CacheAdapter } from "../adapters/cache";
import type { DiscordClient } from "./client";
import type { GuildRoleSyncConfig } from "./types";

export interface CachedGuildData {
	roles: string[];
	permissions: string[];
	expiresAt: number;
}

export class GuildRoleSync {
	private config: GuildRoleSyncConfig;
	private client: DiscordClient;
	private cache: CacheAdapter;

	constructor(
		config: GuildRoleSyncConfig,
		client: DiscordClient,
		cache: CacheAdapter,
	) {
		this.config = config;
		this.client = client;
		this.cache = cache;
	}

	private getCacheKey(userId: string): string {
		return `guild:${this.config.guildId}:user:${userId}`;
	}

	async syncUserRoles(userId: string, accessToken: string): Promise<string[]> {
		const cacheKey = this.getCacheKey(userId);

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

		const permissions = await this.getMappedPermissions(discordRoleIds);

		const cachedData: CachedGuildData = {
			roles: discordRoleIds,
			permissions,
			expiresAt: Date.now() + this.config.cacheTtlMs,
		};

		await this.cache.set(cacheKey, cachedData, this.config.cacheTtlMs);

		return permissions;
	}

	async getMappedPermissions(discordRoleIds: string[]): Promise<string[]> {
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

	async diffAndUpdate(
		oldRoles: string[],
		newRoles: string[],
	): Promise<{ added: string[]; removed: string[] }> {
		const oldSet = new Set(oldRoles);
		const newSet = new Set(newRoles);

		const added = newRoles.filter((r) => !oldSet.has(r));
		const removed = oldRoles.filter((r) => !newSet.has(r));

		return { added, removed };
	}

	async getCachedData(userId: string): Promise<CachedGuildData | null> {
		const cacheKey = this.getCacheKey(userId);
		const cached = await this.cache.get(cacheKey);
		if (!cached) return null;

		const data = cached.value as CachedGuildData;
		if (data.expiresAt <= Date.now()) {
			await this.cache.delete(cacheKey);
			return null;
		}

		return data;
	}

	async invalidateCache(userId: string): Promise<void> {
		const cacheKey = this.getCacheKey(userId);
		await this.cache.delete(cacheKey);
	}
}