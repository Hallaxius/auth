import { createClient, type RedisClientType, type RedisClusterOptions } from "redis";
import type { CacheAdapter, CacheEntry } from "./memory";

export interface RedisClusterCacheOptions {
	nodes?: Array<{ host: string; port: number }>;
	password?: string;
	username?: string;
	keyPrefix?: string;
	defaultTtlMs?: number;
	maxRetries?: number;
	retryDelayMs?: number;
	enableOfflineQueue?: boolean;
}

export interface ClusterNodeStats {
	host: string;
	port: number;
	connected: boolean;
	commandsProcessed: number;
	commandsFailed: number;
	lastError?: string;
}

export class RedisClusterCacheAdapter implements CacheAdapter {
	private cluster: RedisClientType | null = null;
	private options: Required<RedisClusterCacheOptions>;
	private connected = false;
	private reconnectAttempts = 0;
	private nodeStats: Map<string, ClusterNodeStats> = new Map();
	private circuitBreaker = {
		failures: 0,
		lastFailure: 0,
		open: false,
		threshold: 5,
		resetTimeout: 30000,
	};

	constructor(options: RedisClusterCacheOptions = {}) {
		this.options = {
			nodes: options.nodes ?? [{ host: "localhost", port: 6379 }],
			password: options.password ?? "",
			username: options.username ?? "",
			keyPrefix: options.keyPrefix ?? "cache:",
			defaultTtlMs: options.defaultTtlMs ?? 300_000,
			maxRetries: options.maxRetries ?? 3,
			retryDelayMs: options.retryDelayMs ?? 100,
			enableOfflineQueue: options.enableOfflineQueue ?? true,
		};

		this.initializeCluster();
	}

	private initializeCluster(): void {
		try {
			const primaryNode = this.options.nodes[0];
			const url = `redis://${this.options.username ? `${this.options.username}:` : ""}${this.options.password ? `${this.options.password}@` : ""}${primaryNode.host}:${primaryNode.port}`;

			this.cluster = createClient({
				url,
				socket: {
					reconnectStrategy: (retries) => {
						if (retries > this.options.maxRetries) {
							this.openCircuitBreaker();
							return new Error("Max retries reached");
						}
						this.reconnectAttempts = retries;
						return Math.min(retries * this.options.retryDelayMs, 3000);
					},
				},
				...(this.options.enableOfflineQueue ? {} : { disableOfflineQueue: true }),
			});

			this.cluster.on("error", (err) => {
				this.recordNodeFailure(
					primaryNode.host,
					primaryNode.port,
					err.message,
				);
			});

			this.cluster.on("connect", () => {
				this.connected = true;
				this.closeCircuitBreaker();
				this.updateNodeStats(primaryNode.host, primaryNode.port, true);
			});
		} catch (error) {
			this.connected = false;
		}
	}

	private async connect(): Promise<void> {
		if (!this.connected && this.cluster) {
			try {
				await this.cluster.connect();
				this.connected = true;
			} catch (error) {
				this.connected = false;
				throw error;
			}
		}
	}

	private openCircuitBreaker(): void {
		this.circuitBreaker.open = true;
		this.circuitBreaker.lastFailure = Date.now();
	}

	private closeCircuitBreaker(): void {
		this.circuitBreaker.open = false;
		this.circuitBreaker.failures = 0;
	}

	private shouldAllowRequest(): boolean {
		if (!this.circuitBreaker.open) return true;

		if (Date.now() - this.circuitBreaker.lastFailure > this.circuitBreaker.resetTimeout) {
			this.circuitBreaker.open = false;
			return true;
		}

		return false;
	}

	private recordNodeFailure(
		host: string,
		port: number,
		error: string,
	): void {
		const key = `${host}:${port}`;
		const stats = this.nodeStats.get(key) ?? {
			host,
			port,
			connected: false,
			commandsProcessed: 0,
			commandsFailed: 0,
		};

		stats.commandsFailed++;
		stats.lastError = error;
		stats.connected = false;

		this.nodeStats.set(key, stats);

		this.circuitBreaker.failures++;
		if (this.circuitBreaker.failures >= this.circuitBreaker.threshold) {
			this.openCircuitBreaker();
		}
	}

	private updateNodeStats(
		host: string,
		port: number,
		connected: boolean,
	): void {
		const key = `${host}:${port}`;
		const stats = this.nodeStats.get(key) ?? {
			host,
			port,
			connected,
			commandsProcessed: 0,
			commandsFailed: 0,
		};

		stats.connected = connected;
		if (connected) {
			stats.commandsProcessed++;
		}

		this.nodeStats.set(key, stats);
	}

