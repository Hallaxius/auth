import type { TokenRevocationStorage } from "../types";

export class RedisTokenRevocationStorage implements TokenRevocationStorage {
	private redis: ReturnType<typeof import("redis")["createClient"]>;
	private keyPrefix = "revoked_token:";

	constructor(redisClient: ReturnType<typeof import("redis")["createClient"]>) {
		this.redis = redisClient;
	}

	async isRevoked(jti: string): Promise<boolean> {
		try {
			const value = await this.redis.get(`${this.keyPrefix}${jti}`);
			return value !== null;
		} catch (error) {
			console.error("[jwt-revocation] Error checking revoked token:", error);
			return false;
		}
	}

	async revoke(jti: string, ttlSeconds: number): Promise<void> {
		try {
			if (ttlSeconds <= 0) {
				ttlSeconds = 3600;
			}
			await this.redis.setEx(`${this.keyPrefix}${jti}`, ttlSeconds, "1");
		} catch (error) {
			console.error("[jwt-revocation] Error revoking token:", error);
			throw error;
		}
	}
}

export class MemoryTokenRevocationStorage implements TokenRevocationStorage {
	private store = new Map<string, { expiresAt: number }>();
	private cleanupInterval: ReturnType<typeof setInterval> | null = null;

	constructor() {
		this.startCleanup();
	}

	private startCleanup(): void {
		this.cleanupInterval = setInterval(() => {
			const now = Date.now();
			for (const [jti, data] of this.store.entries()) {
				if (data.expiresAt < now) {
					this.store.delete(jti);
				}
			}
		}, 60000);

		if (this.cleanupInterval.unref) {
			this.cleanupInterval.unref();
		}
	}

	async isRevoked(jti: string): Promise<boolean> {
		const entry = this.store.get(jti);
		if (!entry) return false;
		if (Date.now() > entry.expiresAt) {
			this.store.delete(jti);
			return false;
		}
		return true;
	}

	async revoke(jti: string, ttlSeconds: number): Promise<void> {
		const expiresAt = Date.now() + ttlSeconds * 1000;
		this.store.set(jti, { expiresAt });
	}

	dispose(): void {
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval);
			this.cleanupInterval = null;
		}
	}
}
