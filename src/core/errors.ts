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
		Error.captureStackTrace?.(this, this.constructor);
	}
}

/** State CSRF errors */
export class InvalidStateError extends DiscordAuthError {
	constructor(message = "Invalid state parameter - possible CSRF attack") {
		super("INVALID_STATE", message, { statusCode: 403 });
	}
}

export class ExpiredStateError extends DiscordAuthError {
	constructor(message = "State parameter has expired") {
		super("EXPIRED_STATE", message, { statusCode: 403 });
	}
}

/** OAuth2 authorization errors */
export class InvalidCodeError extends DiscordAuthError {
	constructor(message = "Invalid authorization code") {
		super("INVALID_CODE", message, { statusCode: 400 });
	}
}

export class InvalidTokenError extends DiscordAuthError {
	constructor(message = "Invalid token") {
		super("INVALID_TOKEN", message, { statusCode: 401 });
	}
}

/** Token errors */
export class TokenExpiredError extends DiscordAuthError {
	constructor(message = "Token has expired") {
		super("TOKEN_EXPIRED", message, { statusCode: 401 });
	}
}

export class TokenRevokedError extends DiscordAuthError {
	constructor(message = "Token has been revoked") {
		super("TOKEN_REVOKED", message, { statusCode: 401 });
	}
}

/** Rate limiting errors */
export class RateLimitError extends DiscordAuthError {
	readonly retryAfter?: number;

	constructor(message = "Rate limit exceeded", retryAfter?: number) {
		super("RATE_LIMITED", message, {
			statusCode: 429,
			cause: retryAfter
				? new Error(`Retry after ${retryAfter} seconds`)
				: undefined,
		});
		this.retryAfter = retryAfter;
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
	constructor(message = "Invalid scope requested") {
		super("INVALID_SCOPE", message, { statusCode: 400 });
	}
}

/** Storage errors */
export class StorageError extends DiscordAuthError {
	constructor(message = "Storage operation failed") {
		super("STORAGE_ERROR", message, { statusCode: 500 });
	}
}

/** Guild errors */
export class GuildJoinError extends DiscordAuthError {
	constructor(message = "Failed to join guild") {
		super("GUILD_JOIN_ERROR", message, { statusCode: 400 });
	}
}

/** PKCE errors */
export class PKCEError extends DiscordAuthError {
	constructor(message = "PKCE operation failed") {
		super("PKCE_ERROR", message, { statusCode: 400 });
	}
}

/** Configuration errors */
export class ConfigurationError extends DiscordAuthError {
	constructor(message = "Invalid configuration") {
		super("CONFIGURATION_ERROR", message, { statusCode: 500 });
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
