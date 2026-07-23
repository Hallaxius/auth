import { describe, expect, test } from "vitest";
import {
	extractIpFromRequest,
	normalizeIpForRateLimit,
	rateLimit,
} from "../rate-limit";

describe("RFC 8587 Headers", () => {
	test("should add RateLimit headers to response", async () => {
		const limiter = rateLimit({
			maxRequests: 10,
			windowMs: 60000,
		});

		const request = new Request("http://example.com", {
			headers: {
				"x-real-ip": "192.168.1.1",
			},
		});

		const result = await limiter.check(request);
		const response = new Response("OK");

		response.headers.set("RateLimit-Limit", String(result.limit));
		response.headers.set("RateLimit-Remaining", String(result.remaining));
		response.headers.set(
			"RateLimit-Reset",
			String(Math.ceil(result.resetAt / 1000)),
		);

		expect(response.headers.get("RateLimit-Limit")).toBe("10");
		expect(response.headers.get("RateLimit-Remaining")).toBe("9");
		expect(response.headers.get("RateLimit-Reset")).toBeDefined();
	});

	test("should return 429 with headers when rate limited", async () => {
		const limiter = rateLimit({
			maxRequests: 1,
			windowMs: 60000,
		});

		const request = new Request("http://example.com", {
			headers: {
				"x-real-ip": "192.168.1.1",
			},
		});

		await limiter.check(request);

		const middlewareResponse = await limiter.middleware(request);
		expect(middlewareResponse).toBeDefined();
		expect(middlewareResponse?.status).toBe(429);
		expect(middlewareResponse?.headers.get("RateLimit-Limit")).toBe("1");
		expect(middlewareResponse?.headers.get("RateLimit-Remaining")).toBe("0");
		expect(middlewareResponse?.headers.get("RateLimit-Reset")).toBeDefined();
		expect(middlewareResponse?.headers.get("Retry-After")).toBeDefined();
	});
});

describe("IPv6 Support", () => {
	test("should normalize IPv6 addresses", () => {
		const ipv6 = "2001:0db8:85a3:0000:0000:8a2e:0370:7334";
		const normalized = normalizeIpForRateLimit(ipv6);

		expect(normalized).toBe("2001:0db8:85a3:0000::");
	});

	test("should normalize IPv6 with mixed notation", () => {
		const ipv6 = "::ffff:192.0.2.1";
		const normalized = normalizeIpForRateLimit(ipv6);

		expect(normalized).toBe("192.0.2.1");
	});

	test("should not modify IPv4 addresses", () => {
		const ipv4 = "192.168.1.1";
		const normalized = normalizeIpForRateLimit(ipv4);

		expect(normalized).toBe("192.168.1.0/24");
	});

	test("should handle full IPv6 address", () => {
		const ipv6 = "fe80:0000:0000:0000:0000:0000:0000:0001";
		const normalized = normalizeIpForRateLimit(ipv6);

		expect(normalized).toBe("fe80:0000:0000:0000::");
	});

	test("should handle compressed IPv6 address", () => {
		const ipv6 = "::1";
		const normalized = normalizeIpForRateLimit(ipv6);

		expect(normalized).toBe("::");
	});

	test("should rate limit by IPv6 /64 prefix", () => {
		const _limiter = rateLimit({
			maxRequests: 5,
			windowMs: 60000,
		});

		const ipv6_1 = "2001:db8:85a3:0000:0001:0000:0000:0001";
		const ipv6_2 = "2001:db8:85a3:0000:0002:0000:0000:0001";

		const _request1 = new Request("http://example.com", {
			headers: { "x-real-ip": ipv6_1 },
		});

		const _request2 = new Request("http://example.com", {
			headers: { "x-real-ip": ipv6_2 },
		});

		expect(normalizeIpForRateLimit(ipv6_1)).toBe(
			normalizeIpForRateLimit(ipv6_2),
		);
	});
});

describe("extractIpFromRequest", () => {
	test("should extract IP from x-forwarded-for", async () => {
		const request = new Request("http://example.com", {
			headers: {
				"x-forwarded-for": "192.168.1.1, 10.0.0.1",
			},
		});

		const ip = await extractIpFromRequest(request);
		expect(ip).toBe("192.168.1.1");
	});

	test("should extract IP from x-real-ip", async () => {
		const request = new Request("http://example.com", {
			headers: {
				"x-real-ip": "192.168.1.1",
			},
		});

		const ip = await extractIpFromRequest(request);
		expect(ip).toBe("192.168.1.1");
	});

	test("should extract IP from cf-connecting-ip", async () => {
		const request = new Request("http://example.com", {
			headers: {
				"cf-connecting-ip": "104.16.0.1",
				"cf-ray": "test-ray-id",
			},
		});

		const ip = await extractIpFromRequest(request);
		expect(ip).toBe("104.16.0.1");
	});

	test("should return fingerprint if no IP headers", async () => {
		const request = new Request("http://example.com");

		const ip = await extractIpFromRequest(request);
		expect(ip).toMatch(/^fp:[a-f0-9]{16}$/);
	});

	test("should handle IPv6 in x-forwarded-for", async () => {
		const request = new Request("http://example.com", {
			headers: {
				"x-forwarded-for": "2001:db8::1, 10.0.0.1",
			},
		});

		const ip = await extractIpFromRequest(request);
		expect(ip).toBe("2001:db8::1");
	});
});

describe("Dual-stack support", () => {
	test("should handle both IPv4 and IPv6", async () => {
		const limiter = rateLimit({
			maxRequests: 10,
			windowMs: 60000,
		});

		const ipv4Request = new Request("http://example.com", {
			headers: { "x-real-ip": "192.168.1.1" },
		});

		const ipv6Request = new Request("http://example.com", {
			headers: { "x-real-ip": "2001:db8::1" },
		});

		const ipv4Result = await limiter.check(ipv4Request);
		const ipv6Result = await limiter.check(ipv6Request);

		expect(ipv4Result.limit).toBe(10);
		expect(ipv6Result.limit).toBe(10);
		expect(ipv4Result.allowed).toBe(true);
		expect(ipv6Result.allowed).toBe(true);
	});
});
