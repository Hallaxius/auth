import { DiscordAuthError } from "../errors";

/** Base error for all credentials auth errors */
export class CredentialsAuthError extends DiscordAuthError {
	constructor(
		code: string,
		message: string,
		options?: { cause?: Error; statusCode?: number },
	) {
		super(code, message, options);
	}
}

/** Username is already taken */
export class UsernameTakenError extends CredentialsAuthError {
	constructor(
		message = "Username is already taken",
		options?: { cause?: Error },
	) {
		super("USERNAME_TAKEN", message, { statusCode: 409, cause: options?.cause });
	}
}

/** Email is already taken */
export class EmailTakenError extends CredentialsAuthError {
	constructor(
		message = "Email is already taken",
		options?: { cause?: Error },
	) {
		super("EMAIL_TAKEN", message, { statusCode: 409, cause: options?.cause });
	}
}

/** Invalid credentials (wrong password or user not found) */
export class InvalidCredentialsError extends CredentialsAuthError {
	constructor(
		message = "Invalid credentials",
		options?: { cause?: Error },
	) {
		super("INVALID_CREDENTIALS", message, { statusCode: 401, cause: options?.cause });
	}
}

/** User not found */
export class UserNotFoundError extends CredentialsAuthError {
	constructor(
		message = "User not found",
		options?: { cause?: Error },
	) {
		super("USER_NOT_FOUND", message, { statusCode: 404, cause: options?.cause });
	}
}

/** Validation error (missing required fields based on auth strategy) */
export class CredentialsValidationError extends CredentialsAuthError {
	constructor(
		message = "Validation failed",
		options?: { cause?: Error },
	) {
		super("LOCAL_VALIDATION_ERROR", message, { statusCode: 400, cause: options?.cause });
	}
}
