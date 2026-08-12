import { describe, expect, it } from "bun:test";
import {
	BurstRateLimiter,
	SlidingWindowCounter,
	SlidingWindowLog,
	TokenBucket,
} from "../../../src/";

describe("SlidingWindowLog", () => {
	it("should allow requests under limit", async () => {
		const limiter = new SlidingWindowLog({
			maxRequests: 5,
			windowMs: 60000,
		});

		for (let i = 0; i < 5; i++) {
			const result = await limiter.check("user1");
			expect(result.allowed).toBe(true);
			await limiter.increment("user1", 60000);
		}

		const result = await limiter.check("user1");
		expect(result.allowed).toBe(false);
	});

	it("should reset after window expires", async () => {
		const limiter = new SlidingWindowLog({
			maxRequests: 2,
			windowMs: 100,
		});

		await limiter.increment("user1", 100);
		await limiter.increment("user1", 100);

		const result1 = await limiter.check("user1");
		expect(result1.allowed).toBe(false);

		await new Promise((resolve) => setTimeout(resolve, 150));

		const result2 = await limiter.check("user1");
		expect(result2.allowed).toBe(true);
	});

	it("should track different keys independently", async () => {
		const limiter = new SlidingWindowLog({
			maxRequests: 2,
			windowMs: 60000,
		});

		await limiter.increment("user1", 60000);
		await limiter.increment("user1", 60000);

		const result1 = await limiter.check("user1");
		expect(result1.allowed).toBe(false);

		const result2 = await limiter.check("user2");
		expect(result2.allowed).toBe(true);
	});
});

describe("TokenBucket", () => {
	it("should allow requests when tokens available", async () => {
		const limiter = new TokenBucket({
			bucketSize: 5,
			refillRate: 1,
			refillIntervalMs: 1000,
		});

		for (let i = 0; i < 5; i++) {
			const result = await limiter.check("user1");
			expect(result.allowed).toBe(true);
			await limiter.increment("user1", 60000);
		}

		const result = await limiter.check("user1");
		expect(result.allowed).toBe(false);
	});

	it("should refill tokens over time", async () => {
		const limiter = new TokenBucket({
			bucketSize: 2,
			refillRate: 1,
			refillIntervalMs: 50,
		});

		await limiter.increment("user1", 60000);
		await limiter.increment("user1", 60000);

		const result1 = await limiter.check("user1");
		expect(result1.allowed).toBe(false);

		await new Promise((resolve) => setTimeout(resolve, 60));

		const result2 = await limiter.check("user1");
		expect(result2.allowed).toBe(true);
	});

	it("should consume multiple tokens", async () => {
		const limiter = new TokenBucket({
			bucketSize: 5,
			refillRate: 1,
			refillIntervalMs: 1000,
		});

		const consumed = await limiter.consume("user1", 3);
		expect(consumed).toBe(true);

		const result = await limiter.check("user1");
		expect(result.remaining).toBe(2);
	});
});

describe("SlidingWindowCounter", () => {
	it("should estimate count using sliding window", async () => {
		const limiter = new SlidingWindowCounter({
			maxRequests: 10,
			windowMs: 100,
		});

		for (let i = 0; i < 5; i++) {
			await limiter.increment("user1");
		}

		const result = await limiter.check("user1");
		expect(result.allowed).toBe(true);
		expect(result.remaining).toBeLessThanOrEqual(5);
	});

	it("should block when limit exceeded", async () => {
		const limiter = new SlidingWindowCounter({
			maxRequests: 3,
			windowMs: 100,
		});

		for (let i = 0; i < 5; i++) {
			await limiter.increment("user1");
		}

		const result = await limiter.check("user1");
		expect(result.allowed).toBe(false);
	});
});

describe("BurstRateLimiter", () => {
	it("should allow burst within limits", async () => {
		const limiter = new BurstRateLimiter({
			maxBurst: 5,
			burstWindowMs: 1000,
			sustainedLimit: 10,
			sustainedWindowMs: 60000,
		});

		for (let i = 0; i < 5; i++) {
			const result = await limiter.check("user1");
			expect(result.allowed).toBe(true);
			await limiter.increment("user1");
		}

		const result = await limiter.check("user1");
		expect(result.allowed).toBe(false);
	});

	it("should enforce both burst and sustained limits", async () => {
		const limiter = new BurstRateLimiter({
			maxBurst: 10,
			burstWindowMs: 1000,
			sustainedLimit: 3,
			sustainedWindowMs: 60000,
		});

		for (let i = 0; i < 3; i++) {
			const result = await limiter.check("user1");
			expect(result.allowed).toBe(true);
			await limiter.increment("user1");
		}

		const result = await limiter.check("user1");
		expect(result.allowed).toBe(false);
	});

	it("should reset burst window faster than sustained", async () => {
		const limiter = new BurstRateLimiter({
			maxBurst: 2,
			burstWindowMs: 50,
			sustainedLimit: 10,
			sustainedWindowMs: 200,
		});

		await limiter.increment("user1");
		await limiter.increment("user1");

		await new Promise((resolve) => setTimeout(resolve, 60));

		const result = await limiter.check("user1");
		expect(result.allowed).toBe(true);
		expect(result.remaining).toBeGreaterThan(0);
	});
});

