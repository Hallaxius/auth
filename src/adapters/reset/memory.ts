import type { ResetTokenStorage } from "../../types";
import { LruCache } from "../../utils/lru";

interface TokenEntry {
	validatorHash: string;
	expiry: number;
	userId: string;
	email: string;
	username: string;
	usedAt?: number;
}

export class InMemoryResetTokenStorage implements ResetTokenStorage {
	private tokens = new LruCache<string, TokenEntry>(5_000);

	async create(data: {
		selector: string;
		validatorHash: string;
		expiry: number;
		userId: string;
		email: string;
		username: string;
	}): Promise<void> {
		const { selector, validatorHash, expiry, userId, email, username } = data;
		const ttlMs = expiry - Date.now();
		this.tokens.set(
			selector,
			{ validatorHash, expiry, userId, email, username },
			ttlMs,
		);
	}

	async findBySelector(selector: string): Promise<{
		validatorHash: string;
		expiry: number;
		userId: string;
		email: string;
		username: string;
		usedAt?: number;
	} | null> {
		const stored = this.tokens.get(selector);
		if (!stored) return null;
		if (Date.now() > stored.expiry) {
			this.tokens.delete(selector);
			return null;
		}
		return { ...stored };
	}

	async consume(
		selector: string,
	): Promise<{ userId: string; email: string; username: string } | null> {
		const stored = this.tokens.get(selector);
		if (!stored) return null;
		if (Date.now() > stored.expiry) {
			this.tokens.delete(selector);
			return null;
		}
		stored.usedAt = Date.now();
		this.tokens.delete(selector);
		return {
			userId: stored.userId,
			email: stored.email,
			username: stored.username,
		};
	}

	async delete(selector: string): Promise<void> {
		this.tokens.delete(selector);
	}

	dispose(): void {
		this.tokens.dispose();
	}
}
