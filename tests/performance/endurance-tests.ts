import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import http from "http";

interface EnduranceTestConfig {
	baseUrl: string;
	concurrentUsers: number;
	requestsPerSecond: number;
	durationMinutes: number;
	checkpointIntervalMinutes: number;
}

interface EnduranceCheckpoint {
	timestamp: number;
	totalRequests: number;
	successfulRequests: number;
	failedRequests: number;
	averageLatencyMs: number;
	p99LatencyMs: number;
	memoryUsageMB: number;
	errorRate: number;
}

interface EnduranceTestResults {
	checkpoints: EnduranceCheckpoint[];
	totalRequests: number;
	successfulRequests: number;
	failedRequests: number;
	overallErrorRate: number;
	latencyDegradation: number;
	memoryLeakDetected: boolean;
	memoryGrowthMBPerHour: number;
	recommendation: string;
}

class EnduranceTestRunner {
	private config: EnduranceTestConfig;
	private checkpoints: EnduranceCheckpoint[] = [];
	private totalRequests = 0;
	private successfulRequests = 0;
	private failedRequests = 0;
	private latencies: number[] = [];
	private initialMemoryMB = 0;
	private running = false;

	constructor(config: EnduranceTestConfig) {
		this.config = config;
	}

	async run(): Promise<EnduranceTestResults> {
		this.running = true;
		this.totalRequests = 0;
		this.successfulRequests = 0;
		this.failedRequests = 0;
		this.latencies = [];
		this.checkpoints = [];
		this.initialMemoryMB = process.memoryUsage().heapUsed / 1024 / 1024;

		const startTime = Date.now();
		const durationMs = this.config.durationMinutes * 60 * 1000;
		const checkpointIntervalMs = this.config.checkpointIntervalMinutes * 60 * 1000;

		const requestPromises: Promise<void>[] = [];
		for (let i = 0; i < this.config.concurrentUsers; i++) {
			requestPromises.push(this.simulateUser(startTime, durationMs));
		}

		const checkpointInterval = setInterval(() => {
			this.recordCheckpoint();
		}, checkpointIntervalMs);

		await Promise.all(requestPromises);

		clearInterval(checkpointInterval);
		this.recordCheckpoint();

		return this.calculateResults();
	}

	private async simulateUser(
		startTime: number,
		durationMs: number,
	): Promise<void> {
		while (
			this.running &&
			Date.now() - startTime < durationMs &&
			this.totalRequests < this.config.requestsPerSecond * durationMs / 1000
		) {
			await this.makeRequest();
			await this.sleep(1000 / (this.config.requestsPerSecond / this.config.concurrentUsers));
		}
	}

