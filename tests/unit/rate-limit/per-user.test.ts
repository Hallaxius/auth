import { describe, expect, it } from "bun:test";
import { EndpointSpecificLimiter, PerUserRateLimiter } from "../../../src/";

describe("PerUserRateLimiter", () => {
	it("should apply default tier for unknown users", async () => {
		const limiter = new PerUserRateLimiter({
			defaultTier: {
				tierName: "free",
				maxRequests: 5,
				windowMs: 60000,
			},
			tiers: new Map(),
		});

		for (let i = 0; i < 5; i++) {
			const result = await limiter.check(
				new Request("http://example.com"),
				undefined,
			);
			expect(result.allowed).toBe(true);
		}

		const result = await limiter.check(
			new Request("http://example.com"),
			undefined,
		);
		expect(result.allowed).toBe(false);
	});

	it("should apply different tiers based on user", async () => {
		const tiers = new Map([
			["free", { tierName: "free", maxRequests: 2, windowMs: 60000 }],
			["premium", { tierName: "premium", maxRequests: 10, windowMs: 60000 }],
		]);

		const limiter = new PerUserRateLimiter({
			defaultTier: tiers.get("free")!,
			tiers,
			getUserTier: async (userId) => {
				return userId.startsWith("premium") ? "premium" : "free";
			},
		});

		const freeReq1 = new Request("http://example.com", {
			headers: { "x-forwarded-for": "192.168.1.1" },
		});
		const freeResult1 = await limiter.check(freeReq1, "user-free");
		expect(freeResult1.allowed).toBe(true);
		expect(freeResult1.tier).toBe("free");

		const freeReq2 = new Request("http://example.com", {
			headers: { "x-forwarded-for": "192.168.1.1" },
		});
		const freeResult2 = await limiter.check(freeReq2, "user-free");
		expect(freeResult2.allowed).toBe(true);

		const freeReq3 = new Request("http://example.com", {
			headers: { "x-forwarded-for": "192.168.1.1" },
		});
		const freeResult3 = await limiter.check(freeReq3, "user-free");
		expect(freeResult3.allowed).toBe(false);

		const premiumReq = new Request("http://example.com", {
			headers: { "x-forwarded-for": "192.168.1.2" },
		});
		const premiumResult = await limiter.check(premiumReq, "premium-user");
		expect(premiumResult.allowed).toBe(true);
		expect(premiumResult.tier).toBe("premium");
	});

	it("should include tier information in result", async () => {
		const tiers = new Map([
			["premium", { tierName: "premium", maxRequests: 10, windowMs: 60000 }],
		]);

		const limiter = new PerUserRateLimiter({
			defaultTier: tiers.get("premium")!,
			tiers,
		});

		const result = await limiter.check(
			new Request("http://example.com"),
			"user1",
		);
		expect(result.tier).toBe("premium");
	});
});

describe("EndpointSpecificLimiter", () => {
	it("should apply different limits to different endpoints", async () => {
		const limiter = new EndpointSpecificLimiter({
			defaultLimit: {
				maxRequests: 100,
				windowMs: 60000,
			},
			endpoints: [
				{
					pathPattern: "/api/login",
					maxRequests: 5,
					windowMs: 60000,
				},
				{
					pathPattern: "/api/search",
					maxRequests: 10,
					windowMs: 60000,
				},
			],
		});

		const loginRequest = new Request("http://example.com/api/login");
		const searchRequest = new Request("http://example.com/api/search");

		for (let i = 0; i < 5; i++) {
			await limiter.check(loginRequest);
		}

		const loginResult = await limiter.check(loginRequest);
		expect(loginResult.allowed).toBe(false);
		expect(loginResult.endpoint).toBe("/api/login");

		const searchResult = await limiter.check(searchRequest);
		expect(searchResult.allowed).toBe(true);
		expect(searchResult.endpoint).toBe("/api/search");
	});

	it("should match endpoints using regex patterns", async () => {
		const limiter = new EndpointSpecificLimiter({
			defaultLimit: {
				maxRequests: 100,
				windowMs: 60000,
			},
			endpoints: [
				{
					pathPattern: /^\/api\/v\d+\/admin/,
					maxRequests: 10,
					windowMs: 60000,
				},
			],
		});

		const adminV1Request = new Request("http://example.com/api/v1/admin");
		const adminV2Request = new Request("http://example.com/api/v2/admin");
		const publicRequest = new Request("http://example.com/api/public");

		for (let i = 0; i < 10; i++) {
			await limiter.check(adminV1Request);
		}

		const adminV1Result = await limiter.check(adminV1Request);
		expect(adminV1Result.allowed).toBe(false);

		const adminV2Result = await limiter.check(adminV2Request);
		expect(adminV2Result.allowed).toBe(false);

		const publicResult = await limiter.check(publicRequest);
		expect(publicResult.allowed).toBe(true);
	});

	it("should filter by HTTP method", async () => {
		const limiter = new EndpointSpecificLimiter({
			defaultLimit: {
				maxRequests: 100,
				windowMs: 60000,
			},
			endpoints: [
				{
					pathPattern: "/api/data",
					maxRequests: 5,
					windowMs: 60000,
					methods: ["POST", "PUT", "DELETE"],
				},
			],
		});

		const postRequest = new Request("http://example.com/api/data", {
			method: "POST",
		});
		const getRequest = new Request("http://example.com/api/data", {
			method: "GET",
		});

		for (let i = 0; i < 5; i++) {
			await limiter.check(postRequest);
		}

		const postResult = await limiter.check(postRequest);
		expect(postResult.allowed).toBe(false);

		const getResult = await limiter.check(getRequest);
		expect(getResult.allowed).toBe(true);
	});
});

