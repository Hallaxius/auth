import type {
	RateLimitConfig,
	RateLimitResult,
	RateLimitStorage,
} from "./types";
import { getRequestIP, maskIPv4To24, maskIPv6To64 } from "./utils/ip";
import { LruCache } from "./utils/lru";

export class DefaultRateLimitStorage implements RateLimitStorage {
	private store = new LruCache<string, { count: number; resetAt: number }>(
		50_000,
	);
	private locks = new Map<string, Promise<void>>();

	private async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
		const existingLock = this.locks.get(key);
		let resolveLock: () => void;
		const lockPromise = new Promise<void>((resolve) => {
			resolveLock = resolve;
		});

		this.locks.set(key, lockPromise);

		try {
			if (existingLock) {
				await existingLock;
			}
			return await fn();
		} finally {
			resolveLock!();
			this.locks.delete(key);
		}
	}

	async increment(
		key: string,
		windowMs: number,
	): Promise<{ count: number; resetAt: number }> {
		return this.withLock(key, async () => {
			const now = Date.now();
			const entry = this.store.get(key);

			if (!entry || now >= entry.resetAt) {
				const resetAt = now + windowMs;
				const newEntry = { count: 1, resetAt };
				this.store.set(key, newEntry, windowMs);
				return newEntry;
			}

			entry.count++;
			return entry;
		});
	}

	async reset(key: string): Promise<void> {
		this.store.delete(key);
	}

	dispose(): void {
		this.store.dispose();
	}
}

/**
 * Creates a rate limiter middleware
 *
 * Implements sliding window rate limiting with configurable limits and storage.
 * Supports custom key extraction for fine-grained rate limiting (e.g., by user, IP, or API key).
 *
 * @param config - Rate limit configuration
 * @param config.maxRequests - Maximum requests allowed in the window
 * @param config.windowMs - Time window in milliseconds
 * @param config.storage - Optional custom storage (defaults to in-memory LRU cache)
 * @param config.keyBy - Optional function to extract rate limit key from request
 *
 * @returns Object with check, reset, and middleware methods
 *
 * @example
 * ```typescript
 * const limiter = rateLimit({
 *   maxRequests: 100,
 *   windowMs: 60_000, // 1 minute
 * });
 *
 * // Use as middleware
 * const response = await limiter.middleware(request);
 * if (response) return response; // 429 if rate limited
 *
 * // Check rate limit manually
 * const result = await limiter.check(request);
 * console.log(`Remaining: ${result.remaining}`);
 * ```
 *
 * @security
 * - Default key extraction uses masked IP (IPv4 /24, IPv6 /64)
 * - In-memory storage uses LRU cache with 50,000 entry limit
 * - Mutex locks prevent race conditions in concurrent requests
 */
export function rateLimit(config: RateLimitConfig) {
	const storage: RateLimitStorage =
		config.storage ?? new DefaultRateLimitStorage();
	const maxRequests = config.maxRequests;
	const windowMs = config.windowMs;

	return {
		check,
		reset,
		middleware,
	};

	async function check(request: Request): Promise<RateLimitResult> {
		const key = config.keyBy
			? await config.keyBy(request)
			: await getDefaultKey(request);
		const entry = await storage.increment(key, windowMs);

		const allowed = entry.count <= maxRequests;
		const remaining = Math.max(0, maxRequests - entry.count);
		const resetAt = entry.resetAt;

		return {
			allowed,
			limit: maxRequests,
			remaining,
			resetAt,
			retryAfter: allowed ? undefined : Math.max(0, resetAt - Date.now()),
		};
	}

	async function reset(request: Request): Promise<void> {
		const key = config.keyBy
			? await config.keyBy(request)
			: await getDefaultKey(request);
		await storage.reset(key);
	}

	async function middleware(request: Request): Promise<Response | undefined> {
		const result = await check(request);
		const resetSeconds = Math.ceil(result.resetAt / 1000);
		const retryAfterSeconds = result.retryAfter
			? Math.ceil(result.retryAfter / 1000)
			: undefined;

		const headers: HeadersInit = {
			"RateLimit-Limit": String(config.maxRequests),
			"RateLimit-Remaining": String(result.remaining),
			"RateLimit-Reset": String(resetSeconds),
		};

		if (!result.allowed) {
			if (retryAfterSeconds !== undefined) {
				headers["Retry-After"] = String(retryAfterSeconds);
			}
			return new Response(
				JSON.stringify({
					error: "Too many requests",
					code: "RATE_LIMITED",
					retryAfter: result.retryAfter,
				}),
				{
					status: 429,
					headers: {
						...headers,
						"Content-Type": "application/json",
					},
				},
			);
		}

		return undefined;
	}
}

async function getDefaultKey(request: Request): Promise<string> {
	const ip = await getRequestIP(request, { trustProxy: false });
	const normalized = normalizeIpForRateLimit(ip);
	return `ratelimit:${normalized}`;
}

/**
 * Normalizes an IP address for rate limiting by masking to prevent individual IP bypass
 *
 * IPv4 addresses are masked to /24 (first 3 octets)
 * IPv6 addresses are masked to /64 (first 64 bits)
 *
 * @param ip - IP address to normalize
 * @returns Masked IP address for use as rate limit key
 *
 * @example
 * ```typescript
 * normalizeIpForRateLimit("192.168.1.100"); // "192.168.1.0"
 * normalizeIpForRateLimit("2001:db8::1"); // "2001:db8::"
 * ```
 */
export function normalizeIpForRateLimit(ip: string): string {
	if (ip.includes(":")) {
		return maskIPv6To64(ip);
	}
	return maskIPv4To24(ip);
}

/**
 * Extracts the IP address from a Request object
 *
 * Checks multiple headers in order of trustworthiness:
 * 1. CF-Connecting-IP (Cloudflare)
 * 2. X-Forwarded-For (first IP in chain)
 * 3. X-Real-IP
 * 4. Remote address from request
 *
 * @param request - HTTP Request object
 * @returns Client IP address or empty string if not found
 *
 * @example
 * ```typescript
 * const ip = await extractIpFromRequest(request);
 * console.log(`Request from: ${ip}`);
 * ```
 */
export async function extractIpFromRequest(request: Request): Promise<string> {
	return await getRequestIP(request);
}
