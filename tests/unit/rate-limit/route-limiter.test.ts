import { describe, expect, it } from "bun:test";
import { RouteLimiter } from "../../../src/rate-limit/route-limiter";
import type { RouteRateLimitConfig } from "../../../src/rate-limit/route-limiter";
import { TestRateLimitStorage } from "../../helpers/storage";

function createConfig(): RouteRateLimitConfig {
	return {
		enabled: true,
		default: { maxRequests: 100, windowMs: 60_000 },
		routes: [
			{
				path: "/auth/login",
				method: "GET",
				maxRequests: 1,
				windowMs: 60_000,
			},
			{
				path: "/auth/login",
				method: "POST",
				maxRequests: 3,
				windowMs: 60_000,
			},
		],
		storage: new TestRateLimitStorage(),
	};
}

describe("RouteLimiter - method-aware rule cache", () => {
	it("applies different rules for GET and POST on the same path", async () => {
		const limiter = new RouteLimiter(createConfig());
		const getRequest = new Request("http://localhost/auth/login", {
			method: "GET",
		});
		const postRequest = new Request("http://localhost/auth/login", {
			method: "POST",
		});

		const firstGet = await limiter.check(getRequest);
		expect(firstGet.allowed).toBe(true);
		expect(firstGet.limit).toBe(1);

		const secondGet = await limiter.check(getRequest);
		expect(secondGet.allowed).toBe(false);

		for (let i = 0; i < 3; i++) {
			const result = await limiter.check(postRequest);
			expect(result.allowed).toBe(true);
			expect(result.limit).toBe(3);
		}

		const fourthPost = await limiter.check(postRequest);
		expect(fourthPost.allowed).toBe(false);
	});

	it("applies the GET rule after POST requests were made", async () => {
		const limiter = new RouteLimiter(createConfig());
		const postRequest = new Request("http://localhost/auth/login", {
			method: "POST",
		});

		for (let i = 0; i < 3; i++) {
			expect((await limiter.check(postRequest)).allowed).toBe(true);
		}
		expect((await limiter.check(postRequest)).allowed).toBe(false);

		const getRequest = new Request("http://localhost/auth/login", {
			method: "GET",
		});
		const getResult = await limiter.check(getRequest);
		expect(getResult.allowed).toBe(true);
		expect(getResult.limit).toBe(1);

		const secondGet = await limiter.check(getRequest);
		expect(secondGet.allowed).toBe(false);
	});
});
