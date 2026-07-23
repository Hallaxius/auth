import type { StateStore } from "../../internal/state";

export interface RedisStateStoreOptions {
	url?: string;
	keyPrefix?: string;
	connectTimeout?: number;
}

export class RedisStateStore implements StateStore {
	private client: any;
	private keyPrefix: string;
	private connected: boolean = false;
	private connectPromise: Promise<void> | null = null;

	constructor(options: RedisStateStoreOptions = {}) {
		this.keyPrefix = options.keyPrefix ?? "auth:state:";
		
		try {
			const redisUrl = options.url ?? process.env.REDIS_URL ?? "redis://localhost:6379";
			const { createClient } = require("redis");
			this.client = createClient({ url: redisUrl });
			
			this.client.on("error", (err: Error) => {
				console.error("[RedisStateStore] Redis client error:", err);
			});
			
			this.connectPromise = this.connect();
		} catch (error) {
			console.error("[RedisStateStore] Failed to initialize Redis client:", error);
			throw new Error(
				"Redis package not installed. Run: bun add redis",
			);
		}
	}

	private async connect(): Promise<void> {
		if (this.connected) return;
		
		try {
			await this.client.connect();
			this.connected = true;
		} catch (error) {
			this.connected = false;
			throw error;
		}
	}

	private async ensureConnected(): Promise<void> {
		if (!this.connected) {
			if (this.connectPromise) {
				await this.connectPromise;
			} else {
				await this.connect();
			}
		}
	}

	async has(id: string): Promise<boolean> {
		await this.ensureConnected();
		const key = `${this.keyPrefix}${id}`;
		return await this.client.exists(key) === 1;
	}

	async set(id: string, ttlMs: number): Promise<void> {
		await this.ensureConnected();
		const key = `${this.keyPrefix}${id}`;
		await this.client.set(key, "1", { PX: ttlMs });
	}

	async setIfAbsent(id: string, ttlMs: number): Promise<boolean> {
		await this.ensureConnected();
		const key = `${this.keyPrefix}${id}`;
		
		const script = `
			if redis.call('EXISTS', KEYS[1]) == 0 then
				return redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2], 'NX')
			else
				return nil
			end
		`;
		
		const result = await this.client.eval(script, {
			keys: [key],
			values: ["1", ttlMs.toString()],
		});
		
		return result === "OK";
	}

	async delete(id: string): Promise<void> {
		await this.ensureConnected();
		const key = `${this.keyPrefix}${id}`;
		await this.client.del(key);
	}

	async disconnect(): Promise<void> {
		if (this.client) {
			await this.client.quit();
			this.connected = false;
		}
	}
}

export class ResilientRedisStateStore implements StateStore {
	private primary: RedisStateStore;
	private fallback: any;
	private circuitOpen = false;
	private circuitTimer: NodeJS.Timeout | null = null;
	private readonly CIRCUIT_TIMEOUT = 30000;
	private readonly MAX_RETRIES = 3;
	private readonly BASE_DELAY = 100;

	constructor(options: RedisStateStoreOptions = {}, fallbackStore?: any) {
		this.primary = new RedisStateStore(options);
		this.fallback = fallbackStore ?? new (require("../../internal/state").MemoryStateStore)();
	}

	private async withRetry<T>(
		operation: () => Promise<T>,
		operationName: string,
	): Promise<T> {
		let lastError: Error | null = null;
		
		for (let attempt = 0; attempt <= this.MAX_RETRIES; attempt++) {
			try {
				return await operation();
			} catch (error) {
				lastError = error as Error;
				
				if (attempt === this.MAX_RETRIES) {
					break;
				}
				
				const delay = this.BASE_DELAY * Math.pow(2, attempt) + Math.random() * 100;
				console.warn(
					`[ResilientRedisStateStore] Retry ${attempt + 1}/${this.MAX_RETRIES} for ${operationName}:`,
					error,
				);
				await new Promise((resolve) => setTimeout(resolve, delay));
			}
		}
		
		throw lastError;
	}

	private openCircuit() {
		this.circuitOpen = true;
		if (this.circuitTimer) clearTimeout(this.circuitTimer);
		this.circuitTimer = setTimeout(() => {
			this.circuitOpen = false;
			console.info("[ResilientRedisStateStore] Circuit breaker closed, retrying Redis");
		}, this.CIRCUIT_TIMEOUT);
	}

	async has(id: string): Promise<boolean> {
		if (this.circuitOpen) {
			return await this.fallback.has(id);
		}

		try {
			return await this.withRetry(
				() => this.primary.has(id),
				`has(${id})`,
			);
		} catch (error) {
			console.error("[ResilientRedisStateStore] Redis failed, using fallback:", error);
			this.openCircuit();
			return await this.fallback.has(id);
		}
	}

	async set(id: string, ttlMs: number): Promise<void> {
		if (this.circuitOpen) {
			await this.fallback.set(id, ttlMs);
			return;
		}

		try {
			await this.withRetry(
				() => this.primary.set(id, ttlMs),
				`set(${id})`,
			);
		} catch (error) {
			console.error("[ResilientRedisStateStore] Redis failed, using fallback:", error);
			this.openCircuit();
			await this.fallback.set(id, ttlMs);
		}
	}

	async setIfAbsent(id: string, ttlMs: number): Promise<boolean> {
		if (this.circuitOpen) {
			return await this.fallback.setIfAbsent(id, ttlMs);
		}

		try {
			return await this.withRetry(
				() => this.primary.setIfAbsent(id, ttlMs),
				`setIfAbsent(${id})`,
			);
		} catch (error) {
			console.error("[ResilientRedisStateStore] Redis failed, using fallback:", error);
			this.openCircuit();
			return await this.fallback.setIfAbsent(id, ttlMs);
		}
	}

	async delete(id: string): Promise<void> {
		if (this.circuitOpen) {
			await this.fallback.delete(id);
			return;
		}

		try {
			await this.withRetry(
				() => this.primary.delete(id),
				`delete(${id})`,
			);
		} catch (error) {
			console.error("[ResilientRedisStateStore] Redis failed, using fallback:", error);
			this.openCircuit();
			await this.fallback.delete(id);
		}
	}

	async disconnect(): Promise<void> {
		await this.primary.disconnect();
	}
}