import { describe, expect, test } from "bun:test";
import { rateLimit } from "../../../src/";
import { TestRateLimitStorage } from "../../helpers/storage";

describe("rateLimit - basic functionality", () => {
	test("allows requests under limit", async () => {
		const limiter = rateLimit({ maxRequests: 5, windowMs: 60000, storage: new TestRateLimitStorage() });
		const req = new Request("http://localhost/api/test");
		const result = await limiter.check(req);
		expect(result.allowed).toBe(true);
		expect(result.remaining).toBeGreaterThanOrEqual(4);
		expect(result.limit).toBe(5);
	});

	test("remaining decreases with each request", async () => {
		const limiter = rateLimit({ maxRequests: 5, windowMs: 60000, storage: new TestRateLimitStorage() });
		const req = new Request("http://localhost/api/remaining-test");
		const first = await limiter.check(req);
		const second = await limiter.check(req);
		expect(second.remaining).toBe(first.remaining - 1);
	});

	test("blocks requests over limit", async () => {
		const limiter = rateLimit({ maxRequests: 5, windowMs: 60000, storage: new TestRateLimitStorage() });
		const req = new Request("http://localhost/api/limit-test", {
			headers: { "x-forwarded-for": "10.0.0.1" },
		});
		for (let i = 0; i < 5; i++) {
			const result = await limiter.check(req);
			expect(result.allowed).toBe(true);
		}
		const blocked = await limiter.check(req);
		expect(blocked.allowed).toBe(false);
		expect(blocked.remaining).toBe(0);
		expect(blocked.retryAfter).toBeGreaterThan(0);
	});

	test("reset clears the counter", async () => {
		const limiter = rateLimit({ maxRequests: 5, windowMs: 60000, storage: new TestRateLimitStorage() });
		const req = new Request("http://localhost/api/reset-test", {
			headers: { "x-forwarded-for": "10.0.0.2" },
		});
		for (let i = 0; i < 5; i++) {
			await limiter.check(req);
		}
		const blocked = await limiter.check(req);
		expect(blocked.allowed).toBe(false);

		await limiter.reset(req);
		const afterReset = await limiter.check(req);
		expect(afterReset.allowed).toBe(true);
		expect(afterReset.remaining).toBe(4);
	});

	test("custom keyBy function works", async () => {
		const customLimiter = rateLimit({
			maxRequests: 2,
			windowMs: 60000,
			storage: new TestRateLimitStorage(),
			keyBy: (req: Request) => req.headers.get("x-api-key") ?? "default",
		});
		const req1 = new Request("http://localhost/api", {
			headers: { "x-api-key": "key-a" },
		});
		const req2 = new Request("http://localhost/api", {
			headers: { "x-api-key": "key-b" },
		});
		expect((await customLimiter.check(req1)).allowed).toBe(true);
		expect((await customLimiter.check(req1)).allowed).toBe(true);
		expect((await customLimiter.check(req1)).allowed).toBe(false);
		expect((await customLimiter.check(req2)).allowed).toBe(true);
	});
});

describe("rateLimit - RFC 8587 headers", () => {
	test("middleware returns RateLimit headers on allowed requests", async () => {
		const limiter = rateLimit({ maxRequests: 10, windowMs: 60000, storage: new TestRateLimitStorage() });
		const req = new Request("http://localhost/api/headers-test");
		const response = await limiter.middleware(req);
		expect(response).toBeUndefined();

		const result = await limiter.check(req);
		expect(result.allowed).toBe(true);
	});

	test("middleware returns 429 with RateLimit headers when blocked", async () => {
		const limiter = rateLimit({ maxRequests: 1, windowMs: 60000, storage: new TestRateLimitStorage() });
		const req = new Request("http://localhost/api/blocked-headers", {
			headers: { "x-forwarded-for": "192.168.1.1" },
		});

		await limiter.check(req);
		const response = await limiter.middleware(req);
		expect(response).not.toBeUndefined();
		expect(response?.status).toBe(429);

		const headers = response?.headers;
		expect(headers?.get("RateLimit-Limit")).toBe("1");
		expect(headers?.get("RateLimit-Remaining")).toBe("0");
		expect(headers?.get("RateLimit-Reset")).toBeDefined();
		expect(headers?.get("Retry-After")).toBeDefined();
	});

	test("RateLimit-Reset is Unix timestamp in seconds", async () => {
		const limiter = rateLimit({ maxRequests: 1, windowMs: 60000, storage: new TestRateLimitStorage() });
		const req = new Request("http://localhost/api/reset-test", {
			headers: { "x-forwarded-for": "10.0.0.10" },
		});

		await limiter.check(req);
		const response = await limiter.middleware(req);
		const resetHeader = response?.headers.get("RateLimit-Reset");
		expect(resetHeader).toBeDefined();
		const resetTime = parseInt(resetHeader!, 10);
		expect(resetTime).toBeGreaterThan(Math.floor(Date.now() / 1000));
	});
});

describe("TestRateLimitStorage - cleanup", () => {
	test("dispose clears the store", async () => {
		const storage = new TestRateLimitStorage();
		await storage.increment("test-key", 60000);
		storage.dispose();
		const afterDispose = await storage.increment("test-key", 60000);
		expect(afterDispose.count).toBe(1);
	});

	test("increment continues counting within window", async () => {
		const storage = new TestRateLimitStorage();
		const key = "test-within-window";

		const first = await storage.increment(key, 60000);
		expect(first.count).toBe(1);

		const second = await storage.increment(key, 60000);
		expect(second.count).toBe(2);

		const third = await storage.increment(key, 60000);
		expect(third.count).toBe(3);

		storage.dispose();
	});

	test("reset removes entry from store", async () => {
		const storage = new TestRateLimitStorage();
		const key = "test-reset";

		await storage.increment(key, 60000);
		await storage.reset(key);

		const afterReset = await storage.increment(key, 60000);
		expect(afterReset.count).toBe(1);

		storage.dispose();
	});

	test("increment resets counter after window expires", async () => {
		const storage = new TestRateLimitStorage();
		const key = "test-window";
		const windowMs = 50;

		const first = await storage.increment(key, windowMs);
		expect(first.count).toBe(1);

		await new Promise((resolve) => setTimeout(resolve, windowMs + 10));

		const afterExpiry = await storage.increment(key, windowMs);
		expect(afterExpiry.count).toBe(1);
		expect(afterExpiry.resetAt).toBeGreaterThan(first.resetAt);

		storage.dispose();
	});
});