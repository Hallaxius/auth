import type { RateLimitConfig, RateLimitStorage } from "../types";

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
  private userLimiters = new Map<string, { limiter: RateLimitStorage; tier: string }>();

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

    const cached = this.userLimiters.get(limiterKey);
    if (!cached || cached.tier !== tierName) {
      const limiter = this.createLimiterForTier(tier);
      this.userLimiters.set(limiterKey, { limiter, tier: tierName });
      return limiter.increment(key, tier.windowMs);
    }

    return cached.limiter.increment(key, tier.windowMs);
  }

  async reset(key: string): Promise<void> {
    await this.storage.reset(key);
  }

  async check(
    request: Request,
    userId?: string,
  ): Promise<{
    allowed: boolean;
    remaining: number;
    resetAt: number;
    retryAfter?: number;
    limit: number;
    tier?: string;
  }> {
    if (!userId) {
      const result = await (this.storage as any).check?.(keyFromRequest(request));
      if (result) return result;

      const incResult = await this.storage.increment(
        keyFromRequest(request),
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

    let cached = this.userLimiters.get(limiterKey);
    if (!cached || cached.tier !== tierName) {
      const limiter = this.createLimiterForTier(tier);
      cached = { limiter, tier: tierName };
      this.userLimiters.set(limiterKey, cached);
    }

    const result = await (cached.limiter as any).check?.(keyFromRequest(request));
    if (result) {
      return { ...result, tier: tierName };
    }

    const incResult = await cached.limiter.increment(
      keyFromRequest(request),
      tier.windowMs,
    );

    return {
      allowed: incResult.count <= tier.maxRequests,
      remaining: Math.max(0, tier.maxRequests - incResult.count),
      resetAt: incResult.resetAt,
      limit: tier.maxRequests,
      tier: tierName,
    };
  }

  private createLimiterForTier(tier: UserTierConfig): RateLimitStorage {
    if (tier.burstAllowance) {
      return new BurstStorage(tier.maxRequests, tier.burstAllowance, tier.windowMs);
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
      if ((limiter as any).dispose) {
        (limiter as any).dispose();
      }
    }
    this.userLimiters.clear();
    if ((this.storage as any).dispose) {
      (this.storage as any).dispose();
    }
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

  async check(
    request: Request,
  ): Promise<{
    allowed: boolean;
    remaining: number;
    resetAt: number;
    retryAfter?: number;
    limit: number;
    endpoint?: string;
  }> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    const endpoint = this.findEndpoint(path, method);
    const limit = endpoint ?? this.defaultLimit;
    const key = keyFromRequest(request);

    const limiter = endpoint ? this.getOrCreateLimiter(endpoint) : this.storage;
    const endpointKey = endpoint ? `${key}:${endpoint.pathPattern}` : key;

    const result = await (limiter as any).check?.(endpointKey);
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
      if ((limiter as any).dispose) {
        (limiter as any).dispose();
      }
    }
    this.endpointLimiters.clear();
    if ((this.storage as any).dispose) {
      (this.storage as any).dispose();
    }
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

  async increment(
    key: string,
    _windowMs: number,
  ): Promise<{ count: number; resetAt: number }> {
    const now = Date.now();
    const entry = this.store.get(key);
    const effectiveLimit = this.maxRequests + this.burstAllowance;

    if (!entry || now >= entry.resetAt) {
      const resetAt = now + this.windowMs;
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

function keyFromRequest(request: Request): string {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
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
