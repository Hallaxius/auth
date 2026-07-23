import { describe, expect, test, vi } from "vitest";
import { RedisStateStore, ResilientRedisStateStore } from "../../src/adapters/state/redis";

const REDIS_AVAILABLE = process.env.REDIS_AVAILABLE === "true";
const ENDURANCE_TEST = process.env.ENDURANCE_TEST === "true";

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

describe("RedisStateStore - Endurance Tests (Mock)", () => {
	test("should handle sustained load (mock)", async () => {
		const store = new RedisStateStore({ url: "redis://localhost:6379" });
		
		const duration = ENDURANCE_TEST ? 60000 : 5000;
		const startTime = Date.now();
		let operationCount = 0;
		
		while (Date.now() - startTime < duration) {
			const batchId = Math.floor((Date.now() - startTime) / 100);
			await Promise.all(
				Array.from({ length: 10 }, (_, i) =>
					store.set(`endurance-${batchId}-${i}`, 300000),
				),
			);
			operationCount += 10;
			
			if (batchId % 10 === 0) {
				await new Promise((resolve) => setTimeout(resolve, 10));
			}
		}
		
		const endTime = Date.now();
		const actualDuration = endTime - startTime;
		const opsPerSecond = operationCount / (actualDuration / 1000);
		
		console.log(`Duration: ${actualDuration}ms`);
		console.log(`Operations: ${operationCount}`);
		console.log(`Throughput: ${opsPerSecond.toFixed(2)} ops/s`);
		
		expect(operationCount).toBeGreaterThan(100);
		
		await store.disconnect();
	});
});

if (REDIS_AVAILABLE && ENDURANCE_TEST) {
	describe("RedisStateStore - Endurance Tests (Redis Real)", () => {
		let store: RedisStateStore;
		const TEST_PREFIX = "endurance:test:";

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

		test("should handle 1 hour sustained load", async () => {
			const duration = 60 * 60 * 1000;
			const startTime = Date.now();
			let operationCount = 0;
			let errorCount = 0;
			
			while (Date.now() - startTime < duration) {
				try {
					const batchId = Math.floor((Date.now() - startTime) / 1000);
					
					await Promise.all(
						Array.from({ length: 100 }, (_, i) =>
							store.set(`endurance-${batchId}-${i}`, 300000),
						),
					);
					operationCount += 100;
					
					if (batchId % 60 === 0) {
						const elapsed = ((Date.now() - startTime) / 60000).toFixed(1);
						console.log(`[${elapsed}min] Operations: ${operationCount}, Errors: ${errorCount}`);
					}
					
					await new Promise((resolve) => setTimeout(resolve, 100));
				} catch (error) {
					errorCount++;
					console.error("Endurance test error:", error);
				}
			}
			
			const endTime = Date.now();
			const actualDuration = endTime - startTime;
			const opsPerSecond = operationCount / (actualDuration / 1000);
			
			console.log(`\n=== Endurance Test Results ===`);
			console.log(`Duration: ${actualDuration}ms (${(actualDuration / 60000).toFixed(1)} min)`);
			console.log(`Total Operations: ${operationCount}`);
			console.log(`Error Count: ${errorCount}`);
			console.log(`Throughput: ${opsPerSecond.toFixed(2)} ops/s`);
			console.log(`Success Rate: ${((operationCount / (operationCount + errorCount)) * 100).toFixed(2)}%`);
			
			expect(errorCount).toBe(0);
			expect(opsPerSecond).toBeGreaterThan(100);
		});

		test("should maintain consistent latency over time", async () => {
			const duration = 60 * 60 * 1000;
			const startTime = Date.now();
			const latencySamples: number[] = [];
			
			while (Date.now() - startTime < duration) {
				const sampleStart = Date.now();
				
				await store.set(`latency-sample-${latencySamples.length}`, 300000);
				await store.has(`latency-sample-${latencySamples.length}`);
				await store.delete(`latency-sample-${latencySamples.length}`);
				
				const sampleEnd = Date.now();
				latencySamples.push(sampleEnd - sampleStart);
				
				await new Promise((resolve) => setTimeout(resolve, 1000));
			}
			
			latencySamples.sort((a, b) => a - b);
			const p50 = latencySamples[Math.floor(latencySamples.length * 0.5)];
			const p95 = latencySamples[Math.floor(latencySamples.length * 0.95)];
			const p99 = latencySamples[Math.floor(latencySamples.length * 0.99)];
			
			console.log(`\n=== Latency Distribution ===`);
			console.log(`Samples: ${latencySamples.length}`);
			console.log(`p50: ${p50}ms`);
			console.log(`p95: ${p95}ms`);
			console.log(`p99: ${p99}ms`);
			
			expect(p95).toBeLessThan(10);
			expect(p99).toBeLessThan(20);
		});

		test("should not leak memory over extended period", async () => {
			const duration = 60 * 60 * 1000;
			const startTime = Date.now();
			const memorySamples: number[] = [];
			
			const initialMemory = process.memoryUsage().heapUsed;
			memorySamples.push(initialMemory);
			
			while (Date.now() - startTime < duration) {
				const batchId = Math.floor((Date.now() - startTime) / 1000);
				
				await Promise.all(
					Array.from({ length: 50 }, (_, i) =>
						store.set(`memory-${batchId}-${i}`, 300000),
					),
				);
				
				if (batchId % 60 === 0) {
					const currentMemory = process.memoryUsage().heapUsed;
					memorySamples.push(currentMemory);
					
					const elapsed = ((Date.now() - startTime) / 60000).toFixed(1);
					const memoryMB = (currentMemory / (1024 * 1024)).toFixed(2);
					console.log(`[${elapsed}min] Memory: ${memoryMB} MB`);
				}
				
				await new Promise((resolve) => setTimeout(resolve, 100));
			}
			
			const finalMemory = process.memoryUsage().heapUsed;
			const memoryGrowthMB = (finalMemory - initialMemory) / (1024 * 1024);
			
			console.log(`\n=== Memory Usage ===`);
			console.log(`Initial: ${(initialMemory / (1024 * 1024)).toFixed(2)} MB`);
			console.log(`Final: ${(finalMemory / (1024 * 1024)).toFixed(2)} MB`);
			console.log(`Growth: ${memoryGrowthMB.toFixed(2)} MB`);
			
			expect(memoryGrowthMB).toBeLessThan(50);
		});
	});
} else {
	describe("Endurance Tests (SKIPPED)", () => {
		test.skip(
			ENDURANCE_TEST
				? "Endurance tests skipped - Redis not available. Set REDIS_AVAILABLE=true to enable."
				: "Endurance tests skipped - Set ENDURANCE_TEST=true to enable (requires Redis).",
			() => {},
		);
	});
}
