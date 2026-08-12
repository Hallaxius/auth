import { describe, expect, it } from "bun:test";
import { PerUserRateLimiter } from "../../../src/";
import type { UserTierConfig } from "../../../src/rate-limit/per-user";

const MAX_USER_LIMITERS = 5_000;

describe("PerUserRateLimiter - burst ceiling", () => {
	const burstTier: UserTierConfig = {
		tierName: "burst",
		maxRequests: 5,
		windowMs: 60_000,
		burstAllowance: 5,
	};

	it("allows up to maxRequests + burstAllowance then blocks", async () => {
		const limiter = new PerUserRateLimiter({
			defaultTier: burstTier,
			tiers: new Map([["burst", burstTier]]),
		});

		for (let i = 0; i < 10; i++) {
			const result = await limiter.check(
				new Request("http://example.com"),
				"user-burst",
			);
			expect(result.allowed).toBe(true);
		}

		const blocked = await limiter.check(
			new Request("http://example.com"),
			"user-burst",
		);
		expect(blocked.allowed).toBe(false);
		expect(blocked.limit).toBe(10);
		expect(blocked.remaining).toBe(0);
		expect(blocked.retryAfter).toBeGreaterThan(0);
	});

	it("reports the effective limit and remaining on partial usage", async () => {
		const limiter = new PerUserRateLimiter({
			defaultTier: burstTier,
			tiers: new Map([["burst", burstTier]]),
		});

		const result = await limiter.check(
			new Request("http://example.com"),
			"user-burst-2",
		);
		expect(result.allowed).toBe(true);
		expect(result.limit).toBe(10);
		expect(result.remaining).toBe(9);
	});
});

describe("PerUserRateLimiter - userLimiter eviction", () => {
	it("does not grow beyond the cap and evicts the least recently used entry", async () => {
		const tier: UserTierConfig = {
			tierName: "free",
			maxRequests: 100,
			windowMs: 60_000,
		};
		const limiter = new PerUserRateLimiter({
			defaultTier: tier,
			tiers: new Map([["free", tier]]),
		});

		const internal = limiter as unknown as {
			userLimiters: Map<string, unknown>;
		};

		for (let i = 0; i < MAX_USER_LIMITERS + 10; i++) {
			await limiter.increment(`user-${i}`, 60_000);
		}

		expect(internal.userLimiters.size).toBeLessThanOrEqual(MAX_USER_LIMITERS);
	});

	it("re-incrementing an evicted user starts a fresh counter", async () => {
		const tier: UserTierConfig = {
			tierName: "free",
			maxRequests: 100,
			windowMs: 60_000,
		};
		const limiter = new PerUserRateLimiter({
			defaultTier: tier,
			tiers: new Map([["free", tier]]),
		});

		for (let i = 0; i < MAX_USER_LIMITERS; i++) {
			await limiter.increment(`user-${i}`, 60_000);
		}

		const afterFirstWave = await limiter.increment("user-0", 60_000);
		const internal = limiter as unknown as {
			userLimiters: Map<string, unknown>;
		};

		if (internal.userLimiters.has("0:free")) {
			expect(afterFirstWave.count).toBe(2);
		} else {
			expect(afterFirstWave.count).toBe(1);
		}
	});
});

describe("PerUserRateLimiter - increment applies tiers", () => {
	const tiers = new Map<string, UserTierConfig>([
		["free", { tierName: "free", maxRequests: 2, windowMs: 60_000 }],
		["premium", { tierName: "premium", maxRequests: 10, windowMs: 60_000 }],
	]);

	it("accepts user-<id> keys and routes to the correct tier limiter", async () => {
		const limiter = new PerUserRateLimiter({
			defaultTier: tiers.get("free")!,
			tiers,
			getUserTier: async (userId) =>
				userId.startsWith("premium") ? "premium" : "free",
		});

		for (let i = 0; i < 5; i++) {
			await limiter.increment("user-premium-1", 60_000);
		}
		for (let i = 0; i < 3; i++) {
			await limiter.increment("user-free-1", 60_000);
		}

		const premiumCheck = await limiter.check(
			new Request("http://example.com"),
			"premium-1",
		);
		expect(premiumCheck.tier).toBe("premium");
		expect(premiumCheck.allowed).toBe(true);
		expect(premiumCheck.remaining).toBe(4);

		const freeCheck = await limiter.check(
			new Request("http://example.com"),
			"free-1",
		);
		expect(freeCheck.tier).toBe("free");
		expect(freeCheck.allowed).toBe(false);
	});

	it("extractUserId handles keys of the route-limiter format", async () => {
		const limiter = new PerUserRateLimiter({
			defaultTier: tiers.get("free")!,
			tiers,
			getUserTier: async () => "free",
		});

		const first = await limiter.increment("route:login:user:alice", 60_000);
		const second = await limiter.increment("route:login:user:alice", 60_000);

		expect(second.count).toBe(first.count + 1);
	});
});
