/**
 * @file Validation utilities
 *
 * Shared validation functions for configuration, environment, and runtime checks.
 * Centralized validation logic to prevent code duplication.
 *
 * @module utils/validation
 */

import { AuthError, ConfigurationError, ErrorCodes } from "../errors";
import type { DiscordAuthConfig } from "../types";

/**
 * Checks if running in production environment
 * @returns true if NODE_ENV is "production", false otherwise
 * @example
 * if (isProduction()) {
 *   enableSecureCookies();
 * }
 */
export function isProduction(): boolean {
	try {
		const nodeEnv =
			typeof process !== "undefined" ? process.env.NODE_ENV : undefined;
		return nodeEnv === "production";
	} catch {
		return false;
	}
}

/**
 * Validates Discord authentication configuration
 * @param config - Configuration object to validate
 * @throws {AuthError} If required fields are missing or invalid
 * @example
 * validateConfig(config);
 */
export function validateConfig(config: DiscordAuthConfig): void {
	if (!config.clientId) {
		throw new AuthError(
			ErrorCodes.CONFIGURATION_ERROR,
			"Missing required configuration: 'clientId' is required. Get it from https://discord.com/developers/applications",
		);
	}

	if (!config.clientSecret) {
		throw new AuthError(
			ErrorCodes.CONFIGURATION_ERROR,
			"Missing required configuration: 'clientSecret' is required. Get it from https://discord.com/developers/applications",
		);
	}

	if (!config.secret) {
		throw new AuthError(
			ErrorCodes.CONFIGURATION_ERROR,
			"Missing required configuration: 'secret' is required. Generate a strong secret (min 32 chars): crypto.randomUUID() + crypto.randomUUID()",
		);
	}

	if (config.secret && config.secret.length < 32) {
		throw new AuthError(
			ErrorCodes.CONFIGURATION_ERROR,
			"secret must be at least 32 characters long for security",
		);
	}

	if (config.scopes && config.scopes.length === 0) {
		throw new AuthError(
			ErrorCodes.CONFIGURATION_ERROR,
			"scopes array must not be empty if provided",
		);
	}

	if (config.redirectUri && typeof config.redirectUri !== "string") {
		throw new AuthError(
			ErrorCodes.CONFIGURATION_ERROR,
			"redirectUri must be a string",
		);
	}

	if (config.meRoute && typeof config.meRoute !== "string") {
		throw new AuthError(
			ErrorCodes.CONFIGURATION_ERROR,
			"meRoute must be a string",
		);
	}

	if (config.prompt && !["consent", "none"].includes(config.prompt)) {
		throw new AuthError(
			ErrorCodes.CONFIGURATION_ERROR,
			"prompt must be either 'consent' or 'none'",
		);
	}

	if (
		config.session?.type &&
		!["jwt", "server"].includes(config.session.type)
	) {
		throw new AuthError(
			ErrorCodes.CONFIGURATION_ERROR,
			"session.type must be either 'jwt' or 'server'",
		);
	}

	if (
		config.session?.sameSite &&
		!["lax", "strict", "none"].includes(config.session.sameSite)
	) {
		throw new AuthError(
			ErrorCodes.CONFIGURATION_ERROR,
			"session.sameSite must be one of: 'lax', 'strict', 'none'",
		);
	}
}

/**
 * Validates that Redis storage is configured in production
 * @param storage - Storage instance to check
 * @param componentName - Name of component requiring Redis
 * @throws {Error} If production environment without Redis storage
 * @security Memory storage is not secure for production environments
 */
export function requireRedisStorage(
	storage: unknown,
	componentName: string,
): void {
	if (isProduction() && !storage) {
		throw new Error(
			`[SECURITY] ${componentName}: In production (NODE_ENV=production), Redis storage is required. ` +
				`Memory storage is not secure for production environments. ` +
				`Please configure Redis storage or set NODE_ENV=development for local testing.`,
		);
	}
}

/**
 * Validates JWT secret meets minimum security requirements
 * @param secret - Secret string to validate
 * @throws {ConfigurationError} If secret is less than 32 characters
 * @security Secret must be cryptographically secure random string with high entropy
 */
export function validateJwtSecret(secret: string): void {
	if (secret.length < 32) {
		throw new ConfigurationError(
			`JWT secret must be at least 32 characters (256 bits). Got ${secret.length} characters.`,
		);
	}
}

/**
 * Validates cookie value meets security requirements
 * @param value - Cookie value to validate
 * @throws {Error} If value exceeds 4096 bytes or contains invalid characters
 * @security Validates length and character set to prevent header injection
 */
export function validateCookieValue(value: string): void {
	if (value.length > 4096) {
		throw new Error("Cookie value too large: exceeds 4096 bytes");
	}

	if (!/^[a-zA-Z0-9\-_.]+$/.test(value)) {
		throw new Error("Invalid cookie value: contains disallowed characters");
	}
}