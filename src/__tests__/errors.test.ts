import { describe, expect, test } from "vitest";
import {
	AuthError,
	BruteForceBlockedError,
	ConfigurationError,
	CredentialsValidationError,
	EmailTakenError,
	ErrorCodes,
	ExpiredStateError,
	GuildJoinError,
	GuildSyncError,
	getCode,
	InvalidCodeError,
	InvalidCredentialsError,
	InvalidGrantError,
	InvalidStateError,
	InvalidTokenError,
	isAuthError,
	MfaRequiredError,
	NetworkError,
	PKCEValidationError,
	RateLimitError,
	StateBindingError,
	StateReusedError,
	StorageReadError,
	StorageUnavailableError,
	StorageWriteError,
	TokenExchangeError,
	TokenExpiredError,
	TokenRefreshError,
	TokenRevokedError,
	UpstreamError,
	UserNotFoundError,
	UsernameTakenError,
} from "../errors";

describe("AuthError", () => {
	test("creates error with all fields", () => {
		const cause = new Error("root cause");
		const error = new AuthError("TEST_CODE", "test message", {
			statusCode: 400,
			retryable: true,
			retryAfter: 30,
			cause,
		});
		expect(error.code).toBe("TEST_CODE");
		expect(error.message).toBe("test message");
		expect(error.statusCode).toBe(400);
		expect(error.retryable).toBe(true);
		expect(error.retryAfter).toBe(30);
		expect(error.cause).toBe(cause);
		expect(error.name).toBe("AuthError");
	});

	test("defaults retryable to false", () => {
		const error = new AuthError("CODE", "msg");
		expect(error.retryable).toBe(false);
	});

	test("serializes to JSON", () => {
		const error = new AuthError("CODE", "msg", { statusCode: 500 });
		const json = JSON.stringify(error);
		expect(json).toContain("CODE");
		expect(json).toContain("msg");
	});
});

describe("ErrorCodes", () => {
	test("all error codes are strings", () => {
		for (const code of Object.values(ErrorCodes)) {
			expect(typeof code).toBe("string");
		}
	});

	test("no duplicate values", () => {
		const values = Object.values(ErrorCodes);
		const unique = new Set(values);
		expect(unique.size).toBe(values.length);
	});
});

describe("isAuthError", () => {
	test("returns true for AuthError instances", () => {
		const error = new AuthError("CODE", "msg");
		expect(isAuthError(error)).toBe(true);
	});

	test("returns false for regular Error", () => {
		expect(isAuthError(new Error("msg"))).toBe(false);
	});

	test("returns false for non-error values", () => {
		expect(isAuthError(null)).toBe(false);
		expect(isAuthError(undefined)).toBe(false);
		expect(isAuthError("string")).toBe(false);
		expect(isAuthError(42)).toBe(false);
	});

	test("returns true for object with valid error code", () => {
		const error = new Error("msg") as Error & { code: string };
		error.code = ErrorCodes.RATE_LIMITED;
		expect(isAuthError(error)).toBe(true);
	});

	test("returns false for object with empty code", () => {
		const error = new Error("msg") as Error & { code: string };
		error.code = "";
		expect(isAuthError(error)).toBe(false);
	});
});

describe("getCode", () => {
	test("returns code from AuthError", () => {
		const error = new AuthError(ErrorCodes.RATE_LIMITED, "msg");
		expect(getCode(error)).toBe(ErrorCodes.RATE_LIMITED);
	});

	test("returns code from object with code property", () => {
		const error = { code: ErrorCodes.INVALID_TOKEN };
		expect(getCode(error)).toBe(ErrorCodes.INVALID_TOKEN);
	});

	test("returns undefined for non-object", () => {
		expect(getCode(null)).toBeUndefined();
		expect(getCode("string")).toBeUndefined();
	});

	test("returns undefined for invalid code string", () => {
		const error = { code: "INVALID_CODE_THAT_DOES_NOT_EXIST" };
		expect(getCode(error)).toBeUndefined();
	});
});

