import type { RateLimitCheckResult, RateLimitStorage } from "../types";
import { getRequestIP } from "../utils/ip";

export const MAX_USER_LIMITERS = 2_000;

export interface UserTierConfig {
	tierName: string;
	maxRequests: number;
	windowMs: number;
	burstAllowance?: number;
}

export interface PerUserRateLimitConfig {
	defaultTier: UserTierConfig;
	tiers: Map<string, UserTierConfig>;
	getUserTier?: (userId: string) => Promise<string>;
	storage?: RateLimitStorage;
}

export interface EndpointConfig {
	pathPattern: string | RegExp;
	maxRequests: number;
	windowMs: number;
	methods?: string[];
}

export interface EndpointSpecificConfig {
	defaultLimit: {
		maxRequests: number;
		windowMs: number;
	};
	endpoints: EndpointConfig[];
	storage?: RateLimitStorage;
}

export class PerUserRateLimiter implements RateLimitStorage {
	private defaultTier: UserTierConfig;
	private tiers: Map<string, UserTierConfig>;
	private getUserTier?: (userId: string) => Promise<string>;
	private storage: RateLimitStorage;
	private userLimiters = new Map<
		string,
		{ limiter: RateLimitStorage; tier: string; lastUsedAt: number }
	>();

	constructor(config: PerUserRateLimitConfig) {
		this.defaultTier = config.defaultTier;
		this.tiers = config.tiers;
		this.getUserTier = config.getUserTier;
		this.storage = config.storage ?? new MapBasedStorage();
	}

	async increment(
		key: string,
		_windowMs: number,
	): Promise<{ count: number; resetAt: number }> {
		const userId = this.extractUserId(key);
		if (!userId) {
			return this.storage.increment(key, this.defaultTier.windowMs);
		}

		const tierName = this.getUserTier
			? await this.getUserTier(userId)
			: this.defaultTier.tierName;

		const tier = this.tiers.get(tierName) ?? this.defaultTier;
		const limiterKey = `${userId}:${tierName}`;

		const cached = this.getLimiter(limiterKey);
		if (!cached || cached.tier !== tierName) {
			const limiter = this.createLimiterForTier(tier);
			this.storeLimiter(limiterKey, { limiter, tier: tierName });
			return limiter.increment(key, tier.windowMs);
		}

		return cached.limiter.increment(key, tier.windowMs);
	}

	async reset(key: string): Promise<void> {
		await this.storage.reset(key);
	}

	async check(
		key: string | Request,
		userId?: string,
	): Promise<{
		allowed: boolean;
		remaining: number;
		resetAt: number;
		retryAfter?: number;
		limit: number;
		tier?: string;
	}> {
		const rateKey = typeof key === "string" ? key : await keyFromRequest(key);

		if (!userId) {
			const result = await (
				this.storage as {
					check?(key: string): Promise<RateLimitCheckResult>;
				}
			).check?.(rateKey);
			if (result) return result;

			const incResult = await this.storage.increment(
				rateKey,
				this.defaultTier.windowMs,
			);
			return {
				allowed: incResult.count <= this.defaultTier.maxRequests,
				remaining: Math.max(0, this.defaultTier.maxRequests - incResult.count),
				resetAt: incResult.resetAt,
				limit: this.defaultTier.maxRequests,
			};
		}

		const tierName = this.getUserTier
			? await this.getUserTier(userId)
			: this.defaultTier.tierName;

		const tier = this.tiers.get(tierName) ?? this.defaultTier;
		const limiterKey = `${userId}:${tierName}`;

		let cached = this.getLimiter(limiterKey);
		if (!cached || cached.tier !== tierName) {
			const limiter = this.createLimiterForTier(tier);
			cached = { limiter, tier: tierName, lastUsedAt: Date.now() };
			this.storeLimiter(limiterKey, cached);
		}

		const incResult = await cached.limiter.increment(
			`user-${userId}`,
			tier.windowMs,
		);
		const effectiveLimit = tier.maxRequests + (tier.burstAllowance ?? 0);
		const allowed = incResult.count <= effectiveLimit;

		return {
			allowed,
			remaining: Math.max(0, effectiveLimit - incResult.count),
			resetAt: incResult.resetAt,
			retryAfter: allowed
				? undefined
				: Math.max(0, incResult.resetAt - Date.now()),
			limit: effectiveLimit,
			tier: tierName,
		};
	}

