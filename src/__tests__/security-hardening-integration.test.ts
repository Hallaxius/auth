/**
 * @file Security hardening integration tests
 */

import { describe, expect, test } from "bun:test";
import {
	securityHeaders,
	applySecurityHeaders,
	defaultSecurityHeaders,
	createAuditLogger,
	type AuditLogStorage,
	type AuditEvent,
} from "../index";

class TestAuditStorage implements AuditLogStorage {
	public entries: AuditEvent[] = [];

	async store(entry: AuditEvent): Promise<any> {
		this.entries.push(entry);
		return { ...entry, logId: `log_${Date.now()}` };
	}

	async query() {
		return {
			entries: this.entries,
			total: this.entries.length,
			hasMore: false,
		};
	}

	async getById() {
		return null;
	}

	async deleteOlderThan() {
		return 0;
	}

	async exportLogs() {
		return this.entries;
	}
}

describe("Security Headers Integration", () => {
	test("applies all security headers to response", () => {
		const originalResponse = new Response("<html>Test</html>", {
			status: 200,
			headers: {
				"Content-Type": "text/html",
			},
		});

		const response = applySecurityHeaders(originalResponse, defaultSecurityHeaders);

		expect(response.headers.get("Content-Security-Policy")).toContain("default-src 'self'");
		expect(response.headers.get("Strict-Transport-Security")).toContain("max-age=31536000");
		expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
		expect(response.headers.get("X-Frame-Options")).toBe("DENY");
		expect(response.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
		expect(response.headers.get("Permissions-Policy")).toBeDefined();
		expect(response.headers.get("Cross-Origin-Opener-Policy")).toBe("same-origin");
		expect(response.headers.get("Cross-Origin-Embedder-Policy")).toBe("require-corp");
		expect(response.headers.get("Cross-Origin-Resource-Policy")).toBe("same-origin");
		expect(response.headers.get("Cache-Control")).toContain("no-store");
	});

	test("security headers middleware works in request flow", () => {
		const middleware = securityHeaders(defaultSecurityHeaders);
		const request = new Request("https://example.com/api/test");

		const result = middleware(request);

		expect(result?.headers.get("X-Frame-Options")).toBe("DENY");
		expect(result?.headers.get("X-Content-Type-Options")).toBe("nosniff");
	});

	test("CSP prevents XSS attacks", () => {
		const config = {
			csp: {
				enabled: true,
				defaultSrc: ["'self'"],
				scriptSrc: ["'self'"],
				objectSrc: ["'none'"],
				frameAncestors: ["'none'"],
			},
		};

		const middleware = securityHeaders(config);
		const request = new Request("https://example.com/page");
		const result = middleware(request);

		const csp = result?.headers.get("Content-Security-Policy") ?? "";
		expect(csp).toContain("script-src 'self'");
		expect(csp).toContain("object-src 'none'");
		expect(csp).toContain("frame-ancestors 'none'");
	});

	test("HSTS enforces HTTPS", () => {
		const config = {
			hsts: {
				enabled: true,
				maxAge: 31536000,
				includeSubDomains: true,
				preload: true,
			},
		};

		const middleware = securityHeaders(config);
		const request = new Request("https://example.com/page");
		const result = middleware(request);

		const hsts = result?.headers.get("Strict-Transport-Security") ?? "";
		expect(hsts).toBe("max-age=31536000; includeSubDomains; preload");
	});

	test("frame options prevent clickjacking", () => {
		const config = {
			frameOptions: {
				enabled: true,
				option: "DENY",
			},
		};

		const middleware = securityHeaders(config);
		const request = new Request("https://example.com/page");
		const result = middleware(request);

		expect(result?.headers.get("X-Frame-Options")).toBe("DENY");
	});
});

describe("Audit Logging Integration", () => {
	test("logs authentication events", async () => {
		const storage = new TestAuditStorage();
		const logger = createAuditLogger({
			enabled: true,
			logLevel: "debug",
			storage,
		});

		logger.logAuthSuccess("user123", {
			ipAddress: "192.168.1.100",
			sessionId: "sess_abc123",
		});

		logger.logAuthFailure("user456", "Invalid password", {
			ipAddress: "192.168.1.101",
		});

		expect(storage.entries.length).toBe(2);
		expect(storage.entries[0].type).toBe("AUTH_SUCCESS");
		expect(storage.entries[0].userId).toBe("user123");
		expect(storage.entries[1].type).toBe("AUTH_FAILURE");
		expect(storage.entries[1].status).toBe("FAILURE");
	});

	test("logs security violations", async () => {
		const storage = new TestAuditStorage();
		const logger = createAuditLogger({
			enabled: true,
			logLevel: "warn",
			storage,
		});

		logger.logBruteForceDetected("10.0.0.1", 10, 60000);
		logger.logSessionHijackAttempt("user123", "IP address changed mid-session");
		logger.logCsrfViolation("user456", "Invalid CSRF token in form submission");

		expect(storage.entries.length).toBe(3);

		const bruteForceEvent = storage.entries.find((e) => e.type === "BRUTE_FORCE_DETECTED");
		expect(bruteForceEvent?.severity).toBe("HIGH");
		expect(bruteForceEvent?.status).toBe("BLOCKED");

		const hijackEvent = storage.entries.find((e) => e.type === "SESSION_HIJACK_ATTEMPT");
		expect(hijackEvent?.severity).toBe("CRITICAL");

		const csrfEvent = storage.entries.find((e) => e.type === "CSRF_VIOLATION");
		expect(csrfEvent?.severity).toBe("HIGH");
	});

	test("logs MFA events", async () => {
		const storage = new TestAuditStorage();
		const logger = createAuditLogger({
			enabled: true,
			logLevel: "info",
			storage,
		});

		logger.logMfaEnable("user123", "totp");
		logger.logMfaVerifySuccess("user123", "totp");
		logger.logMfaVerifyFailure("user456", "totp", "Invalid code");

		expect(storage.entries.length).toBe(3);

		const enableEvent = storage.entries.find((e) => e.type === "MFA_ENABLE");
		expect(enableEvent?.category).toBe("mfa");

		const verifySuccessEvent = storage.entries.find((e) => e.type === "MFA_VERIFY_SUCCESS");
		expect(verifySuccessEvent?.status).toBe("SUCCESS");

		const verifyFailureEvent = storage.entries.find((e) => e.type === "MFA_VERIFY_FAILURE");
		expect(verifyFailureEvent?.status).toBe("FAILURE");
	});

	test("logs rate limiting and brute force protection", async () => {
		const storage = new TestAuditStorage();
		const logger = createAuditLogger({
			enabled: true,
			logLevel: "warn",
			storage,
		});

		logger.logRateLimitExceeded("192.168.1.1", 100);
		logger.logBruteForceDetected("10.0.0.5", 15, 300000);

		expect(storage.entries.length).toBe(2);

		const rateLimitEvent = storage.entries.find((e) => e.type === "RATE_LIMIT_EXCEEDED");
		expect(rateLimitEvent?.severity).toBe("MEDIUM");
		expect(rateLimitEvent?.context.key).toBe("192.168.1.1");
		expect(rateLimitEvent?.context.limit).toBe(100);

		const bruteForceEvent = storage.entries.find((e) => e.type === "BRUTE_FORCE_DETECTED");
		expect(bruteForceEvent?.severity).toBe("HIGH");
		expect(bruteForceEvent?.context.attempts).toBe(15);
	});

	test("logs token revocation", async () => {
		const storage = new TestAuditStorage();
		const logger = createAuditLogger({
			enabled: true,
			logLevel: "info",
			storage,
		});

		logger.logTokenRevocation("jti_abc123", "User logout", "user123");
		logger.logTokenRevocation("jti_def456", "Password changed", "user456");

		expect(storage.entries.length).toBe(2);

		const revokeEvent = storage.entries.find((e) => e.type === "TOKEN_REVOCATION");
		expect(revokeEvent?.resource).toBe("jwt_token");
		expect(revokeEvent?.context.jti).toBeDefined();
		expect(revokeEvent?.context.reason).toBeDefined();
	});

	test("logs password reset flow", async () => {
		const storage = new TestAuditStorage();
		const logger = createAuditLogger({
			enabled: true,
			logLevel: "info",
			storage,
		});

		logger.logPasswordResetRequest("user@example.com");
		logger.logPasswordResetComplete("user123");

		expect(storage.entries.length).toBe(2);

		const requestEvent = storage.entries.find((e) => e.type === "PASSWORD_RESET_REQUEST");
		expect(requestEvent?.context.identifier).toBe("user@example.com");

		const completeEvent = storage.entries.find((e) => e.type === "PASSWORD_RESET_COMPLETE");
		expect(completeEvent?.userId).toBe("user123");
	});

	test("audit log query and filtering", async () => {
		const storage = new TestAuditStorage();
		const logger = createAuditLogger({
			enabled: true,
			logLevel: "debug",
			storage,
		});

		logger.logAuthSuccess("user123");
		logger.logAuthFailure("user456", "Invalid password");
		logger.logAuthSuccess("user789");
		logger.logBruteForceDetected("10.0.0.1", 10, 60000);

		const allLogs = await logger.queryLogs({});
		expect(allLogs.total).toBe(4);

		const authSuccessLogs = await logger.queryLogs({ type: "AUTH_SUCCESS" });
		expect(authSuccessLogs.total).toBe(2);

		const failureLogs = await logger.queryLogs({ status: "FAILURE" });
		expect(failureLogs.total).toBe(1);

		const highSeverityLogs = await logger.queryLogs({ severity: "HIGH" });
		expect(highSeverityLogs.total).toBe(1);
	});

	test("sanitizes sensitive data in logs", async () => {
		const storage = new TestAuditStorage();
		const logger = createAuditLogger({
			enabled: true,
			logLevel: "debug",
			includeSensitiveData: false,
			storage,
		});

		logger.logAuthFailure("user@example.com", "Invalid password", {
			context: {
				password: "secret123",
				token: "abc123",
				apiKey: "key_123",
				normalData: "visible",
			},
		});

		const event = storage.entries[0];
		expect(event.context.password).toBe("[REDACTED]");
		expect(event.context.token).toBe("[REDACTED]");
		expect(event.context.apiKey).toBe("[REDACTED]");
		expect(event.context.normalData).toBe("visible");
	});
});

describe("Combined Security Hardening", () => {
	test("security headers + audit logging work together", async () => {
		const storage = new TestAuditStorage();
		const logger = createAuditLogger({
			enabled: true,
			logLevel: "info",
			storage,
		});

		const middleware = securityHeaders(defaultSecurityHeaders);
		const request = new Request("https://example.com/api/login");

		const result = middleware(request);

		logger.logAuthSuccess("user123", {
			ipAddress: "192.168.1.100",
			requestId: "req_abc123",
		});

		expect(result?.headers.get("X-Frame-Options")).toBe("DENY");
		expect(storage.entries.length).toBe(1);
		expect(storage.entries[0].type).toBe("AUTH_SUCCESS");
	});

	test("complete authentication flow with security", async () => {
		const storage = new TestAuditStorage();
		const logger = createAuditLogger({
			enabled: true,
			logLevel: "info",
			storage,
		});

		const middleware = securityHeaders({
			...defaultSecurityHeaders,
			csp: {
				enabled: true,
				defaultSrc: ["'self'"],
				scriptSrc: ["'self'"],
				formAction: ["'self'"],
			},
		});

		const loginRequest = new Request("https://example.com/api/login", {
			method: "POST",
		});

		const headersResult = middleware(loginRequest);
		expect(headersResult?.headers.get("Content-Security-Policy")).toContain("form-action 'self'");

		logger.logAuthSuccess("user123", {
			ipAddress: "192.168.1.100",
			sessionId: "sess_xyz",
		});

		logger.logMfaEnable("user123", "totp");

		expect(storage.entries.length).toBe(2);
		expect(storage.entries[0].type).toBe("AUTH_SUCCESS");
		expect(storage.entries[1].type).toBe("MFA_ENABLE");
	});

	test("security event correlation", async () => {
		const storage = new TestAuditStorage();
		const logger = createAuditLogger({
			enabled: true,
			logLevel: "warn",
			storage,
		});

		const sessionId = "sess_attack123";
		const ipAddress = "10.0.0.99";

		logger.logAuthFailure("user123", "Invalid password", {
			ipAddress,
			sessionId,
		});

		logger.logAuthFailure("user123", "Invalid password", {
			ipAddress,
			sessionId,
		});

		logger.logBruteForceDetected(ipAddress, 5, 60000, {
			sessionId,
			targetUser: "user123",
		});

		logger.logSuspiciousActivity("Multiple failed logins from same IP", {
			ipAddress,
			sessionId,
			pattern: "brute_force",
		});

		const ipLogs = await logger.queryLogs({ ipAddress });
		expect(ipLogs.total).toBe(4);

		const sessionLogs = await logger.queryLogs({ sessionId });
		expect(sessionLogs.total).toBe(4);

		const suspiciousEvents = storage.entries.filter(
			(e) => e.severity === "HIGH" || e.severity === "CRITICAL",
		);
		expect(suspiciousEvents.length).toBe(2);
	});
});

describe("Production Security Configurations", () => {
	test("strict CSP for API endpoints", () => {
		const apiSecurityConfig = {
			csp: {
				enabled: true,
				defaultSrc: ["'self'"],
				scriptSrc: ["'none'"],
				styleSrc: ["'none'"],
				imgSrc: ["'self'", "data:"],
				connectSrc: ["'self'"],
				frameSrc: ["'none'"],
				objectSrc: ["'none'"],
				baseUri: ["'self'"],
				formAction: ["'self'"],
				frameAncestors: ["'none'"],
			},
			hsts: {
				enabled: true,
				maxAge: 63072000,
				includeSubDomains: true,
				preload: true,
			},
			contentTypeOptions: true,
			frameOptions: {
				enabled: true,
				option: "DENY",
			},
			referrerPolicy: "no-referrer",
			cacheControl: {
				enabled: true,
				noStore: true,
				noCache: true,
				private: true,
			},
		};

		const middleware = securityHeaders(apiSecurityConfig);
		const request = new Request("https://api.example.com/v1/users");
		const result = middleware(request);

		const csp = result?.headers.get("Content-Security-Policy") ?? "";
		expect(csp).toContain("script-src 'none'");
		expect(csp).toContain("style-src 'none'");
		expect(csp).toContain("frame-ancestors 'none'");

		expect(result?.headers.get("Strict-Transport-Security")).toContain("max-age=63072000");
		expect(result?.headers.get("X-Frame-Options")).toBe("DENY");
		expect(result?.headers.get("Referrer-Policy")).toBe("no-referrer");
		expect(result?.headers.get("Cache-Control")).toContain("no-store");
	});

	test("balanced CSP for web application", () => {
		const webSecurityConfig = {
			csp: {
				enabled: true,
				defaultSrc: ["'self'"],
				scriptSrc: ["'self'", "'unsafe-inline'"],
				styleSrc: ["'self'", "'unsafe-inline'"],
				imgSrc: ["'self'", "data:", "https:"],
				fontSrc: ["'self'", "https://fonts.gstatic.com"],
				connectSrc: ["'self'", "https://api.example.com"],
				frameSrc: ["'none'"],
				objectSrc: ["'none'"],
				baseUri: ["'self'"],
				formAction: ["'self'"],
				frameAncestors: ["'self'"],
				upgradeInsecureRequests: true,
			},
			hsts: {
				enabled: true,
				maxAge: 31536000,
				includeSubDomains: true,
				preload: true,
			},
			permissionsPolicy: {
				camera: [],
				microphone: [],
				geolocation: ["'self'"],
			},
		};

		const middleware = securityHeaders(webSecurityConfig);
		const request = new Request("https://app.example.com/dashboard");
		const result = middleware(request);

		const csp = result?.headers.get("Content-Security-Policy") ?? "";
		expect(csp).toContain("script-src 'self' 'unsafe-inline'");
		expect(csp).toContain("font-src 'self' https://fonts.gstatic.com");
		expect(csp).toContain("connect-src 'self' https://api.example.com");
		expect(csp).toContain("upgrade-insecure-requests");

		const permissions = result?.headers.get("Permissions-Policy") ?? "";
		expect(permissions).toContain("geolocation=('self')");
	});
});