import type { RateLimitStorage } from "../../types";
import { LruCache } from "../../utils/lru";

export class InMemoryRateLimitStorage implements RateLimitStorage {
	private store = new LruCache<string, { count: number; resetAt: number }>(
		50_000,
	);

	async increment(
		key: string,
		windowMs: number,
	): Promise<{ count: number; resetAt: number }> {
		const now = Date.now();
		const entry = this.store.get(key);

		if (!entry || now >= entry.resetAt) {
			const resetAt = now + windowMs;
			const newEntry = { count: 1, resetAt };
			this.store.set(key, newEntry, windowMs);
			return newEntry;
		}

		entry.count++;
		return { count: entry.count, resetAt: entry.resetAt };
	}

	async reset(key: string): Promise<void> {
		this.store.delete(key);
	}

	dispose(): void {
		this.store.dispose();
	}
}
