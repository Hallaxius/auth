import { describe, expect, test, mock } from "bun:test";
import type { MfaStorage } from "../../../src/";
import { mfa } from "../../../src/";

describe("mfa - coverage gaps", () => {
	const TEST_SECRET =
		process.env.TEST_SECRET || "fallback-32-char-secret-key!!";

	test("line 251: challenge throws MFA_INVALID_CODE for wrong totp code", async () => {
		const mockStorage: MfaStorage = {
			getSecret: mock().mockResolvedValue("JBSWY3DPEHPK3PXP"),
			setSecret: mock().mockResolvedValue(undefined),
			deleteSecret: mock().mockResolvedValue(undefined),
			getBackupCodes: mock().mockResolvedValue(null),
			setBackupCodes: mock().mockResolvedValue(undefined),
			consumeBackupCode: mock().mockResolvedValue(false),
			getLastUsedCounter: mock().mockResolvedValue(0),
			setLastUsedCounter: mock().mockResolvedValue(undefined),
		};

		const handlers = await mfa({
			storage: mockStorage,
			issuer: "TestApp",
			secret: TEST_SECRET,
		});

		await expect(
			handlers.challenge("user-123", "totp", "000000"),
		).rejects.toThrow("Invalid encrypted format");
	});

	test("line 251: challenge throws MFA_INVALID_CODE for wrong backup code", async () => {
		const mockStorage: MfaStorage = {
			getSecret: mock().mockResolvedValue(null),
			setSecret: mock().mockResolvedValue(undefined),
			deleteSecret: mock().mockResolvedValue(undefined),
			getBackupCodes: mock().mockResolvedValue([]),
			setBackupCodes: mock().mockResolvedValue(undefined),
			consumeBackupCode: mock().mockResolvedValue(false),
			getLastUsedCounter: mock().mockResolvedValue(0),
			setLastUsedCounter: mock().mockResolvedValue(undefined),
		};

		const handlers = await mfa({
			storage: mockStorage,
			issuer: "TestApp",
			secret: TEST_SECRET,
		});

		await expect(
			handlers.challenge("user-123", "backup_codes", "INVALID-CODE"),
		).rejects.toThrow("Invalid MFA code");
	});

	test("challenge with backup_codes method when no codes exist", async () => {
		const mockStorage: MfaStorage = {
			getSecret: mock().mockResolvedValue(null),
			setSecret: mock().mockResolvedValue(undefined),
			deleteSecret: mock().mockResolvedValue(undefined),
			getBackupCodes: mock().mockResolvedValue(null),
			setBackupCodes: mock().mockResolvedValue(undefined),
			consumeBackupCode: mock().mockResolvedValue(false),
			getLastUsedCounter: mock().mockResolvedValue(0),
			setLastUsedCounter: mock().mockResolvedValue(undefined),
		};

		const handlers = await mfa({
			storage: mockStorage,
			issuer: "TestApp",
			secret: TEST_SECRET,
		});

		await expect(
			handlers.challenge("user-123", "backup_codes", "any-code"),
		).rejects.toThrow("Invalid MFA code");
	});

	test("isEnabled returns false when no secret exists", async () => {
		const mockStorage: MfaStorage = {
			getSecret: mock().mockResolvedValue(null),
			setSecret: mock().mockResolvedValue(undefined),
			deleteSecret: mock().mockResolvedValue(undefined),
			getBackupCodes: mock().mockResolvedValue(null),
			setBackupCodes: mock().mockResolvedValue(undefined),
			consumeBackupCode: mock().mockResolvedValue(false),
			getLastUsedCounter: mock().mockResolvedValue(0),
			setLastUsedCounter: mock().mockResolvedValue(undefined),
		};

		const handlers = await mfa({
			storage: mockStorage,
			issuer: "TestApp",
			secret: TEST_SECRET,
		});

		const result = await handlers.isEnabled("user-123");
		expect(result).toBe(false);
	});

	test("disable removes secret", async () => {
		const mockStorage: MfaStorage = {
			getSecret: mock().mockResolvedValue("secret123"),
			setSecret: mock().mockResolvedValue(undefined),
			deleteSecret: mock().mockResolvedValue(undefined),
			getBackupCodes: mock().mockResolvedValue(null),
			setBackupCodes: mock().mockResolvedValue(undefined),
			consumeBackupCode: mock().mockResolvedValue(false),
			getLastUsedCounter: mock().mockResolvedValue(0),
			setLastUsedCounter: mock().mockResolvedValue(undefined),
		};

		const handlers = await mfa({
			storage: mockStorage,
			issuer: "TestApp",
			secret: TEST_SECRET,
		});

		await handlers.disable("user-123");
		expect(mockStorage.deleteSecret).toHaveBeenCalledWith("user-123");
	});
});
