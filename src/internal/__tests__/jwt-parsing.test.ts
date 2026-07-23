import { afterEach, describe, expect, it } from "bun:test";
import { parseExpiresIn, secretToKey } from "../jwt";
import { ConfigurationError } from "../../errors";

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
		expect(() => parseExpiresIn(undefined as unknown as string | number)).toThrow(
			ConfigurationError,
		);
		expect(() =>
			parseExpiresIn({} as unknown as string | number),
		).toThrow(ConfigurationError);
	});
});

describe("secretToKey", () => {
	it("should accept secret with exactly 32 characters", () => {
		const secret = "12345678901234567890123456789012";
		const key = secretToKey(secret);
		expect(key).toBeInstanceOf(Uint8Array);
		expect(key.length).toBe(32);
	});

	it("should accept secret with 100 characters", () => {
		const secret = "a".repeat(100);
		const key = secretToKey(secret);
		expect(key).toBeInstanceOf(Uint8Array);
		expect(key.length).toBe(100);
	});

	it("should accept secret longer than 32 characters", () => {
		const secret = "1234567890123456789012345678901234567890123456789012345678901234";
		const key = secretToKey(secret);
		expect(key).toBeInstanceOf(Uint8Array);
		expect(key.length).toBe(64);
	});

	it("should reject secret with 31 characters", () => {
		const secret = "1234567890123456789012345678901";
		expect(() => secretToKey(secret)).toThrow(ConfigurationError);
		expect(() => secretToKey(secret)).toThrow(
			"JWT secret must be at least 32 characters",
		);
	});

	it("should reject secret shorter than 32 characters", () => {
		const secret = "short";
		expect(() => secretToKey(secret)).toThrow(ConfigurationError);
		expect(() => secretToKey(secret)).toThrow(
			"JWT secret must be at least 32 characters",
		);
	});

	it("should reject empty secret", () => {
		const secret = "";
		expect(() => secretToKey(secret)).toThrow(ConfigurationError);
	});

	it("should correctly encode secret to Uint8Array", () => {
		const secret = "test-secret-key-32-chars-long!!1";
		const key = secretToKey(secret);
		const decoded = new TextDecoder().decode(key);
		expect(decoded).toBe(secret);
	});

	it("should handle unicode characters in secret", () => {
		const secret = "测试密钥 -12345678901234567890123456";
		const key = secretToKey(secret);
		expect(key).toBeInstanceOf(Uint8Array);
		expect(key.length).toBeGreaterThan(32);
	});

	it("should handle special characters in secret", () => {
		const secret = "!@#$%^&*()_+-=[]{}|;':\",./<>?`~1";
		const key = secretToKey(secret);
		expect(key).toBeInstanceOf(Uint8Array);
		const decoded = new TextDecoder().decode(key);
		expect(decoded).toBe(secret);
	});
});

describe("character variety validation in production", () => {
	const originalEnv = process.env.NODE_ENV;

	afterEach(() => {
		process.env.NODE_ENV = originalEnv;
	});

	it("should accept secret with character variety in production", () => {
		process.env.NODE_ENV = "production";
		const secret = "Str0ng_S3cr3t!With#Special$Chars123";
		expect(() => secretToKey(secret)).not.toThrow();
	});

	it("should accept alphanumeric secret in non-production", () => {
		process.env.NODE_ENV = "development";
		const secret = "OnlyLettersAndNumbers123456789012345";
		expect(() => secretToKey(secret)).not.toThrow();
	});

	it("should accept secret with only lowercase in non-production", () => {
		process.env.NODE_ENV = "test";
		const secret = "abcdefghijklmnopqrstuvwxyz123456";
		expect(() => secretToKey(secret)).not.toThrow();
	});
});
