import type { RateLimitStorage } from "../types";

export interface DistributedRateLimitConfig {
  maxRequests: number;
  windowMs: number;
  redisUrl?: string;
  keyPrefix?: string;
}

export interface AtomicCounterResult {
  count: number;
  resetAt: number;
  ttl: number;
}

export class DistributedRateLimiter implements RateLimitStorage {
  private redis: any;
  private keyPrefix: string;
  private maxRequests: number;
  private windowMs: number;
  private connected: boolean = false;

  private static readonly LUA_SCRIPT = `
    local key = KEYS[1]
    local windowMs = tonumber(ARGV[1])
    local maxRequests = tonumber(ARGV[2])
    local now = tonumber(ARGV[3])
    
    local current = redis.call('GET', key)
    
    if not current then
      redis.call('SETEX', key, math.ceil(windowMs / 1000), '1')
      return {1, now + windowMs, math.ceil(windowMs / 1000)}
    end
    
    local count = tonumber(current)
    if count >= maxRequests then
      local ttl = redis.call('TTL', key)
      return {count, now + (ttl * 1000), ttl}
    end
    
    count = count + 1
    local ttl = redis.call('TTL', key)
    redis.call('SETEX', key, ttl, count)
    
    return {count, now + (ttl * 1000), ttl}
  `;

  private static readonly LUA_SCRIPT_SLIDING = `
    local key = KEYS[1]
    local windowMs = tonumber(ARGV[1])
    local maxRequests = tonumber(ARGV[2])
    local now = tonumber(ARGV[3])
    local requestId = ARGV[4]
    
    redis.call('ZREMRANGEBYSCORE', key, '-inf', now - windowMs)
    
    local count = redis.call('ZCARD', key)
    
    if count >= maxRequests then
      local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
      local resetAt = oldest[2] and (tonumber(oldest[2]) + windowMs) or (now + windowMs)
      return {count, resetAt, 0}
    end
    
    redis.call('ZADD', key, now, requestId)
    redis.call('EXPIRE', key, math.ceil(windowMs / 1000))
    
    local newCount = count + 1
    local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    local resetAt = oldest[2] and (tonumber(oldest[2]) + windowMs) or (now + windowMs)
    
    return {newCount, resetAt, math.ceil(windowMs / 1000)}
  `;

  constructor(config: DistributedRateLimitConfig) {
    this.keyPrefix = config.keyPrefix ?? "ratelimit:distributed:";
    this.maxRequests = config.maxRequests;
    this.windowMs = config.windowMs;
  }

  private async getRedis(): Promise<any> {
    if (!this.connected) {
      const { createClient } = await import("redis");
      const redisUrl =
        process.env.REDIS_URL ?? "redis://localhost:6379";
      this.redis = createClient({ url: redisUrl });

      this.redis.on("error", (err: Error) => {
        console.error("[DistributedRateLimiter] Redis error:", err);
        this.connected = false;
      });

      this.redis.on("connect", () => {
        this.connected = true;
      });

      await this.redis.connect();
    }
    return this.redis;
  }

  async increment(
    key: string,
    windowMs: number,
  ): Promise<{ count: number; resetAt: number }> {
    try {
      const redis = await this.getRedis();
      const fullKey = `${this.keyPrefix}${key}`;
      const now = Date.now();
      const requestId = `${now}-${Math.random().toString(36).slice(2)}`;

      const result = await redis.eval(
        DistributedRateLimiter.LUA_SCRIPT_SLIDING,
        {
          keys: [fullKey],
          arguments: [String(windowMs), String(this.maxRequests), String(now), requestId],
        },
      );

      const [count, resetAt] = result as [number, number];
      return { count, resetAt };
    } catch (error) {
      console.error("[DistributedRateLimiter] Error incrementing:", error);
      return { count: 1, resetAt: Date.now() + windowMs };
    }
  }

  async reset(key: string): Promise<void> {
    try {
      const redis = await this.getRedis();
      const fullKey = `${this.keyPrefix}${key}`;
      await redis.del(fullKey);
    } catch (error) {
      console.error("[DistributedRateLimiter] Error resetting:", error);
    }
  }

  async check(key: string): Promise<{
    allowed: boolean;
    remaining: number;
    resetAt: number;
    retryAfter?: number;
    limit: number;
  }> {
    try {
      const redis = await this.getRedis();
      const fullKey = `${this.keyPrefix}${key}`;
      const now = Date.now();

      const count = await redis.zCount(fullKey, now - this.windowMs, now);
      const allowed = count < this.maxRequests;
      const remaining = Math.max(0, this.maxRequests - count);

      const oldest = await redis.zrange(fullKey, 0, 0, "WITHSCORES");
      const resetAt = oldest[1]
        ? Number(oldest[1]) + this.windowMs
        : now + this.windowMs;

      return {
        allowed,
        remaining,
        resetAt,
        retryAfter: allowed ? undefined : Math.max(0, resetAt - now),
        limit: this.maxRequests,
      };
    } catch (error) {
      console.error("[DistributedRateLimiter] Error checking:", error);
      return {
        allowed: true,
        remaining: this.maxRequests,
        resetAt: Date.now() + this.windowMs,
        limit: this.maxRequests,
      };
    }
  }

