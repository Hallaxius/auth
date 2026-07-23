import { jwtVerify, SignJWT } from "jose";
import { ConfigurationError } from "../errors";
import type { TokenRevocationStorage } from "../types";

const ISO8601_DURATION_REGEX = /^(\d+)([smhd])$/;

/**
 * Converts a secret string to a Uint8Array key for JWT signing/verification
 * @param secret - The secret string (must be at least 32 characters)
 * @returns Uint8Array encoded secret
 * @throws {ConfigurationError} If secret is less than 32 characters
 * @security Secret must be cryptographically secure random string with high entropy
 */
export function secretToKey(secret: string): Uint8Array {
	if (secret.length < 32) {
		throw new ConfigurationError(
			`JWT secret must be at least 32 characters (256 bits). Got ${secret.length} characters.`,
		);
	}
	return new TextEncoder().encode(secret);
}

/**
 * Parses and validates expiresIn parameter for JWT token expiration
 * @param expiresIn - Expiration time as number (seconds) or ISO 8601 duration string (e.g., '7d', '1h', '30m')
 * @returns Normalized ISO 8601 duration string
 * @throws {ConfigurationError} If expiresIn is invalid or negative
 * @example
 * parseExpiresIn(3600) // returns "3600s"
 * parseExpiresIn("7d") // returns "7d"
 * parseExpiresIn("1h") // returns "1h"
 */
export function parseExpiresIn(expiresIn: string | number): string {
	if (typeof expiresIn === "number") {
		if (!Number.isInteger(expiresIn) || expiresIn <= 0) {
			throw new ConfigurationError(
				"expiresIn must be a positive integer (seconds)",
			);
		}
		return `${expiresIn}s`;
	}
	if (typeof expiresIn === "string") {
		const match = expiresIn.match(ISO8601_DURATION_REGEX);
		if (!match) {
			throw new ConfigurationError(
				"expiresIn must be a number (seconds) or ISO 8601 duration string (e.g., '7d', '1h', '30m')",
			);
		}
		const value = Number.parseInt(match[1] as string, 10);
		const _unit = match[2] as string;
		if (value <= 0) {
			throw new ConfigurationError("expiresIn duration must be positive");
		}
		return expiresIn;
	}
	throw new ConfigurationError("expiresIn must be a number or string");
}

/**
 * Signs a JWT access token with HS256 algorithm
 * @param payload - Token payload (user data, claims)
 * @param secret - Signing secret (minimum 32 characters)
 * @param expiresIn - Token expiration (default: "15m")
 * @returns Signed JWT token string
 * @throws {ConfigurationError} If secret is invalid or expiresIn is malformed
 * @security
 * - Uses HS256 algorithm
 * - Automatically adds jti (unique token ID) for revocation support
 * - Secret must be at least 32 characters with high entropy
 */
export async function signToken(
	payload: Record<string, unknown>,
	secret: string,
	expiresIn: string | number = "15m",
): Promise<string> {
	const exp = parseExpiresIn(expiresIn);
	const jti = crypto.randomUUID();

	const payloadWithJti = { ...payload, jti };

	return new SignJWT(payloadWithJti)
		.setProtectedHeader({ alg: "HS256" })
		.setIssuedAt()
		.setExpirationTime(exp)
		.sign(secretToKey(secret));
}

/**
 * Signs a JWT refresh token with HS256 algorithm
 * @param payload - Token payload (user data, claims)
 * @param secret - Signing secret (minimum 32 characters)
 * @param expiresIn - Token expiration (default: "7d")
 * @returns Signed JWT refresh token string
 * @throws {ConfigurationError} If secret is invalid or expiresIn is malformed
 * @security
 * - Uses HS256 algorithm
 * - Automatically adds jti (unique token ID) and type: "refresh" claims
 * - Longer expiration than access tokens (default 7 days)
 * - Secret must be at least 32 characters with high entropy
 */
export async function signRefreshToken(
	payload: Record<string, unknown>,
	secret: string,
	expiresIn: string | number = "7d",
): Promise<string> {
	const exp = parseExpiresIn(expiresIn);
	const jti = crypto.randomUUID();

	const payloadWithJti = { ...payload, jti, type: "refresh" };

	return new SignJWT(payloadWithJti)
		.setProtectedHeader({ alg: "HS256" })
		.setIssuedAt()
		.setExpirationTime(exp)
		.sign(secretToKey(secret));
}

/**
 * Verifies a JWT token and returns payload if valid
 * @param token - JWT token to verify
 * @param secret - Verification secret
 * @param revocationStorage - Optional storage to check token revocation status
 * @returns Decoded payload if valid and not revoked, null otherwise
 * @throws Never - returns null on any verification failure
 * @security
 * - Validates HS256 algorithm
 * - Checks token expiration automatically
 * - Optionally checks revocation status via jti claim
 * - Returns null instead of throwing to prevent information leakage
 */
export async function verifyToken<T extends Record<string, unknown>>(
	token: string,
	secret: string,
	revocationStorage?: TokenRevocationStorage,
): Promise<T | null> {
	try {
		const { payload } = await jwtVerify(token, secretToKey(secret), {
			algorithms: ["HS256"],
		});

		if (revocationStorage && payload.jti) {
			const isRevoked = await revocationStorage.isRevoked(
				payload.jti as string,
			);
			if (isRevoked) {
				return null;
			}
		}

		return payload as T;
	} catch {
		return null;
	}
}

/**
 * Revokes a JWT token by adding its jti to the revocation storage
 * @param token - JWT token to revoke
 * @param secret - Verification secret
 * @param revocationStorage - Storage interface for revoked tokens
 * @returns true if successfully revoked, false if token is invalid
 * @throws Never - returns false on any verification failure
 * @security
 * - Extracts jti from token and stores it with TTL
 * - TTL is calculated from token's remaining expiration time
 * - Revoked tokens will fail verification in verifyToken()
 */
export async function revokeToken(
	token: string,
	secret: string,
	revocationStorage: TokenRevocationStorage,
): Promise<boolean> {
	try {
		const { payload } = await jwtVerify(token, secretToKey(secret), {
			algorithms: ["HS256"],
		});

		if (!payload.jti) {
			return false;
		}

		const ttlSeconds = payload.exp
			? Math.max(1, payload.exp - Math.floor(Date.now() / 1000))
			: 3600;

		await revocationStorage.revoke(payload.jti as string, ttlSeconds);
		return true;
	} catch {
		return false;
	}
}
