import { describe, expect, test } from "bun:test";
import { signToken, verifyToken } from "../jwt";

const SECRET = "test-secret-key-12345";

describe("signToken / verifyToken", () => {
	test("sign and verify roundtrip", async () => {
		const token = await signToken(
			{ discordId: "123", username: "test" },
			SECRET,
		);
		expect(token).toBeString();

		const payload = await verifyToken<{ discordId: string; username: string }>(
			token,
			SECRET,
		);
		expect(payload).not.toBeNull();
		expect(payload?.discordId).toBe("123");
		expect(payload?.username).toBe("test");
	});

	test("verify rejects invalid token", async () => {
		const payload = await verifyToken("invalid-token", SECRET);
		expect(payload).toBeNull();
	});

	test("verify with wrong secret returns null", async () => {
		const token = await signToken({ discordId: "123" }, SECRET);
		const payload = await verifyToken(token, "wrong-secret");
		expect(payload).toBeNull();
	});

	test("sign with custom expiresIn", async () => {
		const token = await signToken({ discordId: "123" }, SECRET, "1h");
		expect(token).toBeString();

		const payload = await verifyToken(token, SECRET);
		expect(payload).not.toBeNull();
	});

	test("sign with numeric expiresIn", async () => {
		const token = await signToken({ discordId: "123" }, SECRET, 3600);
		expect(token).toBeString();

		const payload = await verifyToken(token, SECRET);
		expect(payload).not.toBeNull();
	});
});
