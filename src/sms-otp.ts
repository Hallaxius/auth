import parsePhoneNumber from "libphonenumber-js";
import { BruteForceProtection } from "./credentials";
import { AuthError, ConfigurationError, ErrorCodes } from "./errors";
import { parseCookies } from "./internal/cookies";
import { verifyToken } from "./internal/jwt";
import { MemoryOtpStore } from "./storage/factory";
import type {
	OtpCode,
	OtpStorage,
	PendingTokenEntry,
	SmsConfig,
	SmsNotifier,
} from "./types";
import { constantTimeCompareStrings } from "./utils/constant-time";
import { getRequestIP, sha256Hex } from "./utils/ip";
import { createSecurityLogger } from "./utils/logger";

const logger = createSecurityLogger("sms-otp");

const DEFAULT_TTL_SECONDS = 600;
const MIN_TTL_SECONDS = 60;
const MAX_TTL_SECONDS = 600;
const DEFAULT_CODE_LENGTH = 6;
const MAX_CODE_LENGTH = 10;
const MIN_CODE_LENGTH = 4;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_LOCKOUT_SECONDS = 900;
const DEFAULT_COOLDOWN_MS = 30_000;
const DEFAULT_DAILY_PER_PHONE_LIMIT = 5;
const MAX_PENDING_TOKEN_MS = 5 * 60 * 1000;
const GLOBAL_TENANT = "global";
const DUMMY_DELAY_MS = 100;

const CODE_REGEX = /^\d{4,10}$/;

export type SmsOtpHandlers = {
	/** Ante-auth: request an SMS code (passwordless login or step-up initiation). */
	handleSmsRequest: (request: Request) => Promise<Response>;
	/** Ante-auth: phone + code → session (`createSessionWithoutPassword`, ADR-002). */
	handleSmsVerify: (request: Request) => Promise<Response>;
	/** Post-auth: bind a phone for SMS MFA (re-bind requires re-authentication). */
	handleSmsEnroll: (request: Request) => Promise<Response>;
	/** Post-auth: pendingToken + code → step-up success (binds/unlocks). */
	handleSmsVerifyMfa: (request: Request) => Promise<Response>;
	/** Resend with 30 s cooldown — invalidates the previous code by design. */
	handleSmsResend: (request: Request) => Promise<Response>;
};

function json(data: Record<string, unknown>, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "Content-Type": "application/json; charset=utf-8" },
	});
}

function errorResponse(error: unknown): Response {
	if (error instanceof AuthError) {
		return json(
			{ error: error.message, code: error.code },
			error.statusCode ?? 500,
		);
	}
	throw error;
}

function normalizeE164(input: unknown): string | null {
	if (typeof input !== "string" || input.trim().length === 0) return null;
	const phoneNumber = parsePhoneNumber(input);
	if (!phoneNumber?.isValid() || !phoneNumber.number) return null;
	return phoneNumber.number;
}

function isValidCode(code: unknown): code is string {
	return typeof code === "string" && CODE_REGEX.test(code);
}

