import { describe, expect, test } from "bun:test";
import type { DiscordAuthConfig } from "../../src/";
import { processConfig } from "../../src/";
import { TestStateStore } from "../helpers/storage";

const TEST_CONFIG: DiscordAuthConfig = {
	clientId: "test-client-id",
	clientSecret: "test-client-secret",
	secret: "test-secret-key-32-chars-long!!",
	callbackUrl: "http://localhost:3000/auth/callback",
	redirectUri: "http://localhost:3000/auth/callback",
	session: {
		type: "jwt",
		secret: "test-session-secret-32-chars!!",
	},
	csrf: {
		storage: new TestStateStore(),
	},
};

const BASELINE_METRICS = {
	coldStart: {
		target: 100,
		current: null as number | null,
	},

	configProcessing: {
		target: 50,
		current: null as number | null,
	},

	memoryIdle: {
		target: 50,
		current: null as number | null,
	},

	latency: {
		p50: { target: 50, current: null as number | null },
		p95: { target: 200, current: null as number | null },
		p99: { target: 1000, current: null as number | null },
	},
};

describe("Performance Baseline - v4.0.1", () => {
	describe("Configuration Processing", () => {
		test("should process config in under 50ms", async () => {
			const start = Date.now();

			const config = await processConfig(TEST_CONFIG);
			expect(config).toBeDefined();

			const processingTime = Date.now() - start;
			BASELINE_METRICS.configProcessing.current = processingTime;

			console.log(`Config processing time: ${processingTime}ms`);
			expect(processingTime).toBeLessThan(
				BASELINE_METRICS.configProcessing.target,
			);
		});
	});

	describe("Memory Usage", () => {
		test("should maintain memory footprint under 50MB idle", async () => {
			await processConfig(TEST_CONFIG);

			await new Promise((resolve) => setTimeout(resolve, 100));

			const memoryUsage = process.memoryUsage();
			const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024;

			BASELINE_METRICS.memoryIdle.current = heapUsedMB;

			console.log(`Memory usage (heap): ${heapUsedMB.toFixed(2)}MB`);
			expect(heapUsedMB).toBeLessThan(BASELINE_METRICS.memoryIdle.target);
		});
	});

	describe("Latency Percentiles", () => {
		test("should maintain p50 < 50ms, p95 < 200ms, p99 < 1000ms", async () => {
			const iterations = 100;
			const latencies: number[] = [];

			for (let i = 0; i < iterations; i++) {
				const start = Date.now();

				await processConfig(TEST_CONFIG);

				latencies.push(Date.now() - start);
			}

			latencies.sort((a, b) => a - b);

			const p50 = latencies[Math.floor(iterations * 0.5)];
			const p95 = latencies[Math.floor(iterations * 0.95)];
			const p99 = latencies[Math.floor(iterations * 0.99)];

			BASELINE_METRICS.latency.p50.current = p50;
			BASELINE_METRICS.latency.p95.current = p95;
			BASELINE_METRICS.latency.p99.current = p99;

			console.log(`Latency - p50: ${p50}ms, p95: ${p95}ms, p99: ${p99}ms`);

			expect(p50).toBeLessThan(BASELINE_METRICS.latency.p50.target);
			expect(p95).toBeLessThan(BASELINE_METRICS.latency.p95.target);
			expect(p99).toBeLessThan(1000);
		});
	});
});