	private async makeRequest(): Promise<void> {
		const start = Date.now();

		try {
			await new Promise<void>((resolve, reject) => {
				const req = http.get(`${this.config.baseUrl}/health`, (res) => {
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

			this.successfulRequests++;
			this.latencies.push(Date.now() - start);
		} catch {
			this.failedRequests++;
		}

		this.totalRequests++;
	}

	private recordCheckpoint(): void {
		const sortedLatencies = [...this.latencies].sort((a, b) => a - b);
		const currentMemory = process.memoryUsage().heapUsed / 1024 / 1024;

		const checkpoint: EnduranceCheckpoint = {
			timestamp: Date.now(),
			totalRequests: this.totalRequests,
			successfulRequests: this.successfulRequests,
			failedRequests: this.failedRequests,
			averageLatencyMs:
				this.latencies.length > 0
					? this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length
					: 0,
			p99LatencyMs: this.getPercentile(sortedLatencies, 99),
			memoryUsageMB: currentMemory,
			errorRate:
				this.totalRequests > 0
					? (this.failedRequests / this.totalRequests) * 100
					: 0,
		};

		this.checkpoints.push(checkpoint);
	}

	private calculateResults(): EnduranceTestResults {
		if (this.checkpoints.length < 2) {
			return {
				checkpoints: this.checkpoints,
				totalRequests: this.totalRequests,
				successfulRequests: this.successfulRequests,
				failedRequests: this.failedRequests,
				overallErrorRate:
					this.totalRequests > 0
						? (this.failedRequests / this.totalRequests) * 100
						: 0,
				latencyDegradation: 0,
				memoryLeakDetected: false,
				memoryGrowthMBPerHour: 0,
				recommendation: "Test duration too short for meaningful analysis",
			};
		}

		const firstCheckpoint = this.checkpoints[0];
		const lastCheckpoint = this.checkpoints[this.checkpoints.length - 1];

		const latencyDegradation =
			firstCheckpoint.averageLatencyMs > 0
				? ((lastCheckpoint.averageLatencyMs - firstCheckpoint.averageLatencyMs) /
						firstCheckpoint.averageLatencyMs) *
					100
				: 0;

		const durationHours =
			(lastCheckpoint.timestamp - firstCheckpoint.timestamp) / 1000 / 3600;
		const memoryGrowthMBPerHour =
			durationHours > 0
				? (lastCheckpoint.memoryUsageMB - firstCheckpoint.memoryUsageMB) /
					durationHours
				: 0;

		const memoryLeakDetected = memoryGrowthMBPerHour > 50;

		let recommendation = "System performed well under sustained load.";
		if (memoryLeakDetected) {
			recommendation =
				"WARNING: Memory leak detected. Investigate memory usage patterns.";
		} else if (latencyDegradation > 20) {
			recommendation =
				"WARNING: Latency degradation detected. Consider optimization.";
		} else if (lastCheckpoint.errorRate > 1) {
			recommendation =
				"WARNING: Error rate above threshold. Investigate failure patterns.";
		}

		return {
			checkpoints: this.checkpoints,
			totalRequests: this.totalRequests,
			successfulRequests: this.successfulRequests,
			failedRequests: this.failedRequests,
			overallErrorRate:
				this.totalRequests > 0
					? (this.failedRequests / this.totalRequests) * 100
					: 0,
			latencyDegradation,
			memoryLeakDetected,
			memoryGrowthMBPerHour,
			recommendation,
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

function printEnduranceResults(results: EnduranceTestResults): void {
	console.log("\n=== ENDURANCE TEST RESULTS ===");
	console.log(`Duration: ${results.checkpoints.length * 5} minutes`);
	console.log(`Total Requests: ${results.totalRequests}`);
	console.log(`Successful: ${results.successfulRequests}`);
	console.log(`Failed: ${results.failedRequests}`);
	console.log(`Overall Error Rate: ${results.overallErrorRate.toFixed(2)}%`);
	console.log(`\nLatency Degradation: ${results.latencyDegradation.toFixed(2)}%`);
	console.log(`Memory Growth: ${results.memoryGrowthMBPerHour.toFixed(2)} MB/hour`);
	console.log(`Memory Leak Detected: ${results.memoryLeakDetected ? "YES ⚠️" : "NO"}`);
	console.log(`\nRecommendation: ${results.recommendation}`);

	console.log("\n--- Checkpoints ---");
	results.checkpoints.forEach((checkpoint, index) => {
		console.log(
			`Checkpoint ${index + 1}: ${checkpoint.totalRequests} reqs, ${checkpoint.averageLatencyMs.toFixed(2)}ms avg, ${checkpoint.memoryUsageMB.toFixed(2)}MB`,
		);
	});
	console.log("============================\n");
}

describe("Endurance Tests - Long Running Load", () => {
	let server: http.Server;
	const PORT = 3459;

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

	it("should sustain load for 15 minutes without degradation", async () => {
		const config: EnduranceTestConfig = {
			baseUrl: `http://localhost:${PORT}`,
			concurrentUsers: 100,
			requestsPerSecond: 500,
			durationMinutes: 15,
			checkpointIntervalMinutes: 5,
		};

		const runner = new EnduranceTestRunner(config);
		const results = await runner.run();

		printEnduranceResults(results);

		expect(results.overallErrorRate).toBeLessThan(1);
		expect(results.latencyDegradation).toBeLessThan(20);
		expect(results.memoryLeakDetected).toBe(false);
	}, 120000);

	it("should handle 100 concurrent users for 30 minutes", async () => {
		const config: EnduranceTestConfig = {
			baseUrl: `http://localhost:${PORT}`,
			concurrentUsers: 100,
			requestsPerSecond: 1000,
			durationMinutes: 30,
			checkpointIntervalMinutes: 10,
		};

		const runner = new EnduranceTestRunner(config);
		const results = await runner.run();

		printEnduranceResults(results);

		expect(results.successfulRequests).toBeGreaterThan(100000);
		expect(results.overallErrorRate).toBeLessThan(1);
	}, 200000);
});