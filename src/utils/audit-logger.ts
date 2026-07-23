/**
 * @file Audit logging utilities for security events
 *
 * Comprehensive audit logging for security-critical events.
 * Provides structured logging, log rotation, and security event tracking.
 *
 * @module utils/audit-logger
 */

import type { SecurityLogger } from "../types";

export type AuditEventType =
	| "AUTH_SUCCESS"
	| "AUTH_FAILURE"
	| "LOGOUT"
	| "TOKEN_REVOCATION"
	| "PASSWORD_CHANGE"
	| "PASSWORD_RESET_REQUEST"
	| "PASSWORD_RESET_COMPLETE"
	| "MFA_ENABLE"
	| "MFA_DISABLE"
	| "MFA_VERIFY_SUCCESS"
	| "MFA_VERIFY_FAILURE"
	| "RATE_LIMIT_EXCEEDED"
	| "BRUTE_FORCE_DETECTED"
	| "SUSPICIOUS_ACTIVITY"
	| "PRIVILEGE_ESCALATION"
	| "DATA_ACCESS"
	| "DATA_MODIFICATION"
	| "DATA_DELETION"
	| "CONFIG_CHANGE"
	| "SECURITY_POLICY_VIOLATION"
	| "SESSION_HIJACK_ATTEMPT"
	| "CSRF_VIOLATION"
	| "CORS_VIOLATION"
	| "INPUT_VALIDATION_FAILURE"
	| "FILE_ACCESS"
	| "API_KEY_CREATED"
	| "API_KEY_REVOKED"
	| "USER_CREATED"
	| "USER_UPDATED"
	| "USER_DELETED";

export type AuditSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type AuditStatus = "SUCCESS" | "FAILURE" | "BLOCKED" | "PENDING";

export interface AuditEvent {
	/** Unique event identifier */
	id: string;
	/** Event type */
	type: AuditEventType;
	/** Event timestamp (ISO 8601) */
	timestamp: string;
	/** User ID (if authenticated) */
	userId?: string;
	/** Session ID */
	sessionId?: string;
	/** IP address */
	ipAddress?: string;
	/** User agent */
	userAgent?: string;
	/** Event severity */
	severity: AuditSeverity;
	/** Event status */
	status: AuditStatus;
	/** Event category */
	category: string;
	/** Human-readable description */
	description: string;
	/** Additional context data */
	context: Record<string, unknown>;
	/** Request ID for tracing */
	requestId?: string;
	/** Resource affected */
	resource?: string;
	/** Action performed */
	action?: string;
	/** Outcome details */
	outcome?: string;
}

export interface AuditLogEntry extends AuditEvent {
	/** Log storage ID */
	logId: string;
	/** Hash of event data for integrity */
	hash?: string;
}

export interface AuditLogFilter {
	/** Filter by event type */
	type?: AuditEventType;
	/** Filter by user ID */
	userId?: string;
	/** Filter by IP address */
	ipAddress?: string;
	/** Filter by severity */
	severity?: AuditSeverity;
	/** Filter by status */
	status?: AuditStatus;
	/** Filter by date range (start) */
	startDate?: string;
	/** Filter by date range (end) */
	endDate?: string;
	/** Filter by category */
	category?: string;
	/** Limit results */
	limit?: number;
	/** Offset for pagination */
	offset?: number;
}

export interface AuditLogQueryResult {
	/** Matching log entries */
	entries: AuditLogEntry[];
	/** Total count (without pagination) */
	total: number;
	/** Has more results */
	hasMore: boolean;
}

export interface AuditLogStorage {
	/**
	 * Store audit log entry
	 * @param entry - Audit event to store
	 * @returns Stored entry with logId
	 */
	store(entry: AuditEvent): Promise<AuditLogEntry>;
	/**
	 * Query audit logs
	 * @param filter - Query filters
	 * @returns Query results
	 */
	query(filter: AuditLogFilter): Promise<AuditLogQueryResult>;
	/**
	 * Get entry by ID
	 * @param logId - Log entry ID
	 * @returns Entry or null
	 */
	getById(logId: string): Promise<AuditLogEntry | null>;
	/**
	 * Delete old logs (retention policy)
	 * @param olderThan - Delete entries older than this date
	 * @returns Number of deleted entries
	 */
	deleteOlderThan(olderThan: Date): Promise<number>;
	/**
	 * Export logs for compliance
	 * @param startDate - Start date
	 * @param endDate - End date
	 * @returns Exported logs
	 */
	exportLogs(startDate: Date, endDate: Date): Promise<AuditLogEntry[]>;
}

