import { beforeEach, describe, expect, it } from "bun:test";
import {
	type ComplianceManager,
	createComplianceManager,
	createMemoryComplianceStorage,
} from "../../src/";

describe("ComplianceManager - GDPR Data Export", () => {
	let manager: ComplianceManager;
	let storage: ReturnType<typeof createMemoryComplianceStorage>;

	beforeEach(() => {
		storage = createMemoryComplianceStorage();
		manager = createComplianceManager({
			exportStorage: storage.exportStorage,
			deletionStorage: storage.deletionStorage,
			consentStorage: storage.consentStorage,
			retentionStorage: storage.retentionStorage,
		});
	});

	it("should create export request", async () => {
		const { requestId, expiresAt } = await manager.requestDataExport(
			"user123",
			"user@example.com",
		);

		expect(requestId).toBeDefined();
		expect(expiresAt).toBeGreaterThan(Date.now());
	});

	it("should prevent duplicate export requests", async () => {
		await manager.requestDataExport("user123", "user@example.com");

		await expect(
			manager.requestDataExport("user123", "user@example.com"),
		).rejects.toThrow("Export request already pending");
	});

	it("should process export and store data", async () => {
		const { requestId } = await manager.requestDataExport(
			"user123",
			"user@example.com",
		);

		const mockExportData = {
			version: "1.0",
			exportedAt: new Date().toISOString(),
			user: {
				id: "user123",
				email: "user@example.com",
				username: "testuser",
				createdAt: new Date().toISOString(),
			},
			sessions: [],
			consents: [],
		};

		const request = await storage.exportStorage.getRequest(requestId);
		expect(request).toBeDefined();

		if (request) {
			request.status = "pending";
			request.exportData = undefined;
			await storage.exportStorage.saveRequest(requestId, request);
		}

		await manager.processExport(requestId, async (userId) => {
			expect(userId).toBe("user123");
			return mockExportData;
		});

		const exportData = await manager.getExportData(requestId);
		expect(exportData).toBeDefined();
		expect(exportData?.user.id).toBe("user123");
		expect(exportData?.version).toBe("1.0");
	});

	it("should return null for expired export", async () => {
		const { requestId } = await manager.requestDataExport(
			"user123",
			"user@example.com",
		);

		const request = await storage.exportStorage.getRequest(requestId);
		if (request) {
			request.expiresAt = Date.now() - 1000;
			await storage.exportStorage.saveRequest(requestId, request);
		}

		const exportData = await manager.getExportData(requestId);
		expect(exportData).toBeNull();
	});
});

describe("ComplianceManager - Right to be Forgotten", () => {
	let manager: ComplianceManager;
	let storage: ReturnType<typeof createMemoryComplianceStorage>;

	beforeEach(() => {
		storage = createMemoryComplianceStorage();
		manager = createComplianceManager({
			exportStorage: storage.exportStorage,
			deletionStorage: storage.deletionStorage,
			consentStorage: storage.consentStorage,
			retentionStorage: storage.retentionStorage,
		});
	});

	it("should create deletion request with confirmation", async () => {
		const { requestId, confirmationCode, scheduledFor } =
			await manager.requestDeletion("user123", "user@example.com");

		expect(requestId).toBeDefined();
		expect(confirmationCode).toBeDefined();
		expect(confirmationCode.length).toBe(16);
		expect(scheduledFor).toBeGreaterThan(Date.now());
	});

	it("should confirm deletion with correct code", async () => {
		const { requestId, confirmationCode } = await manager.requestDeletion(
			"user123",
			"user@example.com",
		);

		await manager.confirmDeletion(requestId, confirmationCode);

		const request = await storage.deletionStorage.getRequest(requestId);
		expect(request?.status).toBe("scheduled");
	});

	it("should reject invalid confirmation code", async () => {
		const { requestId } = await manager.requestDeletion(
			"user123",
			"user@example.com",
		);

		await expect(
			manager.confirmDeletion(requestId, "invalid-code"),
		).rejects.toThrow("Invalid deletion request or confirmation code");
	});

	it("should cancel deletion request", async () => {
		const { requestId } = await manager.requestDeletion(
			"user123",
			"user@example.com",
		);

		await manager.cancelDeletion(requestId);

		const request = await storage.deletionStorage.getRequest(requestId);
		expect(request?.status).toBe("cancelled");
	});

	it("should process deletion after confirmation", async () => {
		const { requestId, confirmationCode } = await manager.requestDeletion(
			"user123",
			"user@example.com",
		);

		await manager.confirmDeletion(requestId, confirmationCode);

		const request = await storage.deletionStorage.getRequest(requestId);
		if (request) {
			request.scheduledFor = Date.now() - 1000;
			await storage.deletionStorage.saveRequest(request);
		}

		let deletionCalled = false;
		await manager.processDeletion(requestId, async (userId) => {
			expect(userId).toBe("user123");
			deletionCalled = true;
		});

		expect(deletionCalled).toBe(true);

		const finalRequest = await storage.deletionStorage.getRequest(requestId);
		expect(finalRequest?.status).toBe("completed");
	});
});

