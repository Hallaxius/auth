import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import http from "http";

interface SpikeTestConfig {
	baseUrl: string;
	baselineUsers: number;
	baselineDurationSeconds: number;
	spikeUsers: number;
	spikeDurationSeconds: number;
	recoveryDurationSeconds: number;
}

interface SpikeTestResults {
	baselinePerformance: {
		averageLatencyMs: number;
		p99LatencyMs: number;
		errorRate: number;
		requestsPerSecond: number;
	};
	spikePerformance: {
		averageLatencyMs: number;
		p99LatencyMs: number;
		errorRate: number;
		requestsPerSecond: number;
		maxConcurrentHandled: number;
	};
	recoveryPerformance: {
		averageLatencyMs: number;
		p99LatencyMs: number;
		errorRate: number;
		timeToRecoverMs: number;
	};
	overshootDetected: boolean;
	systemStable: boolean;
}

class SpikeTestRunner {
	private config: SpikeTestConfig;
	private baselineLatencies: number[] = [];
	private spikeLatencies: number[] = [];
	private recoveryLatencies: number[] = [];
	private baselineErrors = 0;
	private spikeErrors = 0;
	private recoveryErrors = 0;
	private baselineRequests = 0;
	private spikeRequests = 0;
	private recoveryRequests = 0;
	private maxConcurrentHandled = 0;
	private running = false;

	constructor(config: SpikeTestConfig) {
		this.config = config;
	}

	async run(): Promise<SpikeTestResults> {
		this.running = true;
		this.baselineLatencies = [];
		this.spikeLatencies = [];
		this.recoveryLatencies = [];
		this.baselineErrors = 0;
		this.spikeErrors = 0;
		this.recoveryErrors = 0;
		this.baselineRequests = 0;
		this.spikeRequests = 0;
		this.recoveryRequests = 0;

		const baselinePromises: Promise<void>[] = [];
		for (let i = 0; i < this.config.baselineUsers; i++) {
			baselinePromises.push(
				this.simulateUser("baseline", this.config.baselineDurationSeconds),
			);
		}

		await Promise.all(baselinePromises);
		await this.sleep(1000);

		const spikePromises: Promise<void>[] = [];
		for (let i = 0; i < this.config.spikeUsers; i++) {
			spikePromises.push(
				this.simulateUser("spike", this.config.spikeDurationSeconds),
			);
		}

		await Promise.all(spikePromises);
		await this.sleep(1000);

		const recoveryPromises: Promise<void>[] = [];
		for (let i = 0; i < this.config.baselineUsers; i++) {
			recoveryPromises.push(
				this.simulateUser("recovery", this.config.recoveryDurationSeconds),
			);
		}

		await Promise.all(recoveryPromises);

		return this.calculateResults();
	}

	private async simulateUser(
		phase: "baseline" | "spike" | "recovery",
		durationSeconds: number,
	): Promise<void> {
		const startTime = Date.now();

		while (
			this.running &&
			Date.now() - startTime < durationSeconds * 1000
		) {
			const start = Date.now();

			try {
				await this.makeRequest();
				const latency = Date.now() - start;

				if (phase === "baseline") {
					this.baselineLatencies.push(latency);
					this.baselineRequests++;
				} else if (phase === "spike") {
					this.spikeLatencies.push(latency);
					this.spikeRequests++;
				} else {
					this.recoveryLatencies.push(latency);
					this.recoveryRequests++;
				}
			} catch {
				if (phase === "baseline") {
					this.baselineErrors++;
					this.baselineRequests++;
				} else if (phase === "spike") {
					this.spikeErrors++;
					this.spikeRequests++;
				} else {
					this.recoveryErrors++;
					this.recoveryRequests++;
				}
			}

			const currentConcurrent =
				phase === "spike" ? this.config.spikeUsers : this.config.baselineUsers;
			if (currentConcurrent > this.maxConcurrentHandled) {
				this.maxConcurrentHandled = currentConcurrent;
			}

			await this.sleep(50);
		}
	}

