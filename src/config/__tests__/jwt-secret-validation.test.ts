import { describe, expect, it } from "bun:test";
import { validateSecretEntropy } from "../config/schema";

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
	});

	it("should reject a secret with low entropy", () => {
		const lowEntropySecret = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
		expect(() => validateSecretEntropy(lowEntropySecret)).toThrow(
			"JWT secret has low entropy",
		);
	});

	it("should reject a secret lacking character variety", () => {
		const noSpecialChars = "OnlyLettersAndNumbers1234567890";
		expect(() => validateSecretEntropy(noSpecialChars)).toThrow(
			"JWT secret lacks character variety",
		);
	});

	it("should accept a secret with mixed characters", () => {
		const mixedSecret = "Str0ng_S3cr3t!With#Special$Chars";
		expect(() => validateSecretEntropy(mixedSecret)).not.toThrow();
	});
});
