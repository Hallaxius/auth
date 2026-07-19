import { jwtVerify, SignJWT } from "jose";

export function secretToKey(secret: string): Uint8Array {
	return new TextEncoder().encode(secret);
}

export async function signToken(
	payload: Record<string, unknown>,
	secret: string,
	expiresIn: string | number = "7d",
): Promise<string> {
	const exp = typeof expiresIn === "number" ? `${expiresIn}s` : expiresIn;

	return new SignJWT(payload)
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
		const { payload } = await jwtVerify(token, secretToKey(secret));
		return payload as T;
	} catch {
		return null;
	}
}
