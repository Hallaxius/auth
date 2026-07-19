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
	private sweepTimer: ReturnType<typeof setInterval> | null = null;

	constructor(sweepIntervalMs = 60_000) {
		if (typeof setInterval === "function") {
			this.sweepTimer = setInterval(() => this.sweepExpired(), sweepIntervalMs);
			if (this.sweepTimer && typeof this.sweepTimer.unref === "function") {
				this.sweepTimer.unref();
			}
		}
	}

	private sweepExpired(): void {
		const now = Date.now();
		for (const [key, entry] of this.store) {
			if (entry.expiresAt <= now) this.store.delete(key);
		}
	}

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

	dispose(): void {
		if (this.sweepTimer && typeof clearInterval === "function") {
			clearInterval(this.sweepTimer);
			this.sweepTimer = null;
		}
	}
}
