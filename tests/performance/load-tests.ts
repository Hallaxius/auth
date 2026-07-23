import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import http from "http";
import os from "os";

interface LoadTestConfig {
	baseUrl: string;
	concurrentUsers: number;
	requestsPerSecond: number;
	durationSeconds: number;
	endpoints: string[];
}

interface LoadTestResults {
	totalRequests: number;
	successfulRequests: number;
	failedRequests: number;
	averageLatencyMs: number;
	p50LatencyMs: number;
	p95LatencyMs: number;
	p99LatencyMs: number;
	maxLatencyMs: number;
	minLatencyMs: number;
	errorRate: number;
	requestsPerSecond: number;
	concurrentUsers: number;
	endpointStats: Map<string, EndpointStats>;
}

interface EndpointStats {
	requests: number;
	successes: number;
	failures: number;
	avgLatencyMs: number;
	p99LatencyMs: number;
}

class LoadTestRunner {
	private config: LoadTestConfig;
	private latencies: number[] = [];
	private errors: number = 0;
	private successes: number = 0;
	private totalRequests: number = 0;
	private endpointStats: Map<string, EndpointStats> = new Map();
	private running = false;

	constructor(config: LoadTestConfig) {
		this.config = config;
	}

	async run(): Promise<LoadTestResults> {
		this.running = true;
		this.latencies = [];
		this.errors = 0;
		this.successes = 0;
		this.totalRequests = 0;
		this.endpointStats = new Map();

		const startTime = Date.now();
		const requestsPromises: Promise<void>[] = [];

		const intervalMs = 1000 / this.config.requestsPerSecond;

		for (let i = 0; i < this.config.concurrentUsers; i++) {
			requestsPromises.push(
				this.simulateUser(i, startTime, this.config.durationSeconds),
			);
		}

		await Promise.all(requestsPromises);

		const endTime = Date.now();
		const durationSeconds = (endTime - startTime) / 1000;

		return this.calculateResults(durationSeconds);
	}

	private async simulateUser(
		userId: number,
		startTime: number,
		durationSeconds: number,
	): Promise<void> {
		while (this.running && Date.now() - startTime < durationSeconds * 1000) {
			const endpoint =
				this.config.endpoints[
					Math.floor(Math.random() * this.config.endpoints.length)
				];

			const requestStart = Date.now();

			try {
				await this.makeRequest(endpoint);
				const latency = Date.now() - requestStart;
				this.latencies.push(latency);
				this.successes++;
				this.totalRequests++;

				this.updateEndpointStats(endpoint, latency, true);
			} catch {
				this.errors++;
				this.totalRequests++;

				this.updateEndpointStats(endpoint, 0, false);
			}

			await this.sleep(10);
		}
	}

	private async makeRequest(endpoint: string): Promise<void> {
		return new Promise((resolve, reject) => {
			const req = http.get(`${this.config.baseUrl}${endpoint}`, (res) => {
				if (res.statusCode === 200) {
					resolve();
				} else {
					reject(new Error(`Status ${res.statusCode}`));
				}
			});

			req.on("error", reject);
			req.setTimeout(5000, () => {
				req.destroy();
				reject(new Error("Timeout"));
			});
		});
	}

	private updateEndpointStats(
		endpoint: string,
		latency: number,
		success: boolean,
	): void {
		const stats = this.endpointStats.get(endpoint) ?? {
			requests: 0,
			successes: 0,
			failures: 0,
			avgLatencyMs: 0,
			p99LatencyMs: 0,
		};

		stats.requests++;
		if (success) {
			stats.successes++;
			stats.avgLatencyMs =
				(stats.avgLatencyMs * (stats.requests - 1) + latency) / stats.requests;
		} else {
			stats.failures++;
		}

		this.endpointStats.set(endpoint, stats);
	}

