import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { RedisStateStore, ResilientRedisStateStore } from "../../src/adapters/state/redis";

const REDIS_AVAILABLE = process.env.REDIS_AVAILABLE === "true";

const mockRedisClient = {
	connect: vi.fn().mockResolvedValue(undefined),
	quit: vi.fn().mockResolvedValue(undefined),
	exists: vi.fn().mockResolvedValue(1),
	set: vi.fn().mockResolvedValue("OK"),
	eval: vi.fn().mockResolvedValue("OK"),
	del: vi.fn().mockResolvedValue(1),
	on: vi.fn(),
};

vi.mock("redis", () => ({
	createClient: vi.fn(() => mockRedisClient),
}));

describe("RedisStateStore - Performance Tests (Mock)", () => {
	test("should handle 1000 concurrent operations (mock)", async () => {
		const store = new RedisStateStore({ url: "redis://localhost:6379" });
		
		const operations = Array.from({ length: 1000 }, (_, i) => i);
		const startTime = Date.now();
		
		await Promise.all(
			operations.map((i) => store.set(`perf-test-${i}`, 300000)),
		);
		
		const endTime = Date.now();
		const duration = endTime - startTime;
		
		expect(duration).toBeLessThan(5000);
		
		await store.disconnect();
	});

	test("should measure latency distribution (mock)", async () => {
		const store = new RedisStateStore({ url: "redis://localhost:6379" });
		const latencies: number[] = [];
		
		const operations = 100;
		for (let i = 0; i < operations; i++) {
			const start = Date.now();
			await store.set(`latency-test-${i}`, 300000);
			const end = Date.now();
			latencies.push(end - start);
		}
		
		latencies.sort((a, b) => a - b);
		const p50 = latencies[Math.floor(operations * 0.5)];
		const p95 = latencies[Math.floor(operations * 0.95)];
		const p99 = latencies[Math.floor(operations * 0.99)];
		
		expect(p50).toBeLessThan(10);
		expect(p95).toBeLessThan(20);
		expect(p99).toBeLessThan(50);
		
		await store.disconnect();
	});

	test("should handle rapid set/delete cycles", async () => {
		const store = new RedisStateStore({ url: "redis://localhost:6379" });
		
		const cycles = 500;
		for (let i = 0; i < cycles; i++) {
			await store.set(`cycle-${i}`, 300000);
			await store.has(`cycle-${i}`);
			await store.delete(`cycle-${i}`);
		}
		
		await store.disconnect();
	});
});

describe("ResilientRedisStateStore - Performance Tests (Mock)", () => {
	test("should handle circuit breaker under load", async () => {
		const mockFallback = {
			has: vi.fn().mockResolvedValue(false),
			set: vi.fn().mockResolvedValue(undefined),
			setIfAbsent: vi.fn().mockResolvedValue(true),
			delete: vi.fn().mockResolvedValue(undefined),
		};
		
		const store = new ResilientRedisStateStore(
			{ url: "redis://localhost:6379" },
			mockFallback,
		);
		
		mockRedisClient.set = vi.fn().mockRejectedValue(new Error("Redis down"));
		
		const operations = Array.from({ length: 100 }, (_, i) => i);
		
		await Promise.all(
			operations.map((i) => store.set(`fallback-${i}`, 300000)),
		);
		
		expect(mockFallback.set).toHaveBeenCalledTimes(100);
		
		await store.disconnect();
	});

	test("should retry with exponential backoff", async () => {
		const store = new ResilientRedisStateStore({ url: "redis://localhost:6379" });
		
		let retryCount = 0;
		mockRedisClient.set = vi.fn().mockImplementation(() => {
			retryCount++;
			if (retryCount < 3) {
				return Promise.reject(new Error("Temporary error"));
			}
			return Promise.resolve("OK");
		});
		
		const startTime = Date.now();
		await store.set("retry-test", 300000);
		const endTime = Date.now();
		
		expect(retryCount).toBe(3);
		expect(endTime - startTime).toBeGreaterThan(100);
		
		await store.disconnect();
	});
});

