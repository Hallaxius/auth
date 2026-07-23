import { describe, it, expect, beforeEach } from "bun:test";
import { MultiLevelCacheAdapter } from "../multi-level";

describe("MultiLevelCacheAdapter", () => {
	let cache: MultiLevelCacheAdapter;

	beforeEach(() => {
		cache = new MultiLevelCacheAdapter({
			l1MaxSize: 100,
			l2MaxSize: 1000,
			defaultTtlMs: 5000,
			staleWhileRevalidateMs: 1000,
		});
	});

	it("should get null for non-existent key", async () => {
		const result = await cache.get("nonexistent");
		expect(result).toBeNull();
	});

	it("should set and get value", async () => {
		await cache.set("key1", "value1", 5000);
		const entry = await cache.get("key1");
		expect(entry).not.toBeNull();
		expect(entry?.value).toBe("value1");
	});

	it("should store in both L1 and L2", async () => {
		await cache.set("key1", { data: "test" }, 5000);

		const stats = cache.getStats();
		expect(stats.totalSets).toBe(1);
	});

	it("should return L1 hit on second get", async () => {
		await cache.set("key1", "value1", 5000);

		await cache.get("key1");

		const stats = cache.getStats();
		expect(stats.l1Hits).toBeGreaterThan(0);
	});

	it("should handle TTL expiration", async () => {
		await cache.set("key1", "value1", 100);

		await new Promise((resolve) => setTimeout(resolve, 150));

		const entry = await cache.get("key1");
		expect(entry).toBeNull();
	});

	it("should track cache statistics", async () => {
		await cache.set("key1", "value1", 5000);
		await cache.get("key1");
		await cache.get("key1");
		await cache.get("nonexistent");

		const stats = cache.getStats();
		expect(stats.totalGets).toBe(3);
		expect(stats.totalSets).toBe(1);
		expect(stats.l1Hits).toBeGreaterThan(0);
		expect(stats.l1Misses).toBeGreaterThan(0);
	});

	it("should calculate hit rate correctly", async () => {
		await cache.set("key1", "value1", 5000);
		await cache.get("key1");
		await cache.get("key2");

		const hitRate = cache.getHitRate();
		expect(hitRate).toBeGreaterThan(0);
		expect(hitRate).toBeLessThanOrEqual(100);
	});

	it("should delete from both L1 and L2", async () => {
		await cache.set("key1", "value1", 5000);
		await cache.delete("key1");

		const entry = await cache.get("key1");
		expect(entry).toBeNull();
	});

	it("should getOrSet with factory function", async () => {
		const factory = async () => ({ computed: "value" });

		const result1 = await cache.getOrSet("key1", factory, 5000);
		const result2 = await cache.getOrSet("key1", factory, 5000);

		expect(result1).toEqual({ computed: "value" });
		expect(result2).toEqual({ computed: "value" });

		const stats = cache.getStats();
		expect(stats.totalSets).toBe(1);
	});

	it("should handle stale-while-revalidate", async () => {
		const cacheWithSwr = new MultiLevelCacheAdapter({
			l1MaxSize: 100,
			l2MaxSize: 1000,
			defaultTtlMs: 200,
			staleWhileRevalidateMs: 100,
		});

		await cacheWithSwr.set("key1", "value1", 200);

		await new Promise((resolve) => setTimeout(resolve, 150));

		const entry = await cacheWithSwr.get("key1");
		expect(entry).not.toBeNull();
	});

	it("should clear all entries", async () => {
		await cache.set("key1", "value1", 5000);
		await cache.set("key2", "value2", 5000);

		await cache.clear();

		const stats = cache.getStats();
		expect(stats.totalGets).toBe(0);
		expect(stats.totalSets).toBe(0);
	});

	it("should dispose resources", async () => {
		await cache.set("key1", "value1", 5000);
		cache.dispose();

		const stats = cache.getStats();
		expect(stats.totalGets).toBe(0);
	});

	it("should handle concurrent gets", async () => {
		await cache.set("key1", "value1", 5000);

		const results = await Promise.all([
			cache.get("key1"),
			cache.get("key1"),
			cache.get("key1"),
		]);

		expect(results.every((r) => r?.value === "value1")).toBe(true);
	});

	it("should handle concurrent sets", async () => {
		await Promise.all([
			cache.set("key1", "value1", 5000),
			cache.set("key2", "value2", 5000),
			cache.set("key3", "value3", 5000),
		]);

		const entry1 = await cache.get("key1");
		const entry2 = await cache.get("key2");
		const entry3 = await cache.get("key3");

		expect(entry1?.value).toBe("value1");
		expect(entry2?.value).toBe("value2");
		expect(entry3?.value).toBe("value3");
	});

	it("should track invalidations", async () => {
		await cache.set("key1", "value1", 5000);
		await cache.delete("key1");

		const stats = cache.getStats();
		expect(stats.invalidations).toBeGreaterThan(0);
	});

	it("should handle large values", async () => {
		const largeValue = "x".repeat(10000);
		await cache.set("large", largeValue, 5000);

		const entry = await cache.get("large");
		expect(entry?.value).toBe(largeValue);
	});

	it("should handle complex objects", async () => {
		const complexObject = {
			nested: {
				data: [1, 2, 3],
				timestamp: Date.now(),
			},
			metadata: {
				version: "1.0",
			},
		};

		await cache.set("complex", complexObject, 5000);
		const entry = await cache.get("complex");

		expect(entry?.value).toEqual(complexObject);
	});
});

