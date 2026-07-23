import type {
  DataExportStorage,
  DataExportRequest,
  UserDataExport,
  DeletionStorage,
  DataDeletionRequest,
  ConsentStorage,
  ConsentRecord,
  RetentionStorage,
} from "../utils/compliance";

export interface RedisComplianceConfig {
  redisUrl?: string;
  keyPrefix?: string;
}

export class RedisDataExportStorage implements DataExportStorage {
  private redis: any;
  private keyPrefix: string;
  private connected = false;

  constructor(config: RedisComplianceConfig = {}) {
    this.keyPrefix = config.keyPrefix ?? "compliance:export:";
  }

  private async getRedis(): Promise<any> {
    if (!this.connected) {
      const { createClient } = await import("redis");
      const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
      this.redis = createClient({ url: redisUrl });

      this.redis.on("error", (err: Error) => {
        console.error("[RedisDataExportStorage] Error:", err);
        this.connected = false;
      });

      await this.redis.connect();
      this.connected = true;
    }
    return this.redis;
  }

  async saveRequest(request: DataExportRequest): Promise<void> {
    const redis = await this.getRedis();
    const key = `${this.keyPrefix}${request.userId}`;
    await redis.set(key, JSON.stringify(request), { EX: 30 * 24 * 60 * 60 });
  }

  async getRequest(requestId: string): Promise<DataExportRequest | null> {
    const redis = await this.getRedis();
    const key = `${this.keyPrefix}${requestId}`;
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  async getPendingRequest(userId: string): Promise<DataExportRequest | null> {
    const redis = await this.getRedis();
    const key = `${this.keyPrefix}${userId}`;
    const data = await redis.get(key);
    if (!data) return null;

    const request = JSON.parse(data) as DataExportRequest;
    return request.status === "pending" ? request : null;
  }

  async updateStatus(
    requestId: string,
    status: DataExportRequest["status"],
  ): Promise<void> {
    const redis = await this.getRedis();
    const request = await this.getRequest(requestId);
    if (request) {
      request.status = status;
      await this.saveRequest(request);
    }
  }

  async setExportData(requestId: string, data: UserDataExport): Promise<void> {
    const redis = await this.getRedis();
    const request = await this.getRequest(requestId);
    if (request) {
      request.exportData = data;
      const key = `${this.keyPrefix}${request.userId}`;
      await redis.set(key, JSON.stringify(request), { EX: 30 * 24 * 60 * 60 });
    }
  }

  async deleteRequest(requestId: string): Promise<void> {
    const redis = await this.getRedis();
    const request = await this.getRequest(requestId);
    if (request) {
      const key = `${this.keyPrefix}${request.userId}`;
      await redis.del(key);
    }
  }

  async disconnect(): Promise<void> {
    if (this.connected && this.redis) {
      await this.redis.quit();
      this.connected = false;
    }
  }
}

export class RedisDeletionStorage implements DeletionStorage {
  private redis: any;
  private keyPrefix: string;
  private connected = false;

  constructor(config: RedisComplianceConfig = {}) {
    this.keyPrefix = config.keyPrefix ?? "compliance:deletion:";
  }

  private async getRedis(): Promise<any> {
    if (!this.connected) {
      const { createClient } = await import("redis");
      const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
      this.redis = createClient({ url: redisUrl });

      this.redis.on("error", (err: Error) => {
        console.error("[RedisDeletionStorage] Error:", err);
        this.connected = false;
      });

      await this.redis.connect();
      this.connected = true;
    }
    return this.redis;
  }

  async saveRequest(request: DataDeletionRequest): Promise<void> {
    const redis = await this.getRedis();
    const key = `${this.keyPrefix}${request.id}`;
    const ttl = 60 * 24 * 60 * 60;
    await redis.set(key, JSON.stringify(request), { EX: ttl });
  }

  async getRequest(requestId: string): Promise<DataDeletionRequest | null> {
    const redis = await this.getRedis();
    const key = `${this.keyPrefix}${requestId}`;
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  async updateStatus(
    requestId: string,
    status: DataDeletionRequest["status"],
  ): Promise<void> {
    const redis = await this.getRedis();
    const request = await this.getRequest(requestId);
    if (request) {
      request.status = status;
      await this.saveRequest(request);
    }
  }

  async setCompletedAt(requestId: string, completedAt: number): Promise<void> {
    const redis = await this.getRedis();
    const request = await this.getRequest(requestId);
    if (request) {
      request.completedAt = completedAt;
      await this.saveRequest(request);
    }
  }

  async cancelRequest(requestId: string): Promise<void> {
    const redis = await this.getRedis();
    const request = await this.getRequest(requestId);
    if (request) {
      request.status = "cancelled";
      await this.saveRequest(request);
    }
  }

  async disconnect(): Promise<void> {
    if (this.connected && this.redis) {
      await this.redis.quit();
      this.connected = false;
    }
  }
}

export class RedisConsentStorage implements ConsentStorage {
  private redis: any;
  private keyPrefix: string;
  private connected = false;

  constructor(config: RedisComplianceConfig = {}) {
    this.keyPrefix = config.keyPrefix ?? "compliance:consent:";
  }

