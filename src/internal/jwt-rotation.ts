import { jwtVerify, SignJWT } from "jose";
import type { TokenRevocationStorage } from "../types";
import { secretToKey } from "./jwt";

export async function rotateToken(
	oldToken: string,
	secret: string,
	issuer?: string,
	revocationStorage?: TokenRevocationStorage,
): Promise<string | null> {
	try {
		const { payload } = await jwtVerify(oldToken, secretToKey(secret), {
			algorithms: ["HS256"],
			issuer,
		});

		if (revocationStorage && payload.jti) {
			const remainingSeconds = payload.exp
				? payload.exp - Math.floor(Date.now() / 1000)
				: 3600;

			if (remainingSeconds > 0) {
				const ttlSeconds = Math.max(60, remainingSeconds);
				await revocationStorage.revoke(payload.jti as string, ttlSeconds);
			}
		}

		const newJti = crypto.randomUUID();
		const newPayload = {
			...payload,
			jti: newJti,
			iat: undefined,
			exp: undefined,
			type: undefined,
		};

		const signer = new SignJWT(newPayload)
			.setProtectedHeader({ alg: "HS256" })
			.setIssuedAt()
			.setExpirationTime(
				payload.exp ? payload.exp - (payload.iat as number) : "15m",
			);

		if (issuer || payload.iss) {
			signer.setIssuer(issuer ?? (payload.iss as string));
		}

		return signer.sign(secretToKey(secret));
	} catch {
		return null;
	}
}
