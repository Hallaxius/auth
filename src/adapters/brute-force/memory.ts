import type { BruteForceStorage } from "../../core/types";

interface BruteForceEntry {
	count: number;
	windowStart: number;
	blockedUntil?: number;
}

export class MemoryBruteForceStorage implements BruteForceStorage {
	private store = new Map<string, BruteForceEntry>();
	private cleanupInterval: ReturnType<typeof setInterval> | null = null;

	constructor() {
		this.startCleanup();
	}

	private startCleanup(): void {
		this.cleanupInterval = setInterval(() => {
			this.cleanup();
		}, 60 * 1000);
	}

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

	stopCleanup(): void {
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval);
			this.cleanupInterval = null;
		}
	}
}
