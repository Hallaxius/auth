import { BruteForceProtection } from "./credentials";
import { AuthError, ErrorCodes, PasswordTooShortError } from "./errors";
import { base64URLEncode } from "./internal/state";
import type {
	ConsumeResetTokenResult,
	PasswordResetConfig,
	RequestResetResult,
} from "./types";
import { constantTimeCompareStrings } from "./utils/constant-time";
import {
	getRequestIP as getTrustedRequestIP,
	isIPv6,
	maskIPv6To64,
	sanitizeIP,
	sha256Hex,
} from "./utils/ip";

export type PasswordResetHandlers = {
	handleForgotPassword: (request: Request) => Promise<Response>;
	handleResetPassword: (request: Request) => Promise<Response>;
};

export function passwordReset(config: PasswordResetConfig) {
	const minPasswordLength = config.minPasswordLength ?? 8;
	const tokenExpirationSeconds = config.tokenExpirationSeconds ?? 3600;
	const trustProxy = config.trustProxy ?? false;
	const rateLimitProgrammatic = config.rateLimitProgrammatic ?? true;
	const forgotPasswordRateLimit = {
		enabled: true,
		maxAttempts: config.forgotPasswordRateLimit?.maxAttempts ?? 3,
		windowMs: config.forgotPasswordRateLimit?.windowMs ?? 60 * 60 * 1000,
		blockDurationMs: 60 * 60 * 1000,
		storage: config.forgotPasswordRateLimit?.storage,
	};
	const resetPasswordRateLimit = {
		enabled: true,
		maxAttempts: config.resetPasswordRateLimit?.maxAttempts ?? 10,
		windowMs: config.resetPasswordRateLimit?.windowMs ?? 15 * 60 * 1000,
		blockDurationMs: 15 * 60 * 1000,
		storage: config.resetPasswordRateLimit?.storage,
	};

	const forgotPasswordLimiter = new BruteForceProtection(
		forgotPasswordRateLimit,
		config.forgotPasswordRateLimit?.storage,
	);
	const resetPasswordLimiter = new BruteForceProtection(
		resetPasswordRateLimit,
		config.resetPasswordRateLimit?.storage,
	);

	async function getRequestIP(request: Request): Promise<string> {
		const trusted = await getTrustedRequestIP(request, { trustProxy });
		if (trusted) {
			const ip = sanitizeIP(trusted);
			if (isIPv6(ip)) {
				return maskIPv6To64(ip);
			}
			return ip;
		}
		const ua = request.headers.get("user-agent") || "unknown";
		const fingerprint = await sha256Hex(ua);
		return `fp:${fingerprint.slice(0, 16)}`;
	}

	async function resolveUser(emailOrUsername: string): Promise<{
		userId: string;
		email: string;
		username: string;
	} | null> {
		if (config.userLookup) {
			return config.userLookup(emailOrUsername);
		}
		return null;
	}

	function generateResetToken() {
		const selectorBytes = new Uint8Array(16);
		crypto.getRandomValues(selectorBytes);
		const selector = base64URLEncode(selectorBytes.buffer);

		const validatorBytes = new Uint8Array(32);
		crypto.getRandomValues(validatorBytes);
		const validator = base64URLEncode(validatorBytes.buffer);

		const token = `${selector}.${validator}`;
		return { selector, validator, token };
	}

	function parseResetToken(token: string): {
		selector: string;
		validator: string;
	} {
		const parts = token.split(".");
		if (parts.length !== 2) {
			throw new AuthError("RESET_TOKEN_INVALID", "Invalid token format", {
				statusCode: 400,
			});
		}
		return { selector: parts[0] as string, validator: parts[1] as string };
	}

	async function hashValidator(validator: string): Promise<string> {
		const encoded = new TextEncoder().encode(validator);
		const digest = await crypto.subtle.digest("SHA-256", encoded);
		const hashArray = new Uint8Array(digest);
		return Array.from(hashArray)
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("");
	}

	async function createTokenAndNotify(
		userData: {
			userId: string;
			email: string;
			username: string;
		} | null,
	): Promise<void> {
		if (!userData) {
			return;
		}

		await config.storage.deleteAllUserTokens?.(userData.userId);

		const { selector, validator } = generateResetToken();
		const validatorHash = await hashValidator(validator);
		const expiry = Date.now() + tokenExpirationSeconds * 1000;

		await config.storage.create({
			selector,
			validatorHash,
			expiry,
			...userData,
		});

		await config.notifier.send(
			{ selector, validator },
			userData.userId,
			userData.email,
			userData.username,
		);
	}

	async function handleForgotPassword(request: Request): Promise<Response> {
		if (request.method !== "POST") {
			return new Response(JSON.stringify({ error: "Method not allowed" }), {
				status: 405,
				headers: { "Content-Type": "application/json" },
			});
		}

		const ip = await getRequestIP(request);

		try {
			const { emailOrUsername } = (await request.json()) as {
				emailOrUsername: string;
			};

			const forgotResult = await forgotPasswordLimiter.recordAttempt(ip);
			if (forgotResult && !forgotResult.allowed) {
				throw new AuthError(
					ErrorCodes.RATE_LIMITED,
					"Too many requests, please try again later",
					{ statusCode: 429, retryAfter: forgotResult.retryAfter },
				);
			}

			const userData = await resolveUser(emailOrUsername);
			await createTokenAndNotify(userData);

			return new Response(JSON.stringify({ success: true }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		} catch (error) {
			if (error instanceof SyntaxError) {
				return new Response(JSON.stringify({ error: "Invalid JSON" }), {
					status: 400,
					headers: { "Content-Type": "application/json" },
				});
			}
			throw error;
		}
	}

	async function handleResetPassword(request: Request): Promise<Response> {
		if (request.method !== "POST") {
			return new Response(JSON.stringify({ error: "Method not allowed" }), {
				status: 405,
				headers: { "Content-Type": "application/json" },
			});
		}

		const ip = await getRequestIP(request);

		try {
			const blocked = await resetPasswordLimiter.isBlocked(ip);
			if (blocked) {
				throw new AuthError(
					ErrorCodes.RATE_LIMITED,
					"Too many requests, please try again later",
					{ statusCode: 429 },
				);
			}

			const { token, newPassword } = (await request.json()) as {
				token: string;
				newPassword: string;
			};

			if (
				typeof newPassword !== "string" ||
				newPassword.length < minPasswordLength
			) {
				throw new PasswordTooShortError(
					`Password must be at least ${minPasswordLength} characters long`,
				);
			}

			const { selector, validator } = parseResetToken(token);
			const stored = await config.storage.findBySelector(selector);
			if (!stored) {
				throw new AuthError(
					ErrorCodes.RESET_TOKEN_INVALID,
					"Invalid or expired reset token",
					{ statusCode: 400 },
				);
			}

			if (Date.now() > stored.expiry) {
				await config.storage.delete(selector);
				throw new AuthError(
					ErrorCodes.RESET_TOKEN_EXPIRED,
					"Reset token has expired",
					{ statusCode: 400 },
				);
			}

			const computedHash = await hashValidator(validator);
			if (!constantTimeCompareStrings(computedHash, stored.validatorHash)) {
				await config.storage.delete(selector);
				throw new AuthError(
					ErrorCodes.RESET_TOKEN_INVALID,
					"Invalid or expired reset token",
					{ statusCode: 400 },
				);
			}

			if (config.onPasswordReset) {
				await config.onPasswordReset(stored.userId);
			}

			await config.storage.delete(selector);

			return new Response(JSON.stringify({ success: true }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		} catch (error) {
			if (error instanceof SyntaxError) {
				return new Response(JSON.stringify({ error: "Invalid JSON" }), {
					status: 400,
					headers: { "Content-Type": "application/json" },
				});
			}
			if (
				error instanceof AuthError &&
				error.code === ErrorCodes.RATE_LIMITED
			) {
				throw error;
			}
			const resetResult = await resetPasswordLimiter.recordAttempt(ip);
			if (resetResult && !resetResult.allowed) {
				throw new AuthError(
					ErrorCodes.RATE_LIMITED,
					"Too many requests, please try again later",
					{ statusCode: 429, retryAfter: resetResult.retryAfter },
				);
			}
			throw error;
		}
	}

	async function requestReset(target: string): Promise<RequestResetResult> {
		if (rateLimitProgrammatic) {
			const key = await sha256Hex(target);
			const result = await forgotPasswordLimiter.recordAttempt(key);
			if (result && !result.allowed) {
				throw new AuthError(
					ErrorCodes.RATE_LIMITED,
					"Too many requests, please try again later",
					{ statusCode: 429, retryAfter: result.retryAfter },
				);
			}
		}
		const userData = await resolveUser(target);
		await createTokenAndNotify(userData);
		return { processed: true };
	}

	async function consumeResetToken(
		token: string,
	): Promise<ConsumeResetTokenResult> {
		const key = rateLimitProgrammatic ? await sha256Hex(token) : undefined;
		if (key) {
			const blocked = await resetPasswordLimiter.isBlocked(key);
			if (blocked) {
				throw new AuthError(
					ErrorCodes.RATE_LIMITED,
					"Too many requests, please try again later",
					{ statusCode: 429 },
				);
			}
		}
		try {
			const { selector, validator } = parseResetToken(token);
			const stored = await config.storage.findBySelector(selector);
			if (!stored) {
				throw new AuthError(
					ErrorCodes.RESET_TOKEN_INVALID,
					"Invalid or expired reset token",
					{ statusCode: 400 },
				);
			}
			if (Date.now() > stored.expiry) {
				await config.storage.delete(selector);
				throw new AuthError(
					ErrorCodes.RESET_TOKEN_EXPIRED,
					"Reset token has expired",
					{ statusCode: 400 },
				);
			}
			const computedHash = await hashValidator(validator);
			if (!constantTimeCompareStrings(computedHash, stored.validatorHash)) {
				await config.storage.delete(selector);
				throw new AuthError(
					ErrorCodes.RESET_TOKEN_INVALID,
					"Invalid or expired reset token",
					{ statusCode: 400 },
				);
			}
			const result = await config.storage.consume(selector);
			if (!result) {
				throw new AuthError(
					ErrorCodes.RESET_TOKEN_INVALID,
					"Invalid or expired reset token",
					{ statusCode: 400 },
				);
			}
			return {
				userId: result.userId,
				email: result.email,
				username: result.username,
			};
		} catch (error) {
			if (key && !(error instanceof SyntaxError)) {
				await resetPasswordLimiter.recordAttempt(key);
			}
			throw error;
		}
	}

	return {
		handleForgotPassword,
		handleResetPassword,
		requestReset,
		consumeResetToken,
	};
}
