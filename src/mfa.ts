import { AuthError, ErrorCodes } from "./errors";
import { parseCookies } from "./internal/cookies";
import { decrypt, encrypt } from "./internal/crypto-aes";
import { verifyToken } from "./internal/jwt";
import type {
	MfaChallengeResult,
	MfaFactoryConfig,
	MfaMethod,
	MfaVerifyResult,
	TotpSetupResult,
} from "./types";

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

async function _generateTOTPCode(secret: string): Promise<string> {
	const key = base32Decode(secret);
	const now = Math.floor(Date.now() / 1000);
	const counter = Math.floor(now / TOTP_STEP);
	return generateTOTPCodeWithCounter(key, counter);
}

async function generateTOTPCodeWithCounter(
	key: Uint8Array,
	counter: number,
): Promise<string> {
	const counterBuf = new Uint8Array(8);
	const view = new DataView(counterBuf.buffer);
	view.setBigUint64(0, BigInt(counter), false);

	const cryptoKey = await crypto.subtle.importKey(
		"raw",
		key.buffer as ArrayBuffer,
		{ name: "HMAC", hash: "SHA-1" },
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

function generatePendingToken(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	let hex = "";
	for (let i = 0; i < bytes.length; i++) {
		hex += (bytes[i] as number).toString(16).padStart(2, "0");
	}
	return hex;
}

async function sha256Hex(input: string): Promise<string> {
	const data = new TextEncoder().encode(input);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	return Array.from(new Uint8Array(hashBuffer))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

function jsonResponse(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

function errorResponse(code: string, message: string, status = 400): Response {
	return jsonResponse({ error: message, code }, status);
}

export function mfa(config: MfaFactoryConfig) {
	const issuer = config.issuer ?? "AuthApp";

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
		await config.storage.setSecret(userId, encryptedSecret);

		const backupCodes = generateBackupCodes();
		const hashedBackupCodes = await Promise.all(
			backupCodes.map((code) => sha256Hex(code)),
		);
		await config.storage.setBackupCodes(userId, hashedBackupCodes);

		const uri = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(userId)}?secret=${secretKey}&issuer=${encodeURIComponent(issuer)}`;
		const pendingToken = generatePendingToken();

		return { secret: secretKey, uri, backupCodes, pendingToken };
	}

	async function verify(
		userId: string,
		code: string,
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
			);
			if (expectedCode === code) {
				valid = true;
				usedCounter = counter;
				break;
			}
		}

		if (valid) {
			await config.storage.setLastUsedCounter(userId, usedCounter);
			return { success: true };
		}

		const backupResult = await verifyBackupCode(userId, code);
		if (backupResult) {
			const codes = await config.storage.getBackupCodes(userId);
			return { success: true, backupCodes: codes ?? undefined };
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
	}

	function generateTotpUri(userId: string, secret: string): string {
		return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(userId)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`;
	}

	async function verifyBackupCode(
		userId: string,
		code: string,
	): Promise<boolean> {
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
			return false;
		}
		await config.storage.consumeBackupCode(userId, foundIndex);
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

		try {
			const { userId, method, code } = (await request.json()) as {
				userId: string;
				method: MfaMethod;
				code: string;
			};
			if (!userId || !method || !code) {
				return errorResponse(
					ErrorCodes.CREDENTIALS_VALIDATION_ERROR,
					"userId, method, and code are required",
					400,
				);
			}
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
			return jsonResponse({ success: true });
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

function constantTimeCompare(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) {
		return false;
	}
	let result = 0;
	for (let i = 0; i < a.length; i++) {
		result |= a[i]! ^ b[i]!;
	}
	return result === 0;
}
