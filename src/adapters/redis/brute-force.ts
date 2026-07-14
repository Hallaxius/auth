import type { Redis } from "ioredis";
import type { BruteForceStorage } from "../../core/types";

export interface RedisBruteForceStoreOptions {
	/** Redis client instance (Redis or Cluster) */
	client: Redis;
	/** Key prefix for brute force entries (default: "auth:bf") */
	prefix?: string;
}

/**
 * Redis-backed BruteForceStorage for rate limiting.
 *
 * Uses Redis TTL (in seconds) for automatic expiration.
 * Key patterns:
 * - `{prefix}:count:{key}` — attempt count with TTL
 * - `{prefix}:block:{key}` — block flag with TTL
 */
export class RedisBruteForceStore implements BruteForceStorage {
	private client: Redis;
	private prefix: string;

	constructor(options: RedisBruteForceStoreOptions) {
		this.client = options.client;
		this.prefix = options.prefix ?? "auth:bf";
	}

	private getCountKey(key: string): string {
		return `${this.prefix}:count:${key}`;
	}

	private getBlockKey(key: string): string {
		return `${this.prefix}:block:${key}`;
	}

	async increment(key: string, windowMs: number): Promise<number> {
		const countKey = this.getCountKey(key);
		const windowSeconds = Math.ceil(windowMs / 1000);

		// Increment count with TTL
		const newCount = await this.client.incr(countKey);
		if (newCount === 1) {
			// First attempt, set TTL
			await this.client.expire(countKey, windowSeconds);
		}

		return newCount;
	}

	async isBlocked(key: string): Promise<boolean> {
		const blockKey = this.getBlockKey(key);
		const exists = await this.client.exists(blockKey);
		return exists === 1;
	}

	async reset(key: string): Promise<void> {
		const countKey = this.getCountKey(key);
		const blockKey = this.getBlockKey(key);
		await this.client.del([countKey, blockKey]);
	}

	async block(key: string, durationMs: number): Promise<void> {
		const blockKey = this.getBlockKey(key);
		const durationSeconds = Math.ceil(durationMs / 1000);
		await this.client.set(blockKey, "1", "EX", durationSeconds);
	}

	async getCount(key: string): Promise<number> {
		const countKey = this.getCountKey(key);
		const count = await this.client.get(countKey);
		return count ? parseInt(count, 10) : 0;
	}
}