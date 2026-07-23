/**
 * @example Security Hardening - Security Headers and Audit Logging
 * 
 * This file demonstrates how to use the security headers middleware
 * and audit logging system for production applications.
 */

import {
	securityHeaders,
	applySecurityHeaders,
	defaultSecurityHeaders,
	createAuditLogger,
	type AuditLogStorage,
} from "./index";

// ============================================================================
// Example 1: Basic Security Headers
// ============================================================================

function basicSecurityHeadersExample() {
	// Create middleware with default secure configuration
	const middleware = securityHeaders(defaultSecurityHeaders);

	// Use in your request handler
	const request = new Request("https://example.com/api/data");
	const result = middleware(request);

	// All security headers are automatically applied
	console.log("CSP:", result?.headers.get("Content-Security-Policy"));
	console.log("HSTS:", result?.headers.get("Strict-Transport-Security"));
	console.log("X-Frame-Options:", result?.headers.get("X-Frame-Options"));
}

// ============================================================================
// Example 2: Custom CSP Configuration
// ============================================================================

function customCspExample() {
	const strictCsp = {
		csp: {
			enabled: true,
			defaultSrc: ["'self'"],
			scriptSrc: ["'self'", "https://cdn.example.com"],
			styleSrc: ["'self'", "'unsafe-inline'"],
			imgSrc: ["'self'", "data:", "https:"],
			fontSrc: ["'self'", "https://fonts.gstatic.com"],
			connectSrc: ["'self'", "https://api.example.com"],
			frameSrc: ["'none'"],
			objectSrc: ["'none'"],
			baseUri: ["'self'"],
			formAction: ["'self'"],
			frameAncestors: ["'none'"],
			upgradeInsecureRequests: true,
			blockAllMixedContent: true,
			reportUri: "https://report.example.com/csp",
		},
		hsts: {
			enabled: true,
			maxAge: 31536000,
			includeSubDomains: true,
			preload: true,
		},
	};

	const middleware = securityHeaders(strictCsp);
	const request = new Request("https://example.com/page");
	const result = middleware(request);

	// CSP header will include all specified directives
	console.log("Custom CSP:", result?.headers.get("Content-Security-Policy"));
}

// ============================================================================
// Example 3: API Security Configuration
// ============================================================================

