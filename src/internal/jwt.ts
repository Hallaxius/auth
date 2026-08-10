import { jwtVerify, SignJWT } from "jose";
import { ConfigurationError } from "../errors";
import type { TokenRevocationStorage } from "../types";
import { validateJwtSecret } from "../utils/validation";

const ISO8601_DURATION_REGEX = /^(\d+)([smhd])$/;
const DURATION_TO_SECONDS: Record<string, number> = {
	s: 1,
	m: 60,
	h: 3600,
	d: 86400,
};

export function secretToKey(secret: string): Uint8Array {
	validateJwtSecret(secret);
	return new TextEncoder().encode(secret);
}

export function parseExpiresIn(expiresIn: string | number): string {
	if (typeof expiresIn === "number") {
		return `${expiresInToSeconds(expiresIn)}s`;
	}
	if (typeof expiresIn === "string") {
		const match = expiresIn.match(ISO8601_DURATION_REGEX);
		if (!match) {
			throw new ConfigurationError(
				"expiresIn must be a number (seconds) or ISO 8601 duration string (e.g., '7d', '1h', '30m')",
			);
		}
		void expiresInToSeconds(expiresIn);
		return expiresIn;
	}
	throw new ConfigurationError("expiresIn must be a number or string");
}

export function expiresInToSeconds(expiresIn: string | number): number {
	if (typeof expiresIn === "number") {
		if (!Number.isInteger(expiresIn) || expiresIn <= 0) {
			throw new ConfigurationError(
				"expiresIn must be a positive integer (seconds)",
			);
		}
		return expiresIn;
	}
	if (typeof expiresIn === "string") {
		const match = expiresIn.match(ISO8601_DURATION_REGEX);
		if (!match) {
			throw new ConfigurationError(
				"expiresIn must be a number (seconds) or ISO 8601 duration string (e.g., '7d', '1h', '30m')",
			);
		}
		const value = Number.parseInt(match[1] as string, 10);
		if (value <= 0) {
			throw new ConfigurationError("expiresIn duration must be positive");
		}
		return value * DURATION_TO_SECONDS[match[2] as string]!;
	}
	throw new ConfigurationError("expiresIn must be a number or string");
}

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

export async function signRefreshToken(
	payload: Record<string, unknown>,
	secret: string,
	expiresIn: string | number = "7d",
): Promise<string> {
	return signRefreshTokenWithJti(
		payload,
		secret,
		expiresIn,
		crypto.randomUUID(),
	);
}

export async function signRefreshTokenWithJti(
	payload: Record<string, unknown>,
	secret: string,
	expiresIn: string | number,
	jti: string,
): Promise<string> {
	const exp = parseExpiresIn(expiresIn);

	const payloadWithJti = { ...payload, jti, type: "refresh" };

	return new SignJWT(payloadWithJti)
		.setProtectedHeader({ alg: "HS256" })
		.setIssuedAt()
		.setExpirationTime(exp)
		.sign(secretToKey(secret));
}

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
