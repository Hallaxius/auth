import { describe, expect, it } from "bun:test";
import {
	MemoryTokenRevocationStorage,
	type TokenRevocationStorage,
} from "../../../src/";
import {
	RefreshTokenManager,
	type RefreshTokenManagerConfig,
} from "../../../src/internal/refresh-token";

const secret = "refresh-token-test-secret-at-least-32-chars!!";

function createManager(
	storage: MemoryTokenRevocationStorage,
	overrides: Partial<RefreshTokenManagerConfig> = {},
): RefreshTokenManager {
	return new RefreshTokenManager({
		secret,
		expiresIn: "1h",
		revocationStorage: storage,
		...overrides,
	});
}

describe("RefreshTokenManager - rotation and reuse detection", () => {
	it("issues a token registered in a family", async () => {
		const storage = new MemoryTokenRevocationStorage();
		const manager = createManager(storage);

		const issued = await manager.issueRefreshToken("user-1");

		expect(issued.token).toBeTruthy();
		expect(issued.familyId).toBeTruthy();
		expect(issued.jti).toBeTruthy();
		expect(await storage.isRevoked(issued.jti)).toBe(false);
		expect(await storage.isFamilyRevoked(issued.familyId)).toBe(false);
	});

	it("rotates normally when the old token was never used", async () => {
		const storage = new MemoryTokenRevocationStorage();
		const manager = createManager(storage);

		const first = await manager.issueRefreshToken("user-1");
		const rotated = await manager.rotateRefreshToken(first.token);

		expect(rotated).not.toBeNull();
		expect(rotated?.familyId).toBe(first.familyId);
		expect(rotated?.jti).not.toBe(first.jti);

		expect(await storage.isRevoked(first.jti)).toBe(true);
		const validated = await manager.validateRefreshToken(rotated!.token);
		expect(validated?.userId).toBe("user-1");
		expect(validated?.familyId).toBe(first.familyId);
	});

	it("detects replay of a rotated jti and revokes the whole family", async () => {
		const storage = new MemoryTokenRevocationStorage();
		const manager = createManager(storage);

		const first = await manager.issueRefreshToken("user-1");
		const rotated = await manager.rotateRefreshToken(first.token);
		expect(rotated).not.toBeNull();

		const replay = await manager.rotateRefreshToken(first.token);

		expect(replay).toBeNull();
		expect(await storage.isFamilyRevoked(first.familyId)).toBe(true);

		const newest = await manager.validateRefreshToken(rotated!.token);
		expect(newest).toBeNull();
	});

	it("rejects a token from a revoked family", async () => {
		const storage = new MemoryTokenRevocationStorage();
		const manager = createManager(storage);

		const first = await manager.issueRefreshToken("user-1");
		await storage.revokeFamily(first.familyId, 3600);

		const validated = await manager.validateRefreshToken(first.token);
		expect(validated).toBeNull();
	});

	it("invalid token / wrong type returns null", async () => {
		const storage = new MemoryTokenRevocationStorage();
		const manager = createManager(storage);

		expect(await manager.rotateRefreshToken("not.a.token")).toBeNull();
	});

	it("revokes a token for its remaining lifetime (min 60s)", async () => {
		const storage = new MemoryTokenRevocationStorage();
		const manager = createManager(storage);

		const issued = await manager.issueRefreshToken("user-1");
		await manager.revokeToken(issued.token);

		expect(await storage.isRevoked(issued.jti)).toBe(true);
		expect(await manager.validateRefreshToken(issued.token)).toBeNull();
	});

	it("revokeAllUserTokens kills every family of the user", async () => {
		const storage = new MemoryTokenRevocationStorage();
		const manager = createManager(storage);

		const a = await manager.issueRefreshToken("user-1");
		const literalB = await manager.issueRefreshToken("user-1");
		expect(a.familyId).not.toBe(literalB.familyId);

		await manager.revokeAllUserTokens("user-1");

		expect(await storage.isFamilyRevoked(a.familyId)).toBe(true);
		expect(await storage.isFamilyRevoked(literalB.familyId)).toBe(true);

		expect(await manager.validateRefreshToken(a.token)).toBeNull();
		expect(await manager.validateRefreshToken(literalB.token)).toBeNull();
	});

	it("does not revoke families of other users", async () => {
		const storage = new MemoryTokenRevocationStorage();
		const manager = createManager(storage);

		const victim = await manager.issueRefreshToken("victim");
		const attacker = await manager.issueRefreshToken("attacker");

		await manager.revokeAllUserTokens("attacker");

		expect(await storage.isFamilyRevoked(victim.familyId)).toBe(false);
		expect(await storage.isFamilyRevoked(attacker.familyId)).toBe(true);
		expect((await manager.validateRefreshToken(victim.token))?.userId).toBe(
			"victim",
		);
	});

	it("falls back to plain rotation when storage has no family API", async () => {
		const plain = new PlainStorage();
		const manager = new RefreshTokenManager({
			secret,
			expiresIn: "1h",
			revocationStorage: plain as unknown as TokenRevocationStorage,
		});

		const first = await manager.issueRefreshToken("user-1");
		const rotated = await manager.rotateRefreshToken(first.token);

		expect(rotated).not.toBeNull();
	});
});

class PlainStorage {
	private revoked = new Set<string>();
	async isRevoked(jti: string): Promise<boolean> {
		return this.revoked.has(jti);
	}
	async revoke(jti: string): Promise<void> {
		this.revoked.add(jti);
	}
}
