export interface CacheAdapter {
	get(key: string): Promise<CacheEntry | null>;
	set(key: string, value: unknown, ttlMs: number): Promise<void>;
	delete(key: string): Promise<void>;
}

export interface CacheEntry {
	value: unknown;
	expiresAt: number;
}

export class MemoryCacheAdapter implements CacheAdapter {
	private store = new Map<string, CacheEntry>();

	async get(key: string): Promise<CacheEntry | null> {
		const entry = this.store.get(key);
		if (!entry) return null;

		if (Date.now() > entry.expiresAt) {
			this.store.delete(key);
			return null;
		}

		return entry;
	}

	async set(key: string, value: unknown, ttlMs: number): Promise<void> {
		const expiresAt = Date.now() + ttlMs;
		this.store.set(key, { value, expiresAt });
	}

	async delete(key: string): Promise<void> {
		this.store.delete(key);
	}
}