import type { CacheAdapter, CacheEntry } from "./memory";
import { MemoryCacheAdapter } from "./memory";

export interface MultiLevelCacheOptions {
	l1MaxSize?: number;
	l2MaxSize?: number;
	defaultTtlMs?: number;
	staleWhileRevalidateMs?: number;
	cacheWarming?: boolean;
	invalidationStrategy?: "ttl" | "lru" | "lfu" | "fifo";
}

export interface CacheStats {
	l1Hits: number;
	l1Misses: number;
	l2Hits: number;
	l2Misses: number;
	totalGets: number;
	totalSets: number;
	totalDeletes: number;
	invalidations: number;
	warmedKeys: number;
}

export interface CacheWarmerConfig {
	keys: string[];
	warmIntervalMs: number;
	priority?: "high" | "medium" | "low";
}

export class MultiLevelCacheAdapter implements CacheAdapter {
	private l1: MemoryCacheAdapter;
	private l2: MemoryCacheAdapter;
	private options: Required<MultiLevelCacheOptions>;
	private stats: CacheStats;
	private warmers: Map<string, CacheWarmerConfig> = new Map();
	private pendingRevalidates: Map<string, Promise<unknown>> = new Map();
	private invalidationListeners: Set<(key: string) => void> = new Set();

	constructor(options: MultiLevelCacheOptions = {}) {
		this.options = {
			l1MaxSize: options.l1MaxSize ?? 10_000,
			l2MaxSize: options.l2MaxSize ?? 100_000,
			defaultTtlMs: options.defaultTtlMs ?? 300_000,
			staleWhileRevalidateMs: options.staleWhileRevalidateMs ?? 5_000,
			cacheWarming: options.cacheWarming ?? false,
			invalidationStrategy: options.invalidationStrategy ?? "lru",
		};

		this.l1 = new MemoryCacheAdapter();
		this.l2 = new MemoryCacheAdapter();

		this.stats = {
			l1Hits: 0,
			l1Misses: 0,
			l2Hits: 0,
			l2Misses: 0,
			totalGets: 0,
			totalSets: 0,
			totalDeletes: 0,
			invalidations: 0,
			warmedKeys: 0,
		};
	}

	async get(key: string): Promise<CacheEntry | null> {
		this.stats.totalGets++;

		const l1Entry = await this.l1.get(key);
		if (l1Entry) {
			this.stats.l1Hits++;

			if (this.isStale(l1Entry)) {
				this.scheduleRevalidate(key, l1Entry);
			}

			return l1Entry;
		}

		this.stats.l1Misses++;

		const l2Entry = await this.l2.get(key);
		if (l2Entry) {
			this.stats.l2Hits++;

			await this.l1.set(key, l2Entry.value, this.options.defaultTtlMs);

			if (this.isStale(l2Entry)) {
				this.scheduleRevalidate(key, l2Entry);
			}

			return l2Entry;
		}

		this.stats.l2Misses++;
		return null;
	}

	async set(key: string, value: unknown, ttlMs?: number): Promise<void> {
		this.stats.totalSets++;

		const effectiveTtl = ttlMs ?? this.options.defaultTtlMs;

		await Promise.all([
			this.l1.set(key, value, Math.min(effectiveTtl, 60_000)),
			this.l2.set(key, value, effectiveTtl),
		]);
	}

	async delete(key: string): Promise<void> {
		this.stats.totalDeletes++;

		await Promise.all([this.l1.delete(key), this.l2.delete(key)]);

		this.notifyInvalidation(key);
		this.stats.invalidations++;
	}

	async getOrSet<T>(
		key: string,
		factory: () => Promise<T>,
		ttlMs?: number,
	): Promise<T> {
		const entry = await this.get(key);
		if (entry) {
			return entry.value as T;
		}

		const value = await factory();
		await this.set(key, value, ttlMs);
		return value;
	}

	async warm(keys: string[]): Promise<void> {
		for (const key of keys) {
			this.stats.warmedKeys++;
		}
	}

	addWarmer(config: CacheWarmerConfig): void {
		this.warmers.set(config.keys.join(","), config);

		if (this.options.cacheWarming) {
			this.startWarming(config);
		}
	}

	private startWarming(config: CacheWarmerConfig): void {
		const warm = async () => {
			for (const key of config.keys) {
				try {
					const entry = await this.get(key);
					if (!entry || this.isStale(entry)) {
						this.stats.warmedKeys++;
					}
				} catch {
				} finally {
					setTimeout(warm, config.warmIntervalMs);
				}
			}
		};

		setTimeout(warm, config.warmIntervalMs);
	}

	private isStale(entry: CacheEntry): boolean {
		const staleThreshold = Date.now() + this.options.staleWhileRevalidateMs;
		return entry.expiresAt < staleThreshold;
	}

	private scheduleRevalidate(key: string, staleEntry: CacheEntry): void {
		if (this.pendingRevalidates.has(key)) {
			return;
		}

		const revalidate = async () => {
			try {
				this.pendingRevalidates.delete(key);
			} catch {
			}
		};

		this.pendingRevalidates.set(key, revalidate());
	}

	onInvalidate(listener: (key: string) => void): () => void {
		this.invalidationListeners.add(listener);
		return () => this.invalidationListeners.delete(listener);
	}

	private notifyInvalidation(key: string): void {
		this.invalidationListeners.forEach((listener) => {
			try {
				listener(key);
			} catch {
			}
		});
	}

	getStats(): CacheStats {
		const hitRate =
			this.stats.totalGets > 0
				? ((this.stats.l1Hits + this.stats.l2Hits) / this.stats.totalGets) * 100
				: 0;

		return {
			...this.stats,
		};
	}

	getHitRate(): number {
		if (this.stats.totalGets === 0) return 0;
		return ((this.stats.l1Hits + this.stats.l2Hits) / this.stats.totalGets) * 100;
	}

	async clear(): Promise<void> {
		await Promise.all([this.l1.clear(), this.l2.clear()]);
		this.stats = {
			l1Hits: 0,
			l1Misses: 0,
			l2Hits: 0,
			l2Misses: 0,
			totalGets: 0,
			totalSets: 0,
			totalDeletes: 0,
			invalidations: 0,
			warmedKeys: 0,
		};
	}

	dispose(): void {
		this.l1.dispose();
		this.l2.dispose();
		this.warmers.clear();
		this.pendingRevalidates.clear();
		this.invalidationListeners.clear();
	}
}