export interface AuditLoggerConfig {
	/** Service name for logging */
	service?: string;
	/** Enable audit logging (default: true) */
	enabled?: boolean;
	/** Log level (default: "info") */
	logLevel?: "debug" | "info" | "warn" | "error";
	/** Include sensitive data (default: false) */
	includeSensitiveData?: boolean;
	/** Storage interface (default: memory) */
	storage?: AuditLogStorage;
	/** Retention period in days (default: 90) */
	retentionDays?: number;
	/** Enable log rotation */
	rotation?: {
		enabled?: boolean;
		maxEntries?: number;
		maxSizeMB?: number;
	};
	/** External logger */
	logger?: SecurityLogger;
}

function generateEventId(): string {
	const timestamp = Date.now().toString(36);
	const random = Math.random().toString(36).substring(2, 10);
	return `evt_${timestamp}_${random}`;
}

function generateLogId(): string {
	const timestamp = Date.now().toString(36);
	const random = Math.random().toString(36).substring(2, 12);
	return `log_${timestamp}_${random}`;
}

function getSeverityForEventType(type: AuditEventType): AuditSeverity {
	const severityMap: Record<AuditEventType, AuditSeverity> = {
		AUTH_SUCCESS: "LOW",
		AUTH_FAILURE: "MEDIUM",
		LOGOUT: "LOW",
		TOKEN_REVOCATION: "MEDIUM",
		PASSWORD_CHANGE: "MEDIUM",
		PASSWORD_RESET_REQUEST: "MEDIUM",
		PASSWORD_RESET_COMPLETE: "MEDIUM",
		MFA_ENABLE: "LOW",
		MFA_DISABLE: "MEDIUM",
		MFA_VERIFY_SUCCESS: "LOW",
		MFA_VERIFY_FAILURE: "MEDIUM",
		RATE_LIMIT_EXCEEDED: "MEDIUM",
		BRUTE_FORCE_DETECTED: "HIGH",
		SUSPICIOUS_ACTIVITY: "HIGH",
		PRIVILEGE_ESCALATION: "CRITICAL",
		DATA_ACCESS: "LOW",
		DATA_MODIFICATION: "MEDIUM",
		DATA_DELETION: "HIGH",
		CONFIG_CHANGE: "MEDIUM",
		SECURITY_POLICY_VIOLATION: "HIGH",
		SESSION_HIJACK_ATTEMPT: "CRITICAL",
		CSRF_VIOLATION: "HIGH",
		CORS_VIOLATION: "MEDIUM",
		INPUT_VALIDATION_FAILURE: "MEDIUM",
		FILE_ACCESS: "LOW",
		API_KEY_CREATED: "MEDIUM",
		API_KEY_REVOKED: "MEDIUM",
		USER_CREATED: "LOW",
		USER_UPDATED: "LOW",
		USER_DELETED: "HIGH",
	};

	return severityMap[type] ?? "MEDIUM";
}

function getCategoryForEventType(type: AuditEventType): string {
	const categoryMap: Partial<Record<AuditEventType, string>> = {
		AUTH_SUCCESS: "authentication",
		AUTH_FAILURE: "authentication",
		LOGOUT: "authentication",
		TOKEN_REVOCATION: "authentication",
		PASSWORD_CHANGE: "authentication",
		PASSWORD_RESET_REQUEST: "authentication",
		PASSWORD_RESET_COMPLETE: "authentication",
		MFA_ENABLE: "mfa",
		MFA_DISABLE: "mfa",
		MFA_VERIFY_SUCCESS: "mfa",
		MFA_VERIFY_FAILURE: "mfa",
		RATE_LIMIT_EXCEEDED: "rate-limiting",
		BRUTE_FORCE_DETECTED: "security",
		SUSPICIOUS_ACTIVITY: "security",
		PRIVILEGE_ESCALATION: "security",
		DATA_ACCESS: "data",
		DATA_MODIFICATION: "data",
		DATA_DELETION: "data",
		CONFIG_CHANGE: "configuration",
		SECURITY_POLICY_VIOLATION: "security",
		SESSION_HIJACK_ATTEMPT: "security",
		CSRF_VIOLATION: "security",
		CORS_VIOLATION: "security",
		INPUT_VALIDATION_FAILURE: "validation",
		FILE_ACCESS: "data",
		API_KEY_CREATED: "api",
		API_KEY_REVOKED: "api",
		USER_CREATED: "user-management",
		USER_UPDATED: "user-management",
		USER_DELETED: "user-management",
	};

	return categoryMap[type] ?? "general";
}

