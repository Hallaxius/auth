import { AuthError, ErrorCodes } from "./errors";
import { clearSessionCookie, parseCookies } from "./internal/cookies";
import { decrypt, encrypt } from "./internal/crypto-aes";
import { verifyToken } from "./internal/jwt";
import type {
	MfaChallengeResult,
	MfaFactoryConfig,
	MfaMethod,
	MfaVerifyResult,
	TotpSetupResult,
} from "./types";
import { constantTimeCompare } from "./utils/constant-time";
import { getRequestIP, sha256Hex } from "./utils/ip";
import { createSecurityLogger } from "./utils/logger";

export type MfaHandlers = {
	handleMfaSetup: (request: Request) => Promise<Response>;
	handleMfaVerify: (request: Request) => Promise<Response>;
	handleMfaChallenge: (request: Request) => Promise<Response>;
	handleMfaDisable: (request: Request) => Promise<Response>;
};

const TOTP_STEP = 30;
const TOTP_DIGITS = 6;
const BACKUP_CODE_COUNT = 10;
const BACKUP_CODE_LENGTH = 12;
const SESSION_COOKIE_NAME = "mfa-session";

function base32Encode(buffer: Uint8Array): string {
	const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
	const bytes = Array.from(buffer);
	let result = "";
	let bits = 0;
	let value = 0;
	for (const byte of bytes) {
		value = (value << 8) | byte;
		bits += 8;
		while (bits >= 5) {
			bits -= 5;
			result += alphabet[(value >> bits) & 31];
		}
	}
	if (bits > 0) {
		result += alphabet[(value << (5 - bits)) & 31];
	}
	return result;
}

async function generateTOTPCodeWithCounter(
	key: Uint8Array,
	counter: number,
	hashAlgorithm: "SHA-1" | "SHA-256" | "SHA-512" = "SHA-256",
): Promise<string> {
	const counterBuf = new Uint8Array(8);
	const view = new DataView(counterBuf.buffer);
	view.setBigUint64(0, BigInt(counter), false);

	const cryptoKey = await crypto.subtle.importKey(
		"raw",
		key.buffer as ArrayBuffer,
		{ name: "HMAC", hash: hashAlgorithm },
		false,
		["sign"],
	);
	const hmac = new Uint8Array(
		await crypto.subtle.sign("HMAC", cryptoKey, counterBuf),
	);

	const offset = (hmac[hmac.length - 1] as number) & 0xf;
	const code =
		(((hmac[offset] as number) & 0x7f) << 24) |
		((hmac[offset + 1] as number) << 16) |
		((hmac[offset + 2] as number) << 8) |
		(hmac[offset + 3] as number);

	const totp = (code % 10 ** TOTP_DIGITS).toString().padStart(TOTP_DIGITS, "0");

	return totp;
}

function base32Decode(encoded: string): Uint8Array {
	const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
	const clean = encoded.replace(/=+$/, "").toUpperCase();
	const bytes: number[] = [];
	let bits = 0;
	let value = 0;
	for (const char of clean) {
		const idx = alphabet.indexOf(char);
		if (idx === -1) continue;
		value = (value << 5) | idx;
		bits += 5;
		if (bits >= 8) {
			bits -= 8;
			bytes.push((value >> bits) & 0xff);
		}
	}
	return new Uint8Array(bytes);
}

function generateBackupCodes(): string[] {
	const codes: string[] = [];
	for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
		const bytes = new Uint8Array(9);
		crypto.getRandomValues(bytes);
		let hex = "";
		for (let j = 0; j < bytes.length; j++) {
			hex += (bytes[j] as number).toString(16).padStart(2, "0");
		}
		const code = hex.slice(0, BACKUP_CODE_LENGTH).toUpperCase();
		codes.push(code);
	}
	return codes;
}

function jsonResponse(
	data: unknown,
	status = 200,
	cookies?: string[],
): Response {
	const headers = new Headers({
		"Content-Type": "application/json",
	});
	if (cookies) {
		for (const c of cookies) headers.append("Set-Cookie", c);
	}
	return new Response(JSON.stringify(data), {
		status,
		headers,
	});
}

function errorResponse(code: string, message: string, status = 400): Response {
	return jsonResponse({ error: message, code }, status);
}