describe("ComplianceManager - Consent Management", () => {
	let manager: ComplianceManager;
	let storage: ReturnType<typeof createMemoryComplianceStorage>;

	beforeEach(() => {
		storage = createMemoryComplianceStorage();
		manager = createComplianceManager({
			exportStorage: storage.exportStorage,
			deletionStorage: storage.deletionStorage,
			consentStorage: storage.consentStorage,
			retentionStorage: storage.retentionStorage,
		});
	});

	it("should grant consent", async () => {
		await manager.grantConsent("user123", "marketing", "1.0", {
			source: "web",
		});

		const consents = await manager.getConsents("user123");
		expect(consents.length).toBe(1);
		expect(consents[0]!.consentType).toBe("marketing");
		expect(consents[0]!.granted).toBe(true);
	});

	it("should withdraw consent", async () => {
		await manager.grantConsent("user123", "analytics", "1.0");
		await manager.withdrawConsent("user123", "analytics");

		const consents = await manager.getConsents("user123");
		expect(consents.length).toBe(1);
		expect(consents[0]!.granted).toBe(false);
		expect(consents[0]!.withdrawnAt).toBeDefined();
	});

	it("should track consent history", async () => {
		await manager.grantConsent("user123", "marketing", "1.0");
		await manager.withdrawConsent("user123", "marketing");
		await manager.grantConsent("user123", "marketing", "1.1");

		const history = await storage.consentStorage.getConsentHistory("user123");
		expect(history.length).toBe(1);
		expect(history[0]!.consentType).toBe("marketing");
		expect(history[0].granted).toBe(false);
	});

	it("should check age consent", async () => {
		const adult = await manager.checkAgeConsent("user123", 18);
		expect(adult).toBe(true);

		const minor = await manager.checkAgeConsent("user123", 15);
		expect(minor).toBe(false);
	});
});

describe("ComplianceManager - Data Retention", () => {
	let manager: ComplianceManager;
	let storage: ReturnType<typeof createMemoryComplianceStorage>;

	beforeEach(() => {
		storage = createMemoryComplianceStorage();
		manager = createComplianceManager({
			exportStorage: storage.exportStorage,
			deletionStorage: storage.deletionStorage,
			consentStorage: storage.consentStorage,
			retentionStorage: storage.retentionStorage,
			retentionPolicies: [
				{
					name: "Delete inactive users",
					description: "Delete data after 365 days of inactivity",
					retentionDays: 365,
					dataCategories: ["profile", "sessions"],
					action: "delete",
					enabled: true,
				},
			],
		});
	});

	it("should enforce retention policy", async () => {
		await storage.retentionStorage.setUserData(
			"user1",
			["profile", "sessions"],
			Date.now() - 400 * 24 * 60 * 60 * 1000,
		);

		await storage.retentionStorage.setUserData(
			"user2",
			["profile"],
			Date.now() - 100 * 24 * 60 * 60 * 1000,
		);

		const result = await manager.enforceRetentionPolicy();

		expect(result.processed).toBe(1);
		expect(result.deleted).toBe(1);

		const user1Categories =
			await storage.retentionStorage.getDataCategories("user1");
		expect(user1Categories.length).toBe(0);

		const user2Categories =
			await storage.retentionStorage.getDataCategories("user2");
		expect(user2Categories.length).toBe(1);
	});

	it("should support different retention actions", async () => {
		const managerAnonymize = createComplianceManager({
			exportStorage: storage.exportStorage,
			deletionStorage: storage.deletionStorage,
			consentStorage: storage.consentStorage,
			retentionStorage: storage.retentionStorage,
			retentionPolicies: [
				{
					name: "Anonymize old data",
					retentionDays: 30,
					dataCategories: ["logs"],
					action: "anonymize",
					enabled: true,
					description: "",
				},
			],
		});

		await storage.retentionStorage.setUserData(
			"user1",
			["logs"],
			Date.now() - 60 * 24 * 60 * 60 * 1000,
		);

		const result = await managerAnonymize.enforceRetentionPolicy();
		expect(result.anonymized).toBe(1);
	});
});
