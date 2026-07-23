import { describe, expect, test } from "vitest";
import { DefaultRateLimitStorage, rateLimit } from "../rate-limit";

describe("rateLimit - basic functionality", () => {
	test("allows requests under limit", async () => {
		const limiter = rateLimit({ maxRequests: 5, windowMs: 60000 });
		const req = new Request("http://localhost/api/test");
		const result = await limiter.check(req);
		expect(result.allowed).toBe(true);
		expect(result.remaining).toBeGreaterThanOrEqual(4);
		expect(result.limit).toBe(5);
	});

	test("remaining decreases with each request", async () => {
		const limiter = rateLimit({ maxRequests: 5, windowMs: 60000 });
		const req = new Request("http://localhost/api/remaining-test");
		const first = await limiter.check(req);
		const second = await limiter.check(req);
		expect(second.remaining).toBe(first.remaining - 1);
	});

	test("blocks requests over limit", async () => {
		const limiter = rateLimit({ maxRequests: 5, windowMs: 60000 });
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
		const limiter = rateLimit({ maxRequests: 5, windowMs: 60000 });
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
		const limiter = rateLimit({ maxRequests: 10, windowMs: 60000 });
		const req = new Request("http://localhost/api/headers-test");
		const response = await limiter.middleware(req);
		expect(response).toBeUndefined();

		const result = await limiter.check(req);
		expect(result.allowed).toBe(true);
	});

	test("middleware returns 429 with RateLimit headers when blocked", async () => {
		const limiter = rateLimit({ maxRequests: 1, windowMs: 60000 });
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
		const limiter = rateLimit({ maxRequests: 1, windowMs: 60000 });
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

describe("DefaultRateLimitStorage - cleanup", () => {
	test("sweep removes expired entries", async () => {
		const storage = new DefaultRateLimitStorage();
		await storage.increment("expired-key", 10);

		await new Promise((resolve) => setTimeout(resolve, 50));

		await storage.increment("valid-key", 60000);
		storage.dispose();
	});

	test("dispose stops cleanup timer", async () => {
		const storage = new DefaultRateLimitStorage();
		await storage.increment("test-key", 60000);
		storage.dispose();

		await new Promise((resolve) => setTimeout(resolve, 100));
	});

	test("sweep removes expired entries when timer fires", async () => {
		const storage = new DefaultRateLimitStorage();
		await storage.increment("expired-key", 10);
		await new Promise((resolve) => setTimeout(resolve, 30));
		const entry = await storage.increment("expired-key", 60000);
		expect(entry.count).toBe(1);
		storage.dispose();
	});
});
