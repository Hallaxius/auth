import { describe, expect, test } from "vitest";
import { rateLimit } from "../rate-limit";

describe("rateLimit - _addHeaders coverage", () => {
	test("middleware sets RateLimit headers with retryAfter when blocked", async () => {
		const limiter = rateLimit({
			maxRequests: 1,
			windowMs: 60000,
		});

		const req = new Request("http://localhost/api/test", {
			headers: { "x-forwarded-for": "10.0.0.1" },
		});

		await limiter.check(req);

		const response = await limiter.middleware(req);
		expect(response).toBeDefined();
		expect(response?.status).toBe(429);

		const headers = response?.headers;
		expect(headers?.get("RateLimit-Limit")).toBe("1");
		expect(headers?.get("RateLimit-Remaining")).toBe("0");
		expect(headers?.get("RateLimit-Reset")).toBeDefined();
		expect(headers?.get("Retry-After")).toBeDefined();

		const retryAfter = headers?.get("Retry-After");
		expect(retryAfter).toBeTruthy();
		expect(Number.parseInt(retryAfter!, 10)).toBeGreaterThan(0);
	});

	test("middleware sets RateLimit headers without retryAfter when allowed", async () => {
		const limiter = rateLimit({
			maxRequests: 10,
			windowMs: 60000,
		});

		const req = new Request("http://localhost/api/test");
		const response = await limiter.middleware(req);

		expect(response).toBeUndefined();
	});

	test("RateLimit-Reset header is Unix timestamp in seconds", async () => {
		const limiter = rateLimit({
			maxRequests: 1,
			windowMs: 60000,
		});

		const req = new Request("http://localhost/api/test", {
			headers: { "x-forwarded-for": "192.168.1.1" },
		});

		await limiter.check(req);
		const response = await limiter.middleware(req);

		const resetHeader = response?.headers.get("RateLimit-Reset");
		expect(resetHeader).toBeDefined();

		const resetTime = Number.parseInt(resetHeader!, 10);
		const nowSeconds = Math.floor(Date.now() / 1000);
		expect(resetTime).toBeGreaterThanOrEqual(nowSeconds);
	});

	test("RateLimit headers on first request", async () => {
		const limiter = rateLimit({
			maxRequests: 5,
			windowMs: 60000,
		});

		const req = new Request("http://localhost/api/first");
		const response = await limiter.middleware(req);

		expect(response).toBeUndefined();
	});
});
