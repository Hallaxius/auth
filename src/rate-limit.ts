import { ConfigurationError } from "./errors";
import type {
	RateLimitConfig,
	RateLimitResult,
	RateLimitStorage,
} from "./types";
import { getRequestIP, maskIPv4To24, maskIPv6To64 } from "./utils/ip";

export function rateLimit(config: RateLimitConfig) {
	if (!config.storage) {
		throw new ConfigurationError(
			"rateLimit() requires a storage. Provide `storage` in the config (e.g. a Redis/Database/KV adapter).",
		);
	}
	const storage: RateLimitStorage = config.storage;
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
			: await getDefaultKey(request, config.trustProxy);

		if (storage.check) {
			return await storage.check(key);
		}

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
			: await getDefaultKey(request, config.trustProxy);
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

async function getDefaultKey(
	request: Request,
	trustProxy?: boolean,
): Promise<string> {
	const ip = await getRequestIP(request, { trustProxy: trustProxy ?? false });
	const normalized = normalizeIpForRateLimit(ip);
	return `ratelimit:${normalized}`;
}

export function normalizeIpForRateLimit(ip: string): string {
	if (ip.includes(":")) {
		return maskIPv6To64(ip);
	}
	return maskIPv4To24(ip);
}

export async function extractIpFromRequest(request: Request): Promise<string> {
	return await getRequestIP(request);
}
