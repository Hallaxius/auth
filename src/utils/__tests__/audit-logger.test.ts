/**
 * @file Audit logger tests
 */

import { describe, expect, test, beforeEach } from "bun:test";
import {
	createAuditLogger,
	auditLogger,
	type AuditLogStorage,
	type AuditEvent,
	type AuditLogFilter,
	type AuditLogQueryResult,
} from "../audit-logger";

class MockAuditStorage implements AuditLogStorage {
	private entries: Map<string, any> = new Map();

	async store(entry: AuditEvent): Promise<any> {
		const logEntry = { ...entry, logId: `log_${Date.now()}` };
		this.entries.set(logEntry.logId, logEntry);
		return logEntry;
	}

	async query(filter: AuditLogFilter): Promise<AuditLogQueryResult> {
		let results = Array.from(this.entries.values());

		if (filter.type) {
			results = results.filter((e) => e.type === filter.type);
		}

		if (filter.userId) {
			results = results.filter((e) => e.userId === filter.userId);
		}

		if (filter.severity) {
			results = results.filter((e) => e.severity === filter.severity);
		}

		if (filter.status) {
			results = results.filter((e) => e.status === filter.status);
		}

		const total = results.length;
		const offset = filter.offset ?? 0;
		const limit = filter.limit ?? 100;
		results = results.slice(offset, offset + limit);

		return {
			entries: results,
			total,
			hasMore: offset + limit < total,
		};
	}

	async getById(logId: string): Promise<any | null> {
		return this.entries.get(logId) ?? null;
	}

	async deleteOlderThan(olderThan: Date): Promise<number> {
		const cutoff = olderThan.getTime();
		const toDelete: string[] = [];

		for (const [logId, entry] of this.entries.entries()) {
			if (new Date(entry.timestamp).getTime() < cutoff) {
				toDelete.push(logId);
			}
		}

		for (const logId of toDelete) {
			this.entries.delete(logId);
		}

		return toDelete.length;
	}

	async exportLogs(startDate: Date, endDate: Date): Promise<any[]> {
		const start = startDate.getTime();
		const end = endDate.getTime();

		return Array.from(this.entries.values()).filter((entry) => {
			const timestamp = new Date(entry.timestamp).getTime();
			return timestamp >= start && timestamp <= end;
		});
	}

	getEntryCount(): number {
		return this.entries.size;
	}

	clear(): void {
		this.entries.clear();
	}
}

describe("createAuditLogger", () => {
	test("creates logger with default config", () => {
		const logger = createAuditLogger();

		expect(logger).toBeDefined();
		expect(typeof logger.logAuthSuccess).toBe("function");
		expect(typeof logger.logAuthFailure).toBe("function");
		expect(typeof logger.logLogout).toBe("function");
		expect(typeof logger.logTokenRevocation).toBe("function");
		expect(typeof logger.logMfaEnable).toBe("function");
		expect(typeof logger.logMfaDisable).toBe("function");
		expect(typeof logger.logRateLimitExceeded).toBe("function");
		expect(typeof logger.logBruteForceDetected).toBe("function");
		expect(typeof logger.logSuspiciousActivity).toBe("function");
		expect(typeof logger.queryLogs).toBe("function");
		expect(typeof logger.exportLogs).toBe("function");
		expect(typeof logger.cleanupOldLogs).toBe("function");
	});

	test("creates logger with custom config", () => {
		const storage = new MockAuditStorage();
		const logger = createAuditLogger({
			service: "test-service",
			enabled: true,
			logLevel: "debug",
			retentionDays: 30,
			storage,
		});

		expect(logger).toBeDefined();
	});

	test("disabled logger does not log", () => {
		const storage = new MockAuditStorage();
		const logger = createAuditLogger({
			enabled: false,
			storage,
		});

		logger.logAuthSuccess("user123");

		expect(storage.getEntryCount()).toBe(0);
	});
});

