import type { BruteForceStorage } from "../../core/types";

interface BruteForceEntry {
	count: number;
	windowStart: number;
	blockedUntil?: number;
}

/**
 * In-memory brute force storage with lazy cleanup.
 *
 * Edge-runtime compatible: no `setInterval` / `setTimeout` timers.
 * Expired entries are purged on every access (increment, isBlocked, getCount)
 * via {@link MemoryBruteForceStorage#cleanup}, so the Map never grows unbounded
 * as long as the store is being queried.
 */
export class MemoryBruteForceStorage implements BruteForceStorage {
	private store = new Map<string, BruteForceEntry>();

	/**
	 * Remove expired entries from the store.
	 *
	 * An entry is expired when:
	 *  - it was blocked and the block window has elapsed (`blockedUntil < now`), or
	 *  - it was never blocked and the 24h tracking window has elapsed.
	 *
	 * Called lazily on every public read/write method so no background timer is
	 * required — safe for Cloudflare Workers, Deno, Vercel Edge, etc.
	 */
	private cleanup(): void {
		const now = Date.now();
		for (const [key, entry] of this.store.entries()) {
			if (entry.blockedUntil && entry.blockedUntil < now) {
				this.store.delete(key);
			} else if (
				!entry.blockedUntil &&
				entry.windowStart + 24 * 60 * 60 * 1000 < now
			) {
				this.store.delete(key);
			}
		}
	}

	async increment(key: string, windowMs: number): Promise<number> {
		this.cleanup();
		const now = Date.now();
		const entry = this.store.get(key);

		if (entry?.blockedUntil && entry.blockedUntil > now) {
			return entry.count;
		}

		if (!entry || now - entry.windowStart > windowMs) {
			this.store.set(key, { count: 1, windowStart: now });
			return 1;
		}

		entry.count += 1;
		this.store.set(key, entry);
		return entry.count;
	}

	async isBlocked(key: string): Promise<boolean> {
		this.cleanup();
		const entry = this.store.get(key);
		if (!entry?.blockedUntil) return false;

		const now = Date.now();
		if (entry.blockedUntil < now) {
			this.store.delete(key);
			return false;
		}

		return true;
	}

	async reset(key: string): Promise<void> {
		this.store.delete(key);
	}

	async block(key: string, durationMs: number): Promise<void> {
		const now = Date.now();
		const entry = this.store.get(key);
		if (entry) {
			entry.blockedUntil = now + durationMs;
			this.store.set(key, entry);
		} else {
			this.store.set(key, {
				count: 1,
				windowStart: now,
				blockedUntil: now + durationMs,
			});
		}
	}

	async getCount(key: string): Promise<number> {
		this.cleanup();
		const entry = this.store.get(key);
		if (!entry) return 0;
		const now = Date.now();
		if (entry.blockedUntil && entry.blockedUntil > now) {
			return entry.count;
		}
		if (now - entry.windowStart > 24 * 60 * 60 * 1000) {
			return 0;
		}
		return entry.count;
	}

	/**
	 * No-op kept for API compatibility with previous versions that used a
	 * `setInterval` timer. There is no timer to clear anymore — cleanup is
	 * lazy and triggered by access — so this method intentionally does nothing.
	 */
	stopCleanup(): void {
		// intentionally empty — no background timer to clear
	}
}
