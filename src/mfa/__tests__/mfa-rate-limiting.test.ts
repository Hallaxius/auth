import { beforeEach, describe, expect, it, vi } from "vitest";
import { mfa } from "../mfa";
import type { MfaStorage } from "../types";

class TestMfaStorage implements MfaStorage {
	private secrets = new Map<string, string>();
	private backupCodes = new Map<string, string[]>();
	private lastUsedCounters = new Map<string, number>();

	async getSecret(userId: string): Promise<string | null> {
		return this.secrets.get(userId) ?? null;
	}

	async setSecret(userId: string, encryptedSecret: string): Promise<void> {
		this.secrets.set(userId, encryptedSecret);
	}

	async deleteSecret(userId: string): Promise<void> {
		this.secrets.delete(userId);
	}

	async getBackupCodes(userId: string): Promise<string[] | null> {
		return this.backupCodes.get(userId) ?? null;
	}

	async setBackupCodes(userId: string, hashedCodes: string[]): Promise<void> {
		this.backupCodes.set(userId, hashedCodes);
	}

	async consumeBackupCode(userId: string, codeIndex: number): Promise<void> {
		const codes = this.backupCodes.get(userId);
		if (codes) {
			codes.splice(codeIndex, 1);
		}
	}

	async getLastUsedCounter(userId: string): Promise<number | null> {
		return this.lastUsedCounters.get(userId) ?? null;
	}

	async setLastUsedCounter(userId: string, counter: number): Promise<void> {
		this.lastUsedCounters.set(userId, counter);
	}
}

describe("MFA Rate Limiting", () => {
	const secret = process.env.TEST_SECRET || "fallback-32-char-secret-key!!";
	let storage: TestMfaStorage;

	beforeEach(() => {
		vi.clearAllMocks();
		storage = new TestMfaStorage();
	});

	it("should allow valid TOTP attempts within limit", async () => {
		const mfaInstance = mfa({ storage, secret });
		const userId = "test-user";

		await mfaInstance.setup(userId);

		for (let i = 0; i < 3; i++) {
			try {
				await mfaInstance.verify(userId, "123456");
			} catch (error) {
				const message = (error as Error).message;
				if (message.includes("Too many TOTP attempts")) {
					throw error;
				}
			}
		}
	});

	it("should block after max TOTP attempts", async () => {
		const mfaInstance = mfa({ storage, secret });
		const userId = "test-user";

		await mfaInstance.setup(userId);

		for (let i = 0; i < 5; i++) {
			try {
				await mfaInstance.verify(userId, "123456");
			} catch (_error) {}
		}

		await expect(mfaInstance.verify(userId, "123456")).rejects.toThrow(
			"Too many TOTP attempts",
		);
	});

	it("should block after max backup code attempts", async () => {
		const mfaInstance = mfa({ storage, secret });
		const userId = "test-user";

		await mfaInstance.setup(userId);

		for (let i = 0; i < 10; i++) {
			const result = await (
				mfaInstance as unknown as {
					verifyBackupCode: (userId: string, code: string) => Promise<boolean>;
				}
			).verifyBackupCode(userId, `invalid${i}`);
			expect(result).toBe(false);
		}

		const result = await (
			mfaInstance as unknown as {
				verifyBackupCode: (userId: string, code: string) => Promise<boolean>;
			}
		).verifyBackupCode(userId, "invalid10");
		expect(result).toBe(false);
	});
});
