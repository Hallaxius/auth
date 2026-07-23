#!/usr/bin/env bun

import { MultiLevelCacheAdapter } from "../src/adapters/cache/multi-level";
import { MemoryCacheAdapter } from "../src/adapters/cache/memory";

interface BenchmarkConfig {
	iterations: number;
	concurrentOperations: number;
	keyCount: number;
	valueSize: number;
}

interface BenchmarkResults {
	operationsPerSecond: number;
	averageLatencyMs: number;
	p50LatencyMs: number;
	p95LatencyMs: number;
	p99LatencyMs: number;
	hitRate: number;
	memoryUsageMB: number;
}

async function runBenchmark(
	cache: MultiLevelCacheAdapter,
	config: BenchmarkConfig,
): Promise<BenchmarkResults> {
	const latencies: number[] = [];
	const keys: string[] = [];

	for (let i = 0; i < config.keyCount; i++) {
		keys.push(`key:${i}`);
	}

	const value = "x".repeat(config.valueSize);

	const startTime = Date.now();

	for (let i = 0; i < config.iterations; i++) {
		const key = keys[Math.floor(Math.random() * keys.length)];

		const opStart = Date.now();

		const entry = await cache.get(key);
		if (!entry) {
			await cache.set(key, value, 300000);
		}

		latencies.push(Date.now() - opStart);

		if (i % config.concurrentOperations === 0) {
			await Promise.all(
				Array.from({ length: 10 }, () => {
					const randomKey = keys[Math.floor(Math.random() * keys.length)];
					return cache.get(randomKey);
				}),
			);
		}
	}

	const duration = (Date.now() - startTime) / 1000;
	const sortedLatencies = [...latencies].sort((a, b) => a - b);

	return {
		operationsPerSecond: config.iterations / duration,
		averageLatencyMs:
			latencies.reduce((a, b) => a + b, 0) / latencies.length,
		p50LatencyMs: sortedLatencies[Math.floor(sortedLatencies.length * 0.5)],
		p95LatencyMs: sortedLatencies[Math.floor(sortedLatencies.length * 0.95)],
		p99LatencyMs: sortedLatencies[Math.floor(sortedLatencies.length * 0.99)],
		hitRate: cache.getHitRate(),
		memoryUsageMB: process.memoryUsage().heapUsed / 1024 / 1024,
	};
}

function printBenchmarkResults(
	name: string,
	results: BenchmarkResults,
): void {
	console.log(`\n=== ${name} ===`);
	console.log(`Operations/sec: ${results.operationsPerSecond.toFixed(2)}`);
	console.log(`Average Latency: ${results.averageLatencyMs.toFixed(3)}ms`);
	console.log(`P50 Latency: ${results.p50LatencyMs.toFixed(3)}ms`);
	console.log(`P95 Latency: ${results.p95LatencyMs.toFixed(3)}ms`);
	console.log(`P99 Latency: ${results.p99LatencyMs.toFixed(3)}ms`);
	console.log(`Cache Hit Rate: ${results.hitRate.toFixed(2)}%`);
	console.log(`Memory Usage: ${results.memoryUsageMB.toFixed(2)}MB`);
	console.log("==================\n");
}

async function main(): Promise<void> {
	console.log("🚀 Starting Performance Benchmark...\n");

	const config: BenchmarkConfig = {
		iterations: 100000,
		concurrentOperations: 100,
		keyCount: 10000,
		valueSize: 256,
	};

	console.log("Benchmark Configuration:");
	console.log(`  Iterations: ${config.iterations.toLocaleString()}`);
	console.log(`  Concurrent Ops: ${config.concurrentOperations}`);
	console.log(`  Key Count: ${config.keyCount.toLocaleString()}`);
	console.log(`  Value Size: ${config.valueSize} bytes`);
	console.log("");

	const cache = new MultiLevelCacheAdapter({
		l1MaxSize: 10000,
		l2MaxSize: 100000,
		defaultTtlMs: 300000,
		staleWhileRevalidateMs: 5000,
		cacheWarming: true,
	});

	console.log("\n📊 Running Multi-Level Cache Benchmark...\n");
	const results = await runBenchmark(cache, config);

	printBenchmarkResults("Multi-Level Cache", results);

	const stats = cache.getStats();
	console.log("Cache Statistics:");
	console.log(`  L1 Hits: ${stats.l1Hits.toLocaleString()}`);
	console.log(`  L1 Misses: ${stats.l1Misses.toLocaleString()}`);
	console.log(`  L2 Hits: ${stats.l2Hits.toLocaleString()}`);
	console.log(`  L2 Misses: ${stats.l2Misses.toLocaleString()}`);
	console.log(`  Total Gets: ${stats.totalGets.toLocaleString()}`);
	console.log(`  Total Sets: ${stats.totalSets.toLocaleString()}`);
	console.log(`  Invalidations: ${stats.invalidations.toLocaleString()}`);
	console.log("");

	const targetOps = 100000;
	const targetP99 = 10;

	if (results.operationsPerSecond >= targetOps) {
		console.log(`✅ OPS Target Met: ${results.operationsPerSecond.toFixed(0)} >= ${targetOps}`);
	} else {
		console.log(`❌ OPS Target Missed: ${results.operationsPerSecond.toFixed(0)} < ${targetOps}`);
	}

	if (results.p99LatencyMs <= targetP99) {
		console.log(`✅ P99 Latency Target Met: ${results.p99LatencyMs.toFixed(2)}ms <= ${targetP99}ms`);
	} else {
		console.log(`❌ P99 Latency Target Missed: ${results.p99LatencyMs.toFixed(2)}ms > ${targetP99}ms`);
	}

	console.log("");
}

main().catch(console.error);