describe.each([
	{
		name: "ConfigurationError",
		error: new ConfigurationError(),
		code: ErrorCodes.CONFIGURATION_ERROR,
		statusCode: 500,
	},
	{
		name: "InvalidStateError",
		error: new InvalidStateError(),
		code: ErrorCodes.INVALID_STATE,
		statusCode: 403,
	},
	{
		name: "ExpiredStateError",
		error: new ExpiredStateError(),
		code: ErrorCodes.EXPIRED_STATE,
		statusCode: 403,
	},
	{
		name: "StateReusedError",
		error: new StateReusedError(),
		code: ErrorCodes.STATE_REUSED,
		statusCode: 403,
	},
	{
		name: "StateBindingError",
		error: new StateBindingError(),
		code: ErrorCodes.STATE_BINDING_FAILED,
		statusCode: 403,
	},
	{
		name: "PKCEValidationError",
		error: new PKCEValidationError(),
		code: ErrorCodes.PKCE_VALIDATION_FAILED,
		statusCode: 400,
	},
	{
		name: "InvalidCodeError",
		error: new InvalidCodeError(),
		code: ErrorCodes.INVALID_CODE,
		statusCode: 400,
	},
	{
		name: "InvalidGrantError",
		error: new InvalidGrantError(),
		code: ErrorCodes.INVALID_GRANT,
		statusCode: 400,
	},
	{
		name: "TokenExchangeError",
		error: new TokenExchangeError(),
		code: ErrorCodes.TOKEN_EXCHANGE_FAILED,
		statusCode: 500,
	},
	{
		name: "InvalidTokenError",
		error: new InvalidTokenError(),
		code: ErrorCodes.INVALID_TOKEN,
		statusCode: 401,
	},
	{
		name: "TokenExpiredError",
		error: new TokenExpiredError(),
		code: ErrorCodes.TOKEN_EXPIRED,
		statusCode: 401,
		retryable: true,
	},
	{
		name: "TokenRefreshError",
		error: new TokenRefreshError(),
		code: ErrorCodes.TOKEN_REFRESH_FAILED,
		statusCode: 500,
		retryable: true,
	},
	{
		name: "TokenRevokedError",
		error: new TokenRevokedError(),
		code: ErrorCodes.TOKEN_REVOKED,
		statusCode: 401,
		retryable: true,
	},
	{
		name: "MfaRequiredError",
		error: new MfaRequiredError(),
		code: ErrorCodes.MFA_REQUIRED,
		statusCode: 403,
	},
	{
		name: "RateLimitError",
		error: new RateLimitError(),
		code: ErrorCodes.RATE_LIMITED,
		statusCode: 429,
		retryable: true,
	},
	{
		name: "UpstreamError",
		error: new UpstreamError(),
		code: ErrorCodes.UPSTREAM_ERROR,
		statusCode: 502,
		retryable: true,
	},
	{
		name: "NetworkError",
		error: new NetworkError(),
		code: ErrorCodes.NETWORK_ERROR,
		statusCode: 503,
		retryable: true,
	},
	{
		name: "StorageReadError",
		error: new StorageReadError(),
		code: ErrorCodes.STORAGE_READ_ERROR,
		statusCode: 500,
	},
	{
		name: "StorageWriteError",
		error: new StorageWriteError(),
		code: ErrorCodes.STORAGE_WRITE_ERROR,
		statusCode: 500,
	},
	{
		name: "StorageUnavailableError",
		error: new StorageUnavailableError(),
		code: ErrorCodes.STORAGE_UNAVAILABLE,
		statusCode: 503,
		retryable: true,
	},
	{
		name: "UsernameTakenError",
		error: new UsernameTakenError(),
		code: ErrorCodes.USERNAME_TAKEN,
		statusCode: 409,
	},
	{
		name: "EmailTakenError",
		error: new EmailTakenError(),
		code: ErrorCodes.EMAIL_TAKEN,
		statusCode: 409,
	},
	{
		name: "InvalidCredentialsError",
		error: new InvalidCredentialsError(),
		code: ErrorCodes.INVALID_CREDENTIALS,
		statusCode: 401,
	},
	{
		name: "UserNotFoundError",
		error: new UserNotFoundError(),
		code: ErrorCodes.USER_NOT_FOUND,
		statusCode: 404,
	},
	{
		name: "CredentialsValidationError",
		error: new CredentialsValidationError(),
		code: ErrorCodes.CREDENTIALS_VALIDATION_ERROR,
		statusCode: 400,
	},
	{
		name: "GuildJoinError",
		error: new GuildJoinError(),
		code: ErrorCodes.GUILD_JOIN_ERROR,
		statusCode: 500,
	},
	{
		name: "GuildSyncError",
		error: new GuildSyncError(),
		code: ErrorCodes.GUILD_SYNC_ERROR,
		statusCode: 500,
	},
	{
		name: "BruteForceBlockedError",
		error: new BruteForceBlockedError(),
		code: ErrorCodes.BRUTE_FORCE_BLOCKED,
		statusCode: 429,
		retryable: true,
	},
])("$name", ({ error, code, statusCode, retryable }) => {
	test(`has code ${code}`, () => {
		expect(error.code).toBe(code);
	});

	test(`has statusCode ${statusCode}`, () => {
		expect(error.statusCode).toBe(statusCode);
	});

	test("is instance of AuthError", () => {
		expect(error).toBeInstanceOf(AuthError);
	});

	test("has correct name", () => {
		expect(error.name).toBe(error.constructor.name);
	});

	test("isAuthError returns true", () => {
		expect(isAuthError(error)).toBe(true);
	});

	test("getCode returns correct code", () => {
		expect(getCode(error)).toBe(code);
	});

	if (retryable) {
		test("is retryable", () => {
			expect(error.retryable).toBe(true);
		});
	}

	test("serializes correctly to JSON", () => {
		const json = JSON.parse(JSON.stringify(error));
		expect(json.code).toBe(code);
		expect(json.message).toBeDefined();
	});
});

describe("Custom constructor options", () => {
	test("ConfigurationError with custom message and cause", () => {
		const cause = new Error("config error");
		const error = new ConfigurationError("custom message", { cause });
		expect(error.message).toBe("custom message");
		expect(error.cause).toBe(cause);
	});

	test("RateLimitError with retryAfter", () => {
		const error = new RateLimitError("rate limited", { retryAfter: 60 });
		expect(error.retryAfter).toBe(60);
		expect(error.retryable).toBe(true);
	});

	test("BruteForceBlockedError with retryAfter", () => {
		const error = new BruteForceBlockedError("blocked", { retryAfter: 120 });
		expect(error.retryAfter).toBe(120);
		expect(error.retryable).toBe(true);
	});

	test("custom message overrides default", () => {
		const error = new InvalidTokenError("custom token error");
		expect(error.message).toBe("custom token error");
	});
});
