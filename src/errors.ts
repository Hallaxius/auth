export class AuthError extends Error {
	readonly code: ErrorCode;
	readonly cause?: Error;
	readonly statusCode?: number;
	readonly retryable?: boolean;
	readonly retryAfter?: number;

	constructor(
		code: ErrorCode,
		message: string,
		options?: {
			cause?: Error;
			statusCode?: number;
			retryable?: boolean;
			retryAfter?: number;
		},
	) {
		super(message);
		this.code = code;
		this.cause = options?.cause;
		this.statusCode = options?.statusCode;
		this.retryable = options?.retryable ?? false;
		this.retryAfter = options?.retryAfter;
		this.name = this.constructor.name;
		if (typeof Error.captureStackTrace === "function") {
			Error.captureStackTrace(this, this.constructor);
		}
	}

	toJSON() {
		return {
			code: this.code,
			message: this.message,
			name: this.name,
			...(this.cause ? { cause: this.cause.message } : {}),
			...(this.statusCode !== undefined ? { statusCode: this.statusCode } : {}),
			...(this.retryable !== undefined ? { retryable: this.retryable } : {}),
			...(this.retryAfter !== undefined ? { retryAfter: this.retryAfter } : {}),
		};
	}
}

export const ErrorCodes = {
	CONFIGURATION_ERROR: "CONFIGURATION_ERROR",

	INVALID_STATE: "INVALID_STATE",
	EXPIRED_STATE: "EXPIRED_STATE",
	STATE_REUSED: "STATE_REUSED",
	STATE_BINDING_FAILED: "STATE_BINDING_FAILED",

	PKCE_VALIDATION_FAILED: "PKCE_VALIDATION_FAILED",

	INVALID_CODE: "INVALID_CODE",
	INVALID_GRANT: "INVALID_GRANT",
	TOKEN_EXCHANGE_FAILED: "TOKEN_EXCHANGE_FAILED",

	INVALID_TOKEN: "INVALID_TOKEN",
	TOKEN_EXPIRED: "TOKEN_EXPIRED",
	TOKEN_REFRESH_FAILED: "TOKEN_REFRESH_FAILED",
	TOKEN_REVOKED: "TOKEN_REVOKED",

	MFA_REQUIRED: "MFA_REQUIRED",

	RATE_LIMITED: "RATE_LIMITED",

	UPSTREAM_ERROR: "UPSTREAM_ERROR",
	NETWORK_ERROR: "NETWORK_ERROR",

	STORAGE_READ_ERROR: "STORAGE_READ_ERROR",
	STORAGE_WRITE_ERROR: "STORAGE_WRITE_ERROR",
	STORAGE_UNAVAILABLE: "STORAGE_UNAVAILABLE",

	USERNAME_TAKEN: "USERNAME_TAKEN",
	EMAIL_TAKEN: "EMAIL_TAKEN",
	INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
	USER_NOT_FOUND: "USER_NOT_FOUND",
	CREDENTIALS_VALIDATION_ERROR: "CREDENTIALS_VALIDATION_ERROR",

	GUILD_JOIN_ERROR: "GUILD_JOIN_ERROR",
	GUILD_SYNC_ERROR: "GUILD_SYNC_ERROR",

	BRUTE_FORCE_BLOCKED: "BRUTE_FORCE_BLOCKED",

	RESET_TOKEN_INVALID: "RESET_TOKEN_INVALID",
	RESET_TOKEN_EXPIRED: "RESET_TOKEN_EXPIRED",
	RESET_TOKEN_USED: "RESET_TOKEN_USED",
	RESET_TOKEN_CONSUMED: "RESET_TOKEN_CONSUMED",
	RESET_PASSWORD_WEAK: "RESET_PASSWORD_WEAK",

	MFA_SETUP_REQUIRED: "MFA_SETUP_REQUIRED",
	MFA_INVALID_CODE: "MFA_INVALID_CODE",
	MFA_INVALID_BACKUP: "MFA_INVALID_BACKUP",
	MFA_BACKUP_EXHAUSTED: "MFA_BACKUP_EXHAUSTED",
	MFA_NOT_SETUP: "MFA_NOT_SETUP",
	MFA_ALREADY_SETUP: "MFA_ALREADY_SETUP",
	MFA_CHALLENGE_FAILED: "MFA_CHALLENGE_FAILED",

	RATE_LIMITED_ROUTE: "RATE_LIMITED_ROUTE",

	INVALID_CODE_VERIFIER: "INVALID_CODE_VERIFIER",
	INTERACTION_REQUIRED: "INTERACTION_REQUIRED",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export function isAuthError(error: unknown): error is AuthError {
	if (error instanceof AuthError) return true;
	if (error instanceof Error) {
		const code = (error as { code?: unknown }).code;
		if (typeof code === "string" && code.length > 0) {
			return Object.values(ErrorCodes).includes(code as ErrorCode);
		}
	}
	return false;
}

const ERROR_CODE_VALUES = Object.values(ErrorCodes) as readonly ErrorCode[];

function isErrorCode(code: string): code is ErrorCode {
	return ERROR_CODE_VALUES.includes(code as ErrorCode);
}

export function getCode(error: unknown): ErrorCode | undefined {
	if (error instanceof AuthError) return error.code;
	if (error && typeof error === "object" && "code" in error) {
		const code = (error as Record<string, unknown>).code;
		if (typeof code === "string" && isErrorCode(code)) {
			return code as ErrorCode;
		}
	}
	return undefined;
}

export class ConfigurationError extends AuthError {
	constructor(message = "Invalid configuration", options?: { cause?: Error }) {
		super(ErrorCodes.CONFIGURATION_ERROR, message, {
			statusCode: 500,
			cause: options?.cause,
		});
	}
}

export class InvalidStateError extends AuthError {
	constructor(
		message = "Invalid state parameter - possible CSRF attack",
		options?: { cause?: Error },
	) {
		super(ErrorCodes.INVALID_STATE, message, {
			statusCode: 403,
			cause: options?.cause,
		});
	}
}

export class ExpiredStateError extends AuthError {
	constructor(
		message = "State parameter has expired",
		options?: { cause?: Error },
	) {
		super(ErrorCodes.EXPIRED_STATE, message, {
			statusCode: 403,
			cause: options?.cause,
		});
	}
}

export class StateReusedError extends AuthError {
	constructor(
		message = "State parameter has already been used",
		options?: { cause?: Error },
	) {
		super(ErrorCodes.STATE_REUSED, message, {
			statusCode: 403,
			cause: options?.cause,
		});
	}
}

export class StateBindingError extends AuthError {
	constructor(
		message = "State parameter binding validation failed",
		options?: { cause?: Error },
	) {
		super(ErrorCodes.STATE_BINDING_FAILED, message, {
			statusCode: 403,
			cause: options?.cause,
		});
	}
}

export class PKCEValidationError extends AuthError {
	constructor(message = "PKCE validation failed", options?: { cause?: Error }) {
		super(ErrorCodes.PKCE_VALIDATION_FAILED, message, {
			statusCode: 400,
			cause: options?.cause,
		});
	}
}

export class InvalidCodeError extends AuthError {
	constructor(
		message = "Invalid authorization code",
		options?: { cause?: Error },
	) {
		super(ErrorCodes.INVALID_CODE, message, {
			statusCode: 400,
			cause: options?.cause,
		});
	}
}

export class InvalidGrantError extends AuthError {
	constructor(message = "Invalid grant", options?: { cause?: Error }) {
		super(ErrorCodes.INVALID_GRANT, message, {
			statusCode: 400,
			cause: options?.cause,
		});
	}
}

export class TokenExchangeError extends AuthError {
	constructor(message = "Token exchange failed", options?: { cause?: Error }) {
		super(ErrorCodes.TOKEN_EXCHANGE_FAILED, message, {
			statusCode: 500,
			cause: options?.cause,
		});
	}
}

export class InvalidTokenError extends AuthError {
	constructor(message = "Invalid token", options?: { cause?: Error }) {
		super(ErrorCodes.INVALID_TOKEN, message, {
			statusCode: 401,
			cause: options?.cause,
		});
	}
}

export class TokenExpiredError extends AuthError {
	constructor(message = "Token has expired", options?: { cause?: Error }) {
		super(ErrorCodes.TOKEN_EXPIRED, message, {
			statusCode: 401,
			retryable: true,
			cause: options?.cause,
		});
	}
}

export class TokenRefreshError extends AuthError {
	constructor(message = "Token refresh failed", options?: { cause?: Error }) {
		super(ErrorCodes.TOKEN_REFRESH_FAILED, message, {
			statusCode: 500,
			retryable: true,
			cause: options?.cause,
		});
	}
}

export class TokenRevokedError extends AuthError {
	constructor(message = "Token has been revoked", options?: { cause?: Error }) {
		super(ErrorCodes.TOKEN_REVOKED, message, {
			statusCode: 401,
			retryable: true,
			cause: options?.cause,
		});
	}
}

export class MfaRequiredError extends AuthError {
	constructor(
		message = "Multi-factor authentication is required",
		options?: { cause?: Error },
	) {
		super(ErrorCodes.MFA_REQUIRED, message, {
			statusCode: 403,
			cause: options?.cause,
		});
	}
}

export class RateLimitError extends AuthError {
	readonly retryAfter?: number;

	constructor(
		message = "Rate limit exceeded",
		options?: { retryAfter?: number; cause?: Error },
	) {
		super(ErrorCodes.RATE_LIMITED, message, {
			statusCode: 429,
			retryable: true,
			retryAfter: options?.retryAfter,
			cause: options?.cause,
		});
		this.retryAfter = options?.retryAfter;
	}
}

export class UpstreamError extends AuthError {
	constructor(message = "Upstream service error", options?: { cause?: Error }) {
		super(ErrorCodes.UPSTREAM_ERROR, message, {
			statusCode: 502,
			retryable: true,
			cause: options?.cause,
		});
	}
}

export class NetworkError extends AuthError {
	constructor(message = "Network error", options?: { cause?: Error }) {
		super(ErrorCodes.NETWORK_ERROR, message, {
			statusCode: 503,
			retryable: true,
			cause: options?.cause,
		});
	}
}

export class StorageReadError extends AuthError {
	constructor(message = "Storage read error", options?: { cause?: Error }) {
		super(ErrorCodes.STORAGE_READ_ERROR, message, {
			statusCode: 500,
			cause: options?.cause,
		});
	}
}

export class StorageWriteError extends AuthError {
	constructor(message = "Storage write error", options?: { cause?: Error }) {
		super(ErrorCodes.STORAGE_WRITE_ERROR, message, {
			statusCode: 500,
			cause: options?.cause,
		});
	}
}

export class StorageUnavailableError extends AuthError {
	constructor(message = "Storage unavailable", options?: { cause?: Error }) {
		super(ErrorCodes.STORAGE_UNAVAILABLE, message, {
			statusCode: 503,
			retryable: true,
			cause: options?.cause,
		});
	}
}

export class UsernameTakenError extends AuthError {
	constructor(
		message = "Username is already taken",
		options?: { cause?: Error },
	) {
		super(ErrorCodes.USERNAME_TAKEN, message, {
			statusCode: 409,
			cause: options?.cause,
		});
	}
}

export class EmailTakenError extends AuthError {
	constructor(message = "Email is already taken", options?: { cause?: Error }) {
		super(ErrorCodes.EMAIL_TAKEN, message, {
			statusCode: 409,
			cause: options?.cause,
		});
	}
}

export class InvalidCredentialsError extends AuthError {
	constructor(message = "Invalid credentials", options?: { cause?: Error }) {
		super(ErrorCodes.INVALID_CREDENTIALS, message, {
			statusCode: 401,
			cause: options?.cause,
		});
	}
}

export class UserNotFoundError extends AuthError {
	constructor(message = "User not found", options?: { cause?: Error }) {
		super(ErrorCodes.USER_NOT_FOUND, message, {
			statusCode: 404,
			cause: options?.cause,
		});
	}
}

export class CredentialsValidationError extends AuthError {
	constructor(message = "Validation failed", options?: { cause?: Error }) {
		super(ErrorCodes.CREDENTIALS_VALIDATION_ERROR, message, {
			statusCode: 400,
			cause: options?.cause,
		});
	}
}

export class GuildJoinError extends AuthError {
	constructor(
		message = "Failed to add user to guild",
		options?: { cause?: Error },
	) {
		super(ErrorCodes.GUILD_JOIN_ERROR, message, {
			statusCode: 500,
			cause: options?.cause,
		});
	}
}

export class GuildSyncError extends AuthError {
	constructor(
		message = "Failed to sync guild roles",
		options?: { cause?: Error },
	) {
		super(ErrorCodes.GUILD_SYNC_ERROR, message, {
			statusCode: 500,
			cause: options?.cause,
		});
	}
}

export class BruteForceBlockedError extends AuthError {
	readonly retryAfter?: number;

	constructor(
		message = "Too many attempts, please try again later",
		options?: { retryAfter?: number; cause?: Error },
	) {
		super(ErrorCodes.BRUTE_FORCE_BLOCKED, message, {
			statusCode: 429,
			retryable: true,
			retryAfter: options?.retryAfter,
			cause: options?.cause,
		});
		this.retryAfter = options?.retryAfter;
	}
}

export class InvalidCodeVerifierError extends AuthError {
	constructor(message = "Invalid code verifier", options?: { cause?: Error }) {
		super(ErrorCodes.INVALID_CODE_VERIFIER, message, {
			statusCode: 400,
			cause: options?.cause,
		});
	}
}

export class InteractionRequiredError extends AuthError {
	constructor(message = "Interaction required", options?: { cause?: Error }) {
		super(ErrorCodes.INTERACTION_REQUIRED, message, {
			statusCode: 401,
			cause: options?.cause,
		});
	}
}