	private getLimiter(key: string):
		| {
				limiter: RateLimitStorage;
				tier: string;
				lastUsedAt: number;
		  }
		| undefined {
		const entry = this.userLimiters.get(key);
		if (entry) {
			entry.lastUsedAt = Date.now();
		}
		return entry;
	}

	private storeLimiter(
		key: string,
		entry: { limiter: RateLimitStorage; tier: string },
	): void {
		this.userLimiters.set(key, { ...entry, lastUsedAt: Date.now() });
		if (this.userLimiters.size > MAX_USER_LIMITERS) {
			let lruKey: string | null = null;
			let lruTime = Number.POSITIVE_INFINITY;
			for (const [candidateKey, candidate] of this.userLimiters) {
				if (candidate.lastUsedAt < lruTime) {
					lruTime = candidate.lastUsedAt;
					lruKey = candidateKey;
				}
			}
			if (lruKey) {
				this.userLimiters.delete(lruKey);
			}
		}
	}

	private createLimiterForTier(tier: UserTierConfig): RateLimitStorage {
		if (tier.burstAllowance) {
			return new BurstStorage(
				tier.maxRequests,
				tier.burstAllowance,
				tier.windowMs,
			);
		}
		return new MapBasedStorage();
	}

	private extractUserId(key: string): string | null {
		const parts = key.split(":");
		for (const part of parts) {
			if (part.startsWith("user-")) {
				return part.slice(5);
			}
		}
		return null;
	}

	dispose(): void {
		for (const { limiter } of this.userLimiters.values()) {
			const d = limiter as { dispose?(): void };
			d.dispose?.();
		}
		this.userLimiters.clear();
		(this.storage as { dispose?(): void }).dispose?.();
	}
}

export class EndpointSpecificLimiter implements RateLimitStorage {
	private defaultLimit: { maxRequests: number; windowMs: number };
	private endpoints: EndpointConfig[];
	private storage: RateLimitStorage;
	private endpointLimiters = new Map<string, RateLimitStorage>();

	constructor(config: EndpointSpecificConfig) {
		this.defaultLimit = config.defaultLimit;
		this.endpoints = config.endpoints;
		this.storage = config.storage ?? new MapBasedStorage();
	}

	async increment(
		key: string,
		_windowMs: number,
	): Promise<{ count: number; resetAt: number }> {
		const endpoint = this.findEndpoint(key);
		if (!endpoint) {
			return this.storage.increment(key, this.defaultLimit.windowMs);
		}

		const limiter = this.getOrCreateLimiter(endpoint);
		const endpointKey = `${key}:${endpoint.pathPattern}`;
		return limiter.increment(endpointKey, endpoint.windowMs);
	}

	async reset(key: string): Promise<void> {
		await this.storage.reset(key);
		for (const endpoint of this.endpoints) {
			const endpointKey = `${key}:${endpoint.pathPattern}`;
			const limiter = this.getOrCreateLimiter(endpoint);
			await limiter.reset(endpointKey);
		}
	}

	async check(key: string | Request): Promise<{
		allowed: boolean;
		remaining: number;
		resetAt: number;
		retryAfter?: number;
		limit: number;
		endpoint?: string;
	}> {
		const path = typeof key === "string" ? key : new URL(key.url).pathname;
		const method = typeof key === "string" ? "GET" : (key.method ?? "GET");

		const endpoint = this.findEndpoint(path, method);
		const limit = endpoint ?? this.defaultLimit;
		const rateKey = typeof key === "string" ? key : await keyFromRequest(key);

		const limiter = endpoint ? this.getOrCreateLimiter(endpoint) : this.storage;
		const endpointKey = endpoint
			? `${rateKey}:${endpoint.pathPattern}`
			: rateKey;

		const result = await (
			limiter as {
				check?(key: string): Promise<RateLimitCheckResult>;
			}
		).check?.(endpointKey);
		if (result) {
			return {
				...result,
				endpoint: endpoint?.pathPattern.toString(),
			};
		}

		const incResult = await limiter.increment(endpointKey, limit.windowMs);

		return {
			allowed: incResult.count <= limit.maxRequests,
			remaining: Math.max(0, limit.maxRequests - incResult.count),
			resetAt: incResult.resetAt,
			limit: limit.maxRequests,
			endpoint: endpoint?.pathPattern.toString(),
		};
	}

