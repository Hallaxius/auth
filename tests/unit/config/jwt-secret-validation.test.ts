import { describe, expect, it } from "bun:test";
import { ConfigurationError, validateSecretEntropy } from "../../../src/";

describe("JWT Secret Validation", () => {
	it("should accept a strong secret with 32+ characters", () => {
		const strongSecret =
			"5K8qN2mR9pL3vX7wJ4tY6hF1dS0aG8bC2eU5iO9xM3nZ7kV4rW1qP6yT0uI8oA2";
		expect(() => validateSecretEntropy(strongSecret)).not.toThrow();
	});

	it("should reject a secret shorter than 32 characters", () => {
		const shortSecret = "short-secret";
		expect(() => validateSecretEntropy(shortSecret)).toThrow(
			"JWT secret too short",
		);
		expect(() => validateSecretEntropy(shortSecret)).toThrow(ConfigurationError);
	});

	it("should reject a secret with low entropy (repetitive single char)", () => {
		const weakSecret = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
		expect(() => validateSecretEntropy(weakSecret)).toThrow(
			"JWT secret is too weak",
		);
		expect(() => validateSecretEntropy(weakSecret)).toThrow(ConfigurationError);
	});

	it("should reject a secret with low entropy even when not in production", () => {
		const lowEntropySecret = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
		expect(() => validateSecretEntropy(lowEntropySecret)).toThrow(
			ConfigurationError,
		);
	});

	it("should reject a secret with insufficient Shannon entropy (4.0 bits/char min)", () => {
		const lowEntropySecret = "aaaaabbbbbccccc1111122222ABcdefgh";
		expect(() => validateSecretEntropy(lowEntropySecret)).toThrow(
			"JWT secret entropy is too low",
		);
	});

	it("should reject a secret with low character variety (less than 3 types)", () => {
		const lowVarietySecret = "abcdefghijklmnopqrstuvwxyz012345";
		expect(() => validateSecretEntropy(lowVarietySecret)).toThrow(
			"JWT secret lacks character variety",
		);
	});

	it("should reject a secret with repetitive pattern", () => {
		const repetitiveSecret = "abc123abc123abc123abc123abc123abc1";
		expect(() => validateSecretEntropy(repetitiveSecret)).toThrow(
			"JWT secret has low entropy",
		);
	});

	it("should accept a strong secret with 32+ characters and high entropy", () => {
		const strongSecret =
			"5K8qN2mR9pL3vX7wJ4tY6hF1dS0aG8bC2eU5iO9xM3nZ7kV4rW1qP6yT0uI8oA2";
		expect(() => validateSecretEntropy(strongSecret)).not.toThrow();
	});

	it("should accept a secret with mixed characters", () => {
		const mixedSecret =
			"Str0ng_S3cr3t!With#Special$Chars&Diversity2024";
		expect(() => validateSecretEntropy(mixedSecret)).not.toThrow();
	});

	it("should reject a secret shorter than 32 characters with ConfigurationError", () => {
		const secret = "short";
		expect(() => validateSecretEntropy(secret)).toThrow(ConfigurationError);
		expect(() => validateSecretEntropy(secret)).toThrow(
			"JWT secret too short",
		);
	});

	it("should reject empty secret with ConfigurationError", () => {
		const secret = "";
		expect(() => validateSecretEntropy(secret)).toThrow(ConfigurationError);
	});

	it("should reject null/undefined secret with ConfigurationError", () => {
		expect(() => validateSecretEntropy(null as unknown as string)).toThrow(
			ConfigurationError,
		);
		expect(() =>
			validateSecretEntropy(undefined as unknown as string),
		).toThrow(ConfigurationError);
	});
});

