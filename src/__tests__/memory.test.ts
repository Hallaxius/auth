import { describe, expect, test } from "bun:test";
import { MemoryCacheAdapter } from "../adapters/cache/memory";

describe("MemoryCacheAdapter", () => {
	test("set and get a value", async () => {
		const cache = new MemoryCacheAdapter(10_000);
		await cache.set("key1", { data: "value1" }, 60_000);
		const entry = await cache.get("key1");
		expect(entry).not.toBeNull();
		expect(entry?.value).toEqual({ data: "value1" });
		cache.dispose();
	});

	test("returns null for missing key", async () => {
		const cache = new MemoryCacheAdapter(10_000);
		const entry = await cache.get("nonexistent");
		expect(entry).toBeNull();
		cache.dispose();
	});

	test("returns null for expired key", async () => {
		const cache = new MemoryCacheAdapter(10_000);
		await cache.set("temp", "value", -1);
		const entry = await cache.get("temp");
		expect(entry).toBeNull();
		cache.dispose();
	});

	test("deletes a key", async () => {
		const cache = new MemoryCacheAdapter(10_000);
		await cache.set("key1", "value1", 60_000);
		await cache.delete("key1");
		const entry = await cache.get("key1");
		expect(entry).toBeNull();
		cache.dispose();
	});

	test("handles dispose gracefully", () => {
		const cache = new MemoryCacheAdapter(10_000);
		cache.dispose();
	});

	test("handles multiple values", async () => {
		const cache = new MemoryCacheAdapter(10_000);
		await cache.set("a", 1, 60_000);
		await cache.set("b", 2, 60_000);
		await cache.set("c", 3, 60_000);

		expect((await cache.get("a"))?.value).toBe(1);
		expect((await cache.get("b"))?.value).toBe(2);
		expect((await cache.get("c"))?.value).toBe(3);
		cache.dispose();
	});

	test("sweep removes expired entries", async () => {
		const cache = new MemoryCacheAdapter(20);
		await cache.set("exp-key", "value", -1);
		await new Promise((r) => setTimeout(r, 30));
		const entry = await cache.get("exp-key");
		expect(entry).toBeNull();
		cache.dispose();
	});
});
