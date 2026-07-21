import { describe, expect, test } from "vitest";
import { decrypt, encrypt } from "../crypto-aes";

describe("crypto-aes", () => {
	const secret = "test-secret-key-32-chars-long!!";

	test("encrypt and decrypt roundtrip", async () => {
		const plaintext = "hello-world-secret-123";
		const encrypted = await encrypt(plaintext, secret);
		expect(encrypted).not.toBe(plaintext);
		expect(encrypted.split(":")).toHaveLength(4);

		const decrypted = await decrypt(encrypted, secret);
		expect(decrypted).toBe(plaintext);
	});

	test("produces different ciphertext each time", async () => {
		const plaintext = "same-text";
		const a = await encrypt(plaintext, secret);
		const b = await encrypt(plaintext, secret);
		expect(a).not.toBe(b);
	});

	test("fails with wrong secret", async () => {
		const encrypted = await encrypt("sensitive-data", secret);
		await expect(
			decrypt(encrypted, "wrong-secret-32-chars-long!!!!!"),
		).rejects.toThrow();
	});

	test("fails with tampered ciphertext", async () => {
		const encrypted = await encrypt("data", secret);
		const parts = encrypted.split(":");
		parts[3] = "ff".repeat(parts[3].length / 2);
		await expect(decrypt(parts.join(":"), secret)).rejects.toThrow();
	});

	test("fails with invalid encrypted format", async () => {
		await expect(decrypt("invalid-format", secret)).rejects.toThrow(
			"Invalid encrypted format",
		);
	});
});
