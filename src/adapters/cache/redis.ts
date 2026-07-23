import { createClient, type RedisClientType } from "redis";
import type { RateLimitStorage, TokenRevocationStorage } from "../../types";

export class RedisTokenRevocationStorage implements TokenRevocationStorage {
	private redis: RedisClientType;
	private keyPrefix = "revoked_token:";
	private connected = false;

	constructor(redisUrl: string = "redis://localhost:6379") {
		this.redis = createClient({ url: redisUrl });
		this.connect();
	}

	private async connect(): Promise<void> {
		if (!this.connected) {
			try {
				await this.redis.connect();
				this.connected = true;
				console.log("[redis] Connected to Redis for token revocation");
			} catch (error) {
				console.error("[redis] Failed to connect to Redis:", error);
				throw error;
			}
		}
	}

	async isRevoked(jti: string): Promise<boolean> {
		try {
			if (!this.connected) {
				await this.connect();
			}
			const value = await this.redis.get(`${this.keyPrefix}${jti}`);
			return value !== null;
		} catch (error) {
			console.error("[redis] Error checking revoked token:", error);
			return false;
		}
	}

	async revoke(jti: string, ttlSeconds: number): Promise<void> {
		try {
			if (!this.connected) {
				await this.connect();
			}
			if (ttlSeconds <= 0) {
				ttlSeconds = 3600;
			}
			await this.redis.setEx(`${this.keyPrefix}${jti}`, ttlSeconds, "1");
		} catch (error) {
			console.error("[redis] Error revoking token:", error);
			throw error;
		}
	}

	async disconnect(): Promise<void> {
		if (this.connected) {
			await this.redis.quit();
			this.connected = false;
		}
	}
}

export class RedisRateLimitStorage implements RateLimitStorage {
	private redis: RedisClientType;
	private keyPrefix = "ratelimit:";
	private connected = false;

	private static readonly LUA_SCRIPT = `
		local key = KEYS[1]
		local windowMs = tonumber(ARGV[1])
		local now = tonumber(ARGV[2])
		
		local entry = redis.call('GET', key)
		
		if not entry or now >= tonumber(entry) then
			local resetAt = now + windowMs
			redis.call('SETEX', key, math.ceil(windowMs / 1000), '1:' .. resetAt)
			return {1, resetAt}
		end
		
		local parts = {}
		for part in string.gmatch(entry, "([^:]+)") do
			table.insert(parts, part)
		end
		
		local count = tonumber(parts[1]) + 1
		local resetAt = tonumber(parts[2])
		
		redis.call('SETEX', key, math.ceil((resetAt - now) / 1000), count .. ':' .. resetAt)
		
		return {count, resetAt}
	`;

	constructor(redisUrl: string = "redis://localhost:6379") {
		this.redis = createClient({ url: redisUrl });
		this.connect();
	}

	private async connect(): Promise<void> {
		if (!this.connected) {
			try {
				await this.redis.connect();
				this.connected = true;
				console.log("[redis] Connected to Redis for rate limiting");
			} catch (error) {
				console.error("[redis] Failed to connect to Redis:", error);
				throw error;
			}
		}
	}

	async increment(
		key: string,
		windowMs: number,
	): Promise<{ count: number; resetAt: number }> {
		try {
			if (!this.connected) {
				await this.connect();
			}

			const fullKey = `${this.keyPrefix}${key}`;
			const now = Date.now();

			const result = await this.redis.eval(RedisRateLimitStorage.LUA_SCRIPT, {
				keys: [fullKey],
				arguments: [String(windowMs), String(now)],
			});

			const [count, resetAt] = result as [number, number];
			return { count, resetAt };
		} catch (error) {
			console.error("[redis] Error incrementing rate limit:", error);
			return { count: 1, resetAt: Date.now() + windowMs };
		}
	}

	async reset(key: string): Promise<void> {
		try {
			if (!this.connected) {
				await this.connect();
			}
			await this.redis.del(`${this.keyPrefix}${key}`);
		} catch (error) {
			console.error("[redis] Error resetting rate limit:", error);
		}
	}

	async disconnect(): Promise<void> {
		if (this.connected) {
			await this.redis.quit();
			this.connected = false;
		}
	}
}

export async function createRedisClient(
	redisUrl: string = "redis://localhost:6379",
): Promise<RedisClientType> {
	const client = createClient({ url: redisUrl });
	await client.connect();
	return client;
}