function apiSecurityExample() {
	const apiConfig = {
		csp: {
			enabled: true,
			defaultSrc: ["'self'"],
			scriptSrc: ["'none'"],
			styleSrc: ["'none'"],
			imgSrc: ["'self'", "data:"],
			connectSrc: ["'self'"],
			frameSrc: ["'none'"],
			objectSrc: ["'none'"],
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
		permissionsPolicy: {
			camera: [],
			microphone: [],
			geolocation: [],
		},
		cacheControl: {
			enabled: true,
			noStore: true,
			noCache: true,
			private: true,
		},
	};

	const middleware = securityHeaders(apiConfig);
	const request = new Request("https://api.example.com/v1/users");
	const result = middleware(request);

	// Maximum security for API endpoints
	console.log("API CSP:", result?.headers.get("Content-Security-Policy"));
	console.log("API Cache:", result?.headers.get("Cache-Control"));
}

// ============================================================================
// Example 4: Applying Headers to Existing Response
// ============================================================================

async function applyHeadersToResponseExample() {
	const originalResponse = new Response(JSON.stringify({ data: "test" }), {
		status: 200,
		headers: {
			"Content-Type": "application/json",
		},
	});

	// Apply security headers to existing response
	const securedResponse = applySecurityHeaders(
		originalResponse,
		defaultSecurityHeaders,
	);

	// Original response is preserved, security headers are added
	console.log("Status:", securedResponse.status);
	console.log("Content-Type:", securedResponse.headers.get("Content-Type"));
	console.log("CSP:", securedResponse.headers.get("Content-Security-Policy"));
}

// ============================================================================
// Example 5: Basic Audit Logging
// ============================================================================

function basicAuditLoggingExample() {
	// Create audit logger with default configuration
	const logger = createAuditLogger({
		service: "my-app",
		enabled: true,
		logLevel: "info",
	});

	// Log authentication events
	logger.logAuthSuccess("user123", {
		ipAddress: "192.168.1.100",
		sessionId: "sess_abc123",
	});

	logger.logAuthFailure("user456", "Invalid password", {
		ipAddress: "192.168.1.101",
	});

	// Log MFA events
	logger.logMfaEnable("user123", "totp");
	logger.logMfaVerifySuccess("user123", "totp");

	// Log security violations
	logger.logRateLimitExceeded("192.168.1.200", 100);
	logger.logBruteForceDetected("10.0.0.1", 10, 60000);
}

// ============================================================================
// Example 6: Custom Audit Log Storage
// ============================================================================

class DatabaseAuditStorage implements AuditLogStorage {
	async store(entry: any): Promise<any> {
		// Store in your database
		console.log("Storing audit log:", entry.type, entry.description);
		// await db.auditLogs.create({...entry})
		return { ...entry, logId: `log_${Date.now()}` };
	}

	async query(filter: any) {
		// Query from your database
		console.log("Querying audit logs:", filter);
		// const entries = await db.auditLogs.findMany({...filter})
		return {
			entries: [],
			total: 0,
			hasMore: false,
		};
	}

	async getById(logId: string) {
		// Get single entry
		console.log("Getting audit log:", logId);
		return null;
	}

	async deleteOlderThan(olderThan: Date): Promise<number> {
		// Cleanup old logs
		console.log("Deleting logs older than:", olderThan);
		return 0;
	}

	async exportLogs(startDate: Date, endDate: Date) {
		// Export for compliance
		console.log("Exporting logs:", startDate, "to", endDate);
		return [];
	}
}

function customStorageExample() {
	const customStorage = new DatabaseAuditStorage();

	const logger = createAuditLogger({
		service: "production-app",
		enabled: true,
		logLevel: "info",
		storage: customStorage,
		retentionDays: 365,
	});

	logger.logAuthSuccess("user789", {
		ipAddress: "203.0.113.1",
		sessionId: "sess_xyz789",
	});
}

// ============================================================================
// Example 7: Security Event Correlation
// ============================================================================

async function securityEventCorrelationExample() {
	const logger = createAuditLogger({
		service: "security-monitor",
		enabled: true,
		logLevel: "warn",
	});

	const suspiciousIp = "10.0.0.99";
	const sessionId = "sess_attack123";

	// Multiple failed login attempts
	logger.logAuthFailure("admin@example.com", "Invalid password", {
		ipAddress: suspiciousIp,
		sessionId,
	});

	logger.logAuthFailure("admin@example.com", "Invalid password", {
		ipAddress: suspiciousIp,
		sessionId,
	});

	logger.logAuthFailure("admin@example.com", "Invalid password", {
		ipAddress: suspiciousIp,
		sessionId,
	});

	// Detect brute force
	logger.logBruteForceDetected(suspiciousIp, 5, 60000, {
		sessionId,
		targetUser: "admin@example.com",
		pattern: "credential_stuffing",
	});

	// Log suspicious activity
	logger.logSuspiciousActivity("Multiple failed logins from same IP", {
		ipAddress: suspiciousIp,
		sessionId,
		pattern: "brute_force",
		attempts: 5,
	});

	// Query related events
	const ipLogs = await logger.queryLogs({ ipAddress: suspiciousIp });
	console.log("Events from suspicious IP:", ipLogs.total);

	const sessionLogs = await logger.queryLogs({ sessionId });
	console.log("Events in session:", sessionLogs.total);
}

// ============================================================================
// Example 8: Complete Authentication Flow with Security
// ============================================================================

async function completeAuthFlowExample() {
	// Setup security headers middleware
	const securityMiddleware = securityHeaders({
		...defaultSecurityHeaders,
		csp: {
			enabled: true,
			defaultSrc: ["'self'"],
			scriptSrc: ["'self'"],
			formAction: ["'self'"],
			frameAncestors: ["'none'"],
		},
	});

	// Setup audit logger
	const auditLogger = createAuditLogger({
		service: "auth-service",
		enabled: true,
		logLevel: "info",
		retentionDays: 90,
	});

	// Simulate login request
	const loginRequest = new Request("https://example.com/api/login", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
	});

	// Apply security headers
	const securityResult = securityMiddleware(loginRequest);

	// Simulate successful authentication
	const userId = "user123";
	const ipAddress = "192.168.1.100";
	const sessionId = `sess_${Date.now()}`;

	auditLogger.logAuthSuccess(userId, {
		ipAddress,
		sessionId,
		requestId: "req_abc123",
	});

	// Check if MFA is enabled
	const mfaEnabled = true;
	if (mfaEnabled) {
		auditLogger.logMfaVerifySuccess(userId, "totp", {
			sessionId,
		});
	}

	// Log data access
	auditLogger.logDataAccess(userId, "user_profile", {
		sessionId,
	});

	console.log("Authentication flow completed with full audit trail");
}

// ============================================================================
// Example 9: Password Reset Flow with Audit Logging
// ============================================================================

