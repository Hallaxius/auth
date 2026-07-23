import { describe, expect, test } from "vitest";

const REDIS_AVAILABLE = process.env.REDIS_AVAILABLE === "true";

if (REDIS_AVAILABLE) {
	const { RedisStateStore, ResilientRedisStateStore } = await import("../../src/adapters/state/redis");

	describe("RedisStateStore - Integration Tests (Redis Real)", () => {
		let store: RedisStateStore;
		const TEST_PREFIX = "integration:test:";

		beforeEach(async () => {
			store = new RedisStateStore({
				url: process.env.REDIS_URL ?? "redis://localhost:6379",
				keyPrefix: TEST_PREFIX,
			});
			await new Promise((resolve) => setTimeout(resolve, 100));
		});

		afterEach(async () => {
			await store.disconnect();
		});

		test("should connect to Redis successfully", async () => {
			const connected = await store.has("connection-test");
			expect(typeof connected).toBe("boolean");
		});

		test("should set and check state", async () => {
			await store.set("test-1", 300000);
			const exists = await store.has("test-1");
			expect(exists).toBe(true);
		});

		test("should respect TTL", async () => {
			await store.set("test-ttl", 1000);
			await new Promise((resolve) => setTimeout(resolve, 1100));
			const exists = await store.has("test-ttl");
			expect(exists).toBe(false);
		});

		test("setIfAbsent should be atomic", async () => {
			const result1 = await store.setIfAbsent("test-atomic", 300000);
			const result2 = await store.setIfAbsent("test-atomic", 300000);
			
			expect(result1).toBe(true);
			expect(result2).toBe(false);
			
			await store.delete("test-atomic");
		});

		test("should delete state", async () => {
			await store.set("test-delete", 300000);
			await store.delete("test-delete");
			const exists = await store.has("test-delete");
			expect(exists).toBe(false);
		});

		test("should handle multiple operations", async () => {
			const operations = Array.from({ length: 100 }, (_, i) => i);
			
			await Promise.all(
				operations.map((i) => store.set(`test-${i}`, 300000)),
			);
			
			const checks = await Promise.all(
				operations.map((i) => store.has(`test-${i}`)),
			);
			
			expect(checks.every((exists) => exists)).toBe(true);
			
			await Promise.all(
				operations.map((i) => store.delete(`test-${i}`)),
			);
		});
	});

	describe("ResilientRedisStateStore - Integration Tests", () => {
		let resilientStore: ResilientRedisStateStore;
		const TEST_PREFIX = "integration:resilient:";

		beforeEach(async () => {
			resilientStore = new ResilientRedisStateStore({
				url: process.env.REDIS_URL ?? "redis://localhost:6379",
				keyPrefix: TEST_PREFIX,
			});
			await new Promise((resolve) => setTimeout(resolve, 100));
		});

		afterEach(async () => {
			await resilientStore.disconnect();
		});

		test("should use Redis when available", async () => {
			await resilientStore.set("test-1", 300000);
			const exists = await resilientStore.has("test-1");
			expect(exists).toBe(true);
		});

		test("should handle high concurrency", async () => {
			const operations = Array.from({ length: 1000 }, (_, i) => i);
			
			const startTime = Date.now();
			
			await Promise.all(
				operations.map((i) => resilientStore.set(`concurrent-${i}`, 300000)),
			);
			
			const endTime = Date.now();
			const duration = endTime - startTime;
			
			expect(duration).toBeLessThan(10000);
			
			const checks = await Promise.all(
				operations.map((i) => resilientStore.has(`concurrent-${i}`)),
			);
			
			expect(checks.every((exists) => exists)).toBe(true);
		});
	});
} else {
	describe("RedisStateStore - Integration Tests (SKIPPED)", () => {
		test.skip("Integration tests skipped - Redis not available. Set REDIS_AVAILABLE=true to enable.", () => {
		});
	});
}