export function mfa(config: MfaFactoryConfig) {
	const logger = createSecurityLogger("mfa");
	const issuer = config.issuer ?? "AuthApp";
	const totpHash: "SHA-1" | "SHA-256" | "SHA-512" =
		config.totpHash ?? "SHA-256";
	const rateLimitStorage = config.rateLimitStorage;
	const totpAttempts = new Map<string, { count: number; resetAt: number }>();
	const backupCodeAttempts = new Map<
		string,
		{ count: number; resetAt: number }
	>();
	const globalBackupCodeAttempts = new Map<
		string,
		{ count: number; resetAt: number }
	>();

	const MAX_TOTP_ATTEMPTS = 5;
	const MAX_BACKUP_CODE_ATTEMPTS = 10;
	const MAX_GLOBAL_BACKUP_CODE_ATTEMPTS = 20;
	const WINDOW_MS = 60 * 60 * 1000;

	if (!rateLimitStorage) {
		logger.warn(
			"MFA rate limiting using in-memory store. " +
				"Provide `rateLimitStorage` for production/serverless deployments.",
		);
	}

	async function checkRateLimit(
		key: string,
		attemptsMap: Map<string, { count: number; resetAt: number }>,
		maxAttempts: number,
	): Promise<boolean> {
		if (rateLimitStorage) {
			const { count } = await rateLimitStorage.increment(key, WINDOW_MS);
			return count < maxAttempts;
		}
		const now = Date.now();
		const entry = attemptsMap.get(key);

		if (!entry || now >= entry.resetAt) {
			attemptsMap.set(key, { count: 0, resetAt: now + WINDOW_MS });
			return true;
		}

		if (entry.count >= maxAttempts) {
			return false;
		}

		entry.count++;
		return true;
	}

	async function recordAttempt(
		key: string,
		attemptsMap: Map<string, { count: number; resetAt: number }>,
	): Promise<void> {
		if (rateLimitStorage) {
			return;
		}
		const now = Date.now();
		const entry = attemptsMap.get(key);

		if (!entry || now >= entry.resetAt) {
			attemptsMap.set(key, { count: 1, resetAt: now + WINDOW_MS });
		} else {
			entry.count++;
		}
	}

	async function resetRateLimit(
		key: string,
		attemptsMap: Map<string, { count: number; resetAt: number }>,
	): Promise<void> {
		if (rateLimitStorage) {
			await rateLimitStorage.reset(key);
		} else {
			attemptsMap.delete(key);
		}
	}

	async function generatePendingToken(userId: string): Promise<string> {
		const bytes = new Uint8Array(32);
		crypto.getRandomValues(bytes);
		let hex = "";
		for (let i = 0; i < bytes.length; i++) {
			hex += (bytes[i] as number).toString(16).padStart(2, "0");
		}

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

		const pendingTokenEntry: import("./types").PendingTokenEntry = {
			token,
			createdAt: Date.now(),
			expiresAt: Date.now() + 5 * 60 * 1000,
		};
		await config.storage.setPendingToken?.(userId, pendingTokenEntry);

		return token;
	}

	return {
		setup,
		verify,
		challenge,
		isEnabled,
		disable,
		generateTotpUri,
		verifyBackupCode,
		handleMfaSetup,
		handleMfaVerify,
		handleMfaChallenge,
		handleMfaDisable,
	};

	async function setup(userId: string): Promise<TotpSetupResult> {
		const existingSecret = await config.storage.getSecret(userId);
		if (existingSecret) {
			throw new AuthError(
				ErrorCodes.MFA_ALREADY_SETUP,
				"MFA is already configured. Disable it first to reconfigure.",
				{ statusCode: 400 },
			);
		}

		const secretBytes = new Uint8Array(20);
		crypto.getRandomValues(secretBytes);
		const secretKey = base32Encode(secretBytes);
		const encryptedSecret = await encrypt(secretKey, config.secret);

		const created = await config.storage.setSecretIfAbsent?.(
			userId,
			encryptedSecret,
		);
		if (created === false) {
			throw new AuthError(
				ErrorCodes.MFA_ALREADY_SETUP,
				"MFA is already configured. Disable it first to reconfigure.",
				{ statusCode: 400 },
			);
		}

		if (created === undefined) {
			await config.storage.setSecret(userId, encryptedSecret);
		}

		const backupCodes = generateBackupCodes();
		const hashedBackupCodes = await Promise.all(
			backupCodes.map((code) => sha256Hex(code)),
		);
		await config.storage.setBackupCodes(userId, hashedBackupCodes);

		const algorithmParam = totpHash === "SHA-1" ? "SHA1" : totpHash;
		const uri = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(userId)}?secret=${secretKey}&issuer=${encodeURIComponent(issuer)}&algorithm=${algorithmParam}&digits=${TOTP_DIGITS}&period=${TOTP_STEP}`;
		const pendingToken = await generatePendingToken(userId);

		return { secret: secretKey, uri, backupCodes, pendingToken };
	}

	async function verify(
		userId: string,
		code: string,
		request?: Request,
	): Promise<MfaVerifyResult> {
		if (code?.length !== 6 || !/^\d{6}$/.test(code)) {
			throw new AuthError(
				ErrorCodes.MFA_INVALID_CODE,
				"Invalid MFA code format",
				{
					statusCode: 400,
				},
			);
		}

		const totpKey = `totp:${userId}`;
		if (!(await checkRateLimit(totpKey, totpAttempts, MAX_TOTP_ATTEMPTS))) {
			throw new AuthError(
				ErrorCodes.RATE_LIMITED,
				"Too many TOTP attempts. Please try again later.",
				{ statusCode: 429 },
			);
		}

		const encryptedSecret = await config.storage.getSecret(userId);
		if (!encryptedSecret) {
			throw new AuthError(ErrorCodes.MFA_NOT_SETUP, "MFA not configured", {
				statusCode: 400,
			});
		}
		const secretKeyString = await decrypt(encryptedSecret, config.secret);
		const secretKey = base32Decode(secretKeyString);

		const now = Math.floor(Date.now() / 1000);
		const currentCounter = Math.floor(now / TOTP_STEP);
		const lastUsedCounter = await config.storage.getLastUsedCounter(userId);

		let valid = false;
		let usedCounter = currentCounter;

		for (const offset of [0, -1, 1] as const) {
			const counter = currentCounter + offset;

			if (lastUsedCounter !== null && counter <= lastUsedCounter) {
				continue;
			}
			const expectedCode = await generateTOTPCodeWithCounter(
				secretKey,
				counter,
				totpHash,
			);
			if (expectedCode === code) {
				valid = true;
				usedCounter = counter;
				break;
			}
		}

		if (valid) {
			await config.storage.setLastUsedCounter(userId, usedCounter);
			await resetRateLimit(totpKey, totpAttempts);
			return { success: true };
		}

		await recordAttempt(totpKey, totpAttempts);

		const allowedMethods = config.allowedMethods ?? ["totp", "backup_codes"];
		if (allowedMethods.includes("backup_codes")) {
			const backupResult = await verifyBackupCode(userId, code, request);
			if (backupResult) {
				const codes = await config.storage.getBackupCodes(userId);
				await resetRateLimit(`backup:${userId}`, backupCodeAttempts);
				return { success: true, backupCodes: codes ?? undefined };
			}
		}

		throw new AuthError(ErrorCodes.MFA_INVALID_CODE, "Invalid MFA code", {
			statusCode: 400,
		});
	}

	async function challenge(
		userId: string,
		method: MfaMethod,
		code: string,
	): Promise<MfaChallengeResult> {
		switch (method) {
			case "totp": {
				const result = await verify(userId, code);
				if (result.success) {
					return { success: true, method: "totp" };
				}
				break;
			}
			case "backup_codes": {
				const valid = await verifyBackupCode(userId, code);
				if (valid) {
					return { success: true, method: "backup_codes" };
				}
				break;
			}
		}
		throw new AuthError(ErrorCodes.MFA_INVALID_CODE, "Invalid MFA code", {
			statusCode: 400,
		});
	}

	async function isEnabled(userId: string): Promise<boolean> {
		const secret = await config.storage.getSecret(userId);
		return secret !== null;
	}

	async function disable(userId: string): Promise<void> {
		await config.storage.deleteSecret(userId);
		await config.storage.setBackupCodes(userId, []);
		await config.storage.setLastUsedCounter(userId, 0);
		await config.storage.deletePendingToken?.(userId);
		await resetRateLimit(`totp:${userId}`, totpAttempts);
		await resetRateLimit(`backup:${userId}`, backupCodeAttempts);
	}

	function generateTotpUri(userId: string, secret: string): string {
		const algorithmParam = totpHash === "SHA-1" ? "SHA1" : totpHash;
		return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(userId)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=${algorithmParam}&digits=${TOTP_DIGITS}&period=${TOTP_STEP}`;
	}

	async function verifyBackupCode(
		userId: string,
		code: string,
		request?: Request,
	): Promise<boolean> {
		const backupKey = `backup:${userId}`;
		if (
			!(await checkRateLimit(
				backupKey,
				backupCodeAttempts,
				MAX_BACKUP_CODE_ATTEMPTS,
			))
		) {
			return false;
		}

		if (request) {
			const ip = await getRequestIP(request);
			const globalKey = `backup:global:${ip}`;
			if (
				!(await checkRateLimit(
					globalKey,
					globalBackupCodeAttempts,
					MAX_GLOBAL_BACKUP_CODE_ATTEMPTS,
				))
			) {
				return false;
			}
		}

		const codes = await config.storage.getBackupCodes(userId);
		if (!codes || codes.length === 0) {
			return false;
		}
		const hashedInput = await sha256Hex(code);
		let foundIndex = -1;
		for (let i = 0; i < codes.length; i++) {
			const storedHash = codes[i] as string;
			const inputBytes = new TextEncoder().encode(hashedInput);
			const storedBytes = new TextEncoder().encode(storedHash);
			if (constantTimeCompare(inputBytes, storedBytes)) {
				foundIndex = i;
			}
		}
		if (foundIndex === -1) {
			await recordAttempt(backupKey, backupCodeAttempts);
			if (request) {
				const ip = await getRequestIP(request);
				const globalKey = `backup:global:${ip}`;
				await recordAttempt(globalKey, globalBackupCodeAttempts);
			}
			return false;
		}
		await config.storage.consumeBackupCode(userId, foundIndex);
		await resetRateLimit(backupKey, backupCodeAttempts);
		return true;
	}

	async function extractUserId(request: Request): Promise<string | null> {
		const cookies = parseCookies(request);
		const sessionCookie = cookies[SESSION_COOKIE_NAME];
		if (!sessionCookie) {
			return null;
		}
		try {
			const payload = await verifyToken<{ userId: string }>(
				sessionCookie,
				config.secret,
			);
			if (!payload) return null;
			return payload.userId ?? null;
		} catch {
			return null;
		}
	}

	async function handleMfaSetup(request: Request): Promise<Response> {
		if (request.method !== "POST") {
			return errorResponse(
				ErrorCodes.CREDENTIALS_VALIDATION_ERROR,
				"Method not allowed",
				405,
			);
		}

		const userId = await extractUserId(request);
		if (!userId) {
			return errorResponse(ErrorCodes.INVALID_TOKEN, "Unauthorized", 401);
		}

		try {
			const result = await setup(userId);
			return jsonResponse(result);
		} catch (error) {
			if (error instanceof AuthError) {
				return errorResponse(
					error.code,
					error.message,
					error.statusCode ?? 400,
				);
			}
			throw error;
		}
	}

	async function handleMfaVerify(request: Request): Promise<Response> {
		if (request.method !== "POST") {
			return errorResponse(
				ErrorCodes.CREDENTIALS_VALIDATION_ERROR,
				"Method not allowed",
				405,
			);
		}

		const userId = await extractUserId(request);
		if (!userId) {
			return errorResponse(ErrorCodes.INVALID_TOKEN, "Unauthorized", 401);
		}

		try {
			const { code } = (await request.json()) as { code: string };
			if (!code) {
				return errorResponse(
					ErrorCodes.CREDENTIALS_VALIDATION_ERROR,
					"Code is required",
					400,
				);
			}
			const result = await verify(userId, code);
			return jsonResponse(result);
		} catch (error) {
			if (error instanceof AuthError) {
				return errorResponse(
					error.code,
					error.message,
					error.statusCode ?? 400,
				);
			}
			throw error;
		}
	}

	async function handleMfaChallenge(request: Request): Promise<Response> {
		if (request.method !== "POST") {
			return errorResponse(
				ErrorCodes.CREDENTIALS_VALIDATION_ERROR,
				"Method not allowed",
				405,
			);
		}

		let body: { userId: string; method: MfaMethod; code: string };
		try {
			body = (await request.json()) as {
				userId: string;
				method: MfaMethod;
				code: string;
			};
		} catch {
			return errorResponse(
				ErrorCodes.CREDENTIALS_VALIDATION_ERROR,
				"Invalid JSON body",
				400,
			);
		}

		const { userId, method, code } = body;
		if (!userId || !method || !code) {
			return errorResponse(
				ErrorCodes.CREDENTIALS_VALIDATION_ERROR,
				"userId, method, and code are required",
				400,
			);
		}

		try {
			const result = await challenge(userId, method, code);
			return jsonResponse(result);
		} catch (error) {
			if (error instanceof AuthError) {
				return errorResponse(
					error.code,
					error.message,
					error.statusCode ?? 400,
				);
			}
			throw error;
		}
	}

	async function handleMfaDisable(request: Request): Promise<Response> {
		if (request.method !== "POST") {
			return errorResponse(
				ErrorCodes.CREDENTIALS_VALIDATION_ERROR,
				"Method not allowed",
				405,
			);
		}

		const userId = await extractUserId(request);
		if (!userId) {
			return errorResponse(ErrorCodes.INVALID_TOKEN, "Unauthorized", 401);
		}

		try {
			const { password } = (await request.json()) as { password: string };
			if (!password) {
				return errorResponse(
					ErrorCodes.CREDENTIALS_VALIDATION_ERROR,
					"Password is required",
					400,
				);
			}

			if (config.verifyPassword) {
				const valid = await config.verifyPassword(userId, password);
				if (!valid) {
					return errorResponse(
						ErrorCodes.INVALID_CREDENTIALS,
						"Invalid password",
						401,
					);
				}
			}

			await disable(userId);
			const clearCookie = clearSessionCookie(SESSION_COOKIE_NAME);
			return jsonResponse({ success: true }, 200, [clearCookie]);
		} catch (error) {
			if (error instanceof AuthError) {
				return errorResponse(
					error.code,
					error.message,
					error.statusCode ?? 400,
				);
			}
			throw error;
		}
	}
}
