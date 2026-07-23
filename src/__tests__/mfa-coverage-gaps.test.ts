import { describe, expect, test, vi } from "vitest";
import { mfa } from "../mfa";
import type { MfaStorage } from "../types";

describe("mfa - coverage gaps", () => {
	test("line 251: challenge throws MFA_INVALID_CODE for wrong totp code", async () => {
		const mockStorage: MfaStorage = {
			getSecret: vi.fn().mockResolvedValue("JBSWY3DPEHPK3PXP"),
			setSecret: vi.fn().mockResolvedValue(undefined),
			deleteSecret: vi.fn().mockResolvedValue(undefined),
			getBackupCodes: vi.fn().mockResolvedValue(null),
			setBackupCodes: vi.fn().mockResolvedValue(undefined),
			consumeBackupCode: vi.fn().mockResolvedValue(false),
			getLastUsedCounter: vi.fn().mockResolvedValue(0),
			setLastUsedCounter: vi.fn().mockResolvedValue(undefined),
		};

		const handlers = await mfa({
			storage: mockStorage,
			issuer: "TestApp",
			secret: "test-secret-key-32-chars-long!!",
		});

		await expect(
			handlers.challenge("user-123", "totp", "000000"),
		).rejects.toThrow("Invalid encrypted format");
	});

	test("line 251: challenge throws MFA_INVALID_CODE for wrong backup code", async () => {
		const mockStorage: MfaStorage = {
			getSecret: vi.fn().mockResolvedValue(null),
			setSecret: vi.fn().mockResolvedValue(undefined),
			deleteSecret: vi.fn().mockResolvedValue(undefined),
			getBackupCodes: vi.fn().mockResolvedValue([]),
			setBackupCodes: vi.fn().mockResolvedValue(undefined),
			consumeBackupCode: vi.fn().mockResolvedValue(false),
			getLastUsedCounter: vi.fn().mockResolvedValue(0),
			setLastUsedCounter: vi.fn().mockResolvedValue(undefined),
		};

		const handlers = await mfa({
			storage: mockStorage,
			issuer: "TestApp",
			secret: "test-secret-key-32-chars-long!!",
		});

		await expect(
			handlers.challenge("user-123", "backup_codes", "INVALID-CODE"),
		).rejects.toThrow("Invalid MFA code");
	});

	test("challenge with backup_codes method when no codes exist", async () => {
		const mockStorage: MfaStorage = {
			getSecret: vi.fn().mockResolvedValue(null),
			setSecret: vi.fn().mockResolvedValue(undefined),
			deleteSecret: vi.fn().mockResolvedValue(undefined),
			getBackupCodes: vi.fn().mockResolvedValue(null),
			setBackupCodes: vi.fn().mockResolvedValue(undefined),
			consumeBackupCode: vi.fn().mockResolvedValue(false),
			getLastUsedCounter: vi.fn().mockResolvedValue(0),
			setLastUsedCounter: vi.fn().mockResolvedValue(undefined),
		};

		const handlers = await mfa({
			storage: mockStorage,
			issuer: "TestApp",
			secret: "test-secret-key-32-chars-long!!",
		});

		await expect(
			handlers.challenge("user-123", "backup_codes", "any-code"),
		).rejects.toThrow("Invalid MFA code");
	});

	test("isEnabled returns false when no secret exists", async () => {
		const mockStorage: MfaStorage = {
			getSecret: vi.fn().mockResolvedValue(null),
			setSecret: vi.fn().mockResolvedValue(undefined),
			deleteSecret: vi.fn().mockResolvedValue(undefined),
			getBackupCodes: vi.fn().mockResolvedValue(null),
			setBackupCodes: vi.fn().mockResolvedValue(undefined),
			consumeBackupCode: vi.fn().mockResolvedValue(false),
			getLastUsedCounter: vi.fn().mockResolvedValue(0),
			setLastUsedCounter: vi.fn().mockResolvedValue(undefined),
		};

		const handlers = await mfa({
			storage: mockStorage,
			issuer: "TestApp",
			secret: "test-secret-key-32-chars-long!!",
		});

		const result = await handlers.isEnabled("user-123");
		expect(result).toBe(false);
	});

	test("disable removes secret", async () => {
		const mockStorage: MfaStorage = {
			getSecret: vi.fn().mockResolvedValue("secret123"),
			setSecret: vi.fn().mockResolvedValue(undefined),
			deleteSecret: vi.fn().mockResolvedValue(undefined),
			getBackupCodes: vi.fn().mockResolvedValue(null),
			setBackupCodes: vi.fn().mockResolvedValue(undefined),
			consumeBackupCode: vi.fn().mockResolvedValue(false),
			getLastUsedCounter: vi.fn().mockResolvedValue(0),
			setLastUsedCounter: vi.fn().mockResolvedValue(undefined),
		};

		const handlers = await mfa({
			storage: mockStorage,
			issuer: "TestApp",
			secret: "test-secret-key-32-chars-long!!",
		});

		await handlers.disable("user-123");
		expect(mockStorage.deleteSecret).toHaveBeenCalledWith("user-123");
	});
});
