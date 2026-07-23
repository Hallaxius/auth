import type { RateLimitStorage } from "../types";

export interface SlidingWindowEntry {
  timestamp: number;
  weight: number;
}

export interface SlidingWindowConfig {
  maxRequests: number;
  windowMs: number;
  precision?: number;
  storage?: RateLimitStorage;
}

export interface TokenBucketConfig {
  bucketSize: number;
  refillRate: number;
  refillIntervalMs: number;
  storage?: RateLimitStorage;
}

export interface BurstConfig {
  maxBurst: number;
  burstWindowMs: number;
  sustainedLimit: number;
  sustainedWindowMs: number;
  storage?: RateLimitStorage;
}

export interface RateLimitCheckResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
  limit: number;
}

export class SlidingWindowLog implements RateLimitStorage {
  private store = new Map<string, SlidingWindowEntry[]>();
  private maxRequests: number;
  private windowMs: number;
  private precision: number;

  constructor(config: SlidingWindowConfig) {
    this.maxRequests = config.maxRequests;
    this.windowMs = config.windowMs;
    this.precision = config.precision ?? 1000;
  }

  async increment(
    key: string,
    windowMs: number,
  ): Promise<{ count: number; resetAt: number }> {
    const now = Date.now();
    const entries = this.store.get(key) ?? [];
    const windowStart = now - windowMs;

    const validEntries = entries.filter((entry) => entry.timestamp > windowStart);

    validEntries.push({ timestamp: now, weight: 1 });

    if (validEntries.length > this.maxRequests * 2) {
      const trimmed = validEntries.slice(-this.maxRequests);
      this.store.set(key, trimmed);
    } else {
      this.store.set(key, validEntries);
    }

    const oldestEntry = validEntries[0];
    const resetAt = oldestEntry
      ? oldestEntry.timestamp + windowMs
      : now + windowMs;

    return {
      count: validEntries.length,
      resetAt,
    };
  }

  async reset(key: string): Promise<void> {
    this.store.delete(key);
  }

  dispose(): void {
    this.store.clear();
  }

  async check(key: string): Promise<RateLimitCheckResult> {
    const now = Date.now();
    const entries = this.store.get(key) ?? [];
    const windowStart = now - this.windowMs;

    const validEntries = entries.filter((entry) => entry.timestamp > windowStart);
    const count = validEntries.length;
    const allowed = count < this.maxRequests;

    const oldestEntry = validEntries[0];
    const resetAt = oldestEntry
      ? oldestEntry.timestamp + this.windowMs
      : now + this.windowMs;

    return {
      allowed,
      remaining: Math.max(0, this.maxRequests - count),
      resetAt,
      retryAfter: allowed ? undefined : Math.max(0, resetAt - now),
      limit: this.maxRequests,
    };
  }
}

export class TokenBucket implements RateLimitStorage {
  private buckets = new Map<string, { tokens: number; lastRefill: number }>();
  private bucketSize: number;
  private refillRate: number;
  private refillIntervalMs: number;

  constructor(config: TokenBucketConfig) {
    this.bucketSize = config.bucketSize;
    this.refillRate = config.refillRate;
    this.refillIntervalMs = config.refillIntervalMs;
  }

  private refillBucket(key: string): { tokens: number; lastRefill: number } {
    const now = Date.now();
    const bucket = this.buckets.get(key) ?? {
      tokens: this.bucketSize,
      lastRefill: now,
    };

    const timePassed = now - bucket.lastRefill;
    const tokensToAdd = Math.floor(
      (timePassed / this.refillIntervalMs) * this.refillRate,
    );

    if (tokensToAdd > 0) {
      bucket.tokens = Math.min(this.bucketSize, bucket.tokens + tokensToAdd);
      bucket.lastRefill = now;
      this.buckets.set(key, bucket);
    }

    return bucket;
  }

  async increment(
    key: string,
    _windowMs: number,
  ): Promise<{ count: number; resetAt: number }> {
    const bucket = this.refillBucket(key);

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      this.buckets.set(key, bucket);

      const timeToRefill = Math.ceil(
        ((this.bucketSize - bucket.tokens) / this.refillRate) *
          this.refillIntervalMs,
      );

      return {
        count: this.bucketSize - bucket.tokens,
        resetAt: Date.now() + timeToRefill,
      };
    }

    const timeToNextToken = Math.ceil(
      this.refillIntervalMs / this.refillRate,
    );

    return {
      count: this.bucketSize,
      resetAt: Date.now() + timeToNextToken,
    };
  }

  async reset(key: string): Promise<void> {
    this.buckets.delete(key);
  }

  dispose(): void {
    this.buckets.clear();
  }

  async check(key: string): Promise<RateLimitCheckResult> {
    const bucket = this.refillBucket(key);
    const now = Date.now();

    const allowed = bucket.tokens >= 1;
    const timeToFull = Math.ceil(
      ((this.bucketSize - bucket.tokens) / this.refillRate) *
        this.refillIntervalMs,
    );

    return {
      allowed,
      remaining: Math.floor(bucket.tokens),
      resetAt: now + timeToFull,
      retryAfter: allowed ? undefined : timeToFull,
      limit: this.bucketSize,
    };
  }

  async consume(key: string, tokens: number = 1): Promise<boolean> {
    const bucket = this.refillBucket(key);

    if (bucket.tokens >= tokens) {
      bucket.tokens -= tokens;
      this.buckets.set(key, bucket);
      return true;
    }

    return false;
  }
}

export class SlidingWindowCounter {
  private store = new Map<
    string,
    { currentWindow: { count: number; start: number }; previousCount: number }
  >();
  private maxRequests: number;
  private windowMs: number;