	private findEndpoint(path: string, method?: string): EndpointConfig | null {
		for (const endpoint of this.endpoints) {
			if (endpoint.methods && !endpoint.methods.includes(method ?? "GET")) {
				continue;
			}

			if (typeof endpoint.pathPattern === "string") {
				if (path === endpoint.pathPattern) {
					return endpoint;
				}
			} else {
				if (endpoint.pathPattern.test(path)) {
					return endpoint;
				}
			}
		}
		return null;
	}

	private getOrCreateLimiter(endpoint: EndpointConfig): RateLimitStorage {
		const key = endpoint.pathPattern.toString();
		let limiter = this.endpointLimiters.get(key);

		if (!limiter) {
			limiter = new MapBasedStorage();
			this.endpointLimiters.set(key, limiter);
		}

		return limiter;
	}

	dispose(): void {
		for (const limiter of this.endpointLimiters.values()) {
			(limiter as { dispose?(): void }).dispose?.();
		}
		this.endpointLimiters.clear();
		(this.storage as { dispose?(): void }).dispose?.();
	}
}

class MapBasedStorage implements RateLimitStorage {
	private store = new Map<string, { count: number; resetAt: number }>();

	async increment(
		key: string,
		windowMs: number,
	): Promise<{ count: number; resetAt: number }> {
		const now = Date.now();
		const entry = this.store.get(key);

		if (!entry || now >= entry.resetAt) {
			const resetAt = now + windowMs;
			this.store.set(key, { count: 1, resetAt });
			return { count: 1, resetAt };
		}

		entry.count++;
		return { count: entry.count, resetAt: entry.resetAt };
	}

	async reset(key: string): Promise<void> {
		this.store.delete(key);
	}
}

class BurstStorage implements RateLimitStorage {
	private store = new Map<string, { count: number; resetAt: number }>();
	private maxRequests: number;
	private burstAllowance: number;
	private windowMs: number;

	constructor(maxRequests: number, burstAllowance: number, windowMs: number) {
		this.maxRequests = maxRequests;
		this.burstAllowance = burstAllowance;
		this.windowMs = windowMs;
	}

	private get effectiveLimit(): number {
		return this.maxRequests + this.burstAllowance;
	}

	async increment(
		key: string,
		_windowMs: number,
	): Promise<{ count: number; resetAt: number }> {
		const now = Date.now();
		const entry = this.store.get(key);

		if (!entry || now >= entry.resetAt) {
			const resetAt = now + this.windowMs;
			const newEntry = { count: 1, resetAt };
			this.store.set(key, newEntry);
			return newEntry;
		}

		entry.count++;
		return { count: entry.count, resetAt: entry.resetAt };
	}

	async check(key: string): Promise<RateLimitCheckResult> {
		const now = Date.now();
		const entry = this.store.get(key);
		const active = entry && now < entry.resetAt;
		const count = active ? entry.count : 0;
		const limit = this.effectiveLimit;
		const resetAt = active ? entry.resetAt : now + this.windowMs;
		const allowed = count < limit;

		return {
			allowed,
			remaining: Math.max(0, limit - count),
			resetAt,
			retryAfter: allowed ? undefined : Math.max(0, resetAt - now),
			limit,
		};
	}

	async reset(key: string): Promise<void> {
		this.store.delete(key);
	}
}

async function keyFromRequest(request: Request): Promise<string> {
	const ip = (await getRequestIP(request)) ?? "unknown";
	return `ratelimit:${ip}`;
}

export function createPerUserLimiter(
	config: PerUserRateLimitConfig,
): PerUserRateLimiter {
	return new PerUserRateLimiter(config);
}

export function createEndpointSpecificLimiter(
	config: EndpointSpecificConfig,
): EndpointSpecificLimiter {
	return new EndpointSpecificLimiter(config);
}
