import { describe, expect, test } from "bun:test";
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

describe("deriveKey with varied secret sizes", () => {
	test("works with 16-byte secret", async () => {
		const secret = "1234567890123456";
		const plaintext = "test-data";
		const encrypted = await encrypt(plaintext, secret);
		const decrypted = await decrypt(encrypted, secret);
		expect(decrypted).toBe(plaintext);
	});

	test("works with 32-byte secret", async () => {
		const secret = "12345678901234567890123456789012";
		const plaintext = "test-data";
		const encrypted = await encrypt(plaintext, secret);
		const decrypted = await decrypt(encrypted, secret);
		expect(decrypted).toBe(plaintext);
	});

	test("works with 64-byte secret", async () => {
		const secret = "1234567890123456789012345678901234567890123456789012345678901234";
		const plaintext = "test-data";
		const encrypted = await encrypt(plaintext, secret);
		const decrypted = await decrypt(encrypted, secret);
		expect(decrypted).toBe(plaintext);
	});
});

describe("hexEncode / hexDecode round-trip (via encrypt/decrypt)", () => {
	test("round-trip validates hex encoding/decoding internally", async () => {
		const secret = "test-secret-key-32-chars-long!!";
		const plaintext = "hello-world";
		const encrypted = await encrypt(plaintext, secret);
		const parts = encrypted.split(":");

		expect(parts).toHaveLength(4);
		const [saltHex, ivHex, tagHex, ciphertextHex] = parts;

		expect(saltHex).toMatch(/^[0-9a-f]+$/);
		expect(ivHex).toMatch(/^[0-9a-f]+$/);
		expect(tagHex).toMatch(/^[0-9a-f]+$/);
		expect(ciphertextHex).toMatch(/^[0-9a-f]+$/);

		const decrypted = await decrypt(encrypted, secret);
		expect(decrypted).toBe(plaintext);
	});

	test("hex format is consistent across multiple encryptions", async () => {
		const secret = "test-secret-key-32-chars-long!!";
		const plaintext = "test-data";

		for (let i = 0; i < 5; i++) {
			const encrypted = await encrypt(plaintext, secret);
			const parts = encrypted.split(":");
			expect(parts).toHaveLength(4);

			for (const part of parts) {
				expect(part).toMatch(/^[0-9a-f]+$/);
			}
		}
	});
});

describe("encrypt / decrypt with empty inputs", () => {
	const secret = "test-secret-key-32-chars-long!!";

	test("encrypt and decrypt empty string", async () => {
		const plaintext = "";
		const encrypted = await encrypt(plaintext, secret);
		expect(encrypted.split(":")).toHaveLength(4);

		const decrypted = await decrypt(encrypted, secret);
		expect(decrypted).toBe("");
	});

	test("encrypt and decrypt single character", async () => {
		const plaintext = "a";
		const encrypted = await encrypt(plaintext, secret);
		const decrypted = await decrypt(encrypted, secret);
		expect(decrypted).toBe("a");
	});

	test("encrypt and decrypt unicode characters", async () => {
		const plaintext = "Hello 世界 🌍";
		const encrypted = await encrypt(plaintext, secret);
		const decrypted = await decrypt(encrypted, secret);
		expect(decrypted).toBe(plaintext);
	});
});

describe("encrypt with same plaintext generates different ciphertext", () => {
	const secret = "test-secret-key-32-chars-long!!";

	test("same plaintext produces different ciphertext (random IV)", async () => {
		const plaintext = "identical-text";
		const results = new Set<string>();

		for (let i = 0; i < 10; i++) {
			const encrypted = await encrypt(plaintext, secret);
			results.add(encrypted);
		}

		expect(results.size).toBe(10);
	});

	test("different secrets produce different ciphertexts", async () => {
		const plaintext = "same-plaintext";
		const secret1 = "secret-key-1-32-chars-long!!!!";
		const secret2 = "secret-key-2-32-chars-long!!!!";

		const encrypted1 = await encrypt(plaintext, secret1);
		const encrypted2 = await encrypt(plaintext, secret2);

		expect(encrypted1).not.toBe(encrypted2);
	});
});
