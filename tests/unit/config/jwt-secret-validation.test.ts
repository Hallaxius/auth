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
			"JWT secret must be at least 32 characters",
		);
		expect(() => validateSecretEntropy(shortSecret)).toThrow(ConfigurationError);
	});

	it("should reject a secret with low entropy in production", () => {
		const originalNodeEnv = process.env.NODE_ENV;
		process.env.NODE_ENV = "production";
		try {
			const lowEntropySecret = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
			expect(() => validateSecretEntropy(lowEntropySecret)).toThrow(
				"JWT secret has low entropy",
			);
			expect(() => validateSecretEntropy(lowEntropySecret)).toThrow(
				ConfigurationError,
			);
		} finally {
			process.env.NODE_ENV = originalNodeEnv;
		}
	});

	it("should accept a secret with mixed characters", () => {
		const mixedSecret = "Str0ng_S3cr3t!With#Special$Chars";
		expect(() => validateSecretEntropy(mixedSecret)).not.toThrow();
	});

	it("should reject a secret shorter than 32 characters with ConfigurationError", () => {
		const secret = "short";
		expect(() => validateSecretEntropy(secret)).toThrow(ConfigurationError);
		expect(() => validateSecretEntropy(secret)).toThrow(
			"JWT secret must be at least 32 characters",
		);
	});

	it("should reject empty secret with ConfigurationError", () => {
		const secret = "";
		expect(() => validateSecretEntropy(secret)).toThrow(ConfigurationError);
	});
});
