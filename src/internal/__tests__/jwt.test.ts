import { describe, expect, test } from "vitest";
import { ConfigurationError } from "../../errors";
import { parseExpiresIn, secretToKey, signToken, verifyToken } from "../jwt";

const TEST_SECRET = "test-secret-key-32-chars-long-for-jwt!!";

describe("secretToKey", () => {
	test("returns Uint8Array from string", () => {
		const key = secretToKey(TEST_SECRET);
		expect(key).toBeInstanceOf(Uint8Array);
		expect(key.length).toBe(TEST_SECRET.length);
	});
});

describe("parseExpiresIn", () => {
	test("accepts positive integer number", () => {
		expect(parseExpiresIn(3600)).toBe("3600s");
	});

	test("accepts zero for number (throws)", () => {
		expect(() => parseExpiresIn(0)).toThrow(ConfigurationError);
	});

	test("throws for negative number", () => {
		expect(() => parseExpiresIn(-1)).toThrow(ConfigurationError);
	});

	test("throws for non-integer number", () => {
		expect(() => parseExpiresIn(1.5)).toThrow(ConfigurationError);
	});

	test("accepts valid ISO 8601 duration string", () => {
		expect(parseExpiresIn("7d")).toBe("7d");
		expect(parseExpiresIn("1h")).toBe("1h");
		expect(parseExpiresIn("30m")).toBe("30m");
		expect(parseExpiresIn("60s")).toBe("60s");
	});

	test("throws for invalid duration string", () => {
		expect(() => parseExpiresIn("invalid")).toThrow(ConfigurationError);
	});

	test("throws for string with zero value", () => {
		expect(() => parseExpiresIn("0d")).toThrow(ConfigurationError);
	});

	test("throws for non-number non-string", () => {
		expect(() => parseExpiresIn(true as never)).toThrow(ConfigurationError);
	});

	test("throws for empty string", () => {
		expect(() => parseExpiresIn("")).toThrow(ConfigurationError);
	});
});

describe("signToken and verifyToken", () => {
	test("signs and verifies a token", async () => {
		const payload = { userId: "user-1", role: "admin" };
		const token = await signToken(payload, TEST_SECRET, "1h");
		expect(token).toBeTruthy();
		expect(typeof token).toBe("string");

		const verified = await verifyToken<Record<string, unknown>>(
			token,
			TEST_SECRET,
		);
		expect(verified).not.toBeNull();
		expect(verified?.userId).toBe("user-1");
		expect(verified?.role).toBe("admin");
		expect(verified?.jti).toBeTruthy();
	});

	test("signs with default expiry", async () => {
		const token = await signToken({ test: true }, TEST_SECRET);
		const verified = await verifyToken<Record<string, unknown>>(
			token,
			TEST_SECRET,
		);
		expect(verified).not.toBeNull();
	});

	test("returns null for invalid token", async () => {
		const result = await verifyToken("invalid-token", TEST_SECRET);
		expect(result).toBeNull();
	});

	test("returns null for tampered token", async () => {
		const token = await signToken({ userId: "user-1" }, TEST_SECRET, "1h");
		const tampered = `${token.slice(0, -5)}xxxxx`;
		const result = await verifyToken(tampered, TEST_SECRET);
		expect(result).toBeNull();
	});

	test("returns null for wrong secret", async () => {
		const token = await signToken({ userId: "user-1" }, TEST_SECRET, "1h");
		const result = await verifyToken(
			token,
			"wrong-secret-32-chars-long-for-testing!",
		);
		expect(result).toBeNull();
	});

	test("includes jti in payload", async () => {
		const token = await signToken({ userId: "user-1" }, TEST_SECRET, "1h");
		const verified = await verifyToken<Record<string, unknown>>(
			token,
			TEST_SECRET,
		);
		expect(verified?.jti).toBeTruthy();
		expect(typeof verified?.jti).toBe("string");
	});

	test("signs with number expiresIn", async () => {
		const token = await signToken({ test: true }, TEST_SECRET, 3600);
		const verified = await verifyToken<Record<string, unknown>>(
			token,
			TEST_SECRET,
		);
		expect(verified).not.toBeNull();
	});
});