function sanitizeContext(
	context: Record<string, unknown>,
	includeSensitive: boolean,
): Record<string, unknown> {
	if (includeSensitive) {
		return context;
	}

	const SENSITIVE_FIELDS = [
		"password",
		"secret",
		"token",
		"accessToken",
		"refreshToken",
		"apiKey",
		"api_key",
		"private_key",
		"authorization",
		"cookie",
		"credential",
	];

	const sanitized: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(context)) {
		const lowerKey = key.toLowerCase();
		if (SENSITIVE_FIELDS.some((field) => lowerKey.includes(field))) {
			sanitized[key] = "[REDACTED]";
		} else if (typeof value === "object" && value !== null) {
			sanitized[key] = sanitizeContext(value as Record<string, unknown>, includeSensitive);
		} else {
			sanitized[key] = value;
		}
	}

	return sanitized;
}

class MemoryAuditLogStorage implements AuditLogStorage {
	private entries: Map<string, AuditLogEntry> = new Map();
	private indexByUser: Map<string, Set<string>> = new Map();
	private indexByType: Map<string, Set<string>> = new Map();
	private indexByDate: Map<string, Set<string>> = new Map();

	async store(entry: AuditEvent): Promise<AuditLogEntry> {
		const logId = generateLogId();
		const logEntry: AuditLogEntry = {
			...entry,
			logId,
		};

		this.entries.set(logId, logEntry);

		if (entry.userId) {
			if (!this.indexByUser.has(entry.userId)) {
				this.indexByUser.set(entry.userId, new Set());
			}
			this.indexByUser.get(entry.userId)!.add(logId);
		}

		if (!this.indexByType.has(entry.type)) {
			this.indexByType.set(entry.type, new Set());
		}
		this.indexByType.get(entry.type)!.add(logId);

		const dateKey = entry.timestamp.split("T")[0];
		if (!this.indexByDate.has(dateKey)) {
			this.indexByDate.set(dateKey, new Set());
		}
		this.indexByDate.get(dateKey)!.add(logId);

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

		if (filter.ipAddress) {
			results = results.filter((e) => e.ipAddress === filter.ipAddress);
		}

		if (filter.severity) {
			results = results.filter((e) => e.severity === filter.severity);
		}

		if (filter.status) {
			results = results.filter((e) => e.status === filter.status);
		}

		if (filter.category) {
			results = results.filter((e) => e.category === filter.category);
		}

		if (filter.startDate) {
			const startDate = new Date(filter.startDate).getTime();
			results = results.filter((e) => new Date(e.timestamp).getTime() >= startDate);
		}

		if (filter.endDate) {
			const endDate = new Date(filter.endDate).getTime();
			results = results.filter((e) => new Date(e.timestamp).getTime() <= endDate);
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

	async getById(logId: string): Promise<AuditLogEntry | null> {
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

		for (const index of this.indexByUser.values()) {
			for (const logId of toDelete) {
				index.delete(logId);
			}
		}

		for (const index of this.indexByType.values()) {
			for (const logId of toDelete) {
				index.delete(logId);
			}
		}

		for (const index of this.indexByDate.values()) {
			for (const logId of toDelete) {
				index.delete(logId);
			}
		}

		return toDelete.length;
	}

	async exportLogs(startDate: Date, endDate: Date): Promise<AuditLogEntry[]> {
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
		this.indexByUser.clear();
		this.indexByType.clear();
		this.indexByDate.clear();
	}
}

export function createAuditLogger(config: AuditLoggerConfig = {}): AuditLogger {
	const {
		service = "auth",
		enabled = true,
		logLevel = "info",
		includeSensitiveData = false,
		retentionDays = 90,
	} = config;

	const storage = config.storage ?? new MemoryAuditLogStorage();
	const logger = config.logger;

	function log(event: AuditEvent): void {
		if (!enabled) {
			return;
		}

		const sanitizedContext = sanitizeContext(event.context, includeSensitiveData);

		const logMessage = `[AUDIT] ${event.type} - ${event.description}`;
		const logContext = {
			...event,
			context: sanitizedContext,
		};

		switch (logLevel) {
			case "debug":
				logger?.debug(logMessage, logContext);
				break;
			case "info":
				logger?.info(logMessage, logContext);
				break;
			case "warn":
				logger?.warn(logMessage, logContext);
				break;
			case "error":
				logger?.error(logMessage, logContext);
				break;
		}

		storage.store(event).catch((err) => {
			console.error("Failed to store audit log:", err);
		});
	}

	function createEvent(
		type: AuditEventType,
		description: string,
		options: Partial<AuditEvent> = {},
	): AuditEvent {
		return {
			id: generateEventId(),
			type,
			timestamp: new Date().toISOString(),
			severity: options.severity ?? getSeverityForEventType(type),
			status: options.status ?? "SUCCESS",
			category: options.category ?? getCategoryForEventType(type),
			description,
			context: options.context ?? {},
			userId: options.userId,
			sessionId: options.sessionId,
			ipAddress: options.ipAddress,
			userAgent: options.userAgent,
			requestId: options.requestId,
			resource: options.resource,
			action: options.action,
			outcome: options.outcome,
		};
	}

	return {
		log,

		logAuthSuccess(userId: string, options: Partial<AuditEvent> = {}): void {
			const event = createEvent("AUTH_SUCCESS", "User authentication successful", {
				...options,
				userId,
				status: "SUCCESS",
			});
			log(event);
		},

		logAuthFailure(
			identifier: string,
			reason: string,
			options: Partial<AuditEvent> = {},
		): void {
			const event = createEvent(
				"AUTH_FAILURE",
				`Authentication failure: ${reason}`,
				{
					...options,
					status: "FAILURE",
					context: { ...options.context, identifier, reason },
				},
			);
			log(event);
		},

		logLogout(userId: string, options: Partial<AuditEvent> = {}): void {
			const event = createEvent("LOGOUT", "User logout", {
				...options,
				userId,
				status: "SUCCESS",
			});
			log(event);
		},

		logTokenRevocation(
			jti: string,
			reason: string,
			userId?: string,
			options: Partial<AuditEvent> = {},
		): void {
			const event = createEvent(
				"TOKEN_REVOCATION",
				`Token revoked: ${reason}`,
				{
					...options,
					userId,
					status: "SUCCESS",
					context: { ...options.context, jti, reason },
					resource: "jwt_token",
				},
			);
			log(event);
		},

		logPasswordChange(userId: string, options: Partial<AuditEvent> = {}): void {
			const event = createEvent("PASSWORD_CHANGE", "Password changed", {
				...options,
				userId,
				status: "SUCCESS",
			});
			log(event);
		},

		logPasswordResetRequest(
			identifier: string,
			options: Partial<AuditEvent> = {},
		): void {
			const event = createEvent(
				"PASSWORD_RESET_REQUEST",
				"Password reset requested",
				{
					...options,
					status: "SUCCESS",
					context: { ...options.context, identifier },
				},
			);
			log(event);
		},

		logPasswordResetComplete(
			userId: string,
			options: Partial<AuditEvent> = {},
		): void {
			const event = createEvent(
				"PASSWORD_RESET_COMPLETE",
				"Password reset completed",
				{
					...options,
					userId,
					status: "SUCCESS",
				},
			);
			log(event);
		},

		logMfaEnable(userId: string, method: string, options: Partial<AuditEvent> = {}): void {
			const event = createEvent("MFA_ENABLE", "MFA enabled", {
				...options,
				userId,
				status: "SUCCESS",
				context: { ...options.context, method },
			});
			log(event);
		},

		logMfaDisable(userId: string, method: string, options: Partial<AuditEvent> = {}): void {
			const event = createEvent("MFA_DISABLE", "MFA disabled", {
				...options,
				userId,
				status: "SUCCESS",
				context: { ...options.context, method },
			});
			log(event);
		},

		logMfaVerifySuccess(
			userId: string,
			method: string,
			options: Partial<AuditEvent> = {},
		): void {
			const event = createEvent("MFA_VERIFY_SUCCESS", "MFA verification successful", {
				...options,
				userId,
				status: "SUCCESS",
				context: { ...options.context, method },
			});
			log(event);
		},

		logMfaVerifyFailure(
			userId: string,
			method: string,
			reason: string,
			options: Partial<AuditEvent> = {},
		): void {
			const event = createEvent(
				"MFA_VERIFY_FAILURE",
				`MFA verification failed: ${reason}`,
				{
					...options,
					userId,
					status: "FAILURE",
					context: { ...options.context, method, reason },
				},
			);
			log(event);
		},

		logRateLimitExceeded(
			key: string,
			limit: number,
			options: Partial<AuditEvent> = {},
		): void {
			const event = createEvent(
				"RATE_LIMIT_EXCEEDED",
				`Rate limit exceeded: ${key}`,
				{
					...options,
					status: "BLOCKED",
					severity: "MEDIUM",
					context: { ...options.context, key, limit },
				},
			);
			log(event);
		},

		logBruteForceDetected(
			ipAddress: string,
			attempts: number,
			windowMs: number,
			options: Partial<AuditEvent> = {},
		): void {
			const event = createEvent(
				"BRUTE_FORCE_DETECTED",
				`Brute force attack detected from ${ipAddress}`,
				{
					...options,
					ipAddress,
					status: "BLOCKED",
					severity: "HIGH",
					context: { ...options.context, attempts, windowMs },
				},
			);
			log(event);
		},

		logSuspiciousActivity(
			description: string,
			options: Partial<AuditEvent> = {},
		): void {
			const event = createEvent("SUSPICIOUS_ACTIVITY", description, {
				...options,
				status: "BLOCKED",
				severity: "HIGH",
			});
			log(event);
		},

		logSessionHijackAttempt(
			userId: string,
			reason: string,
			options: Partial<AuditEvent> = {},
		): void {
			const event = createEvent(
				"SESSION_HIJACK_ATTEMPT",
				`Session hijack attempt: ${reason}`,
				{
					...options,
					userId,
					status: "BLOCKED",
					severity: "CRITICAL",
					context: { ...options.context, reason },
				},
			);
			log(event);
		},

		logCsrfViolation(
			userId: string,
			details: string,
			options: Partial<AuditEvent> = {},
		): void {
			const event = createEvent("CSRF_VIOLATION", `CSRF violation: ${details}`, {
				...options,
				userId,
				status: "BLOCKED",
				severity: "HIGH",
				context: { ...options.context, details },
			});
			log(event);
		},

		logSecurityPolicyViolation(
			policy: string,
			details: string,
			options: Partial<AuditEvent> = {},
		): void {
			const event = createEvent(
				"SECURITY_POLICY_VIOLATION",
				`Security policy violation: ${policy}`,
				{
					...options,
					status: "BLOCKED",
					severity: "HIGH",
					context: { ...options.context, policy, details },
				},
			);
			log(event);
		},

		logDataAccess(
			userId: string,
			resource: string,
			options: Partial<AuditEvent> = {},
		): void {
			const event = createEvent("DATA_ACCESS", "Data accessed", {
				...options,
				userId,
				status: "SUCCESS",
				resource,
			});
			log(event);
		},

		logDataModification(
			userId: string,
			resource: string,
			changes: string,
			options: Partial<AuditEvent> = {},
		): void {
			const event = createEvent("DATA_MODIFICATION", "Data modified", {
				...options,
				userId,
				status: "SUCCESS",
				resource,
				context: { ...options.context, changes },
			});
			log(event);
		},

		logUserAction(
			userId: string,
			action: string,
			description: string,
			options: Partial<AuditEvent> = {},
		): void {
			const event = createEvent("USER_CREATED", description, {
				...options,
				userId,
				status: "SUCCESS",
				action,
			});
			log(event);
		},

		async queryLogs(filter: AuditLogFilter): Promise<AuditLogQueryResult> {
			return storage.query(filter);
		},

		async exportLogs(startDate: Date, endDate: Date): Promise<AuditLogEntry[]> {
			return storage.exportLogs(startDate, endDate);
		},

		async cleanupOldLogs(olderThan?: Date): Promise<number> {
			const cutoff = olderThan ?? new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
			return storage.deleteOlderThan(cutoff);
		},
	};
}

export const auditLogger = createAuditLogger();

export type AuditLogger = ReturnType<typeof createAuditLogger>;