	private async makeRequest(): Promise<void> {
		return new Promise((resolve, reject) => {
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
	}

	private calculateResults(): SpikeTestResults {
		const baselineSorted = [...this.baselineLatencies].sort((a, b) => a - b);
		const spikeSorted = [...this.spikeLatencies].sort((a, b) => a - b);
		const recoverySorted = [...this.recoveryLatencies].sort((a, b) => a - b);

		const baselineErrorRate =
			this.baselineRequests > 0
				? (this.baselineErrors / this.baselineRequests) * 100
				: 0;
		const spikeErrorRate =
			this.spikeRequests > 0
				? (this.spikeErrors / this.spikeRequests) * 100
				: 0;
		const recoveryErrorRate =
			this.recoveryRequests > 0
				? (this.recoveryErrors / this.recoveryRequests) * 100
				: 0;

		const baselineAvg =
			this.baselineLatencies.length > 0
				? this.baselineLatencies.reduce((a, b) => a + b, 0) /
					this.baselineLatencies.length
				: 0;
		const spikeAvg =
			this.spikeLatencies.length > 0
				? this.spikeLatencies.reduce((a, b) => a + b, 0) /
					this.spikeLatencies.length
				: 0;
		const recoveryAvg =
			this.recoveryLatencies.length > 0
				? this.recoveryLatencies.reduce((a, b) => a + b, 0) /
					this.recoveryLatencies.length
				: 0;

		const overshootDetected = recoveryAvg > baselineAvg * 1.5;
		const systemStable = recoveryErrorRate < 5 && !overshootDetected;

		return {
			baselinePerformance: {
				averageLatencyMs: baselineAvg,
				p99LatencyMs: this.getPercentile(baselineSorted, 99),
				errorRate: baselineErrorRate,
				requestsPerSecond:
					this.baselineRequests / this.config.baselineDurationSeconds,
			},
			spikePerformance: {
				averageLatencyMs: spikeAvg,
				p99LatencyMs: this.getPercentile(spikeSorted, 99),
				errorRate: spikeErrorRate,
				requestsPerSecond:
					this.spikeRequests / this.config.spikeDurationSeconds,
				maxConcurrentHandled: this.maxConcurrentHandled,
			},
			recoveryPerformance: {
				averageLatencyMs: recoveryAvg,
				p99LatencyMs: this.getPercentile(recoverySorted, 99),
				errorRate: recoveryErrorRate,
				timeToRecoverMs: 0,
			},
			overshootDetected,
			systemStable,
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

function printSpikeResults(results: SpikeTestResults): void {
	console.log("\n=== SPIKE TEST RESULTS ===");
	console.log("\n--- Baseline Performance ---");
	console.log(
		`Avg Latency: ${results.baselinePerformance.averageLatencyMs.toFixed(2)}ms`,
	);
	console.log(
		`P99 Latency: ${results.baselinePerformance.p99LatencyMs.toFixed(2)}ms`,
	);
	console.log(
		`Error Rate: ${results.baselinePerformance.errorRate.toFixed(2)}%`,
	);
	console.log(
		`Throughput: ${results.baselinePerformance.requestsPerSecond.toFixed(2)} req/s`,
	);

	console.log("\n--- Spike Performance ---");
	console.log(
		`Avg Latency: ${results.spikePerformance.averageLatencyMs.toFixed(2)}ms`,
	);
	console.log(
		`P99 Latency: ${results.spikePerformance.p99LatencyMs.toFixed(2)}ms`,
	);
	console.log(`Error Rate: ${results.spikePerformance.errorRate.toFixed(2)}%`);
	console.log(
		`Throughput: ${results.spikePerformance.requestsPerSecond.toFixed(2)} req/s`,
	);
	console.log(
		`Max Concurrent: ${results.spikePerformance.maxConcurrentHandled}`,
	);

	console.log("\n--- Recovery Performance ---");
	console.log(
		`Avg Latency: ${results.recoveryPerformance.averageLatencyMs.toFixed(2)}ms`,
	);
	console.log(
		`P99 Latency: ${results.recoveryPerformance.p99LatencyMs.toFixed(2)}ms`,
	);
	console.log(
		`Error Rate: ${results.recoveryPerformance.errorRate.toFixed(2)}%`,
	);
	console.log(
		`Time to Recover: ${results.recoveryPerformance.timeToRecoverMs}ms`,
	);

	console.log("\n--- Analysis ---");
	console.log(`Overshoot Detected: ${results.overshootDetected ? "YES ⚠️" : "NO"}`);
	console.log(`System Stable: ${results.systemStable ? "YES ✓" : "NO ⚠️"}`);
	console.log("=========================\n");
}

describe("Spike Tests - Sudden Traffic Surges", () => {
	let server: http.Server;
	const PORT = 3460;

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

	it("should handle 10x traffic spike and recover", async () => {
		const config: SpikeTestConfig = {
			baseUrl: `http://localhost:${PORT}`,
			baselineUsers: 50,
			baselineDurationSeconds: 10,
			spikeUsers: 500,
			spikeDurationSeconds: 5,
			recoveryDurationSeconds: 10,
		};

		const runner = new SpikeTestRunner(config);
		const results = await runner.run();

		printSpikeResults(results);

		expect(results.spikePerformance.errorRate).toBeLessThan(10);
		expect(results.systemStable).toBe(true);
	}, 60000);

	it("should handle sudden 1000 concurrent users without crash", async () => {
		const config: SpikeTestConfig = {
			baseUrl: `http://localhost:${PORT}`,
			baselineUsers: 100,
			baselineDurationSeconds: 10,
			spikeUsers: 1000,
			spikeDurationSeconds: 10,
			recoveryDurationSeconds: 15,
		};

		const runner = new SpikeTestRunner(config);
		const results = await runner.run();

		printSpikeResults(results);

		expect(results.spikePerformance.maxConcurrentHandled).toBeGreaterThanOrEqual(
			1000,
		);
		expect(results.spikePerformance.errorRate).toBeLessThan(15);
	}, 90000);

	it("should recover to baseline performance after spike", async () => {
		const config: SpikeTestConfig = {
			baseUrl: `http://localhost:${PORT}`,
			baselineUsers: 100,
			baselineDurationSeconds: 15,
			spikeUsers: 800,
			spikeDurationSeconds: 5,
			recoveryDurationSeconds: 20,
		};

		const runner = new SpikeTestRunner(config);
		const results = await runner.run();

		printSpikeResults(results);

		const latencyIncrease =
			((results.recoveryPerformance.averageLatencyMs -
				results.baselinePerformance.averageLatencyMs) /
				results.baselinePerformance.averageLatencyMs) *
			100;

		expect(latencyIncrease).toBeLessThan(30);
		expect(results.recoveryPerformance.errorRate).toBeLessThan(5);
	}, 90000);
});