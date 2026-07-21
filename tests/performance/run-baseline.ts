#!/usr/bin/env bun

/**
 * Baseline Performance Test Runner
 *
 * This script runs performance benchmarks and generates a baseline report.
 * Run with: bun run tests/performance/run-baseline.ts
 */

import { writeFile } from "node:fs/promises";
import { join } from "node:path";

interface BaselineMetrics {
	version: string;
	timestamp: string;
	environment: {
		bun: string;
		node: string;
		platform: string;
		arch: string;
	};
	metrics: {
		coldStart: number | null;
		configProcessing: number | null;
		memoryIdle: number | null;
		latency: {
			p50: number | null;
			p95: number | null;
			p99: number | null;
		};
	};
	targets: {
		coldStart: number;
		configProcessing: number;
		memoryIdle: number;
		latency: {
			p50: number;
			p95: number;
			p99: number;
		};
	};
}

async function runBaseline(): Promise<BaselineMetrics> {
	console.log("🚀 Running Performance Baseline Tests...\n");

	const metrics: BaselineMetrics = {
		version: "4.0.1",
		timestamp: new Date().toISOString(),
		environment: {
			bun: process.versions.bun,
			node: process.version,
			platform: process.platform,
			arch: process.arch,
		},
		metrics: {
			coldStart: null,
			configProcessing: null,
			memoryIdle: null,
			latency: {
				p50: null,
				p95: null,
				p99: null,
			},
		},
		targets: {
			coldStart: 100,
			configProcessing: 50,
			memoryIdle: 50,
			latency: {
				p50: 50,
				p95: 200,
				p99: 500,
			},
		},
	};

	// Import dynamically to measure cold start
	const startTime = Date.now();
	const { processConfig } = await import("../../src/config");
	const coldStartTime = Date.now() - startTime;
	metrics.metrics.coldStart = coldStartTime;

	console.log(
		`✅ Cold Start: ${coldStartTime}ms (target: <${metrics.targets.coldStart}ms)`,
	);

	// Config processing test
	const TEST_CONFIG = {
		clientId: "test-client-id",
		clientSecret: "test-client-secret",
		secret: "test-secret-key-32-chars-long!!",
		callbackUrl: "/auth/callback",
		session: {
			type: "jwt" as const,
			secret: "test-session-secret-32-chars!!",
		},
	};

	const configStart = Date.now();
	await processConfig(TEST_CONFIG);
	const configTime = Date.now() - configStart;
	metrics.metrics.configProcessing = configTime;

	console.log(
		`✅ Config Processing: ${configTime}ms (target: <${metrics.targets.configProcessing}ms)`,
	);

	// Memory test
	await new Promise((resolve) => setTimeout(resolve, 100));
	const memoryUsage = process.memoryUsage();
	const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024;
	metrics.metrics.memoryIdle = heapUsedMB;

	console.log(
		`✅ Memory Idle: ${heapUsedMB.toFixed(2)}MB (target: <${metrics.targets.memoryIdle}MB)`,
	);

	// Latency test
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

	metrics.metrics.latency = { p50, p95, p99 };

	console.log(`✅ Latency - p50: ${p50}ms, p95: ${p95}ms, p99: ${p99}ms`);
	console.log(
		`   Targets - p50: <${metrics.targets.latency.p50}ms, p95: <${metrics.targets.latency.p95}ms, p99: <${metrics.targets.latency.p99}ms`,
	);

	// Check if all targets met
	const allTargetsMet =
		coldStartTime < metrics.targets.coldStart &&
		configTime < metrics.targets.configProcessing &&
		heapUsedMB < metrics.targets.memoryIdle &&
		p50 < metrics.targets.latency.p50 &&
		p95 < metrics.targets.latency.p95 &&
		p99 < metrics.targets.latency.p99;

	console.log(
		`\n${allTargetsMet ? "✅" : "❌"} All performance targets ${allTargetsMet ? "MET" : "NOT MET"}`,
	);

	return metrics;
}

async function saveReport(metrics: BaselineMetrics): Promise<void> {
	const reportPath = join(
		process.cwd(),
		"tests",
		"performance",
		"baseline-report.json",
	);

	await writeFile(reportPath, JSON.stringify(metrics, null, 2));

	console.log(`\n📊 Baseline report saved to: ${reportPath}`);
}

async function main(): Promise<void> {
	try {
		const metrics = await runBaseline();
		await saveReport(metrics);

		console.log("\n✨ Baseline tests completed successfully!");
		process.exit(0);
	} catch (error) {
		console.error("❌ Baseline tests failed:", error);
		process.exit(1);
	}
}

// Run if executed directly
if (import.meta.main) {
	main();
}
