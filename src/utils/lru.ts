interface LruEntry<V> {
	value: V;
	expiresAt: number;
}

export class LruCache<K, V> {
	private cache = new Map<K, LruEntry<V>>();
	private readonly maxEntries: number;
	private readonly sweepIntervalMs: number;
	private sweepTimer: ReturnType<typeof setTimeout> | null = null;
	private disposed = false;

	constructor(maxEntries: number, sweepIntervalMs = 60_000) {
		this.maxEntries = maxEntries;
		this.sweepIntervalMs = sweepIntervalMs;
		this.scheduleSweep();
	}

	private scheduleSweep(): void {
		if (this.disposed) return;
		this.sweepTimer = setTimeout(() => {
			this.sweepExpired();
			this.scheduleSweep();
		}, this.sweepIntervalMs);
		if (this.sweepTimer && typeof this.sweepTimer.unref === "function") {
			this.sweepTimer.unref();
		}
	}

	private sweepExpired(): void {
		const now = Date.now();
		for (const [key, entry] of this.cache) {
			if (entry.expiresAt <= now) this.cache.delete(key);
		}
	}

	private evictIfNeeded(): void {
		while (this.cache.size >= this.maxEntries) {
			const firstKey = this.cache.keys().next().value;
			if (firstKey !== undefined) {
				this.cache.delete(firstKey);
			} else {
				break;
			}
		}
	}

	has(key: K): boolean {
		const entry = this.cache.get(key);
		if (!entry) return false;
		if (Date.now() > entry.expiresAt) {
			this.cache.delete(key);
			return false;
		}
		return true;
	}

	get(key: K): V | undefined {
		const entry = this.cache.get(key);
		if (!entry) return undefined;
		if (Date.now() > entry.expiresAt) {
			this.cache.delete(key);
			return undefined;
		}
		return entry.value;
	}

	set(key: K, value: V, ttlMs: number): void {
		this.evictIfNeeded();
		this.cache.set(key, { value, expiresAt: Date.now() + ttlMs });
	}

	delete(key: K): void {
		this.cache.delete(key);
	}

	size(): number {
		return this.cache.size;
	}

	clear(): void {
		this.cache.clear();
	}

	dispose(): void {
		this.disposed = true;
		if (this.sweepTimer && typeof clearTimeout === "function") {
			clearTimeout(this.sweepTimer);
			this.sweepTimer = null;
		}
	}
}
