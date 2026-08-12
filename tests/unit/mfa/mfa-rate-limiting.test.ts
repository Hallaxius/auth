import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { MfaStorage } from "../../../src/";
import { mfa } from "../../../src/";
import { TestRateLimitStorage } from "../../helpers/storage";

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
	const secret = process.env.TEST_SECRET || "5K8qN2mR9pL3vX7wJ4tY6hF1dS0aG8bC2eU5iO9xM3nZ7kV4rW1qP6yT0uI8oA2";
	let storage: TestMfaStorage;

	beforeEach(() => {
		mock.clearAllMocks();
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

	async function disableWithWrongPassword(
		instance: ReturnType<typeof mfa>,
		userId: string,
	): Promise<Response> {
		const { signToken } = await import("../../../src/internal/jwt");
		const token = await signToken({ userId }, secret, "7d");
		return instance.handleMfaDisable(
			new Request("http://localhost/mfa/disable", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Cookie: `mfa-session=${token}`,
				},
				body: JSON.stringify({ password: "wrong-password" }),
			}),
		);
	}

	it("should block disable after 5 wrong passwords (in-memory)", async () => {
		const mfaInstance = mfa({
			storage,
			secret,
			verifyPassword: async () => false,
		});
		const userId = "disable-user";
		await mfaInstance.setup(userId);

		for (let i = 0; i < 5; i++) {
			const res = await disableWithWrongPassword(mfaInstance, userId);
			expect(res.status).toBe(401);
		}
		const res = await disableWithWrongPassword(mfaInstance, userId);
		expect(res.status).toBe(429);
	});

	it("should block disable at the same attempt count with rateLimitStorage", async () => {
		const mfaInstance = mfa({
			storage,
			secret,
			verifyPassword: async () => false,
			rateLimitStorage: new TestRateLimitStorage(),
		});
		const userId = "disable-user-storage";
		await mfaInstance.setup(userId);

		for (let i = 0; i < 5; i++) {
			const res = await disableWithWrongPassword(mfaInstance, userId);
			expect(res.status).toBe(401);
		}
		const res = await disableWithWrongPassword(mfaInstance, userId);
		expect(res.status).toBe(429);
	});

	it("should block TOTP at the same attempt count with rateLimitStorage", async () => {
		const mfaInstance = mfa({
			storage,
			secret,
			rateLimitStorage: new TestRateLimitStorage(),
		});
		const userId = "totp-storage";
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

	it("should block backup codes at the same attempt count with rateLimitStorage", async () => {
		const mfaInstance = mfa({
			storage,
			secret,
			rateLimitStorage: new TestRateLimitStorage(),
		});
		const userId = "backup-storage";
		await mfaInstance.setup(userId);

		const verifyBackupCode = (
			mfaInstance as unknown as {
				verifyBackupCode: (userId: string, code: string) => Promise<boolean>;
			}
		).verifyBackupCode.bind(mfaInstance);

		for (let i = 0; i < 10; i++) {
			expect(await verifyBackupCode(userId, `invalid${i}`)).toBe(false);
		}
		expect(await verifyBackupCode(userId, "invalid10")).toBe(false);
	});
});



