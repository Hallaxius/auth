import { validateSecretEntropy } from "../config/schema";
import { AuthError, ErrorCodes } from "../errors";
import type { DiscordAuthConfig } from "../types";

export { validateSecretEntropy };

export function isProduction(): boolean {
	try {
		const nodeEnv =
			typeof process !== "undefined" ? process.env.NODE_ENV : undefined;
		return nodeEnv === "production";
	} catch {
		return false;
	}
}

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

export function validateJwtSecret(secret: string): void {
	validateSecretEntropy(secret);
}

export function validateCookieValue(value: string): void {
	if (value.length === 0) {
		return;
	}

	if (value.length > 4096) {
		throw new Error("Cookie value too large: exceeds 4096 bytes");
	}

	if (!/^[a-zA-Z0-9\-_.]+$/.test(value)) {
		throw new Error("Invalid cookie value: contains disallowed characters");
	}
}
