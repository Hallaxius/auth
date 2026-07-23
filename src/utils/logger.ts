/**
 * @file Security logging utilities
 *
 * Structured logging for security events with production-safe defaults.
 * Removes sensitive data and prevents information leakage.
 *
 * @module utils/logger
 */

import type { SecurityLogger } from "../types";

export interface LogEntry {
	timestamp: string;
	level: "debug" | "info" | "warn" | "error";
	event: string;
	message: string;
	context?: Record<string, unknown>;
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
];

function sanitizeContext(
	context: Record<string, unknown>,
): Record<string, unknown> {
	const sanitized: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(context)) {
		const lowerKey = key.toLowerCase();
		if (SENSITIVE_FIELDS.some((field) => lowerKey.includes(field))) {
			sanitized[key] = "[REDACTED]";
		} else if (typeof value === "object" && value !== null) {
			sanitized[key] = sanitizeContext(value as Record<string, unknown>);
		} else {
			sanitized[key] = value;
		}
	}

	return sanitized;
}

function isProduction(): boolean {
	try {
		return (
			typeof process !== "undefined" && process.env.NODE_ENV === "production"
		);
	} catch {
		return false;
	}
}

function formatLogEntry(entry: LogEntry): string {
	const sanitizedContext = entry.context
		? sanitizeContext(entry.context)
		: undefined;

	if (isProduction()) {
		return JSON.stringify({
			...entry,
			timestamp: new Date().toISOString(),
			context: sanitizedContext,
		});
	}

	const contextStr = sanitizedContext
		? ` ${JSON.stringify(sanitizedContext, null, 2)}`
		: "";
	return `[${entry.level.toUpperCase()}] ${entry.timestamp} - ${entry.event}: ${entry.message}${contextStr}`;
}

export function createSecurityLogger(service: string = "auth"): SecurityLogger {
	function log(
		level: "debug" | "info" | "warn" | "error",
		message: string,
		context?: Record<string, unknown>,
	): void {
		const entry: LogEntry = {
			timestamp: new Date().toISOString(),
			level,
			event: `security:${service}`,
			message,
			context,
		};

		const formatted = formatLogEntry(entry);

		if (isProduction()) {
			switch (level) {
				case "debug":
					console.debug(formatted);
					break;
				case "info":
					console.info(formatted);
					break;
				case "warn":
					console.warn(formatted);
					break;
				case "error":
					console.error(formatted);
					break;
			}
		} else {
			console.log(formatted);
		}
	}

	return {
		debug(message, context) {
			if (!isProduction()) {
				log("debug", message, context);
			}
		},
		info(message, context) {
			log("info", message, context);
		},
		warn(message, context) {
			log("warn", message, context);
		},
		error(message, context) {
			log("error", message, context);
		},
	};
}

export const securityLogger = createSecurityLogger("auth");

export function logAuthFailure(
	identifier: string,
	reason: string,
	ip?: string,
): void {
	securityLogger.warn("Authentication failure", {
		identifier,
		reason,
		ip: ip ?? "unknown",
		timestamp: Date.now(),
	});
}

export function logRateLimitExceeded(
	key: string,
	limit: number,
	ip?: string,
): void {
	securityLogger.warn("Rate limit exceeded", {
		key,
		limit,
		ip: ip ?? "unknown",
		timestamp: Date.now(),
	});
}

export function logTokenRevocation(
	jti: string,
	reason: string,
	userId?: string,
): void {
	securityLogger.info("Token revoked", {
		jti,
		reason,
		userId: userId ?? "unknown",
		timestamp: Date.now(),
	});
}
