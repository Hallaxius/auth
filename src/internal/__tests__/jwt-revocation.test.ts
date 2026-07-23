import { beforeEach, describe, expect, it } from "bun:test";
import {
	revokeToken,
	setTokenRevocationStorage,
	signToken,
	verifyToken,
} from "../internal/jwt";
import { MemoryTokenRevocationStorage } from "../internal/jwt-revocation";

describe("JWT Token Revocation", () => {
	const secret = "test-secret-key-with-at-least-32-characters-for-security";
	let storage: MemoryTokenRevocationStorage;

	beforeEach(() => {
		storage = new MemoryTokenRevocationStorage();
		setTokenRevocationStorage(storage);
	});

	it("should verify a valid token", async () => {
		const payload = { userId: "123", username: "test" };
		const token = await signToken(payload, secret, "1h");

		const verified = await verifyToken<typeof payload>(token, secret);
		expect(verified).not.toBeNull();
		expect(verified?.userId).toBe("123");
	});

	it("should reject a revoked token", async () => {
		const payload = { userId: "123", username: "test" };
		const token = await signToken(payload, secret, "1h");

		const revoked = await revokeToken(token, secret);
		expect(revoked).toBe(true);

		const verified = await verifyToken<typeof payload>(token, secret);
		expect(verified).toBeNull();
	});

	it("should not revoke an invalid token", async () => {
		const revoked = await revokeToken("invalid.token.here", secret);
		expect(revoked).toBe(false);
	});

	it("should keep non-revoked tokens valid", async () => {
		const payload1 = { userId: "123", username: "test1" };
		const payload2 = { userId: "456", username: "test2" };

		const token1 = await signToken(payload1, secret, "1h");
		const token2 = await signToken(payload2, secret, "1h");

		await revokeToken(token1, secret);

		const verified1 = await verifyToken<typeof payload1>(token1, secret);
		const verified2 = await verifyToken<typeof payload2>(token2, secret);

		expect(verified1).toBeNull();
		expect(verified2).not.toBeNull();
		expect(verified2?.userId).toBe("456");
	});

	it("should handle token revocation with storage", async () => {
		const payload = { userId: "123", username: "test" };
		const _token = await signToken(payload, secret, "1h");

		const isRevokedBefore = await storage.isRevoked("test-jti");
		expect(isRevokedBefore).toBe(false);

		await storage.revoke("test-jti", 3600);

		const isRevokedAfter = await storage.isRevoked("test-jti");
		expect(isRevokedAfter).toBe(true);
	});
});
