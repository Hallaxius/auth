export class AuthError extends Error {
	readonly code: string;
	readonly cause?: Error;
	readonly statusCode?: number;
	readonly retryAfter?: number;

	constructor(
		code: string,
		message: string,
		options?: { cause?: Error; statusCode?: number; retryAfter?: number },
	) {
		super(message);
		this.code = code;
		this.cause = options?.cause;
		this.statusCode = options?.statusCode;
		this.retryAfter = options?.retryAfter;
		this.name = this.constructor.name;
		if (typeof Error.captureStackTrace === "function") {
			Error.captureStackTrace(this, this.constructor);
		}
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
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export function isAuthError(error: unknown): error is AuthError {
	if (error instanceof AuthError) return true;
	if (error instanceof Error) {
		const code = (error as { code?: unknown }).code;
		return typeof code === "string" && code.length > 0;
	}
	return false;
}

export function getCode(error: unknown): string | undefined {
	if (error instanceof AuthError) return error.code;
	if (error && typeof error === "object" && "code" in error) {
		const code = (error as Record<string, unknown>).code;
		return typeof code === "string" ? code : undefined;
	}
	return undefined;
}
