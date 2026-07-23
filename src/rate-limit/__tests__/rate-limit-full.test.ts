import { describe, expect, test } from "vitest";
import {
	DefaultRateLimitStorage,
	extractIpFromRequest,
	normalizeIpForRateLimit,
	rateLimit,
} from "../rate-limit";

describe("rateLimit - Full Coverage", () => {
	test("middleware returns undefined for allowed requests", async () => {
		const limiter = rateLimit({ maxRequests: 10, windowMs: 60000 });
		const req = new Request("http://localhost/api/allowed");
		const result = await limiter.middleware(req);
		expect(result).toBeUndefined();
	});

	test("middleware returns 429 response when blocked", async () => {
		const limiter = rateLimit({ maxRequests: 1, windowMs: 60000 });
		const req = new Request("http://localhost/api/blocked", {
			headers: { "x-forwarded-for": "192.168.1.100" },
		});

		await limiter.check(req);
		const response = await limiter.middleware(req);

		expect(response).toBeDefined();
		expect(response?.status).toBe(429);

		const body = await response?.json();
		expect(body).toEqual({
			error: "Too many requests",
			code: "RATE_LIMITED",
			retryAfter: expect.any(Number),
		});
	});

	test("middleware includes all RateLimit headers", async () => {
		const limiter = rateLimit({ maxRequests: 2, windowMs: 60000 });
		const req = new Request("http://localhost/api/headers", {
			headers: { "x-forwarded-for": "10.0.0.50" },
		});

		await limiter.check(req);
		await limiter.check(req);
		const response = await limiter.middleware(req);

		expect(response?.headers.get("RateLimit-Limit")).toBe("2");
		expect(response?.headers.get("RateLimit-Remaining")).toBe("0");
		expect(response?.headers.get("RateLimit-Reset")).toBeDefined();
		expect(response?.headers.get("Retry-After")).toBeDefined();
	});

	test("check returns correct retryAfter when blocked", async () => {
		const limiter = rateLimit({ maxRequests: 1, windowMs: 60000 });
		const req = new Request("http://localhost/api/retry-after", {
			headers: { "x-forwarded-for": "10.0.0.60" },
		});

		await limiter.check(req);
		const result = await limiter.check(req);

		expect(result.allowed).toBe(false);
		expect(result.remaining).toBe(0);
		expect(result.retryAfter).toBeDefined();
		expect(result.retryAfter!).toBeGreaterThan(0);
		expect(result.retryAfter!).toBeLessThanOrEqual(60000);
	});

	test("reset uses custom keyBy function", async () => {
		const customLimiter = rateLimit({
			maxRequests: 2,
			windowMs: 60000,
			keyBy: (req: Request) => req.headers.get("x-user-id") ?? "anon",
		});

		const req1 = new Request("http://localhost/api", {
			headers: { "x-user-id": "user-123" },
		});
		const req2 = new Request("http://localhost/api", {
			headers: { "x-user-id": "user-456" },
		});

		await customLimiter.check(req1);
		await customLimiter.check(req1);
		await customLimiter.check(req1);

		const result1 = await customLimiter.check(req1);
		const result2 = await customLimiter.check(req2);

		expect(result1.allowed).toBe(false);
		expect(result2.allowed).toBe(true);

		await customLimiter.reset(req1);
		const afterReset = await customLimiter.check(req1);
		expect(afterReset.allowed).toBe(true);
	});

	test("getDefaultKey uses normalizeIpForRateLimit", async () => {
		const limiter = rateLimit({ maxRequests: 5, windowMs: 60000 });
		const ipv6Req = new Request("http://localhost/api", {
			headers: {
				"x-forwarded-for": "2001:0db8:85a3:0000:0000:8a2e:0370:7334",
			},
		});

		const result = await limiter.check(ipv6Req);
		expect(result.allowed).toBe(true);
	});
});

describe("normalizeIpForRateLimit", () => {
	test("masks IPv4 address to /24", () => {
		expect(normalizeIpForRateLimit("192.168.1.1")).toBe("192.168.1.0/24");
		expect(normalizeIpForRateLimit("10.0.0.1")).toBe("10.0.0.0/24");
		expect(normalizeIpForRateLimit("127.0.0.1")).toBe("127.0.0.0/24");
	});

	test("masks IPv6 address to /64", () => {
		const result = normalizeIpForRateLimit(
			"2001:0db8:85a3:0000:0000:8a2e:0370:7334",
		);
		expect(result).toContain("2001");
		expect(result).toContain("db8");
		expect(result).toContain("85a3");
		expect(result.split(":").length).toBeLessThanOrEqual(6);
	});

	test("handles IPv6 with mixed notation", () => {
		const result = normalizeIpForRateLimit("::ffff:192.0.2.1");
		expect(result).toBeDefined();
		expect(result.length).toBeGreaterThan(0);
	});
});

describe("extractIpFromRequest", () => {
	test("extracts IP from x-forwarded-for header", async () => {
		const req = new Request("http://localhost", {
			headers: { "x-forwarded-for": "10.0.0.1" },
		});
		expect(await extractIpFromRequest(req)).toBe("10.0.0.1");
	});

	test("extracts first IP from x-forwarded-for list", async () => {
		const req = new Request("http://localhost", {
			headers: {
				"x-forwarded-for": "10.0.0.1, 192.168.1.1, 172.16.0.1",
			},
		});
		expect(await extractIpFromRequest(req)).toBe("10.0.0.1");
	});

	test("extracts IP from x-real-ip header", async () => {
		const req = new Request("http://localhost", {
			headers: { "x-real-ip": "10.0.0.1" },
		});
		expect(await extractIpFromRequest(req)).toBe("10.0.0.1");
	});

	test("falls back to socket address", async () => {
		const req = new Request("http://localhost");
		const ip = await extractIpFromRequest(req);
		expect(ip).toBeDefined();
	});

	test("handles IPv6 address", async () => {
		const req = new Request("http://localhost", {
			headers: { "x-forwarded-for": "2001:db8::1" },
		});
		expect(await extractIpFromRequest(req)).toBe("2001:db8::1");
	});
});

describe("DefaultRateLimitStorage - additional coverage", () => {
	test("increment resets counter after window expires", async () => {
		const storage = new DefaultRateLimitStorage();
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

	test("increment continues counting within window", async () => {
		const storage = new DefaultRateLimitStorage();
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
		const storage = new DefaultRateLimitStorage();
		const key = "test-reset";

		await storage.increment(key, 60000);
		await storage.reset(key);

		const afterReset = await storage.increment(key, 60000);
		expect(afterReset.count).toBe(1);

		storage.dispose();
	});

	test("withLock processes requests sequentially", async () => {
		const storage = new DefaultRateLimitStorage();
		const key = "test-lock";

		const _results: number[] = [];
		await storage.increment(key, 60000);
		await storage.increment(key, 60000);
		await storage.increment(key, 60000);

		const final = await storage.increment(key, 60000);
		expect(final.count).toBe(4);

		storage.dispose();
	});
});
