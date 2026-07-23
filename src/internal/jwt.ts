import { jwtVerify, SignJWT } from "jose";
import { ConfigurationError } from "../errors";
import type { TokenRevocationStorage } from "../types";

const ISO8601_DURATION_REGEX = /^(\d+)([smhd])$/;

let _revocationStorage: TokenRevocationStorage | null = null;

export function setTokenRevocationStorage(
	storage: TokenRevocationStorage,
): void {
	_revocationStorage = storage;
}

export function getTokenRevocationStorage(): TokenRevocationStorage | null {
	return _revocationStorage;
}

export function secretToKey(secret: string): Uint8Array {
	return new TextEncoder().encode(secret);
}

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

export async function verifyToken<T extends Record<string, unknown>>(
	token: string,
	secret: string,
): Promise<T | null> {
	try {
		const { payload } = await jwtVerify(token, secretToKey(secret), {
			algorithms: ["HS256"],
		});

		if (_revocationStorage && payload.jti) {
			const isRevoked = await _revocationStorage.isRevoked(
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
): Promise<boolean> {
	try {
		const payload = await verifyToken<
			Record<string, unknown> & { jti: string; exp?: number }
		>(token, secret);
		if (!payload?.jti) {
			return false;
		}

		if (!_revocationStorage) {
			console.warn(
				"[jwt] Token revocation storage not configured. Token not revoked.",
			);
			return false;
		}

		const ttlSeconds = payload.exp
			? Math.max(1, payload.exp - Math.floor(Date.now() / 1000))
			: 3600;

		await _revocationStorage.revoke(payload.jti as string, ttlSeconds);
		return true;
	} catch {
		return false;
	}
}