async function passwordResetFlowExample() {
	const logger = createAuditLogger({
		service: "password-reset",
		enabled: true,
		logLevel: "info",
	});

	// User requests password reset
	const email = "user@example.com";
	logger.logPasswordResetRequest(email, {
		ipAddress: "192.168.1.50",
	});

	// User completes password reset
	const userId = "user123";
	logger.logPasswordResetComplete(userId, {
		ipAddress: "192.168.1.50",
	});

	// Log password change
	logger.logPasswordChange(userId, {
		ipAddress: "192.168.1.50",
	});

	// Revoke all existing tokens for security
	logger.logTokenRevocation("jti_old_token_1", "Password changed", userId);
	logger.logTokenRevocation("jti_old_token_2", "Password changed", userId);

	console.log("Password reset flow logged");
}

// ============================================================================
// Example 10: Production Monitoring Dashboard
// ============================================================================

async function productionMonitoringExample() {
	const logger = createAuditLogger({
		service: "production-monitor",
		enabled: true,
		logLevel: "info",
	});

	// Simulate various security events
	logger.logAuthSuccess("user1", { ipAddress: "192.168.1.1" });
	logger.logAuthFailure("user2", "Invalid password", { ipAddress: "10.0.0.1" });
	logger.logBruteForceDetected("10.0.0.1", 10, 60000);
	logger.logRateLimitExceeded("192.168.1.100", 100);
	logger.logMfaEnable("user3", "totp");
	logger.logSessionHijackAttempt("user4", "IP address mismatch");

	// Query for monitoring dashboard
	const allLogs = await logger.queryLogs({ limit: 100 });
	const authFailures = await logger.queryLogs({
		type: "AUTH_FAILURE",
		limit: 50,
	});
	const securityEvents = await logger.queryLogs({
		severity: "HIGH",
		limit: 50,
	});
	const blockedEvents = await logger.queryLogs({
		status: "BLOCKED",
		limit: 50,
	});

	console.log("Total events:", allLogs.total);
	console.log("Auth failures:", authFailures.total);
	console.log("High severity events:", securityEvents.total);
	console.log("Blocked events:", blockedEvents.total);

	// Export logs for compliance (last 30 days)
	const now = new Date();
	const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
	const exportedLogs = await logger.exportLogs(thirtyDaysAgo, now);

	console.log("Exported logs for compliance:", exportedLogs.length);
}

// ============================================================================
// Example 11: Rate Limiting Integration
// ============================================================================

async function rateLimitingIntegrationExample() {
	const logger = createAuditLogger({
		service: "rate-limiter",
		enabled: true,
		logLevel: "warn",
	});

	// Simulate rate limit checks
	const ip = "192.168.1.100";
	const requestCount = 150;
	const limit = 100;

	if (requestCount > limit) {
		logger.logRateLimitExceeded(ip, limit, {
			requestCount,
			windowMs: 60000,
			endpoint: "/api/data",
		});

		logger.logSuspiciousActivity("Potential DDoS attack", {
			ipAddress: ip,
			requestCount,
			pattern: "rate_limit_abuse",
		});
	}

	console.log("Rate limiting events logged");
}

// ============================================================================
// Example 12: Token Revocation on Security Events
// ============================================================================

async function tokenRevocationExample() {
	const logger = createAuditLogger({
		service: "token-manager",
		enabled: true,
		logLevel: "info",
	});

	const userId = "user123";
	const jti = "jti_token_abc123";

	// User logs out
	logger.logTokenRevocation(jti, "User logout", userId, {
		sessionId: "sess_xyz",
	});

	// Password changed - revoke all tokens
	logger.logTokenRevocation("jti_token_1", "Password changed", userId);
	logger.logTokenRevocation("jti_token_2", "Password changed", userId);
	logger.logTokenRevocation("jti_token_3", "Password changed", userId);

	// Suspicious activity detected
	logger.logSessionHijackAttempt(userId, "Geographic impossibility", {
		jti: "jti_token_4",
		previousIp: "192.168.1.1",
		currentIp: "203.0.113.50",
	});

	logger.logTokenRevocation("jti_token_4", "Security violation", userId);

	console.log("Token revocation events logged");
}

// Run examples
console.log("=== Security Headers and Audit Logging Examples ===\n");

console.log("1. Basic Security Headers:");
basicSecurityHeadersExample();

console.log("\n2. Custom CSP Configuration:");
customCspExample();

console.log("\n3. API Security Configuration:");
apiSecurityExample();

console.log("\n4. Basic Audit Logging:");
basicAuditLoggingExample();

console.log("\n5. Security Event Correlation:");
securityEventCorrelationExample();

console.log("\n6. Complete Auth Flow:");
completeAuthFlowExample();

console.log("\n7. Password Reset Flow:");
passwordResetFlowExample();

console.log("\n8. Production Monitoring:");
productionMonitoringExample();

console.log("\n9. Token Revocation:");
tokenRevocationExample();

console.log("\n=== Examples Complete ===");