describe("audit logger methods", () => {
	let storage: MockAuditStorage;
	let logger: ReturnType<typeof createAuditLogger>;

	beforeEach(() => {
		storage = new MockAuditStorage();
		logger = createAuditLogger({
			enabled: true,
			logLevel: "debug",
			storage,
		});
	});

	test("logAuthSuccess creates audit event", () => {
		logger.logAuthSuccess("user123", {
			ipAddress: "192.168.1.1",
			sessionId: "sess_abc",
		});

		expect(storage.getEntryCount()).toBeGreaterThan(0);
	});

	test("logAuthFailure creates audit event", () => {
		logger.logAuthFailure("user@example.com", "Invalid password", {
			ipAddress: "192.168.1.1",
		});

		expect(storage.getEntryCount()).toBeGreaterThan(0);
	});

	test("logLogout creates audit event", () => {
		logger.logLogout("user123");

		expect(storage.getEntryCount()).toBeGreaterThan(0);
	});

	test("logTokenRevocation creates audit event", () => {
		logger.logTokenRevocation("jti_123", "User logout", "user123");

		expect(storage.getEntryCount()).toBeGreaterThan(0);
	});

	test("logPasswordChange creates audit event", () => {
		logger.logPasswordChange("user123");

		expect(storage.getEntryCount()).toBeGreaterThan(0);
	});

	test("logPasswordResetRequest creates audit event", () => {
		logger.logPasswordResetRequest("user@example.com");

		expect(storage.getEntryCount()).toBeGreaterThan(0);
	});

	test("logPasswordResetComplete creates audit event", () => {
		logger.logPasswordResetComplete("user123");

		expect(storage.getEntryCount()).toBeGreaterThan(0);
	});

	test("logMfaEnable creates audit event", () => {
		logger.logMfaEnable("user123", "totp");

		expect(storage.getEntryCount()).toBeGreaterThan(0);
	});

	test("logMfaDisable creates audit event", () => {
		logger.logMfaDisable("user123", "totp");

		expect(storage.getEntryCount()).toBeGreaterThan(0);
	});

	test("logMfaVerifySuccess creates audit event", () => {
		logger.logMfaVerifySuccess("user123", "totp");

		expect(storage.getEntryCount()).toBeGreaterThan(0);
	});

	test("logMfaVerifyFailure creates audit event", () => {
		logger.logMfaVerifyFailure("user123", "totp", "Invalid code");

		expect(storage.getEntryCount()).toBeGreaterThan(0);
	});

	test("logRateLimitExceeded creates audit event", () => {
		logger.logRateLimitExceeded("192.168.1.1", 100);

		expect(storage.getEntryCount()).toBeGreaterThan(0);
	});

	test("logBruteForceDetected creates audit event", () => {
		logger.logBruteForceDetected("192.168.1.1", 10, 60000);

		expect(storage.getEntryCount()).toBeGreaterThan(0);
	});

	test("logSuspiciousActivity creates audit event", () => {
		logger.logSuspiciousActivity("Multiple failed login attempts");

		expect(storage.getEntryCount()).toBeGreaterThan(0);
	});

	test("logSessionHijackAttempt creates audit event", () => {
		logger.logSessionHijackAttempt("user123", "IP address mismatch");

		expect(storage.getEntryCount()).toBeGreaterThan(0);
	});

	test("logCsrfViolation creates audit event", () => {
		logger.logCsrfViolation("user123", "Invalid CSRF token");

		expect(storage.getEntryCount()).toBeGreaterThan(0);
	});

	test("logSecurityPolicyViolation creates audit event", () => {
		logger.logSecurityPolicyViolation("CSP", "Inline script blocked");

		expect(storage.getEntryCount()).toBeGreaterThan(0);
	});

	test("logDataAccess creates audit event", () => {
		logger.logDataAccess("user123", "user_profile");

		expect(storage.getEntryCount()).toBeGreaterThan(0);
	});

	test("logDataModification creates audit event", () => {
		logger.logDataModification("user123", "user_profile", "email updated");

		expect(storage.getEntryCount()).toBeGreaterThan(0);
	});

	test("logUserAction creates audit event", () => {
		logger.logUserAction("user123", "profile_update", "User updated profile");

		expect(storage.getEntryCount()).toBeGreaterThan(0);
	});
});

