import type { CacheAdapter, CacheEntry } from "./memory";

export type InvalidationStrategy = "ttl" | "lru" | "lfu" | "fifo" | "adaptive";

export interface InvalidationConfig {
	strategy: InvalidationStrategy;
	maxSize: number;
	ttlMs?: number;
	adaptiveThreshold?: number;
}

export class CacheInvalidationManager {
	private strategy: InvalidationStrategy;
	private maxSize: number;
	private ttlMs?: number;
	private accessOrder: string[] = [];
	private accessCount: Map<string, number> = new Map();
	private insertionOrder: string[] = [];
	private adaptiveThreshold: number;
	private hitRateHistory: number[] = [];
	private currentStrategy: InvalidationStrategy = "lru";

	constructor(config: InvalidationConfig) {
		this.strategy = config.strategy;
		this.maxSize = config.maxSize;
		this.ttlMs = config.ttlMs;
		this.adaptiveThreshold = config.adaptiveThreshold ?? 0.7;

		if (config.strategy === "adaptive") {
			this.currentStrategy = "lru";
		}
	}

	async shouldInvalidate(
		cache: CacheAdapter,
		key: string,
		entry: CacheEntry | null,
	): Promise<boolean> {
		if (!entry) return false;

		if (this.ttlMs && Date.now() > entry.expiresAt) {
			return true;
		}

		if (this.accessOrder.length >= this.maxSize) {
			const victim = this.selectVictim();
			if (victim === key) {
				return true;
			}
		}

		return false;
	}

	recordAccess(key: string, hit: boolean): void {
		this.accessOrder = this.accessOrder.filter((k) => k !== key);
		this.accessOrder.push(key);

		const count = this.accessCount.get(key) ?? 0;
		this.accessCount.set(key, count + 1);

		if (!this.insertionOrder.includes(key)) {
			this.insertionOrder.push(key);
		}

		this.hitRateHistory.push(hit ? 1 : 0);
		if (this.hitRateHistory.length > 100) {
			this.hitRateHistory.shift();
		}

		if (this.strategy === "adaptive") {
			this.adaptStrategy();
		}
	}

	recordEviction(key: string): void {
		this.accessOrder = this.accessOrder.filter((k) => k !== key);
		this.accessCount.delete(key);
		this.insertionOrder = this.insertionOrder.filter((k) => k !== key);
	}

	private selectVictim(): string {
		switch (this.currentStrategy) {
			case "lru":
				return this.selectLruVictim();
			case "lfu":
				return this.selectLfuVictim();
			case "fifo":
				return this.selectFifoVictim();
			default:
				return this.selectLruVictim();
		}
	}

	private selectLruVictim(): string {
		if (this.accessOrder.length === 0) {
			return "";
		}
		return this.accessOrder[0];
	}

	private selectLfuVictim(): string {
		let minCount = Infinity;
		let victim = "";

		for (const [key, count] of this.accessCount.entries()) {
			if (count < minCount) {
				minCount = count;
				victim = key;
			}
		}

		return victim;
	}

	private selectFifoVictim(): string {
		if (this.insertionOrder.length === 0) {
			return "";
		}
		return this.insertionOrder[0];
	}

	private adaptStrategy(): void {
		if (this.hitRateHistory.length < 50) return;

		const recentHitRate =
			this.hitRateHistory.slice(-20).reduce((a, b) => a + b, 0) / 20;
		const overallHitRate =
			this.hitRateHistory.reduce((a, b) => a + b, 0) /
			this.hitRateHistory.length;

		if (recentHitRate < this.adaptiveThreshold) {
			if (overallHitRate < 0.5) {
				this.currentStrategy = "lfu";
			} else if (this.accessOrder.length > this.maxSize * 0.8) {
				this.currentStrategy = "lru";
			} else {
				this.currentStrategy = "fifo";
			}
		} else {
			this.currentStrategy = "lru";
		}
	}

	getVictim(): string {
		return this.selectVictim();
	}

	getStats(): {
		strategy: InvalidationStrategy;
		currentStrategy: InvalidationStrategy;
		maxSize: number;
		currentSize: number;
		hitRateHistory: number;
	} {
		const avgHitRate =
			this.hitRateHistory.length > 0
				? this.hitRateHistory.reduce((a, b) => a + b, 0) /
					this.hitRateHistory.length
				: 0;

		return {
			strategy: this.strategy,
			currentStrategy: this.currentStrategy,
			maxSize: this.maxSize,
			currentSize: this.accessOrder.length,
			hitRateHistory: avgHitRate,
		};
	}

	reset(): void {
		this.accessOrder = [];
		this.accessCount.clear();
		this.insertionOrder = [];
		this.hitRateHistory = [];
		this.currentStrategy = "lru";
	}
}

export interface StaleWhileRevalidateConfig {
	staleWindowMs: number;
	revalidateThresholdMs: number;
	backgroundRefresh: boolean;
	maxPendingRevalidates: number;
}

export class StaleWhileRevalidateManager {
	private config: StaleWhileRevalidateConfig;
	private pendingRevalidates: Map<string, Promise<unknown>> = new Map();
	private lastRevalidate: Map<string, number> = new Map();
	private revalidateCallbacks: Map<
		string,
		() => Promise<unknown>
	> = new Map();

	constructor(config?: Partial<StaleWhileRevalidateConfig>) {
		this.config = {
			staleWindowMs: config?.staleWindowMs ?? 5_000,
			revalidateThresholdMs: config?.revalidateThresholdMs ?? 1_000,
			backgroundRefresh: config?.backgroundRefresh ?? true,
			maxPendingRevalidates: config?.maxPendingRevalidates ?? 100,
		};
	}

	isStale(entry: CacheEntry): boolean {
		const staleThreshold = entry.expiresAt - this.config.staleWindowMs;
		return Date.now() > staleThreshold;
	}

	shouldRevalidate(key: string, entry: CacheEntry): boolean {
		const lastRevalidate = this.lastRevalidate.get(key) ?? 0;
		const now = Date.now();

		if (now - lastRevalidate < this.config.revalidateThresholdMs) {
			return false;
		}

		if (this.pendingRevalidates.size >= this.config.maxPendingRevalidates) {
			return false;
		}

		return this.isStale(entry);
	}

	async scheduleRevalidate(
		key: string,
		revalidateFn: () => Promise<unknown>,
	): Promise<void> {
		if (this.pendingRevalidates.has(key)) {
			return;
		}

		if (this.pendingRevalidates.size >= this.config.maxPendingRevalidates) {
			return;
		}

		const revalidate = async () => {
			try {
				await revalidateFn();
				this.lastRevalidate.set(key, Date.now());
			} catch {
			} finally {
				this.pendingRevalidates.delete(key);
			}
		};

		this.pendingRevalidates.set(key, revalidate());

		if (!this.config.backgroundRefresh) {
			await revalidate();
		}
	}

	cancelRevalidate(key: string): void {
		this.pendingRevalidates.delete(key);
		this.revalidateCallbacks.delete(key);
	}

	getPendingCount(): number {
		return this.pendingRevalidates.size;
	}

	getStats(): {
		pendingRevalidates: number;
		maxPending: number;
		backgroundRefresh: boolean;
	} {
		return {
			pendingRevalidates: this.pendingRevalidates.size,
			maxPending: this.config.maxPendingRevalidates,
			backgroundRefresh: this.config.backgroundRefresh,
		};
	}
}