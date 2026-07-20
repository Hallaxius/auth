import type { MfaStorage } from "../../types";
import { LruCache } from "../../utils/lru";

export class InMemoryMfaStorage implements MfaStorage {
	private secrets = new LruCache<string, string>(10_000);
	private backupCodes = new LruCache<string, string[]>(10_000);
	private lastUsedCounters = new LruCache<string, number>(10_000);

	async getSecret(userId: string): Promise<string | null> {
		return this.secrets.get(userId) ?? null;
	}

	async setSecret(userId: string, encryptedSecret: string): Promise<void> {
		this.secrets.set(userId, encryptedSecret, 0);
	}

	async deleteSecret(userId: string): Promise<void> {
		this.secrets.delete(userId);
		this.backupCodes.delete(userId);
		this.lastUsedCounters.delete(userId);
	}

	async getBackupCodes(userId: string): Promise<string[] | null> {
		return this.backupCodes.get(userId) ?? null;
	}

	async setBackupCodes(userId: string, hashedCodes: string[]): Promise<void> {
		this.backupCodes.set(userId, [...hashedCodes], 0);
	}

	async consumeBackupCode(userId: string, codeIndex: number): Promise<void> {
		const codes = this.backupCodes.get(userId);
		if (!codes) return;
		codes.splice(codeIndex, 1);
		if (codes.length === 0) {
			this.backupCodes.delete(userId);
		}
	}

	async getLastUsedCounter(userId: string): Promise<number | null> {
		return this.lastUsedCounters.get(userId) ?? null;
	}

	async setLastUsedCounter(userId: string, counter: number): Promise<void> {
		this.lastUsedCounters.set(userId, counter, 0);
	}

	dispose(): void {
		this.secrets.dispose();
		this.backupCodes.dispose();
		this.lastUsedCounters.dispose();
	}
}
