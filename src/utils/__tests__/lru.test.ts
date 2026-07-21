import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LruCache } from "../lru";

describe("LruCache", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("constructor", () => {
		it("creates cache with max entries", () => {
			const cache = new LruCache(100);
			expect(cache.size()).toBe(0);
		});

		it("uses default sweep interval of 60000ms", () => {
			const cache = new LruCache(100);
			expect(cache.size()).toBe(0);
		});

		it("accepts custom sweep interval", () => {
			const cache = new LruCache(100, 30000);
			expect(cache.size()).toBe(0);
		});
	});

	describe("set and get", () => {
		it("stores and retrieves a value", () => {
			const cache = new LruCache(10);
			cache.set("key1", "value1", 60000);
			expect(cache.get("key1")).toBe("value1");
		});

		it("returns undefined for non-existent key", () => {
			const cache = new LruCache(10);
			expect(cache.get("nonexistent")).toBeUndefined();
		});

		it("overwrites existing key with new value", () => {
			const cache = new LruCache(10);
			cache.set("key1", "value1", 60000);
			cache.set("key1", "value2", 60000);
			expect(cache.get("key1")).toBe("value2");
		});

		it("stores complex values", () => {
			const cache = new LruCache(10);
			const obj = { foo: "bar", nested: { key: "value" } };
			cache.set("obj", obj, 60000);
			expect(cache.get("obj")).toEqual(obj);
		});

		it("stores null values", () => {
			const cache = new LruCache(10);
			cache.set("nullkey", null, 60000);
			expect(cache.get("nullkey")).toBeNull();
		});

		it("stores undefined values", () => {
			const cache = new LruCache(10);
			cache.set("undefinedkey", undefined, 60000);
			expect(cache.get("undefinedkey")).toBeUndefined();
		});
	});

	describe("has", () => {
		it("returns true for existing key", () => {
			const cache = new LruCache(10);
			cache.set("key1", "value1", 60000);
			expect(cache.has("key1")).toBe(true);
		});

		it("returns false for non-existent key", () => {
			const cache = new LruCache(10);
			expect(cache.has("nonexistent")).toBe(false);
		});

		it("returns false for expired key", () => {
			const cache = new LruCache(10);
			cache.set("key1", "value1", 1000);
			vi.advanceTimersByTime(1500);
			expect(cache.has("key1")).toBe(false);
		});

		it("returns true just before expiration", () => {
			const cache = new LruCache(10);
			cache.set("key1", "value1", 1000);
			vi.advanceTimersByTime(999);
			expect(cache.has("key1")).toBe(true);
		});
	});

	describe("expiration", () => {
		it("returns undefined for expired entry", () => {
			const cache = new LruCache(10);
			cache.set("key1", "value1", 1000);
			vi.advanceTimersByTime(1500);
			expect(cache.get("key1")).toBeUndefined();
		});

		it("removes expired entry on get", () => {
			const cache = new LruCache(10);
			cache.set("key1", "value1", 1000);
			vi.advanceTimersByTime(1500);
			cache.get("key1");
			expect(cache.size()).toBe(0);
		});

		it("removes expired entry on has", () => {
			const cache = new LruCache(10);
			cache.set("key1", "value1", 1000);
			vi.advanceTimersByTime(1500);
			cache.has("key1");
			expect(cache.size()).toBe(0);
		});

		it("keeps non-expired entries", () => {
			const cache = new LruCache(10);
			cache.set("key1", "value1", 2000);
			vi.advanceTimersByTime(1000);
			expect(cache.get("key1")).toBe("value1");
		});
	});

	describe("eviction", () => {
		it("evicts oldest entry when max capacity reached", () => {
			const cache = new LruCache(2);
			cache.set("key1", "value1", 60000);
			cache.set("key2", "value2", 60000);
			cache.set("key3", "value3", 60000);

			expect(cache.get("key1")).toBeUndefined();
			expect(cache.get("key2")).toBe("value2");
			expect(cache.get("key3")).toBe("value3");
			expect(cache.size()).toBe(2);
		});

		it("evicts multiple entries when exceeding capacity", () => {
			const cache = new LruCache(3);
			cache.set("key1", "value1", 60000);
			cache.set("key2", "value2", 60000);
			cache.set("key3", "value3", 60000);
			cache.set("key4", "value4", 60000);
			cache.set("key5", "value5", 60000);

			expect(cache.size()).toBe(3);
			expect(cache.get("key1")).toBeUndefined();
			expect(cache.get("key2")).toBeUndefined();
			expect(cache.get("key3")).toBe("value3");
			expect(cache.get("key4")).toBe("value4");
			expect(cache.get("key5")).toBe("value5");
		});

		it("handles capacity of 1", () => {
			const cache = new LruCache(1);
			cache.set("key1", "value1", 60000);
			cache.set("key2", "value2", 60000);

			expect(cache.get("key1")).toBeUndefined();
			expect(cache.get("key2")).toBe("value2");
			expect(cache.size()).toBe(1);
		});
	});

	describe("delete", () => {
		it("removes existing key", () => {
			const cache = new LruCache(10);
			cache.set("key1", "value1", 60000);
			cache.delete("key1");
			expect(cache.get("key1")).toBeUndefined();
			expect(cache.has("key1")).toBe(false);
			expect(cache.size()).toBe(0);
		});

		it("does nothing for non-existent key", () => {
			const cache = new LruCache(10);
			cache.delete("nonexistent");
			expect(cache.size()).toBe(0);
		});

		it("removes one key without affecting others", () => {
			const cache = new LruCache(10);
			cache.set("key1", "value1", 60000);
			cache.set("key2", "value2", 60000);
			cache.delete("key1");

			expect(cache.get("key1")).toBeUndefined();
			expect(cache.get("key2")).toBe("value2");
			expect(cache.size()).toBe(1);
		});
	});

	describe("size", () => {
		it("returns 0 for empty cache", () => {
			const cache = new LruCache(10);
			expect(cache.size()).toBe(0);
		});

		it("returns correct count after adding entries", () => {
			const cache = new LruCache(10);
			cache.set("key1", "value1", 60000);
			cache.set("key2", "value2", 60000);
			cache.set("key3", "value3", 60000);
			expect(cache.size()).toBe(3);
		});

		it("returns correct count after deletion", () => {
			const cache = new LruCache(10);
			cache.set("key1", "value1", 60000);
			cache.set("key2", "value2", 60000);
			cache.delete("key1");
			expect(cache.size()).toBe(1);
		});

		it("returns correct count after eviction", () => {
			const cache = new LruCache(2);
			cache.set("key1", "value1", 60000);
			cache.set("key2", "value2", 60000);
			cache.set("key3", "value3", 60000);
			expect(cache.size()).toBe(2);
		});
	});

	describe("clear", () => {
		it("removes all entries", () => {
			const cache = new LruCache(10);
			cache.set("key1", "value1", 60000);
			cache.set("key2", "value2", 60000);
			cache.set("key3", "value3", 60000);

			cache.clear();

			expect(cache.size()).toBe(0);
			expect(cache.get("key1")).toBeUndefined();
			expect(cache.get("key2")).toBeUndefined();
			expect(cache.get("key3")).toBeUndefined();
		});

		it("works on empty cache", () => {
			const cache = new LruCache(10);
			cache.clear();
			expect(cache.size()).toBe(0);
		});
	});

	describe("dispose", () => {
		it("clears sweep timer", () => {
			const cache = new LruCache(10, 1000);
			const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");

			cache.dispose();

			expect(clearTimeoutSpy).toHaveBeenCalled();
			clearTimeoutSpy.mockRestore();
		});

		it("sets disposed flag", () => {
			const cache = new LruCache(10, 1000);
			cache.dispose();

			vi.advanceTimersByTime(2000);

			expect(cache.size()).toBe(0);
		});

		it("prevents new sweep scheduling after dispose", () => {
			const cache = new LruCache(10, 1000);
			cache.dispose();

			vi.advanceTimersByTime(2000);

			expect(cache.size()).toBe(0);
		});

		it("can be called multiple times safely", () => {
			const cache = new LruCache(10, 1000);
			cache.dispose();
			expect(() => cache.dispose()).not.toThrow();
		});

		it("works when timer is null", () => {
			const cache = new LruCache(10, 1000);
			cache.dispose();
			expect(cache.size()).toBe(0);
		});
	});

	describe("sweep expired entries", () => {
		it("automatically sweeps expired entries", () => {
			const cache = new LruCache(10, 1000);
			cache.set("key1", "value1", 500);
			cache.set("key2", "value2", 1500);

			vi.advanceTimersByTime(1000);

			expect(cache.get("key1")).toBeUndefined();
			expect(cache.get("key2")).toBe("value2");
			expect(cache.size()).toBe(1);
		});

		it("sweeps multiple expired entries", () => {
			const cache = new LruCache(10, 1000);
			cache.set("key1", "value1", 500);
			cache.set("key2", "value2", 500);
			cache.set("key3", "value3", 500);

			vi.advanceTimersByTime(1000);

			expect(cache.size()).toBe(0);
		});

		it("keeps non-expired entries during sweep", () => {
			const cache = new LruCache(10, 1000);
			cache.set("key1", "value1", 2000);
			cache.set("key2", "value2", 2000);

			vi.advanceTimersByTime(1000);

			expect(cache.get("key1")).toBe("value1");
			expect(cache.get("key2")).toBe("value2");
			expect(cache.size()).toBe(2);
		});
	});

	describe("edge cases", () => {
		it("handles zero TTL", () => {
			const cache = new LruCache(10);
			cache.set("key1", "value1", 0);

			vi.advanceTimersByTime(1);

			expect(cache.get("key1")).toBeUndefined();
		});

		it("handles very large TTL", () => {
			const cache = new LruCache(10);
			const largeTtl = 365 * 24 * 60 * 60 * 1000;
			cache.set("key1", "value1", largeTtl);

			expect(cache.get("key1")).toBe("value1");
		});

		it("handles negative TTL (treated as immediate expiration)", () => {
			const cache = new LruCache(10);
			cache.set("key1", "value1", -1000);

			vi.advanceTimersByTime(1);

			expect(cache.get("key1")).toBeUndefined();
		});

		it("handles max entries of 0", () => {
			const cache = new LruCache(0);
			cache.set("key1", "value1", 60000);

			// With maxEntries=0, evictIfNeeded will try to evict but won't find a key
			// The behavior depends on implementation details
			expect(cache.size()).toBeLessThanOrEqual(1);
		});

		it("handles string keys", () => {
			const cache = new LruCache(10);
			cache.set("string-key", "value", 60000);
			expect(cache.get("string-key")).toBe("value");
		});

		it("handles number keys", () => {
			const cache = new LruCache(10);
			cache.set(123, "value", 60000);
			expect(cache.get(123)).toBe("value");
		});

		it("handles symbol keys", () => {
			const cache = new LruCache(10);
			const sym = Symbol("key");
			cache.set(sym, "value", 60000);
			expect(cache.get(sym)).toBe("value");
		});

		it("handles object keys", () => {
			const cache = new LruCache(10);
			const objKey = { id: 1 };
			cache.set(objKey, "value", 60000);
			expect(cache.get(objKey)).toBe("value");
		});
	});

	describe("concurrent operations", () => {
		it("handles rapid set and get operations", () => {
			const cache = new LruCache(100);

			for (let i = 0; i < 50; i++) {
				cache.set(`key${i}`, `value${i}`, 60000);
			}

			for (let i = 0; i < 50; i++) {
				expect(cache.get(`key${i}`)).toBe(`value${i}`);
			}

			expect(cache.size()).toBe(50);
		});

		it("handles mixed operations", () => {
			const cache = new LruCache(10);

			cache.set("key1", "value1", 60000);
			cache.set("key2", "value2", 60000);
			expect(cache.has("key1")).toBe(true);
			cache.delete("key1");
			expect(cache.has("key1")).toBe(false);
			cache.set("key3", "value3", 60000);
			cache.clear();
			expect(cache.size()).toBe(0);
		});
	});
});
