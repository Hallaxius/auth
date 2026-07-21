import { beforeEach, describe, expect, it } from "vitest";
import {
	type CacheEntry,
	MemoryCacheAdapter,
} from "../../../adapters/cache/memory";

describe("MemoryCacheAdapter", () => {
	let cache: MemoryCacheAdapter;

	beforeEach(() => {
		cache = new MemoryCacheAdapter();
	});

	describe("get", () => {
		it("returns null for non-existent key", async () => {
			const result = await cache.get("nonexistent");
			expect(result).toBeNull();
		});

		it("returns entry for existing key", async () => {
			const value = { foo: "bar" };
			const ttlMs = 60000;
			await cache.set("key1", value, ttlMs);

			const result = await cache.get("key1");

			expect(result).not.toBeNull();
			expect(result?.value).toEqual(value);
			expect(result?.expiresAt).toBeGreaterThan(Date.now());
		});

		it("returns null for expired entry and deletes from store", async () => {
			await cache.set("key1", "value1", 100);

			await new Promise((resolve) => setTimeout(resolve, 150));

			const result = await cache.get("key1");
			expect(result).toBeNull();

			const size = cache.getSize();
			expect(size).toBe(0);
		});

		it("deletes expired entry from store on get (covers lines 22-23)", async () => {
			await cache.set("key1", "value1", 50);

			await new Promise((resolve) => setTimeout(resolve, 100));

			const firstGet = await cache.get("key1");
			expect(firstGet).toBeNull();

			const sizeAfterExpiredGet = cache.getSize();
			expect(sizeAfterExpiredGet).toBe(0);

			const secondGet = await cache.get("key1");
			expect(secondGet).toBeNull();
		});

		it("handles null values", async () => {
			await cache.set("key1", null, 60000);

			const result = await cache.get("key1");
			expect(result).not.toBeNull();
			expect(result?.value).toBeNull();
		});

		it("handles complex objects", async () => {
			const complexObj = {
				nested: { key: "value" },
				array: [1, 2, 3],
				func: function test() {},
			};

			await cache.set("complex", complexObj, 60000);

			const result = await cache.get("complex");
			expect(result?.value).toEqual(complexObj);
		});
	});

	describe("set", () => {
		it("stores value with TTL", async () => {
			const value = "test-value";
			const ttlMs = 60000;

			await cache.set("key1", value, ttlMs);

			const result = await cache.get("key1");
			expect(result?.value).toBe(value);
			expect(result?.expiresAt).toBeGreaterThan(Date.now());
			expect(result?.expiresAt).toBeLessThanOrEqual(Date.now() + ttlMs);
		});

		it("overwrites existing key", async () => {
			await cache.set("key1", "value1", 60000);
			await cache.set("key1", "value2", 60000);

			const result = await cache.get("key1");
			expect(result?.value).toBe("value2");
		});

		it("handles zero TTL", async () => {
			await cache.set("key1", "value1", 0);

			await new Promise((resolve) => setTimeout(resolve, 10));

			const result = await cache.get("key1");
			expect(result).toBeNull();
		});

		it("handles very large TTL", async () => {
			const largeTtl = 365 * 24 * 60 * 60 * 1000;
			await cache.set("key1", "value1", largeTtl);

			const result = await cache.get("key1");
			expect(result?.value).toBe("value1");
		});

		it("stores numbers", async () => {
			await cache.set("num", 42, 60000);
			const result = await cache.get("num");
			expect(result?.value).toBe(42);
		});

		it("stores booleans", async () => {
			await cache.set("bool", true, 60000);
			const result = await cache.get("bool");
			expect(result?.value).toBe(true);
		});

		it("stores arrays", async () => {
			await cache.set("arr", [1, 2, 3], 60000);
			const result = await cache.get("arr");
			expect(result?.value).toEqual([1, 2, 3]);
		});

		it("stores Maps", async () => {
			const map = new Map([["key", "value"]]);
			await cache.set("map", map, 60000);
			const result = await cache.get("map");
			expect(result?.value).toEqual(map);
		});

		it("stores Sets", async () => {
			const set = new Set([1, 2, 3]);
			await cache.set("set", set, 60000);
			const result = await cache.get("set");
			expect(result?.value).toEqual(set);
		});
	});

	describe("delete", () => {
		it("removes existing key", async () => {
			await cache.set("key1", "value1", 60000);
			await cache.delete("key1");

			const result = await cache.get("key1");
			expect(result).toBeNull();
		});

		it("does nothing for non-existent key", async () => {
			await expect(cache.delete("nonexistent")).resolves.not.toThrow();
		});

		it("removes one key without affecting others", async () => {
			await cache.set("key1", "value1", 60000);
			await cache.set("key2", "value2", 60000);
			await cache.delete("key1");

			const result1 = await cache.get("key1");
			const result2 = await cache.get("key2");

			expect(result1).toBeNull();
			expect(result2?.value).toBe("value2");
		});
	});

	describe("dispose", () => {
		it("disposes underlying LRU cache", async () => {
			await cache.set("key1", "value1", 100);
			cache.dispose();

			await new Promise((resolve) => setTimeout(resolve, 150));

			const result = await cache.get("key1");
			expect(result).toBeNull();
		});

		it("can be called multiple times safely", () => {
			expect(() => {
				cache.dispose();
				cache.dispose();
				cache.dispose();
			}).not.toThrow();
		});
	});

	describe("CacheEntry interface", () => {
		it("has correct structure", async () => {
			const value = { test: "data" };
			const ttlMs = 5000;
			await cache.set("entry", value, ttlMs);

			const result = await cache.get("entry");

			expect(result).toHaveProperty("value");
			expect(result).toHaveProperty("expiresAt");
			expect(typeof result?.expiresAt).toBe("number");
		});

		it("expiresAt is in milliseconds", async () => {
			const beforeSet = Date.now();
			await cache.set("key1", "value1", 1000);
			const afterSet = Date.now();

			const result = await cache.get("key1");

			expect(result?.expiresAt).toBeGreaterThan(beforeSet);
			expect(result?.expiresAt).toBeLessThanOrEqual(afterSet + 1000);
		});
	});

	describe("edge cases", () => {
		it("handles rapid set operations", async () => {
			const promises: Promise<void>[] = [];
			for (let i = 0; i < 100; i++) {
				promises.push(cache.set(`key${i}`, `value${i}`, 60000));
			}
			await Promise.all(promises);

			expect(cache.getSize()).toBe(100);
		});

		it("handles rapid get operations", async () => {
			for (let i = 0; i < 100; i++) {
				await cache.set(`key${i}`, `value${i}`, 60000);
			}

			const promises: Promise<CacheEntry | null>[] = [];
			for (let i = 0; i < 100; i++) {
				promises.push(cache.get(`key${i}`));
			}

			const results = await Promise.all(promises);
			results.forEach((result: CacheEntry | null, index: number) => {
				expect(result?.value).toBe(`value${index}`);
			});
		});

		it("handles concurrent set and delete", async () => {
			await cache.set("key1", "value1", 60000);

			const [setResult, deleteResult] = await Promise.all([
				cache.set("key1", "value2", 60000),
				cache.delete("key1"),
			]);

			expect(setResult).toBeUndefined();
			expect(deleteResult).toBeUndefined();

			const getResult = await cache.get("key1");
			expect(getResult).toBeNull();
		});

		it("handles undefined values", async () => {
			await cache.set("undef", undefined, 60000);
			const result = await cache.get("undef");
			expect(result?.value).toBeUndefined();
		});

		it("handles empty string values", async () => {
			await cache.set("empty", "", 60000);
			const result = await cache.get("empty");
			expect(result?.value).toBe("");
		});

		it("handles special characters in keys", async () => {
			const specialKey = "key:with:special:chars!@#$%";
			await cache.set(specialKey, "value", 60000);
			const result = await cache.get(specialKey);
			expect(result?.value).toBe("value");
		});

		it("handles very long keys", async () => {
			const longKey = "a".repeat(1000);
			await cache.set(longKey, "value", 60000);
			const result = await cache.get(longKey);
			expect(result?.value).toBe("value");
		});

		it("handles very large values", async () => {
			const largeValue = { data: new Array(10000).fill("x") };
			await cache.set("large", largeValue, 60000);
			const result = await cache.get("large");
			expect(result?.value).toEqual(largeValue);
		});
	});

	describe("TTL behavior", () => {
		it("entry expires after TTL", async () => {
			await cache.set("key1", "value1", 200);

			await new Promise((resolve) => setTimeout(resolve, 100));
			let result = await cache.get("key1");
			expect(result?.value).toBe("value1");

			await new Promise((resolve) => setTimeout(resolve, 150));
			result = await cache.get("key1");
			expect(result).toBeNull();
		});

		it("multiple entries with different TTLs", async () => {
			await cache.set("key1", "value1", 300);
			await cache.set("key2", "value2", 600);
			await cache.set("key3", "value3", 900);

			await new Promise((resolve) => setTimeout(resolve, 400));

			let result = await cache.get("key1");
			expect(result).toBeNull();

			result = await cache.get("key2");
			expect(result?.value).toBe("value2");

			result = await cache.get("key3");
			expect(result?.value).toBe("value3");

			await new Promise((resolve) => setTimeout(resolve, 300));

			result = await cache.get("key2");
			expect(result).toBeNull();

			result = await cache.get("key3");
			expect(result?.value).toBe("value3");
		});
	});
});