  private async getRedis(): Promise<any> {
    if (!this.connected) {
      const { createClient } = await import("redis");
      const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
      this.redis = createClient({ url: redisUrl });

      this.redis.on("error", (err: Error) => {
        console.error("[RedisConsentStorage] Error:", err);
        this.connected = false;
      });

      await this.redis.connect();
      this.connected = true;
    }
    return this.redis;
  }

  async getConsents(userId: string): Promise<ConsentRecord[]> {
    const redis = await this.getRedis();
    const key = `${this.keyPrefix}${userId}:current`;
    const data = await redis.get(key);
    return data ? JSON.parse(data) : [];
  }

  async setConsent(consent: ConsentRecord): Promise<void> {
    const redis = await this.getRedis();
    const userConsents = await this.getConsents(consent.userId);

    const existingIndex = userConsents.findIndex(
      (c) => c.consentType === consent.consentType,
    );

    if (existingIndex >= 0) {
      userConsents[existingIndex] = consent;
    } else {
      userConsents.push(consent);
    }

    const key = `${this.keyPrefix}${consent.userId}:current`;
    await redis.set(key, JSON.stringify(userConsents));
  }

  async withdrawConsent(userId: string, consentType: string): Promise<void> {
    const redis = await this.getRedis();
    const userConsents = await this.getConsents(userId);

    const consent = userConsents.find((c) => c.consentType === consentType);
    if (consent) {
      consent.granted = false;
      consent.withdrawnAt = new Date();

      const historyKey = `${this.keyPrefix}${userId}:history`;
      await redis.rPush(historyKey, JSON.stringify(consent));

      const currentKey = `${this.keyPrefix}${userId}:current`;
      await redis.set(currentKey, JSON.stringify(userConsents));
    }
  }

  async getConsentHistory(userId: string): Promise<ConsentRecord[]> {
    const redis = await this.getRedis();
    const historyKey = `${this.keyPrefix}${userId}:history`;
    const history = await redis.lRange(historyKey, 0, -1);
    return history.map((item: string) => JSON.parse(item));
  }

  async disconnect(): Promise<void> {
    if (this.connected && this.redis) {
      await this.redis.quit();
      this.connected = false;
    }
  }
}

export class RedisRetentionStorage implements RetentionStorage {
  private redis: any;
  private keyPrefix: string;
  private connected = false;

  constructor(config: RedisComplianceConfig = {}) {
    this.keyPrefix = config.keyPrefix ?? "compliance:retention:";
  }

  private async getRedis(): Promise<any> {
    if (!this.connected) {
      const { createClient } = await import("redis");
      const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
      this.redis = createClient({ url: redisUrl });

      this.redis.on("error", (err: Error) => {
        console.error("[RedisRetentionStorage] Error:", err);
        this.connected = false;
      });

      await this.redis.connect();
      this.connected = true;
    }
    return this.redis;
  }

  async getDataCategories(userId: string): Promise<string[]> {
    const redis = await this.getRedis();
    const key = `${this.keyPrefix}${userId}:categories`;
    const data = await redis.smembers(key);
    return data || [];
  }

  async deleteData(userId: string, categories: string[]): Promise<void> {
    const redis = await this.getRedis();
    const key = `${this.keyPrefix}${userId}:categories`;
    for (const category of categories) {
      await redis.sRem(key, category);
    }
  }

  async anonymizeData(userId: string, categories: string[]): Promise<void> {
    await this.deleteData(userId, categories);
  }

  async archiveData(userId: string, categories: string[]): Promise<void> {
    const redis = await this.getRedis();
    const archiveKey = `${this.keyPrefix}archive:${userId}`;
    await redis.set(archiveKey, JSON.stringify({ categories, archivedAt: Date.now() }));
    await this.deleteData(userId, categories);
  }

  async getUsersWithDataOlderThan(days: number): Promise<string[]> {
    const redis = await this.getRedis();
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    const keys = await redis.keys(`${this.keyPrefix}*:lastActive`);
    const users: string[] = [];

    for (const key of keys) {
      const lastActive = await redis.get(key);
      if (lastActive && Number.parseInt(lastActive) < cutoff) {
        const userId = key.replace(`${this.keyPrefix}`, "").replace(":lastActive", "");
        const categories = await this.getDataCategories(userId);
        if (categories.length > 0) {
          users.push(userId);
        }
      }
    }

    return users;
  }

  async setUserLastActive(userId: string): Promise<void> {
    const redis = await this.getRedis();
    const key = `${this.keyPrefix}${userId}:lastActive`;
    await redis.set(key, String(Date.now()));
  }

  async addUserCategory(userId: string, category: string): Promise<void> {
    const redis = await this.getRedis();
    const key = `${this.keyPrefix}${userId}:categories`;
    await redis.sAdd(key, category);
    await this.setUserLastActive(userId);
  }

  async disconnect(): Promise<void> {
    if (this.connected && this.redis) {
      await this.redis.quit();
      this.connected = false;
    }
  }
}

export function createRedisComplianceStorage(config: RedisComplianceConfig = {}) {
  return {
    exportStorage: new RedisDataExportStorage(config),
    deletionStorage: new RedisDeletionStorage(config),
    consentStorage: new RedisConsentStorage(config),
    retentionStorage: new RedisRetentionStorage(config),
  };
}
