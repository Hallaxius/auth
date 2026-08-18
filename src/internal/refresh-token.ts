import type { TokenRevocationStorage } from "../types";
import {
	expiresInToSeconds,
	signRefreshTokenWithJti,
	verifyToken,
} from "./jwt";

export interface RefreshTokenManagerConfig {
	secret: string;
	expiresIn?: string | number;
	issuer?: string;
	revocationStorage: TokenRevocationStorage;
	familyTracking?: boolean;
}

export interface RefreshTokenPayload {
	userId: string;
	familyId?: string;
	jti: string;
	iat: number;
	exp: number;
	type: "refresh";
	[key: string]: unknown;
}

export class RefreshTokenManager {
	private secret: string;
	private expiresIn: string | number;
	private issuer?: string;
	private revocationStorage: TokenRevocationStorage;
	private familyTracking: boolean;

	constructor(config: RefreshTokenManagerConfig) {
		this.secret = config.secret;
		this.expiresIn = config.expiresIn ?? "7d";
		this.issuer = config.issuer;
		this.revocationStorage = config.revocationStorage;
		this.familyTracking = config.familyTracking ?? true;
	}

	private get hasFamilyApi(): boolean {
		return (
			typeof this.revocationStorage.revokeFamily === "function" &&
			typeof this.revocationStorage.isFamilyRevoked === "function" &&
			typeof this.revocationStorage.registerFamilyMember === "function"
		);
	}

	async issueRefreshToken(
		userId: string,
		familyId?: string,
	): Promise<{ token: string; familyId: string; jti: string }> {
		const newFamilyId = familyId ?? crypto.randomUUID();
		const jti = crypto.randomUUID();

		const token = await signRefreshTokenWithJti(
			{ userId, familyId: newFamilyId },
			this.secret,
			this.expiresIn,
			jti,
		);

		if (this.familyTracking && this.hasFamilyApi) {
			await this.revocationStorage.registerFamilyMember?.(
				newFamilyId,
				jti,
				userId,
				this.tokenTtlSeconds(),
			);
		}

		return { token, familyId: newFamilyId, jti };
	}

	async rotateRefreshToken(
		oldToken: string,
	): Promise<{ token: string; familyId: string; jti: string } | null> {
		const payload = await verifyToken<RefreshTokenPayload>(
			oldToken,
			this.secret,
		);

		if (payload?.type !== "refresh" || !payload.jti) {
			return null;
		}

		const oldJti = payload.jti as string;
		const remainingSeconds = this.remainingSeconds(payload.exp);

		if (this.familyTracking && payload.familyId && this.hasFamilyApi) {
			const reused = await this.detectReuse(payload.familyId, oldJti);
			if (reused) {
				await this.revokeFamily(payload.familyId, remainingSeconds);
				return null;
			}
		}

		if (typeof this.revocationStorage.revokeIfPresent === "function") {
			let revoked: boolean;
			try {
				revoked = await this.revocationStorage.revokeIfPresent(
					oldJti,
					remainingSeconds,
				);
			} catch {
				return null;
			}
			if (!revoked) {
				return null;
			}
		} else {
			try {
				const alreadyRevoked = await this.revocationStorage.isRevoked(oldJti);
				if (alreadyRevoked) {
					return null;
				}
				await this.revocationStorage.revoke(oldJti, remainingSeconds);
			} catch {
				return null;
			}
		}

		return this.issueRefreshToken(payload.userId, payload.familyId);
	}

	private async detectReuse(
		familyId: string,
		currentJti: string,
	): Promise<boolean> {
		const familyRevoked =
			await this.revocationStorage.isFamilyRevoked?.(familyId);
		if (familyRevoked) {
			return true;
		}

		return await this.revocationStorage.isRevoked(currentJti);
	}

	private async revokeFamily(
		familyId: string,
		ttlSeconds: number,
	): Promise<void> {
		await this.revocationStorage.revokeFamily?.(familyId, ttlSeconds);
	}

	async validateRefreshToken(
		token: string,
	): Promise<{ userId: string; familyId?: string } | null> {
		const payload = await verifyToken<RefreshTokenPayload>(token, this.secret);

		if (payload?.type !== "refresh") {
			return null;
		}

		const isRevoked = await this.revocationStorage.isRevoked(payload.jti);
		if (isRevoked) {
			return null;
		}

		if (
			this.familyTracking &&
			payload.familyId &&
			typeof this.revocationStorage.isFamilyRevoked === "function"
		) {
			const familyRevoked = await this.revocationStorage.isFamilyRevoked(
				payload.familyId,
			);
			if (familyRevoked) {
				return null;
			}
		}

		return { userId: payload.userId, familyId: payload.familyId };
	}

	async revokeToken(token: string): Promise<void> {
		const payload = await verifyToken<RefreshTokenPayload>(token, this.secret);

		if (payload?.jti) {
			const remainingSeconds = payload.exp
				? payload.exp - Math.floor(Date.now() / 1000)
				: 60;
			await this.revocationStorage.revoke(
				payload.jti,
				Math.max(60, remainingSeconds),
			);
		}
	}

	async revokeAllUserTokens(userId: string): Promise<void> {
		if (typeof this.revocationStorage.revokeAllForUser === "function") {
			await this.revocationStorage.revokeAllForUser(
				userId,
				this.tokenTtlSeconds(),
			);
		}
	}

	private tokenTtlSeconds(): number {
		return Math.max(60, Math.floor(expiresInToSeconds(this.expiresIn)));
	}

	private remainingSeconds(exp?: number): number {
		if (!exp) return 60;
		return Math.max(60, exp - Math.floor(Date.now() / 1000));
	}
}
