import type {
	RateLimitConfig,
	RateLimitResult,
	RateLimitStorage,
} from "./types";
import { getRequestIP, maskIPv6To64 } from "./utils/ip";
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
		const key = config.keyBy ? config.keyBy(request) : getDefaultKey(request);
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
		const key = config.keyBy ? config.keyBy(request) : getDefaultKey(request);
		await storage.reset(key);
	}

	async function middleware(request: Request): Promise<Response | undefined> {
		const result = await check(request);
		const resetSeconds = Math.ceil(result.resetAt / 1000);
		const retryAfterSeconds = result.retryAfter
			? Math.ceil(result.retryAfter / 1000)
			: undefined;

		const headers: HeadersInit = {
			"RateLimit-Limit": String(result.limit),
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

function getDefaultKey(request: Request): string {
	const ip = getRequestIP(request);
	const normalized = normalizeIpForRateLimit(ip);
	return `ratelimit:${normalized}`;
}

export function normalizeIpForRateLimit(ip: string): string {
	if (ip.includes(":")) {
		return maskIPv6To64(ip);
	}
	return ip;
}

export function extractIpFromRequest(request: Request): string {
	return getRequestIP(request);
}