  async getUsage(key: string): Promise<{
    current: number;
    limit: number;
    remaining: number;
    resetAt: number;
    percentageUsed: number;
  }> {
    try {
      const redis = await this.getRedis();
      const fullKey = `${this.keyPrefix}${key}`;
      const now = Date.now();

      const current = await redis.zCount(fullKey, now - this.windowMs, now);
      const remaining = Math.max(0, this.maxRequests - current);
      const percentageUsed = (current / this.maxRequests) * 100;

      const oldest = await redis.zrange(fullKey, 0, 0, "WITHSCORES");
      const resetAt = oldest[1]
        ? Number(oldest[1]) + this.windowMs
        : now + this.windowMs;

      return {
        current,
        limit: this.maxRequests,
        remaining,
        resetAt,
        percentageUsed: Math.min(100, percentageUsed),
      };
    } catch (error) {
      console.error("[DistributedRateLimiter] Error getting usage:", error);
      return {
        current: 0,
        limit: this.maxRequests,
        remaining: this.maxRequests,
        resetAt: Date.now() + this.windowMs,
        percentageUsed: 0,
      };
    }
  }

  async disconnect(): Promise<void> {
    if (this.connected && this.redis) {
      await this.redis.quit();
      this.connected = false;
    }
  }

  dispose(): void {
    this.disconnect().catch(console.error);
  }
}

export interface MultiWindowConfig {
  windows: Array<{
    maxRequests: number;
    windowMs: number;
  }>;
  storage?: RateLimitStorage;
}

export class MultiWindowRateLimiter implements RateLimitStorage {
  private windows: Array<{
    maxRequests: number;
    windowMs: number;
    limiter: RateLimitStorage;
  }> = [];

  constructor(config: MultiWindowConfig) {
    this.windows = config.windows.map((window) => ({
      ...window,
      limiter: config.storage ?? new MapBasedStorage(),
    }));
  }

  async increment(
    key: string,
    _windowMs: number,
  ): Promise<{ count: number; resetAt: number }> {
    let maxCount = 0;
    let maxResetAt = 0;

    for (const window of this.windows) {
      const result = await window.limiter.increment(key, window.windowMs);
      maxCount = Math.max(maxCount, result.count);
      maxResetAt = Math.max(maxResetAt, result.resetAt);
    }

    return { count: maxCount, resetAt: maxResetAt };
  }

  async reset(key: string): Promise<void> {
    for (const window of this.windows) {
      await window.limiter.reset(key);
    }
  }

  async check(key: string): Promise<{
    allowed: boolean;
    remaining: number;
    resetAt: number;
    retryAfter?: number;
    limit: number;
    exceededWindows?: Array<{ windowMs: number; maxRequests: number }>;
  }> {
    let minRemaining = Infinity;
    let maxResetAt = 0;
    let allAllowed = true;
    const exceededWindows: Array<{ windowMs: number; maxRequests: number }> = [];

    for (const window of this.windows) {
      const result = await (window.limiter as any).check?.(key);
      if (!result) {
        const incResult = await window.limiter.increment(key, window.windowMs);
        const allowed = incResult.count <= window.maxRequests;
        if (!allowed) {
          exceededWindows.push({
            windowMs: window.windowMs,
            maxRequests: window.maxRequests,
          });
          allAllowed = false;
        }
        minRemaining = Math.min(minRemaining, window.maxRequests - incResult.count);
        maxResetAt = Math.max(maxResetAt, incResult.resetAt);
      } else {
        if (!result.allowed) {
          exceededWindows.push({
            windowMs: window.windowMs,
            maxRequests: window.maxRequests,
          });
          allAllowed = false;
        }
        minRemaining = Math.min(minRemaining, result.remaining);
        maxResetAt = Math.max(maxResetAt, result.resetAt);
      }
    }

    return {
      allowed: allAllowed,
      remaining: Math.max(0, minRemaining === Infinity ? 0 : minRemaining),
      resetAt: maxResetAt,
      retryAfter: allAllowed ? undefined : Math.max(0, maxResetAt - Date.now()),
      limit: Math.min(...this.windows.map((w) => w.maxRequests)),
      exceededWindows,
    };
  }

  dispose(): void {
    for (const window of this.windows) {
      if ((window.limiter as any).dispose) {
        (window.limiter as any).dispose();
      }
    }
  }
}

class MapBasedStorage implements RateLimitStorage {
  private store = new Map<
    string,
    { count: number; resetAt: number }
  >();

  async increment(
    key: string,
    windowMs: number,
  ): Promise<{ count: number; resetAt: number }> {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || now >= entry.resetAt) {
      const resetAt = now + windowMs;
      const newEntry = { count: 1, resetAt };
      this.store.set(key, newEntry);
      return newEntry;
    }

    entry.count++;
    return entry;
  }

  async reset(key: string): Promise<void> {
    this.store.delete(key);
  }
}

export function createDistributedLimiter(
  config: DistributedRateLimitConfig,
): DistributedRateLimiter {
  return new DistributedRateLimiter(config);
}

export function createMultiWindowLimiter(
  config: MultiWindowConfig,
): MultiWindowRateLimiter {
  return new MultiWindowRateLimiter(config);
}