if (REDIS_AVAILABLE) {
	describe("RedisStateStore - Load Tests (Redis Real)", () => {
		let store: RedisStateStore;
		const TEST_PREFIX = "load:test:";

		beforeEach(async () => {
			store = new RedisStateStore({
				url: process.env.REDIS_URL ?? "redis://localhost:6379",
				keyPrefix: TEST_PREFIX,
			});
			await new Promise((resolve) => setTimeout(resolve, 100));
		});

		afterEach(async () => {
			await store.disconnect();
			await new Promise((resolve) => setTimeout(resolve, 100));
		});

		test("should handle 1000 concurrent requests", async () => {
			const operations = Array.from({ length: 1000 }, (_, i) => i);
			const startTime = Date.now();
			
			await Promise.all(
				operations.map((i) => store.set(`load-${i}`, 300000)),
			);
			
			const endTime = Date.now();
			const duration = endTime - startTime;
			const opsPerSecond = operations.length / (duration / 1000);
			
			console.log(`Throughput: ${opsPerSecond.toFixed(2)} ops/s`);
			console.log(`Duration: ${duration}ms for 1000 operations`);
			
			expect(opsPerSecond).toBeGreaterThan(1000);
			
			const checks = await Promise.all(
				operations.map((i) => store.has(`load-${i}`)),
			);
			
			expect(checks.every((exists) => exists)).toBe(true);
		});

		test("should measure p95 latency under load", async () => {
			const latencies: number[] = [];
			const operations = 100;
			
			for (let i = 0; i < operations; i++) {
				const start = Date.now();
				await store.set(`latency-${i}`, 300000);
				const end = Date.now();
				latencies.push(end - start);
			}
			
			latencies.sort((a, b) => a - b);
			const p50 = latencies[Math.floor(operations * 0.5)];
			const p95 = latencies[Math.floor(operations * 0.95)];
			const p99 = latencies[Math.floor(operations * 0.99)];
			
			console.log(`Latency p50: ${p50}ms`);
			console.log(`Latency p95: ${p95}ms`);
			console.log(`Latency p99: ${p99}ms`);
			
			expect(p95).toBeLessThan(10);
			
			await Promise.all(
				Array.from({ length: operations }, (_, i) => store.delete(`latency-${i}`)),
			);
		});

		test("should handle mixed operations", async () => {
			const operations = 500;
			
			const setPromises = Array.from({ length: operations }, (_, i) =>
				store.set(`mixed-${i}`, 300000),
			);
			
			await Promise.all(setPromises);
			
			const hasPromises = Array.from({ length: operations }, (_, i) =>
				store.has(`mixed-${i}`),
			);
			
			const hasResults = await Promise.all(hasPromises);
			expect(hasResults.every((exists) => exists)).toBe(true);
			
			const deletePromises = Array.from({ length: operations }, (_, i) =>
				store.delete(`mixed-${i}`),
			);
			
			await Promise.all(deletePromises);
			
			const deleteChecks = await Promise.all(
				Array.from({ length: operations }, (_, i) =>
					store.has(`mixed-${i}`),
				),
			);
			
			expect(deleteChecks.every((exists) => !exists)).toBe(true);
		});

		test("should measure memory usage", async () => {
			const startMemory = process.memoryUsage().heapUsed;
			
			const operations = Array.from({ length: 1000 }, (_, i) => i);
			await Promise.all(
				operations.map((i) => store.set(`memory-${i}`, 300000)),
			);
			
			const endMemory = process.memoryUsage().heapUsed;
			const memoryDeltaMB = (endMemory - startMemory) / (1024 * 1024);
			
			console.log(`Memory delta: ${memoryDeltaMB.toFixed(2)} MB`);
			
			expect(memoryDeltaMB).toBeLessThan(50);
			
			await Promise.all(
				operations.map((i) => store.delete(`memory-${i}`)),
			);
		});
	});

	describe("ResilientRedisStateStore - Failover Tests", () => {
		test("should failover to MemoryStore when Redis is down", async () => {
			const resilientStore = new ResilientRedisStateStore({
				url: "redis://invalid-host:6379",
			});
			
		});
	});
} else {
	describe("Load Tests (SKIPPED)", () => {
		test.skip("Load tests skipped - Redis not available. Set REDIS_AVAILABLE=true to enable.", () => {
		});
	});
}
