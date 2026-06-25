import { MemoryBruteForceStorage } from "../adapters/brute-force";
import type { BruteForceConfig, BruteForceStorage } from "./types";

export class BruteForceProtection {
	private config: Required<Omit<BruteForceConfig, "storage">>;
	private storage: BruteForceStorage;

	constructor(config: BruteForceConfig, storage?: BruteForceStorage) {
		this.config = {
			enabled: config.enabled ?? true,
			maxAttempts: config.maxAttempts ?? 5,
			windowMs: config.windowMs ?? 15 * 60 * 1000,
			blockDurationMs: config.blockDurationMs ?? 30 * 60 * 1000,
		};
		this.storage = storage ?? config.storage ?? new MemoryBruteForceStorage();
	}

	async recordAttempt(key: string, success: boolean): Promise<void> {
		if (!this.config.enabled) return;

		if (success) {
			await this.storage.reset(key);
			return;
		}

		const count = await this.storage.increment(key, this.config.windowMs);
		if (count > this.config.maxAttempts) {
			await this.storage.block(key, this.config.blockDurationMs);
		}
	}

	async isBlocked(key: string): Promise<boolean> {
		if (!this.config.enabled) return false;
		return this.storage.isBlocked(key);
	}

	async getRemainingAttempts(key: string): Promise<number> {
		if (!this.config.enabled) return this.config.maxAttempts;
		const blocked = await this.storage.isBlocked(key);
		if (blocked) return 0;
		const count = await this.storage.getCount(key);
		return Math.max(0, this.config.maxAttempts - count);
	}

	async reset(key: string): Promise<void> {
		if (!this.config.enabled) return;
		await this.storage.reset(key);
	}

	static extractKey(request: Request): string {
		const ip =
			request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
			request.headers.get("x-real-ip") ??
			"unknown";
		const userAgent =
			request.headers.get("user-agent")?.slice(0, 50) ?? "unknown";
		return `${ip}:${userAgent}`;
	}
}