  constructor(config: { maxRequests: number; windowMs: number }) {
    this.maxRequests = config.maxRequests;
    this.windowMs = config.windowMs;
  }

  async check(key: string): Promise<RateLimitCheckResult> {
    const now = Date.now();
    const data = this.store.get(key) ?? {
      currentWindow: { count: 0, start: now },
      previousCount: 0,
    };

    const windowStart = data.currentWindow.start;
    const elapsed = now - windowStart;

    if (elapsed >= this.windowMs * 2) {
      data.currentWindow = { count: 0, start: now };
      data.previousCount = 0;
    } else if (elapsed >= this.windowMs) {
      const newWindowStart = windowStart + this.windowMs;
      data.previousCount = data.currentWindow.count;
      data.currentWindow = { count: 0, start: newWindowStart };
    }

    const weight = elapsed / this.windowMs;
    const estimatedCount =
      data.previousCount * (1 - weight) + data.currentWindow.count;

    const allowed = estimatedCount < this.maxRequests;
    const resetAt = data.currentWindow.start + this.windowMs;

    return {
      allowed,
      remaining: Math.max(0, Math.floor(this.maxRequests - estimatedCount)),
      resetAt,
      retryAfter: allowed ? undefined : Math.max(0, resetAt - now),
      limit: this.maxRequests,
    };
  }

  async increment(key: string): Promise<{ count: number; resetAt: number }> {
    const now = Date.now();
    const data = this.store.get(key) ?? {
      currentWindow: { count: 0, start: now },
      previousCount: 0,
    };

    const windowStart = data.currentWindow.start;
    const elapsed = now - windowStart;

    if (elapsed >= this.windowMs * 2) {
      data.currentWindow = { count: 1, start: now };
      data.previousCount = 0;
    } else if (elapsed >= this.windowMs) {
      const newWindowStart = windowStart + this.windowMs;
      data.previousCount = data.currentWindow.count;
      data.currentWindow = { count: 1, start: newWindowStart };
    } else {
      data.currentWindow.count += 1;
    }

    this.store.set(key, data);

    const resetAt = data.currentWindow.start + this.windowMs;
    return { count: data.currentWindow.count, resetAt };
  }

  async reset(key: string): Promise<void> {
    this.store.delete(key);
  }

  dispose(): void {
    this.store.clear();
  }
}

export class BurstRateLimiter {
  private burstStore = new Map<string, { count: number; resetAt: number }>();
  private sustainedStore = new Map<
    string,
    { count: number; resetAt: number }
  >();
  private maxBurst: number;
  private burstWindowMs: number;
  private sustainedLimit: number;
  private sustainedWindowMs: number;

  constructor(config: BurstConfig) {
    this.maxBurst = config.maxBurst;
    this.burstWindowMs = config.burstWindowMs;
    this.sustainedLimit = config.sustainedLimit;
    this.sustainedWindowMs = config.sustainedWindowMs;
  }

  async check(key: string): Promise<RateLimitCheckResult> {
    const now = Date.now();

    const burstData = this.burstStore.get(key);
    const sustainedData = this.sustainedStore.get(key);

    const burstCount =
      burstData && now < burstData.resetAt ? burstData.count : 0;
    const sustainedCount =
      sustainedData && now < sustainedData.resetAt ? sustainedData.count : 0;

    const burstAllowed = burstCount < this.maxBurst;
    const sustainedAllowed = sustainedCount < this.sustainedLimit;

    const allowed = burstAllowed && sustainedAllowed;

    const burstResetAt = burstData?.resetAt ?? now + this.burstWindowMs;
    const sustainedResetAt = sustainedData?.resetAt ?? now + this.sustainedWindowMs;
    const resetAt = Math.max(burstResetAt, sustainedResetAt);

    const remaining = Math.min(
      this.maxBurst - burstCount,
      this.sustainedLimit - sustainedCount,
    );

    return {
      allowed,
      remaining: Math.max(0, remaining),
      resetAt,
      retryAfter: allowed ? undefined : Math.max(0, resetAt - now),
      limit: Math.min(this.maxBurst, this.sustainedLimit),
    };
  }

  async increment(key: string): Promise<{ count: number; resetAt: number }> {
    const now = Date.now();

    let burstData = this.burstStore.get(key);
    if (!burstData || now >= burstData.resetAt) {
      burstData = { count: 1, resetAt: now + this.burstWindowMs };
    } else {
      burstData.count += 1;
    }
    this.burstStore.set(key, burstData);

    let sustainedData = this.sustainedStore.get(key);
    if (!sustainedData || now >= sustainedData.resetAt) {
      sustainedData = { count: 1, resetAt: now + this.sustainedWindowMs };
    } else {
      sustainedData.count += 1;
    }
    this.sustainedStore.set(key, sustainedData);

    return {
      count: Math.max(burstData.count, sustainedData.count),
      resetAt: Math.max(burstData.resetAt, sustainedData.resetAt),
    };
  }

  async reset(key: string): Promise<void> {
    this.burstStore.delete(key);
    this.sustainedStore.delete(key);
  }

  dispose(): void {
    this.burstStore.clear();
    this.sustainedStore.clear();
  }
}

export function createSlidingWindowLimiter(
  config: SlidingWindowConfig,
): SlidingWindowLog {
  return new SlidingWindowLog(config);
}

export function createTokenBucketLimiter(
  config: TokenBucketConfig,
): TokenBucket {
  return new TokenBucket(config);
}

export function createSlidingWindowCounterLimiter(config: {
  maxRequests: number;
  windowMs: number;
}): SlidingWindowCounter {
  return new SlidingWindowCounter(config);
}

export function createBurstLimiter(config: BurstConfig): BurstRateLimiter {
  return new BurstRateLimiter(config);
}
