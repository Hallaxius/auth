import {
	PasswordInvalidFormatError,
	PasswordTooLongError,
	PasswordTooShortError,
} from "../errors";

export interface PasswordValidationOptions {
	minLength?: number;
	maxLength?: number;
	requireLowercase?: boolean;
	requireUppercase?: boolean;
	requireNumber?: boolean;
	requireSpecial?: boolean;
}

export interface PasswordValidationResult {
	valid: boolean;
	errorCode?:
		| "PASSWORD_TOO_SHORT"
		| "PASSWORD_TOO_LONG"
		| "PASSWORD_INVALID_FORMAT";
	message?: string;
}

const DEFAULT_OPTIONS = {
	minLength: 8,
	maxLength: undefined as number | undefined,
	requireLowercase: true,
	requireUppercase: true,
	requireNumber: true,
	requireSpecial: true,
} as const;

export function validatePassword(
	password: string,
	options?: PasswordValidationOptions,
): PasswordValidationResult {
	const minLength = options?.minLength ?? DEFAULT_OPTIONS.minLength;
	const maxLength = options?.maxLength ?? DEFAULT_OPTIONS.maxLength;
	const requireLowercase =
		options?.requireLowercase ?? DEFAULT_OPTIONS.requireLowercase;
	const requireUppercase =
		options?.requireUppercase ?? DEFAULT_OPTIONS.requireUppercase;
	const requireNumber = options?.requireNumber ?? DEFAULT_OPTIONS.requireNumber;
	const requireSpecial =
		options?.requireSpecial ?? DEFAULT_OPTIONS.requireSpecial;

	if (!password || password.length < minLength) {
		return {
			valid: false,
			errorCode: "PASSWORD_TOO_SHORT",
			message: `Password must be at least ${minLength} characters long`,
		};
	}

	if (maxLength !== undefined && password.length > maxLength) {
		return {
			valid: false,
			errorCode: "PASSWORD_TOO_LONG",
			message: `Password must be no more than ${maxLength} characters long`,
		};
	}

	if (requireLowercase && !/[a-z]/.test(password)) {
		return {
			valid: false,
			errorCode: "PASSWORD_INVALID_FORMAT",
			message: "Password must contain at least one lowercase letter",
		};
	}

	if (requireUppercase && !/[A-Z]/.test(password)) {
		return {
			valid: false,
			errorCode: "PASSWORD_INVALID_FORMAT",
			message: "Password must contain at least one uppercase letter",
		};
	}

	if (requireNumber && !/[0-9]/.test(password)) {
		return {
			valid: false,
			errorCode: "PASSWORD_INVALID_FORMAT",
			message: "Password must contain at least one number",
		};
	}

	if (requireSpecial && !/[!@#$%^&*()_+\-=[\]{}|;:,.<>?]/.test(password)) {
		return {
			valid: false,
			errorCode: "PASSWORD_INVALID_FORMAT",
			message: "Password must contain at least one special character",
		};
	}

	return { valid: true };
}

export function validatePasswordOrThrow(
	password: string,
	options?: PasswordValidationOptions,
): void {
	const result = validatePassword(password, options);
	if (!result.valid) {
		if (result.errorCode === "PASSWORD_TOO_SHORT") {
			throw new PasswordTooShortError(result.message);
		} else if (result.errorCode === "PASSWORD_TOO_LONG") {
			throw new PasswordTooLongError(result.message);
		} else if (result.errorCode === "PASSWORD_INVALID_FORMAT") {
			throw new PasswordInvalidFormatError(result.message);
		}
	}
}
