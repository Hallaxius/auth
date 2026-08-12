import type { BruteForceStorage } from "../../src/types";
import type { RateLimitStorage } from "../../src/types";
import type { StateStore } from "../../src/internal/state";

export function createTestVerifyPassword(
	known: Map<string, string> = new Map(),
): (userId: string, password: string) => Promise<boolean> {
	return async (userId: string, password: string) =>
		known.get(userId) === password;
}

export class TestBruteForceStorage implements BruteForceStorage {
	private store = new Map<
		string,
		{ count: number; resetAt: number; blockedUntil?: number }
	>();

	async increment(key: string, windowMs: number): Promise<number> {
		const now = Date.now();
		const existing = this.store.get(key);
		if (!existing || now > existing.resetAt) {
			this.store.set(key, { count: 1, resetAt: now + windowMs });
			return 1;
		}
		existing.count++;
		return existing.count;
	}

	async isBlocked(key: string): Promise<boolean> {
		const existing = this.store.get(key);
		if (!existing) return false;
		if (existing.blockedUntil && Date.now() < existing.blockedUntil) {
			return true;
		}
		return false;
	}

	async reset(key: string): Promise<void> {
		this.store.delete(key);
	}

	async block(key: string, durationMs: number): Promise<void> {
		const existing = this.store.get(key);
		if (existing) {
			existing.blockedUntil = Date.now() + durationMs;
			this.store.set(key, existing);
		} else {
			this.store.set(key, {
				count: 0,
				resetAt: Date.now(),
				blockedUntil: Date.now() + durationMs,
			});
		}
	}

	async getCount(key: string): Promise<number> {
		const existing = this.store.get(key);
		if (!existing || Date.now() > existing.resetAt) return 0;
		return existing.count;
	}

	async getRemainingBlockTime?(key: string): Promise<number | undefined> {
		const existing = this.store.get(key);
		if (!existing?.blockedUntil) return undefined;
		const remaining = existing.blockedUntil - Date.now();
		return remaining > 0 ? remaining : undefined;
	}
}

export class TestRateLimitStorage implements RateLimitStorage {
	private store = new Map<string, { count: number; resetAt: number }>();

	async increment(
		key: string,
		windowMs: number,
	): Promise<{ count: number; resetAt: number }> {
		const now = Date.now();
		const entry = this.store.get(key);
		if (!entry || now >= entry.resetAt) {
			const resetAt = now + windowMs;
			const newEntry = { count: 1, resetAt };
			this.store.set(key, newEntry);
			return newEntry;
		}
		entry.count++;
		return entry;
	}

	async reset(key: string): Promise<void> {
		this.store.delete(key);
	}

	dispose(): void {
		this.store.clear();
	}
}

export class TestStateStore implements StateStore {
	private store = new Map<string, number>();
	public disposed: boolean = false;

	async has(id: string): Promise<boolean> {
		const expiresAt = this.store.get(id);
		if (!expiresAt) return false;
		if (Date.now() > expiresAt) {
			this.store.delete(id);
			return false;
		}
		return true;
	}

	async set(id: string, ttlMs: number): Promise<void> {
		this.store.set(id, Date.now() + ttlMs);
	}

	async setIfAbsent(id: string, ttlMs: number): Promise<boolean> {
		const expiresAt = this.store.get(id);
		if (expiresAt !== undefined) {
			if (Date.now() > expiresAt) {
				this.store.set(id, Date.now() + ttlMs);
				return true;
			}
			return false;
		}
		this.store.set(id, Date.now() + ttlMs);
		return true;
	}

	async delete(id: string): Promise<void> {
		this.store.delete(id);
	}

	dispose(): void {
		this.disposed = true;
		this.store.clear();
	}
}