function generateCode(length: number): string {
	const digits = new Uint8Array(length);
	crypto.getRandomValues(digits);
	let code = "";
	for (const d of digits) code += String(d % 10);
	return code;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export function smsOtp(config: SmsConfig) {
	if (!config.notifier || typeof config.notifier.send !== "function") {
		throw new ConfigurationError(
			"smsOtp() requires a `notifier` with send() (D6 — consumer brings the provider).",
		);
	}
	const notifier = config.notifier as SmsNotifier;
	const codeLength = Math.min(
		MAX_CODE_LENGTH,
		Math.max(MIN_CODE_LENGTH, config.codeLength ?? DEFAULT_CODE_LENGTH),
	);
	const ttlSeconds = Math.min(
		MAX_TTL_SECONDS,
		Math.max(MIN_TTL_SECONDS, config.ttlSeconds ?? DEFAULT_TTL_SECONDS),
	);
	const maxAttempts = config.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
	const lockoutSeconds = config.lockoutSeconds ?? DEFAULT_LOCKOUT_SECONDS;
	const cooldownMs = config.cooldownMs ?? DEFAULT_COOLDOWN_MS;
	const dailyPerPhoneLimit =
		config.dailyPerPhoneLimit ?? DEFAULT_DAILY_PER_PHONE_LIMIT;
	const trustProxy = config.trustProxy ?? false;
	const sessionCookieName = config.sessionCookieName ?? "session";
	const storage: OtpStorage =
		config.storage ??
		(() => {
			logger.warn(
				"smsOtp(): no `storage` provided, falling back to in-memory store. " +
					"This is NOT suitable for production, serverless, or multi-process deployments.",
			);
			return new MemoryOtpStore();
		})();

	const bruteForceStorage = config.bruteForceStorage;
	const ipLimiter = new BruteForceProtection(
		{
			enabled: true,
			maxAttempts: 5,
			windowMs: 60 * 60 * 1000,
			blockDurationMs: 60 * 60 * 1000,
			storage: bruteForceStorage,
		},
		bruteForceStorage,
	);
	const phoneLimiter = new BruteForceProtection(
		{
			enabled: true,
			maxAttempts: 3,
			windowMs: 10 * 60 * 1000,
			blockDurationMs: 10 * 60 * 1000,
			storage: bruteForceStorage,
		},
		bruteForceStorage,
	);
	const tenantLimiter = new BruteForceProtection(
		{
			enabled: true,
			maxAttempts: 100,
			windowMs: 10 * 60 * 1000,
			blockDurationMs: 10 * 60 * 1000,
			storage: bruteForceStorage,
		},
		bruteForceStorage,
	);
	const dailyLimiter = new BruteForceProtection(
		{
			enabled: true,
			maxAttempts: dailyPerPhoneLimit,
			windowMs: 24 * 60 * 60 * 1000,
			blockDurationMs: 24 * 60 * 60 * 1000,
			storage: bruteForceStorage,
		},
		bruteForceStorage,
	);
	const verifyLimiter = new BruteForceProtection(
		{
			enabled: true,
			maxAttempts: maxAttempts,
			windowMs: 15 * 60 * 1000,
			blockDurationMs: lockoutSeconds * 1000,
			storage: bruteForceStorage,
		},
		bruteForceStorage,
	);

	function tenantKeyOf(tenantId: string | null): string {
		return tenantId ?? GLOBAL_TENANT;
	}

	function verifyKey(tenantKey: string, phoneHash: string): string {
		return `sms:verify:${tenantKey}:${phoneHash}`;
	}

	function rateLimitError(): AuthError {
		return new AuthError(
			ErrorCodes.RATE_LIMITED,
			"Too many requests, please try again later",
			{ statusCode: 429, retryable: true },
		);
	}

	async function enforceSendLimits(
		phoneHash: string,
		tenantKey: string,
		request: Request,
		includePhone: boolean,
	): Promise<string> {
		const ip = await getRequestIP(request, { trustProxy });
		if (await ipLimiter.isBlocked(`sms:req:${tenantKey}:${ip}`)) {
			throw rateLimitError();
		}
		if (
			includePhone &&
			(await phoneLimiter.isBlocked(`sms:phone:${tenantKey}:${phoneHash}`))
		) {
			throw rateLimitError();
		}
		if (await tenantLimiter.isBlocked(`sms:tenant:${tenantKey}`)) {
			throw rateLimitError();
		}
		return ip;
	}

	async function recordSendUsage(
		phoneHash: string,
		tenantKey: string,
		ip: string,
		includePhone: boolean,
	): Promise<void> {
		if (includePhone) {
			const dailyKey = `sms:daily:${tenantKey}:${phoneHash}`;
			if (await dailyLimiter.isBlocked(dailyKey)) {
				throw rateLimitError();
			}
			const result = await dailyLimiter.recordAttempt(dailyKey);
			if (result && !result.allowed) throw rateLimitError();
			await phoneLimiter.recordAttempt(`sms:phone:${tenantKey}:${phoneHash}`);
		}
		await ipLimiter.recordAttempt(`sms:req:${tenantKey}:${ip}`);
	}

	async function extractUserId(request: Request): Promise<string | null> {
		if (!config.secret) {
			throw new ConfigurationError(
				"smsOtp(): `secret` is required for authenticated operations (enroll / step-up / recovery).",
			);
		}
		const cookies = parseCookies(request);
		const sessionCookie = cookies[sessionCookieName];
		if (!sessionCookie) return null;
		try {
			const payload = await verifyToken<{ userId: string }>(
				sessionCookie,
				config.secret,
			);
			return payload?.userId ?? null;
		} catch {
			return null;
		}
	}

	async function ensureAuthenticated(request: Request): Promise<string> {
		const userId = await extractUserId(request);
		if (!userId) {
			throw new AuthError(ErrorCodes.INVALID_TOKEN, "Unauthorized", {
				statusCode: 401,
			});
		}
		return userId;
	}

	async function mintPendingToken(userId: string): Promise<string> {
		const bytes = new Uint8Array(32);
		crypto.getRandomValues(bytes);
		let hex = "";
		for (const b of bytes) hex += b.toString(16).padStart(2, "0");
		const data = `${userId}:${hex}`;
		const encoder = new TextEncoder().encode(data);
		const keyData = new TextEncoder().encode(config.secret);
		const key = await crypto.subtle.importKey(
			"raw",
			keyData,
			{ name: "HMAC", hash: "SHA-256" },
			false,
			["sign"],
		);
		const sig = await crypto.subtle.sign("HMAC", key, encoder);
		const sigHex = Array.from(new Uint8Array(sig))
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("");
		const token = `${hex}:${sigHex}`;
		const pendingTokenEntry: PendingTokenEntry = {
			token,
			createdAt: Date.now(),
			expiresAt: Date.now() + MAX_PENDING_TOKEN_MS,
		};
		await config.mfaStorage?.setPendingToken?.(userId, pendingTokenEntry);
		return token;
	}

	async function verifyPendingToken(
		userId: string,
		pendingToken: string,
	): Promise<void> {
		if (!config.mfaStorage) {
			throw new ConfigurationError(
				"smsOtp(): `mfaStorage` is required for the post-auth step-up flow.",
			);
		}
		const stored = await config.mfaStorage.getPendingToken(userId);
		if (!stored) {
			throw new AuthError(
				ErrorCodes.INVALID_TOKEN,
				"Invalid or expired pending token",
				{ statusCode: 401 },
			);
		}
		if (stored.expiresAt < Date.now()) {
			await config.mfaStorage.deletePendingToken?.(userId);
			throw new AuthError(ErrorCodes.TOKEN_EXPIRED, "Pending token expired", {
				statusCode: 401,
			});
		}
		if (!constantTimeCompareStrings(pendingToken, stored.token)) {
			throw new AuthError(
				ErrorCodes.INVALID_TOKEN,
				"Invalid or expired pending token",
				{ statusCode: 401 },
			);
		}
	}

	async function runVerifyAttempts(
		tenantKey: string,
		phoneHash: string,
		record: OtpCode,
		code: string,
	): Promise<OtpCode> {
		const wrong = !constantTimeCompareStrings(
			await sha256Hex(code),
			record.codeHash,
		);
		if (!wrong) {
			await verifyLimiter.reset(verifyKey(tenantKey, phoneHash));
			return record;
		}
		const attempts = record.attempts + 1;
		if (attempts >= maxAttempts) {
			const result = await verifyLimiter.recordAttempt(
				verifyKey(tenantKey, phoneHash),
			);
			throw new AuthError(
				ErrorCodes.RATE_LIMITED,
				"Too many attempts, please try again later",
				{ statusCode: 429, retryAfter: result?.retryAfter },
			);
		}
		const retried: OtpCode = { ...record, attempts };
		await storage.set(phoneHash, record.purpose, retried);
		throw new AuthError(ErrorCodes.INVALID_CODE, "Invalid code", {
			statusCode: 400,
		});
	}

	function dummyResponse(purpose: OtpCode["purpose"]): Promise<Response> {
		const started = Date.now();
		return (async () => {
			await sleep(Math.max(0, DUMMY_DELAY_MS - (Date.now() - started)));
			return json({
				success: true,
				purpose,
				expiresInSeconds: ttlSeconds,
			});
		})();
	}

	async function handleSmsRequest(request: Request): Promise<Response> {
		if (request.method !== "POST") {
			return json({ error: "Method not allowed" }, 405);
		}
		try {
			const { phone, tenantId, purpose } = (await request.json()) as {
				phone?: unknown;
				tenantId?: string;
				purpose?: string;
			};
			const normalized = normalizeE164(phone);
			if (!normalized) {
				return json({ error: "phone must be a valid E.164 number" }, 400);
			}
			const resolvedPurpose: OtpCode["purpose"] =
				purpose === "mfa" || purpose === "recovery" ? purpose : "sms-login";
			const tenantIdValue =
				(await config.tenantIdFromRequest?.(request)) ?? tenantId ?? null;
			const tenantKey = tenantKeyOf(tenantIdValue);
			const phoneHash = await sha256Hex(normalized);

			if (
				config.allowedCountryPrefixes?.length &&
				!config.allowedCountryPrefixes.some((p) => normalized.startsWith(p))
			) {
				return dummyResponse(resolvedPurpose);
			}

			const known =
				resolvedPurpose !== "sms-login" ||
				(await config.phoneLookup?.(phoneHash)) !== null;
			if (!known) {
				await enforceSendLimits(phoneHash, tenantKey, request, false);
				return dummyResponse(resolvedPurpose);
			}

			await enforceSendLimits(phoneHash, tenantKey, request, true);
			const ip = await getRequestIP(request, { trustProxy });
			const existing = await storage.getAndConsume(phoneHash, resolvedPurpose);
			if (existing && Date.now() - existing.createdAt < cooldownMs) {
				await storage.set(phoneHash, resolvedPurpose, existing);
				throw rateLimitError();
			}
			if (existing && Date.now() > existing.expiresAt) {
				await storage.delete(phoneHash, resolvedPurpose);
			}

			await recordSendUsage(phoneHash, tenantKey, ip, true);

			const code = generateCode(codeLength);
			const now = Date.now();
			const record: OtpCode = {
				phoneHash,
				tenantId: tenantIdValue,
				userId: null,
				purpose: resolvedPurpose,
				codeHash: await sha256Hex(code),
				attempts: 0,
				expiresAt: now + ttlSeconds * 1000,
				createdAt: now,
			};
			if (resolvedPurpose === "sms-login") {
				const lookup = await config.phoneLookup?.(phoneHash);
				record.userId = lookup?.userId ?? null;
			}
			await storage.set(phoneHash, resolvedPurpose, record);

			try {
				await notifier.send({
					to: normalized,
					code,
					ttlMinutes: Math.ceil(ttlSeconds / 60),
					purpose: resolvedPurpose,
					tenantId: tenantIdValue ?? undefined,
				});
			} catch (cause) {
				throw new AuthError(ErrorCodes.UPSTREAM_ERROR, "SMS delivery failed", {
					statusCode: 502,
					retryable: true,
					cause: cause instanceof Error ? cause : undefined,
				});
			}
			return json({
				success: true,
				purpose: resolvedPurpose,
				expiresInSeconds: ttlSeconds,
			});
		} catch (error) {
			return errorResponse(error);
		}
	}

	async function handleSmsVerify(request: Request): Promise<Response> {
		if (request.method !== "POST") {
			return json({ error: "Method not allowed" }, 405);
		}
		try {
			const { phone, code, tenantId } = (await request.json()) as {
				phone?: unknown;
				code?: unknown;
				tenantId?: string;
			};
			const normalized = normalizeE164(phone);
			if (!normalized || !isValidCode(code)) {
				return json({ error: "phone and code are required" }, 400);
			}
			const tenantIdValue =
				(await config.tenantIdFromRequest?.(request)) ?? tenantId ?? null;
			const tenantKey = tenantKeyOf(tenantIdValue);
			const phoneHash = await sha256Hex(normalized);
			const key = verifyKey(tenantKey, phoneHash);

			if (!config.smsPasswordless) {
				throw new AuthError(
					ErrorCodes.FORBIDDEN,
					"SMS passwordless is disabled",
					{ statusCode: 403 },
				);
			}
			if (await verifyLimiter.isBlocked(key)) {
				throw new AuthError(
					ErrorCodes.RATE_LIMITED,
					"Too many attempts, please try again later",
					{ statusCode: 429 },
				);
			}

			const record = await storage.getAndConsume(phoneHash, "sms-login");
			if (!record || record.expiresAt < Date.now() || !record.userId) {
				await verifyLimiter.recordAttempt(key);
				throw new AuthError(
					ErrorCodes.INVALID_CODE,
					"Invalid or expired code",
					{
						statusCode: 400,
					},
				);
			}

			await runVerifyAttempts(tenantKey, phoneHash, record, code);

			const ip = await getRequestIP(request, { trustProxy });
			if (config.createSessionWithoutPassword) {
				const session = await config.createSessionWithoutPassword({
					userId: record.userId,
					tenantId: tenantIdValue ?? undefined,
					ip,
					userAgent: request.headers.get("user-agent") ?? undefined,
				});
				return json({
					sessionToken: session.sessionToken,
					idToken: session.idToken,
				});
			}
			return json({ success: true, userId: record.userId });
		} catch (error) {
			return errorResponse(error);
		}
	}

	async function handleSmsEnroll(request: Request): Promise<Response> {
		if (request.method !== "POST") {
			return json({ error: "Method not allowed" }, 405);
		}
		try {
			const userId = await ensureAuthenticated(request);
			const { phone, password } = (await request.json()) as {
				phone?: unknown;
				password?: string;
			};
			const normalized = normalizeE164(phone);
			if (!normalized) {
				return json({ error: "phone must be a valid E.164 number" }, 400);
			}
			const tenantIdValue: string | null =
				(await config.tenantIdFromRequest?.(request)) ?? null;
			const tenantKey = tenantKeyOf(tenantIdValue);
			const phoneHash = await sha256Hex(normalized);
			const ip = await enforceSendLimits(phoneHash, tenantKey, request, true);
			const binding = (await config.getBinding?.(userId)) ?? null;
			if (binding) {
				if (binding.phoneHash === phoneHash) {
					throw new AuthError(
						ErrorCodes.MFA_ALREADY_SETUP,
						"This phone is already bound for SMS MFA",
						{ statusCode: 409 },
					);
				}
				if (typeof password !== "string" || password.length === 0) {
					throw new AuthError(
						ErrorCodes.INVALID_CREDENTIALS,
						"Re-authentication is required to change the bound phone",
						{ statusCode: 401 },
					);
				}
				if (!config.verifyPassword) {
					throw new ConfigurationError(
						"smsOtp(): a `verifyPassword` hook is required to re-bind a different phone.",
					);
				}
				const ok = await config.verifyPassword(userId, password);
				if (!ok) {
					throw new AuthError(
						ErrorCodes.INVALID_CREDENTIALS,
						"Re-authentication failed",
						{ statusCode: 401 },
					);
				}
			}

			if (!config.mfaStorage) {
				throw new ConfigurationError(
					"smsOtp(): `mfaStorage` is required for the enrollment flow.",
				);
			}
			const existing = await storage.getAndConsume(phoneHash, "mfa");
			if (existing && Date.now() - existing.createdAt < cooldownMs) {
				await storage.set(phoneHash, "mfa", existing);
				throw rateLimitError();
			}

			await recordSendUsage(phoneHash, tenantKey, ip, true);

			const code = generateCode(codeLength);
			const now = Date.now();
			const record: OtpCode = {
				phoneHash,
				tenantId: tenantIdValue,
				userId,
				purpose: "mfa",
				codeHash: await sha256Hex(code),
				attempts: 0,
				expiresAt: now + ttlSeconds * 1000,
				createdAt: now,
			};
			await storage.set(phoneHash, "mfa", record);
			const pendingToken = await mintPendingToken(userId);

			try {
				await notifier.send({
					to: normalized,
					code,
					ttlMinutes: Math.ceil(ttlSeconds / 60),
					purpose: "mfa",
					tenantId: tenantIdValue ?? undefined,
				});
			} catch (cause) {
				throw new AuthError(ErrorCodes.UPSTREAM_ERROR, "SMS delivery failed", {
					statusCode: 502,
					retryable: true,
					cause: cause instanceof Error ? cause : undefined,
				});
			}
			return json({ pendingToken, expiresInSeconds: ttlSeconds });
		} catch (error) {
			return errorResponse(error);
		}
	}

	async function handleSmsVerifyMfa(request: Request): Promise<Response> {
		if (request.method !== "POST") {
			return json({ error: "Method not allowed" }, 405);
		}
		try {
			const userId = await ensureAuthenticated(request);
			const { phone, code, pendingToken } = (await request.json()) as {
				phone?: unknown;
				code?: unknown;
				pendingToken?: string;
			};
			const normalized = normalizeE164(phone);
			if (!normalized || !isValidCode(code)) {
				return json({ error: "phone and code are required" }, 400);
			}
			if (typeof pendingToken !== "string" || pendingToken.length === 0) {
				throw new AuthError(
					ErrorCodes.INVALID_TOKEN,
					"pendingToken is required",
					{ statusCode: 401 },
				);
			}
			const tenantKey = tenantKeyOf(
				(await config.tenantIdFromRequest?.(request)) ?? null,
			);
			const phoneHash = await sha256Hex(normalized);
			const key = verifyKey(tenantKey, phoneHash);
			if (await verifyLimiter.isBlocked(key)) {
				throw new AuthError(
					ErrorCodes.RATE_LIMITED,
					"Too many attempts, please try again later",
					{ statusCode: 429 },
				);
			}

			await verifyPendingToken(userId, pendingToken);

			const record = await storage.getAndConsume(phoneHash, "mfa");
			if (!record || record.expiresAt < Date.now()) {
				await verifyLimiter.recordAttempt(key);
				throw new AuthError(
					ErrorCodes.INVALID_CODE,
					"Invalid or expired code",
					{
						statusCode: 400,
					},
				);
			}

			await runVerifyAttempts(tenantKey, phoneHash, record, code);

			await config.mfaStorage?.deletePendingToken?.(userId);
			await config.onEnrolled?.({
				userId,
				phoneHash,
				tenantId: record.tenantId,
			});
			return json({ success: true, userId });
		} catch (error) {
			return errorResponse(error);
		}
	}

	async function handleSmsResend(request: Request): Promise<Response> {
		if (request.method !== "POST") {
			return json({ error: "Method not allowed" }, 405);
		}
		try {
			const { phone, purpose, tenantId } = (await request.json()) as {
				phone?: unknown;
				purpose?: string;
				tenantId?: string;
			};
			const normalized = normalizeE164(phone);
			if (!normalized) {
				return json({ error: "phone must be a valid E.164 number" }, 400);
			}
			const resolvedPurpose: OtpCode["purpose"] =
				purpose === "mfa" || purpose === "recovery" ? purpose : "sms-login";
			if (resolvedPurpose === "mfa") {
				await ensureAuthenticated(request);
			}
			const tenantIdValue =
				(await config.tenantIdFromRequest?.(request)) ?? tenantId ?? null;
			const tenantKey = tenantKeyOf(tenantIdValue);
			const phoneHash = await sha256Hex(normalized);
			await enforceSendLimits(phoneHash, tenantKey, request, true);
			const ip = await getRequestIP(request, { trustProxy });

			const existing = await storage.getAndConsume(phoneHash, resolvedPurpose);
			if (existing && Date.now() - existing.createdAt < cooldownMs) {
				await storage.set(phoneHash, resolvedPurpose, existing);
				throw rateLimitError();
			}

			await recordSendUsage(phoneHash, tenantKey, ip, true);

			const code = generateCode(codeLength);
			const now = Date.now();
			const record: OtpCode = {
				phoneHash,
				tenantId: tenantIdValue,
				userId: null,
				purpose: resolvedPurpose,
				codeHash: await sha256Hex(code),
				attempts: 0,
				expiresAt: now + ttlSeconds * 1000,
				createdAt: now,
			};
			if (resolvedPurpose === "sms-login") {
				const lookup = await config.phoneLookup?.(phoneHash);
				record.userId = lookup?.userId ?? null;
			}
			await storage.set(phoneHash, resolvedPurpose, record);

			try {
				await notifier.send({
					to: normalized,
					code,
					ttlMinutes: Math.ceil(ttlSeconds / 60),
					purpose: resolvedPurpose,
					tenantId: tenantIdValue ?? undefined,
				});
			} catch (cause) {
				throw new AuthError(ErrorCodes.UPSTREAM_ERROR, "SMS delivery failed", {
					statusCode: 502,
					retryable: true,
					cause: cause instanceof Error ? cause : undefined,
				});
			}
			return json({ success: true, expiresInSeconds: ttlSeconds });
		} catch (error) {
			return errorResponse(error);
		}
	}

	return {
		handleSmsRequest,
		handleSmsVerify,
		handleSmsEnroll,
		handleSmsVerifyMfa,
		handleSmsResend,
	};
}
