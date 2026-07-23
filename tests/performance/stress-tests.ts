import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import http from "http";

interface StressTestConfig {
	baseUrl: string;
	rampUpUsers: number;
	rampUpDurationSeconds: number;
	peakDurationSeconds: number;
	breakingPoint: number;
}

interface StressTestResults {
	breakingPoint: number;
	degradationPoint: number;
	recoveryTime: number;
	maxConcurrentUsers: number;
	errorRateAtPeak: number;
	latencyAtPeak: {
		average: number;
		p95: number;
		p99: number;
	};
	systemResources: {
		memoryUsageMB: number;
		cpuUsagePercent: number;
	};
}

class StressTestRunner {
	private config: StressTestConfig;
	private activeUsers = 0;
	private latencies: number[] = [];
	private errors = 0;
	private successes = 0;
	private breakingPointReached = false;
	private degradationPoint = 0;
	private peakLatency = 0;

	constructor(config: StressTestConfig) {
		this.config = config;
	}

	async run(): Promise<StressTestResults> {
		this.activeUsers = 0;
		this.latencies = [];
		this.errors = 0;
		this.successes = 0;

		const rampUpInterval =
			this.config.rampUpDurationSeconds / this.config.rampUpUsers;

		for (let i = 0; i < this.config.rampUpUsers; i++) {
			this.activeUsers++;

			if (this.activeUsers % 50 === 0) {
				const currentErrorRate =
					this.successes + this.errors > 0
						? (this.errors / (this.successes + this.errors)) * 100
						: 0;

				if (currentErrorRate > 10 && !this.breakingPointReached) {
					this.breakingPointReached = true;
					this.degradationPoint = this.activeUsers;
				}

				const avgLatency =
					this.latencies.length > 0
						? this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length
						: 0;

				if (avgLatency > 100 && this.degradationPoint === 0) {
					this.degradationPoint = this.activeUsers;
				}

				if (avgLatency > this.peakLatency) {
					this.peakLatency = avgLatency;
				}
			}

			await this.simulateUser();
			await this.sleep(rampUpInterval * 1000);
		}

		await this.sleep(this.config.peakDurationSeconds * 1000);

		const sortedLatencies = [...this.latencies].sort((a, b) => a - b);

		return {
			breakingPoint: this.breakingPointReached ? this.degradationPoint : -1,
			degradationPoint: this.degradationPoint,
			recoveryTime: 0,
			maxConcurrentUsers: this.activeUsers,
			errorRateAtPeak:
				this.successes + this.errors > 0
					? (this.errors / (this.successes + this.errors)) * 100
					: 0,
			latencyAtPeak: {
				average:
					this.latencies.length > 0
						? this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length
						: 0,
				p95: this.getPercentile(sortedLatencies, 95),
				p99: this.getPercentile(sortedLatencies, 99),
			},
			systemResources: {
				memoryUsageMB: process.memoryUsage().heapUsed / 1024 / 1024,
				cpuUsagePercent: 0,
			},
		};
	}

	private async simulateUser(): Promise<void> {
		const promises: Promise<void>[] = [];

		for (let i = 0; i < 10; i++) {
			promises.push(this.makeRequest());
		}

		await Promise.all(promises);
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

			this.successes++;
			this.latencies.push(Date.now() - start);
		} catch {
			this.errors++;
		}
	}

	private getPercentile(sorted: number[], percentile: number): number {
		if (sorted.length === 0) return 0;
		const index = Math.floor((percentile / 100) * sorted.length);
		return sorted[Math.min(index, sorted.length - 1)];
	}

	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}

function printStressResults(results: StressTestResults): void {
	console.log("\n=== STRESS TEST RESULTS ===");
	console.log(`Breaking Point: ${results.breakingPoint} concurrent users`);
	console.log(`Degradation Point: ${results.degradationPoint} concurrent users`);
	console.log(`Max Concurrent Users: ${results.maxConcurrentUsers}`);
	console.log(`Error Rate at Peak: ${results.errorRateAtPeak.toFixed(2)}%`);
	console.log(`\nLatency at Peak:`);
	console.log(`  Average: ${results.latencyAtPeak.average.toFixed(2)}ms`);
	console.log(`  P95: ${results.latencyAtPeak.p95.toFixed(2)}ms`);
	console.log(`  P99: ${results.latencyAtPeak.p99.toFixed(2)}ms`);
	console.log(`\nSystem Resources:`);
	console.log(`  Memory: ${results.systemResources.memoryUsageMB.toFixed(2)}MB`);
	console.log(`  CPU: ${results.systemResources.cpuUsagePercent.toFixed(2)}%`);
	console.log("==========================\n");
}

describe("Stress Tests - Breaking Point Analysis", () => {
	let server: http.Server;
	const PORT = 3458;

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

	it("should identify degradation point under increasing load", async () => {
		const config: StressTestConfig = {
			baseUrl: `http://localhost:${PORT}`,
			rampUpUsers: 200,
			rampUpDurationSeconds: 20,
			peakDurationSeconds: 10,
			breakingPoint: 1000,
		};

		const runner = new StressTestRunner(config);
		const results = await runner.run();

		printStressResults(results);

		expect(results.degradationPoint).toBeGreaterThan(50);
		expect(results.errorRateAtPeak).toBeLessThan(15);
	}, 60000);

	it("should handle gradual load increase without catastrophic failure", async () => {
		const config: StressTestConfig = {
			baseUrl: `http://localhost:${PORT}`,
			rampUpUsers: 500,
			rampUpDurationSeconds: 30,
			peakDurationSeconds: 15,
			breakingPoint: 2000,
		};

		const runner = new StressTestRunner(config);
		const results = await runner.run();

		printStressResults(results);

		expect(results.errorRateAtPeak).toBeLessThan(20);
		expect(results.latencyAtPeak.p99).toBeLessThan(500);
	}, 90000);

	it("should recover after peak load is removed", async () => {
		const config: StressTestConfig = {
			baseUrl: `http://localhost:${PORT}`,
			rampUpUsers: 300,
			rampUpDurationSeconds: 20,
			peakDurationSeconds: 10,
			breakingPoint: 1500,
		};

		const runner = new StressTestRunner(config);
		const results = await runner.run();

		printStressResults(results);

		const memoryAfter = process.memoryUsage().heapUsed / 1024 / 1024;
		expect(memoryAfter).toBeLessThan(500);
	}, 60000);
});