describe("MultiLevelCacheAdapter - Cache Warming", () => {
	it("should add warmer configuration", async () => {
		const cache = new MultiLevelCacheAdapter({
			cacheWarming: true,
		});

		cache.addWarmer({
			keys: ["key1", "key2"],
			warmIntervalMs: 1000,
			priority: "high",
		});

		const stats = cache.getStats();
		expect(stats).toBeDefined();
	});

	it("should warm multiple keys", async () => {
		const cache = new MultiLevelCacheAdapter();

		await cache.warm(["key1", "key2", "key3"]);

		const stats = cache.getStats();
		expect(stats.warmedKeys).toBe(3);
	});
});

describe("MultiLevelCacheAdapter - Invalidation Listeners", () => {
	it("should notify on invalidation", async () => {
		const cache = new MultiLevelCacheAdapter();
		const invalidatedKeys: string[] = [];

		const unsubscribe = cache.onInvalidate((key) => {
			invalidatedKeys.push(key);
		});

		await cache.set("key1", "value1", 5000);
		await cache.delete("key1");

		expect(invalidatedKeys).toContain("key1");

		unsubscribe();
	});

	it("should allow multiple listeners", async () => {
		const cache = new MultiLevelCacheAdapter();
		const listener1Keys: string[] = [];
		const listener2Keys: string[] = [];

		cache.onInvalidate((key) => listener1Keys.push(key));
		cache.onInvalidate((key) => listener2Keys.push(key));

		await cache.set("key1", "value1", 5000);
		await cache.delete("key1");

		expect(listener1Keys).toContain("key1");
		expect(listener2Keys).toContain("key1");
	});
});

describe("MultiLevelCacheAdapter - Performance", () => {
	it("should handle 10k operations efficiently", async () => {
		const cache = new MultiLevelCacheAdapter({
			l1MaxSize: 10000,
			l2MaxSize: 100000,
		});

		const startTime = Date.now();

		for (let i = 0; i < 10000; i++) {
			await cache.set(`key:${i}`, `value:${i}`, 300000);
		}

		for (let i = 0; i < 10000; i++) {
			await cache.get(`key:${i}`);
		}

		const duration = Date.now() - startTime;

		expect(duration).toBeLessThan(10000);

		const stats = cache.getStats();
		expect(stats.totalSets).toBe(10000);
		expect(stats.totalGets).toBe(10000);
		expect(cache.getHitRate()).toBeGreaterThan(80);
	});

	it("should maintain hit rate under load", async () => {
		const cache = new MultiLevelCacheAdapter({
			l1MaxSize: 1000,
			l2MaxSize: 10000,
		});

		for (let i = 0; i < 500; i++) {
			await cache.set(`key:${i}`, `value:${i}`, 300000);
		}

		for (let i = 0; i < 1000; i++) {
			const key = `key:${Math.floor(Math.random() * 500)}`;
			await cache.get(key);
		}

		const hitRate = cache.getHitRate();
		expect(hitRate).toBeGreaterThan(50);
	});
});