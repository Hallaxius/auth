import { afterEach, describe, expect, it } from "bun:test";
import { ConfigurationError, parseExpiresIn, secretToKey } from "../../../src/";

const STRONG_SECRET = "5K8qN2mR9pL3vX7wJ4tY6hF1dS0aG8bC2eU5iO9xM3nZ7kV4rW1qP6yT0uI8oA2";

describe("parseExpiresIn", () => {
	it("should parse duration string '7d' (7 days)", () => {
		const result = parseExpiresIn("7d");
		expect(result).toBe("7d");
	});

	it("should parse duration string '1h' (1 hour)", () => {
		const result = parseExpiresIn("1h");
		expect(result).toBe("1h");
	});

	it("should parse duration string '30m' (30 minutes)", () => {
		const result = parseExpiresIn("30m");
		expect(result).toBe("30m");
	});

	it("should parse duration string '60s' (60 seconds)", () => {
		const result = parseExpiresIn("60s");
		expect(result).toBe("60s");
	});

	it("should parse number 3600 as '3600s'", () => {
		const result = parseExpiresIn(3600);
		expect(result).toBe("3600s");
	});

	it("should parse number 900 as '900s'", () => {
		const result = parseExpiresIn(900);
		expect(result).toBe("900s");
	});

	it("should parse number 1 as '1s'", () => {
		const result = parseExpiresIn(1);
		expect(result).toBe("1s");
	});

	it("should throw for invalid string format", () => {
		expect(() => parseExpiresIn("invalid")).toThrow(ConfigurationError);
		expect(() => parseExpiresIn("7 days")).toThrow(ConfigurationError);
		expect(() => parseExpiresIn("1 hour")).toThrow(ConfigurationError);
		expect(() => parseExpiresIn("30 minutes")).toThrow(ConfigurationError);
		expect(() => parseExpiresIn("")).toThrow(ConfigurationError);
	});

	it("should throw for zero or negative numbers", () => {
		expect(() => parseExpiresIn(0)).toThrow(ConfigurationError);
		expect(() => parseExpiresIn(-1)).toThrow(ConfigurationError);
		expect(() => parseExpiresIn(-100)).toThrow(ConfigurationError);
	});

	it("should throw for zero duration string", () => {
		expect(() => parseExpiresIn("0d")).toThrow(ConfigurationError);
		expect(() => parseExpiresIn("0h")).toThrow(ConfigurationError);
		expect(() => parseExpiresIn("0m")).toThrow(ConfigurationError);
		expect(() => parseExpiresIn("0s")).toThrow(ConfigurationError);
	});

	it("should throw for non-integer numbers", () => {
		expect(() => parseExpiresIn(3600.5)).toThrow(ConfigurationError);
		expect(() => parseExpiresIn(1.1)).toThrow(ConfigurationError);
	});

	it("should throw for invalid type", () => {
		expect(() => parseExpiresIn(null as unknown as string | number)).toThrow(
			ConfigurationError,
		);
		expect(() =>
			parseExpiresIn(undefined as unknown as string | number),
		).toThrow(ConfigurationError);
		expect(() => parseExpiresIn({} as unknown as string | number)).toThrow(
			ConfigurationError,
		);
	});
});

describe("secretToKey", () => {
	it("should accept strong secret with 32+ characters", () => {
		const key = secretToKey(STRONG_SECRET);
		expect(key).toBeInstanceOf(Uint8Array);
		expect(key.length).toBe(63);
	});

	it("should accept secret longer than 32 characters", () => {
		const secret = STRONG_SECRET + "extra-chars-appended";
		const key = secretToKey(secret);
		expect(key).toBeInstanceOf(Uint8Array);
		expect(key.length).toBe(secret.length);
	});

	it("should reject secret with 31 characters", () => {
		const secret = "1234567890123456789012345678901";
		expect(() => secretToKey(secret)).toThrow(ConfigurationError);
		expect(() => secretToKey(secret)).toThrow(
			"JWT secret too short",
		);
	});

	it("should reject secret shorter than 32 characters", () => {
		const secret = "short";
		expect(() => secretToKey(secret)).toThrow(ConfigurationError);
		expect(() => secretToKey(secret)).toThrow(
			"JWT secret too short",
		);
	});

	it("should reject empty secret", () => {
		const secret = "";
		expect(() => secretToKey(secret)).toThrow(ConfigurationError);
	});

	it("should correctly encode secret to Uint8Array", () => {
		const key = secretToKey(STRONG_SECRET);
		const decoded = new TextDecoder().decode(key);
		expect(decoded).toBe(STRONG_SECRET);
	});

	it("should reject secret with low character variety (all digits)", () => {
		const secret = "12345678901234567890123456789012";
		expect(() => secretToKey(secret)).toThrow(ConfigurationError);
		expect(() => secretToKey(secret)).toThrow(
			"JWT secret entropy is too low",
		);
	});

	it("should reject secret with low character variety (repetitive)", () => {
		const secret = "a".repeat(100);
		expect(() => secretToKey(secret)).toThrow(ConfigurationError);
		expect(() => secretToKey(secret)).toThrow(
			"JWT secret is too weak",
		);
	});

	it("should reject secret with low Shannon entropy", () => {
		const secret = "Abcdefghij1Abcdefghij1Abcdefghij1!";
		expect(() => secretToKey(secret)).toThrow(ConfigurationError);
		expect(() => secretToKey(secret)).toThrow(
			"JWT secret entropy is too low",
		);
	});
});

describe("character variety validation", () => {
	it("should accept secret with full character variety", () => {
		const secret = "Str0ng_S3cr3t!With#Special$Chars123";
		expect(() => secretToKey(secret)).not.toThrow();
	});

	it("should reject secret with only digits (low variety)", () => {
		const secret = "0123456789012345678901234567890123";
		expect(() => secretToKey(secret)).toThrow(ConfigurationError);
		expect(() => secretToKey(secret)).toThrow(
			"JWT secret has low entropy",
		);
	});

	it("should reject secret with only lowercase and digits (low variety)", () => {
		const secret = "abcdefghijklmnopqrstuvwxyz1234567890";
		expect(() => secretToKey(secret)).toThrow(ConfigurationError);
		expect(() => secretToKey(secret)).toThrow(
			"JWT secret lacks character variety",
		);
	});
});