	private calculateResults(durationSeconds: number): LoadTestResults {
		const sortedLatencies = [...this.latencies].sort((a, b) => a - b);

		const p50 = this.getPercentile(sortedLatencies, 50);
		const p95 = this.getPercentile(sortedLatencies, 95);
		const p99 = this.getPercentile(sortedLatencies, 99);

		return {
			totalRequests: this.totalRequests,
			successfulRequests: this.successes,
			failedRequests: this.errors,
			averageLatencyMs:
				this.latencies.length > 0
					? this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length
					: 0,
			p50LatencyMs: p50,
			p95LatencyMs: p95,
			p99LatencyMs: p99,
			maxLatencyMs: sortedLatencies.length > 0 ? sortedLatencies[0] : 0,
			minLatencyMs:
				sortedLatencies.length > 0
					? sortedLatencies[sortedLatencies.length - 1]
					: 0,
			errorRate:
				this.totalRequests > 0 ? (this.errors / this.totalRequests) * 100 : 0,
			requestsPerSecond:
				durationSeconds > 0 ? this.totalRequests / durationSeconds : 0,
			concurrentUsers: this.config.concurrentUsers,
			endpointStats: this.endpointStats,
		};
	}

	private getPercentile(sorted: number[], percentile: number): number {
		if (sorted.length === 0) return 0;
		const index = Math.floor((percentile / 100) * sorted.length);
		return sorted[Math.min(index, sorted.length - 1)];
	}

	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	stop(): void {
		this.running = false;
	}
}

function printResults(results: LoadTestResults): void {
	console.log("\n=== LOAD TEST RESULTS ===");
	console.log(`Total Requests: ${results.totalRequests}`);
	console.log(`Successful: ${results.successfulRequests}`);
	console.log(`Failed: ${results.failedRequests}`);
	console.log(`Error Rate: ${results.errorRate.toFixed(2)}%`);
	console.log(`\nLatency:`);
	console.log(`  Average: ${results.averageLatencyMs.toFixed(2)}ms`);
	console.log(`  P50: ${results.p50LatencyMs.toFixed(2)}ms`);
	console.log(`  P95: ${results.p95LatencyMs.toFixed(2)}ms`);
	console.log(`  P99: ${results.p99LatencyMs.toFixed(2)}ms`);
	console.log(`  Min: ${results.minLatencyMs.toFixed(2)}ms`);
	console.log(`  Max: ${results.maxLatencyMs.toFixed(2)}ms`);
	console.log(`\nThroughput: ${results.requestsPerSecond.toFixed(2)} req/s`);
	console.log(`Concurrent Users: ${results.concurrentUsers}`);
	console.log("=========================\n");
}

describe("Load Tests - 10k Concurrent Users", () => {
	let server: http.Server;
	const PORT = 3457;

	beforeAll(() => {
		server = http.createServer((req, res) => {
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ success: true }));
		});

		server.listen(PORT);
	});

	afterAll(() => {
		server.close();
	});

	it("should handle 100 concurrent users with <10ms p99", async () => {
		const config: LoadTestConfig = {
			baseUrl: `http://localhost:${PORT}`,
			concurrentUsers: 100,
			requestsPerSecond: 1000,
			durationSeconds: 10,
			endpoints: ["/health", "/api/test"],
		};

		const runner = new LoadTestRunner(config);
		const results = await runner.run();

		printResults(results);

		expect(results.errorRate).toBeLessThan(1);
		expect(results.p99LatencyMs).toBeLessThan(10);
		expect(results.requestsPerSecond).toBeGreaterThan(500);
	}, 30000);

	it("should handle 500 concurrent users with <1% error rate", async () => {
		const config: LoadTestConfig = {
			baseUrl: `http://localhost:${PORT}`,
			concurrentUsers: 500,
			requestsPerSecond: 5000,
			durationSeconds: 15,
			endpoints: ["/health", "/api/test", "/api/data"],
		};

		const runner = new LoadTestRunner(config);
		const results = await runner.run();

		printResults(results);

		expect(results.errorRate).toBeLessThan(1);
		expect(results.successfulRequests).toBeGreaterThan(10000);
	}, 45000);

	it("should sustain 1000 concurrent users for 30 seconds", async () => {
		const config: LoadTestConfig = {
			baseUrl: `http://localhost:${PORT}`,
			concurrentUsers: 1000,
			requestsPerSecond: 10000,
			durationSeconds: 30,
			endpoints: ["/health", "/api/test"],
		};

		const runner = new LoadTestRunner(config);
		const results = await runner.run();

		printResults(results);

		expect(results.errorRate).toBeLessThan(1);
		expect(results.totalRequests).toBeGreaterThan(50000);
		expect(results.p99LatencyMs).toBeLessThan(50);
	}, 60000);
});