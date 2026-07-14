import type { Redis } from "ioredis";
import type { StateStore } from "../../core/state";

export interface RedisStateStoreOptions {
	/** Redis client instance (Redis or Cluster) */
	client: Redis;
	/** Key prefix for state entries (default: "auth:state") */
	prefix?: string;
}

/**
 * Redis-backed StateStore for CSRF state tokens.
 *
 * Uses Redis TTL (in seconds) for automatic expiration.
 * Key pattern: `{prefix}:{id}` e.g. `auth:state:uuid-here`
 */
export class RedisStateStore implements StateStore {
	private client: Redis;
	private prefix: string;

	constructor(options: RedisStateStoreOptions) {
		this.client = options.client;
		this.prefix = options.prefix ?? "auth:state";
	}

	private getKey(id: string): string {
		return `${this.prefix}:${id}`;
	}

	async has(id: string): Promise<boolean> {
		const key = this.getKey(id);
		const exists = await this.client.exists(key);
		return exists === 1;
	}

	async set(id: string, ttlMs: number): Promise<void> {
		const key = this.getKey(id);
		const ttlSeconds = Math.ceil(ttlMs / 1000);
		await this.client.set(key, "1", "EX", ttlSeconds);
	}

	async delete(id: string): Promise<void> {
		const key = this.getKey(id);
		await this.client.del(key);
	}
}