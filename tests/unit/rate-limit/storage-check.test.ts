import { describe, expect, it } from "bun:test";
import { rateLimit, SlidingWindowLog, TokenBucket } from "../../../src/";
import { TestRateLimitStorage } from "../../helpers/storage";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("rateLimit with storage.check", () => {
	it("delegates to storage.check when the storage implements it", async () => {
		const storage = new TokenBucket({
			bucketSize: 3,
			refillRate: 1,
			refillIntervalMs: 1000,
		});
		const limiter = rateLimit({
			maxRequests: 3,
			windowMs: 60_000,
			storage,
			keyBy: () => "tb-key",
		});

		expect(typeof storage.check).toBe("function");

		await storage.increment("tb-key", 60_000);
		await storage.increment("tb-key", 60_000);

		const result = await limiter.check(new Request("http://localhost/x"));
		expect(result.allowed).toBe(true);
		expect(result.remaining).toBe(1);
		expect(result.limit).toBe(3);
	});

	it("blocks after the bucket ceiling (TokenBucket)", async () => {
		const storage = new TokenBucket({
			bucketSize: 3,
			refillRate: 1,
			refillIntervalMs: 1000,
		});
		const limiter = rateLimit({
			maxRequests: 3,
			windowMs: 60_000,
			storage,
			keyBy: () => "tb-key",
		});
		const request = new Request("http://localhost/x");

		for (let i = 0; i < 3; i++) {
			await storage.increment("tb-key", 60_000);
		}

		const blocked = await limiter.check(request);
		expect(blocked.allowed).toBe(false);
		expect(blocked.remaining).toBe(0);
		expect(blocked.retryAfter).toBeGreaterThan(0);
		expect(blocked.limit).toBe(3);
	});

	it("frees the bucket after refill (TokenBucket)", async () => {
		const storage = new TokenBucket({
			bucketSize: 2,
			refillRate: 1,
			refillIntervalMs: 50,
		});
		const limiter = rateLimit({
			maxRequests: 2,
			windowMs: 60_000,
			storage,
			keyBy: () => "tb-key",
		});
		const request = new Request("http://localhost/x");

		await storage.increment("tb-key", 60_000);
		await storage.increment("tb-key", 60_000);

		expect((await limiter.check(request)).allowed).toBe(false);

		await sleep(60);

		const allowed = await limiter.check(request);
		expect(allowed.allowed).toBe(true);
		expect(allowed.remaining).toBeGreaterThan(0);
	});

	it("blocks at the ceiling (SlidingWindowLog)", async () => {
		const storage = new SlidingWindowLog({
			maxRequests: 5,
			windowMs: 60_000,
		});
		const limiter = rateLimit({
			maxRequests: 5,
			windowMs: 60_000,
			storage,
			keyBy: () => "sw-key",
		});
		const request = new Request("http://localhost/x");

		for (let i = 0; i < 5; i++) {
			await storage.increment("sw-key", 60_000);
		}

		const blocked = await limiter.check(request);
		expect(blocked.allowed).toBe(false);
		expect(blocked.remaining).toBe(0);
		expect(blocked.limit).toBe(5);
	});

	it("keeps N allowed / N+1 blocked for a fixed-window counter without check", async () => {
		const storage = new TestRateLimitStorage();
		const limiter = rateLimit({
			maxRequests: 4,
			windowMs: 60_000,
			storage,
			keyBy: () => "fw-key",
		});
		const request = new Request("http://localhost/x");

		for (let i = 0; i < 4; i++) {
			expect((await limiter.check(request)).allowed).toBe(true);
		}

		const blocked = await limiter.check(request);
		expect(blocked.allowed).toBe(false);
		expect(blocked.remaining).toBe(0);
	});
});
