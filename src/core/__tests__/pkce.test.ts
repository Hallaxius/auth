import { describe, expect, it } from "bun:test";
import {
	generateCodeChallenge,
	generateCodeVerifier,
	generatePKCE,
	isValidCodeChallenge,
	isValidCodeVerifier,
} from "../config";

describe("PKCE Functions", () => {
	describe("generateCodeVerifier", () => {
		it("generates a valid code_verifier", () => {
			const verifier = generateCodeVerifier();
			expect(verifier).toBeTruthy();
			expect(isValidCodeVerifier(verifier)).toBe(true);
		});

		it("generates different verifiers on each call", () => {
			const v1 = generateCodeVerifier();
			const v2 = generateCodeVerifier();
			expect(v1).not.toBe(v2);
		});

		it("generates URL-safe base64 string", () => {
			const verifier = generateCodeVerifier();
			// Should not contain + / or =
			expect(verifier).not.toContain("+");
			expect(verifier).not.toContain("/");
			expect(verifier).not.toContain("=");
		});

		it("generates string with correct length (43 chars for 32 bytes)", () => {
			const verifier = generateCodeVerifier();
			// 32 bytes = 256 bits = 43 base64 chars (without padding)
			expect(verifier.length).toBe(43);
		});
	});

	describe("generateCodeChallenge", () => {
		it("generates a valid code_challenge from verifier", async () => {
			const verifier = generateCodeVerifier();
			const challenge = await generateCodeChallenge(verifier);
			expect(challenge).toBeTruthy();
			expect(isValidCodeChallenge(challenge)).toBe(true);
		});

		it("generates different challenges for different verifiers", async () => {
			const v1 = generateCodeVerifier();
			const v2 = generateCodeVerifier();
			const c1 = await generateCodeChallenge(v1);
			const c2 = await generateCodeChallenge(v2);
			expect(c1).not.toBe(c2);
		});

		it("generates same challenge for same verifier", async () => {
			const verifier = generateCodeVerifier();
			const c1 = await generateCodeChallenge(verifier);
			const c2 = await generateCodeChallenge(verifier);
			expect(c1).toBe(c2);
		});

		it("generates URL-safe base64 string", async () => {
			const verifier = generateCodeVerifier();
			const challenge = await generateCodeChallenge(verifier);
			expect(challenge).not.toContain("+");
			expect(challenge).not.toContain("/");
			expect(challenge).not.toContain("=");
		});

		it("generates 43 character string (SHA-256 hash)", async () => {
			const verifier = generateCodeVerifier();
			const challenge = await generateCodeChallenge(verifier);
			// SHA-256 produces 32 bytes = 43 base64 chars
			expect(challenge.length).toBe(43);
		});

		it("handles invalid verifier gracefully", async () => {
			// A função não lança erro, apenas gera um hash do que recebe
			const challenge = await generateCodeChallenge("invalid");
			expect(challenge).toBeTruthy();
		});
	});

	describe("generatePKCE", () => {
		it("generates verifier and challenge", async () => {
			const pkce = await generatePKCE();
			expect(pkce).toHaveProperty("codeVerifier");
			expect(pkce).toHaveProperty("codeChallenge");
			expect(pkce).toHaveProperty("codeChallengeMethod");
			expect(pkce.codeChallengeMethod).toBe("S256");
		});

		it("generates valid verifier and challenge", async () => {
			const pkce = await generatePKCE();
			expect(isValidCodeVerifier(pkce.codeVerifier)).toBe(true);
			expect(isValidCodeChallenge(pkce.codeChallenge)).toBe(true);
		});

		it("challenge is derived from verifier", async () => {
			const pkce = await generatePKCE();
			const expectedChallenge = await generateCodeChallenge(pkce.codeVerifier);
			expect(pkce.codeChallenge).toBe(expectedChallenge);
		});
	});

	describe("isValidCodeVerifier", () => {
		it("returns true for valid verifier", () => {
			const verifier = generateCodeVerifier();
			expect(isValidCodeVerifier(verifier)).toBe(true);
		});

		it("returns false for too short string", () => {
			expect(isValidCodeVerifier("abc")).toBe(false);
		});

		it("returns false for too long string", () => {
			const longString = "a".repeat(129);
			expect(isValidCodeVerifier(longString)).toBe(false);
		});

		it("returns false for string with invalid characters", () => {
			expect(isValidCodeVerifier("abc+def")).toBe(false);
			expect(isValidCodeVerifier("abc/def")).toBe(false);
			expect(isValidCodeVerifier("abc=def")).toBe(false);
			expect(isValidCodeVerifier("abc def")).toBe(false);
		});

		it("returns true for valid length base64url string", () => {
			// Gerar um verifier válido e modificar levemente
			const verifier = generateCodeVerifier();
			// Substituir último caractere por um válido
			const modified = `${verifier.slice(0, -1)}a`;
			expect(isValidCodeVerifier(modified)).toBe(true);
		});
	});

	describe("isValidCodeChallenge", () => {
		it("returns true for valid challenge", async () => {
			const verifier = generateCodeVerifier();
			const challenge = await generateCodeChallenge(verifier);
			expect(isValidCodeChallenge(challenge)).toBe(true);
		});

		it("returns false for too short string", () => {
			expect(isValidCodeChallenge("abc")).toBe(false);
		});

		it("returns false for too long string", () => {
			const longString = "a".repeat(129);
			expect(isValidCodeChallenge(longString)).toBe(false);
		});

		it("returns false for string with invalid characters", () => {
			expect(isValidCodeChallenge("abc+def")).toBe(false);
			expect(isValidCodeChallenge("abc/def")).toBe(false);
		});
	});
});