	private getKey(key: string): string {
		return `${this.options.keyPrefix}${key}`;
	}

	async get(key: string): Promise<CacheEntry | null> {
		if (!this.shouldAllowRequest()) {
			return null;
		}

		try {
			if (!this.connected) {
				await this.connect();
			}

			if (!this.cluster) return null;

			const value = await this.cluster.get(this.getKey(key));
			if (!value) return null;

			const entry: CacheEntry = JSON.parse(value);

			if (Date.now() > entry.expiresAt) {
				await this.delete(key);
				return null;
			}

			return entry;
		} catch (error) {
			const primaryNode = this.options.nodes[0];
			this.recordNodeFailure(
				primaryNode.host,
				primaryNode.port,
				error instanceof Error ? error.message : "Unknown error",
			);
			return null;
		}
	}

	async set(key: string, value: unknown, ttlMs?: number): Promise<void> {
		if (!this.shouldAllowRequest()) {
			return;
		}

		try {
			if (!this.connected) {
				await this.connect();
			}

			if (!this.cluster) return;

			const effectiveTtl = ttlMs ?? this.options.defaultTtlMs;
			const entry: CacheEntry = {
				value,
				expiresAt: Date.now() + effectiveTtl,
			};

			await this.cluster.setEx(
				this.getKey(key),
				Math.ceil(effectiveTtl / 1000),
				JSON.stringify(entry),
			);
		} catch (error) {
			const primaryNode = this.options.nodes[0];
			this.recordNodeFailure(
				primaryNode.host,
				primaryNode.port,
				error instanceof Error ? error.message : "Unknown error",
			);
		}
	}

	async delete(key: string): Promise<void> {
		if (!this.shouldAllowRequest()) {
			return;
		}

		try {
			if (!this.connected) {
				await this.connect();
			}

			if (!this.cluster) return;

			await this.cluster.del(this.getKey(key));
		} catch (error) {
			const primaryNode = this.options.nodes[0];
			this.recordNodeFailure(
				primaryNode.host,
				primaryNode.port,
				error instanceof Error ? error.message : "Unknown error",
			);
		}
	}

	async mget(keys: string[]): Promise<(CacheEntry | null)[]> {
		if (!this.shouldAllowRequest()) {
			return keys.map(() => null);
		}

		try {
			if (!this.connected) {
				await this.connect();
			}

			if (!this.cluster) return keys.map(() => null);

			const clusterKeys = keys.map((k) => this.getKey(k));
			const values = await this.cluster.mGet(clusterKeys);

			return values.map((value, index) => {
				if (!value) return null;

				try {
					const entry: CacheEntry = JSON.parse(value);
					if (Date.now() > entry.expiresAt) {
						this.delete(keys[index]).catch(() => {});
						return null;
					}
					return entry;
				} catch {
					return null;
				}
			});
		} catch (error) {
			return keys.map(() => null);
		}
	}

	async mset(
		entries: Array<{ key: string; value: unknown; ttlMs?: number }>,
	): Promise<void> {
		if (!this.shouldAllowRequest()) {
			return;
		}

		try {
			if (!this.connected) {
				await this.connect();
			}

			if (!this.cluster) return;

			const pipeline = this.cluster.multi();

			for (const entry of entries) {
				const effectiveTtl = entry.ttlMs ?? this.options.defaultTtlMs;
				const cacheEntry: CacheEntry = {
					value: entry.value,
					expiresAt: Date.now() + effectiveTtl,
				};

				pipeline.setEx(
					this.getKey(entry.key),
					Math.ceil(effectiveTtl / 1000),
					JSON.stringify(cacheEntry),
				);
			}

			await pipeline.exec();
		} catch (error) {
			const primaryNode = this.options.nodes[0];
			this.recordNodeFailure(
				primaryNode.host,
				primaryNode.port,
				error instanceof Error ? error.message : "Unknown error",
			);
		}
	}

	getClusterStats(): {
		connected: boolean;
		nodes: ClusterNodeStats[];
		circuitBreakerOpen: boolean;
		reconnectAttempts: number;
	} {
		return {
			connected: this.connected,
			nodes: Array.from(this.nodeStats.values()),
			circuitBreakerOpen: this.circuitBreaker.open,
			reconnectAttempts: this.reconnectAttempts,
		};
	}

	async disconnect(): Promise<void> {
		if (this.cluster && this.connected) {
			await this.cluster.quit();
			this.connected = false;
		}
	}
}