describe("audit log query", () => {
	let storage: MockAuditStorage;
	let logger: ReturnType<typeof createAuditLogger>;

	beforeEach(() => {
		storage = new MockAuditStorage();
		logger = createAuditLogger({
			enabled: true,
			logLevel: "debug",
			storage,
		});
	});

	test("queryLogs returns results", async () => {
		logger.logAuthSuccess("user123");
		await new Promise((resolve) => setTimeout(resolve, 10));
		logger.logAuthSuccess("user456");
		await new Promise((resolve) => setTimeout(resolve, 10));
		logger.logAuthFailure("user789", "Invalid password");
		await new Promise((resolve) => setTimeout(resolve, 10));

		const result = await logger.queryLogs({});

		expect(result.total).toBe(3);
		expect(result.entries.length).toBe(3);
		expect(result.hasMore).toBe(false);
	});

	test("queryLogs filters by type", async () => {
		logger.logAuthSuccess("user123");
		logger.logAuthSuccess("user456");
		logger.logAuthFailure("user789", "Invalid password");

		const result = await logger.queryLogs({ type: "AUTH_SUCCESS" });

		expect(result.total).toBe(2);
		expect(result.entries.every((e) => e.type === "AUTH_SUCCESS")).toBe(true);
	});

	test("queryLogs filters by userId", async () => {
		logger.logAuthSuccess("user123");
		logger.logAuthSuccess("user123");
		logger.logAuthSuccess("user456");

		const result = await logger.queryLogs({ userId: "user123" });

		expect(result.total).toBe(2);
		expect(result.entries.every((e) => e.userId === "user123")).toBe(true);
	});

	test("queryLogs filters by severity", async () => {
		logger.logAuthSuccess("user123");
		logger.logBruteForceDetected("192.168.1.1", 10, 60000);
		logger.logSuspiciousActivity("Suspicious activity");

		const result = await logger.queryLogs({ severity: "HIGH" });

		expect(result.entries.every((e) => e.severity === "HIGH")).toBe(true);
	});

	test("queryLogs filters by status", async () => {
		logger.logAuthSuccess("user123");
		logger.logAuthFailure("user456", "Invalid password");
		logger.logBruteForceDetected("192.168.1.1", 10, 60000);

		const result = await logger.queryLogs({ status: "FAILURE" });

		expect(result.entries.every((e) => e.status === "FAILURE")).toBe(true);
	});

	test("queryLogs pagination", async () => {
		for (let i = 0; i < 15; i++) {
			logger.logAuthSuccess(`user${i}`);
		}

		const page1 = await logger.queryLogs({ limit: 10, offset: 0 });
		const page2 = await logger.queryLogs({ limit: 10, offset: 10 });

		expect(page1.entries.length).toBe(10);
		expect(page1.hasMore).toBe(true);
		expect(page2.entries.length).toBe(5);
		expect(page2.hasMore).toBe(false);
	});
});

describe("audit log cleanup", () => {
	let storage: MockAuditStorage;
	let logger: ReturnType<typeof createAuditLogger>;

	beforeEach(() => {
		storage = new MockAuditStorage();
		logger = createAuditLogger({
			enabled: true,
			logLevel: "debug",
			storage,
			retentionDays: 90,
		});
	});

	test("cleanupOldLogs removes old entries", async () => {
		logger.logAuthSuccess("user123");

		const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
		const deleted = await logger.cleanupOldLogs(oldDate);

		expect(deleted).toBe(1);
	});

	test("exportLogs returns logs in date range", async () => {
		logger.logAuthSuccess("user123");

		const now = new Date();
		const startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
		const endDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);

		const exported = await logger.exportLogs(startDate, endDate);

		expect(exported.length).toBeGreaterThan(0);
	});
});

describe("audit event structure", () => {
	let storage: MockAuditStorage;
	let logger: ReturnType<typeof createAuditLogger>;

	beforeEach(() => {
		storage = new MockAuditStorage();
		logger = createAuditLogger({
			enabled: true,
			logLevel: "debug",
			storage,
		});
	});

	test("event has required fields", async () => {
		logger.logAuthSuccess("user123");

		const result = await logger.queryLogs({});
		const event = result.entries[0];

		expect(event.id).toBeDefined();
		expect(event.type).toBe("AUTH_SUCCESS");
		expect(event.timestamp).toBeDefined();
		expect(event.severity).toBeDefined();
		expect(event.status).toBeDefined();
		expect(event.category).toBeDefined();
		expect(event.description).toBeDefined();
		expect(event.context).toBeDefined();
		expect(event.logId).toBeDefined();
	});

	test("event has correct severity for type", async () => {
		logger.logAuthSuccess("user123");
		logger.logBruteForceDetected("192.168.1.1", 10, 60000);
		logger.logSessionHijackAttempt("user123", "IP mismatch");

		const result = await logger.queryLogs({});

		const authEvent = result.entries.find((e) => e.type === "AUTH_SUCCESS");
		const bruteForceEvent = result.entries.find((e) => e.type === "BRUTE_FORCE_DETECTED");
		const hijackEvent = result.entries.find((e) => e.type === "SESSION_HIJACK_ATTEMPT");

		expect(authEvent?.severity).toBe("LOW");
		expect(bruteForceEvent?.severity).toBe("HIGH");
		expect(hijackEvent?.severity).toBe("CRITICAL");
	});

	test("event has correct category for type", async () => {
		logger.logAuthSuccess("user123");
		logger.logMfaEnable("user123", "totp");
		logger.logDataAccess("user123", "profile");

		const result = await logger.queryLogs({});

		const authEvent = result.entries.find((e) => e.type === "AUTH_SUCCESS");
		const mfaEvent = result.entries.find((e) => e.type === "MFA_ENABLE");
		const dataEvent = result.entries.find((e) => e.type === "DATA_ACCESS");

		expect(authEvent?.category).toBe("authentication");
		expect(mfaEvent?.category).toBe("mfa");
		expect(dataEvent?.category).toBe("data");
	});
});

describe("audit logger singleton", () => {
	test("exports default logger instance", () => {
		expect(auditLogger).toBeDefined();
		expect(typeof auditLogger.logAuthSuccess).toBe("function");
	});
});
