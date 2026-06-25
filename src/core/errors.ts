/**
 * Discord Auth Error Hierarchy
 * All errors extending DiscordAuthError have:
 * - code: string (unique error identifier)
 * - message: string (descriptive message)
 * - cause?: Error (original error, when applicable)
 */

export class DiscordAuthError extends Error {
	readonly code: string;
	readonly cause?: Error;
	readonly statusCode?: number;

	constructor(
		code: string,
		message: string,
		options?: { cause?: Error; statusCode?: number },
	) {
		super(message);
		this.code = code;
		this.cause = options?.cause;
		this.statusCode = options?.statusCode;
		this.name = this.constructor.name;
		if (typeof Error.captureStackTrace === "function") {
			Error.captureStackTrace(this, this.constructor);
		}
	}
}

/** State CSRF errors */
export class InvalidStateError extends DiscordAuthError {
	constructor(
		message = "Invalid state parameter - possible CSRF attack",
		options?: { cause?: Error },
	) {
		super("INVALID_STATE", message, { statusCode: 403, cause: options?.cause });
	}
}

export class ExpiredStateError extends DiscordAuthError {
	constructor(
		message = "State parameter has expired",
		options?: { cause?: Error },
	) {
		super("EXPIRED_STATE", message, { statusCode: 403, cause: options?.cause });
	}
}

/** OAuth2 authorization errors */
export class InvalidCodeError extends DiscordAuthError {
	constructor(
		message = "Invalid authorization code",
		options?: { cause?: Error },
	) {
		super("INVALID_CODE", message, { statusCode: 400, cause: options?.cause });
	}
}

export class InvalidTokenError extends DiscordAuthError {
	constructor(message = "Invalid token", options?: { cause?: Error }) {
		super("INVALID_TOKEN", message, { statusCode: 401, cause: options?.cause });
	}
}

/** Token errors */
export class TokenExpiredError extends DiscordAuthError {
	constructor(message = "Token has expired", options?: { cause?: Error }) {
		super("TOKEN_EXPIRED", message, { statusCode: 401, cause: options?.cause });
	}
}

export class TokenRevokedError extends DiscordAuthError {
	constructor(message = "Token has been revoked", options?: { cause?: Error }) {
		super("TOKEN_REVOKED", message, { statusCode: 401, cause: options?.cause });
	}
}

/** Rate limiting errors */
export class RateLimitError extends DiscordAuthError {
	readonly retryAfter?: number;

	constructor(
		message = "Rate limit exceeded",
		options?: { retryAfter?: number; cause?: Error },
	) {
		super("RATE_LIMITED", message, {
			statusCode: 429,
			cause:
				options?.cause ??
				(options?.retryAfter
					? new Error(`Retry after ${options.retryAfter} seconds`)
					: undefined),
		});
		this.retryAfter = options?.retryAfter;
	}
}

/** Network errors */
export class NetworkError extends DiscordAuthError {
	readonly url?: string;
	readonly status?: number;

	constructor(
		message: string,
		options?: { url?: string; status?: number; cause?: Error },
	) {
		super("NETWORK_ERROR", message, {
			cause: options?.cause,
			statusCode: options?.status,
		});
		this.url = options?.url;
		this.status = options?.status;
	}
}

/** Scope errors */
export class InvalidScopeError extends DiscordAuthError {
	constructor(
		message = "Invalid scope requested",
		options?: { cause?: Error },
	) {
		super("INVALID_SCOPE", message, { statusCode: 400, cause: options?.cause });
	}
}

/** Storage errors */
export class StorageError extends DiscordAuthError {
	constructor(
		message = "Storage operation failed",
		options?: { cause?: Error },
	) {
		super("STORAGE_ERROR", message, { statusCode: 500, cause: options?.cause });
	}
}

/** Guild errors */
export class GuildJoinError extends DiscordAuthError {
	constructor(message = "Failed to join guild", options?: { cause?: Error }) {
		super("GUILD_JOIN_ERROR", message, {
			statusCode: 400,
			cause: options?.cause,
		});
	}
}

/** PKCE errors */
export class PKCEError extends DiscordAuthError {
	constructor(message = "PKCE operation failed", options?: { cause?: Error }) {
		super("PKCE_ERROR", message, { statusCode: 400, cause: options?.cause });
	}
}

/** Configuration errors */
export class ConfigurationError extends DiscordAuthError {
	constructor(message = "Invalid configuration", options?: { cause?: Error }) {
		super("CONFIGURATION_ERROR", message, {
			statusCode: 500,
			cause: options?.cause,
		});
	}
}

/** MFA errors */
export class MfaRequiredError extends DiscordAuthError {
	constructor(
		message = "Multi-factor authentication is required",
		options?: { cause?: Error },
	) {
		super("MFA_REQUIRED", message, { statusCode: 403, cause: options?.cause });
	}
}

/** Brute force errors */
export class BruteForceBlockedError extends DiscordAuthError {
	readonly retryAfter?: number;

	constructor(
		message = "Too many attempts, please try again later",
		options?: { retryAfter?: number; cause?: Error },
	) {
		super("BRUTE_FORCE_BLOCKED", message, {
			statusCode: 429,
			cause:
				options?.cause ??
				(options?.retryAfter
					? new Error(`Retry after ${options.retryAfter} seconds`)
					: undefined),
		});
		this.retryAfter = options?.retryAfter;
	}
}

/** Guild sync errors */
export class GuildSyncError extends DiscordAuthError {
	constructor(
		message = "Failed to synchronize guild roles",
		options?: { cause?: Error },
	) {
		super("GUILD_SYNC_ERROR", message, {
			statusCode: 500,
			cause: options?.cause,
		});
	}
}

/** CSRF/State errors */
export class StateReusedError extends DiscordAuthError {
	constructor(
		message = "State parameter has already been used",
		options?: { cause?: Error },
	) {
		super("STATE_REUSED", message, { statusCode: 403, cause: options?.cause });
	}
}

export class StateBindingError extends DiscordAuthError {
	constructor(
		message = "State parameter binding validation failed",
		options?: { cause?: Error },
	) {
		super("STATE_BINDING_FAILED", message, {
			statusCode: 403,
			cause: options?.cause,
		});
	}
}

/**
 * Checks if an error is from DiscordAuthError hierarchy
 */
export function isDiscordAuthError(error: unknown): error is DiscordAuthError {
	return error instanceof DiscordAuthError;
}

/**
 * Gets error code if it's a DiscordAuthError
 */
export function getErrorCode(error: unknown): string | undefined {
	return isDiscordAuthError(error) ? error.code : undefined;
}
