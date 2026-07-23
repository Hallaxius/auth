import { describe, test, expect, beforeEach } from "bun:test";
import { encrypt, decrypt } from "../crypto-aes";

describe("Crypto AES-GCM - Complete Coverage", () => {
	describe("encrypt/decrypt round-trip", () => {
		const testCases = [
			{ name: "empty string", value: "" },
			{ name: "single character", value: "a" },
			{ name: "short text", value: "Hello World" },
			{ name: "unicode characters", value: "Olá 世界 🌍" },
			{ name: "special characters", value: "!@#$%^&*()_+-=[]{}|;':\",./<>?" },
			{ name: "newlines and tabs", value: "Line1\nLine2\tTab" },
			{ name: "long text (1KB)", value: "x".repeat(1024) },
			{ name: "very long text (10KB)", value: "y".repeat(10240) },
			{ name: "json object", value: JSON.stringify({ key: "value", num: 42 }) },
			{ name: "array", value: JSON.stringify([1, 2, 3, "test"]) },
			{ name: "null bytes", value: "test\u0000null" },
			{ name: "whitespace only", value: "   \t\n   " },
		];

		test.each(testCases)("$name", async ({ value }) => {
			const secret = "a".repeat(32);
			const encrypted = await encrypt(value, secret);
			const decrypted = await decrypt(encrypted, secret);
			expect(decrypted).toBe(value);
		});

		test("different secrets produce different ciphertexts", async () => {
			const plaintext = "test message";
			const secret1 = "a".repeat(32);
			const secret2 = "b".repeat(32);

			const encrypted1 = await encrypt(plaintext, secret1);
			const encrypted2 = await encrypt(plaintext, secret2);

			expect(encrypted1).not.toBe(encrypted2);

			await expect(decrypt(encrypted1, secret2)).rejects.toThrow();
			await expect(decrypt(encrypted2, secret1)).rejects.toThrow();
		});

		test("same plaintext produces different ciphertexts (random IV)", async () => {
			const plaintext = "identical message";
			const secret = "a".repeat(32);

			const encrypted1 = await encrypt(plaintext, secret);
			const encrypted2 = await encrypt(plaintext, secret);

			expect(encrypted1).not.toBe(encrypted2);

			const decrypted1 = await decrypt(encrypted1, secret);
			const decrypted2 = await decrypt(encrypted2, secret);

			expect(decrypted1).toBe(plaintext);
			expect(decrypted2).toBe(plaintext);
		});
	});

	describe("IV randomness validation", () => {
		test("IV is randomly generated for each encryption", async () => {
			const secret = "a".repeat(32);
			const plaintext = "test";
			const iterations = 100;
			const ciphertexts = new Set<string>();

			for (let i = 0; i < iterations; i++) {
				const encrypted = await encrypt(plaintext, secret);
				ciphertexts.add(encrypted);
			}

			expect(ciphertexts.size).toBe(iterations);
		});

		test("IV is 16 bytes (128 bits)", async () => {
			const secret = "a".repeat(32);
			const encrypted = await encrypt("test", secret);
			const parts = encrypted.split(":");

			expect(parts).toHaveLength(4);
			const [salt, iv, tag, ciphertext] = parts;

			expect(salt).toHaveLength(32);
			expect(iv).toHaveLength(32);
			expect(tag).toHaveLength(32);
		});
	});

	describe("error handling", () => {
		test("decrypt with invalid format throws", async () => {
			const secret = "a".repeat(32);

			await expect(decrypt("invalid", secret)).rejects.toThrow(
				"Invalid encrypted format",
			);
			await expect(decrypt("a:b:c", secret)).rejects.toThrow(
				"Invalid encrypted format",
			);
			await expect(decrypt("a:b:c:d:e", secret)).rejects.toThrow(
				"Invalid encrypted format",
			);
			await expect(decrypt("", secret)).rejects.toThrow(
				"Invalid encrypted format",
			);
		});

		test("decrypt with tampered ciphertext throws", async () => {
			const secret = "a".repeat(32);
			const plaintext = "original message";
			const encrypted = await encrypt(plaintext, secret);

			const parts = encrypted.split(":");
			const tamperedCiphertext = parts[3]!.split("").reverse().join("");
			const tampered = `${parts[0]}:${parts[1]}:${parts[2]}:${tamperedCiphertext}`;

			await expect(decrypt(tampered, secret)).rejects.toThrow();
		});

		test("decrypt with wrong tag throws", async () => {
			const secret = "a".repeat(32);
			const plaintext = "message";
			const encrypted = await encrypt(plaintext, secret);

			const parts = encrypted.split(":");
			const wrongTag = "00000000000000000000000000000000";
			const tampered = `${parts[0]}:${parts[1]}:${wrongTag}:${parts[3]}`;

			await expect(decrypt(tampered, secret)).rejects.toThrow();
		});

		test("decrypt with corrupted salt throws", async () => {
			const secret = "a".repeat(32);
			const plaintext = "test";
			const encrypted = await encrypt(plaintext, secret);

			const parts = encrypted.split(":");
			const wrongSalt = "ffffffffffffffffffffffffffffffff";
			const tampered = `${wrongSalt}:${parts[1]}:${parts[2]}:${parts[3]}`;

			await expect(decrypt(tampered, secret)).rejects.toThrow();
		});
	});

	describe("key derivation edge cases", () => {
		test("minimum length secret (32 chars)", async () => {
			const secret = "a".repeat(32);
			const plaintext = "test";
			const encrypted = await encrypt(plaintext, secret);
			const decrypted = await decrypt(encrypted, secret);
			expect(decrypted).toBe(plaintext);
		});

		test("long secret (1000 chars)", async () => {
			const secret = "a".repeat(1000);
			const plaintext = "test";
			const encrypted = await encrypt(plaintext, secret);
			const decrypted = await decrypt(encrypted, secret);
			expect(decrypted).toBe(plaintext);
		});

		test("unicode secret", async () => {
			const secret = "🔐🔑🗝️".repeat(10);
			const plaintext = "test message";
			const encrypted = await encrypt(plaintext, secret);
			const decrypted = await decrypt(encrypted, secret);
			expect(decrypted).toBe(plaintext);
		});

		test("secret with special characters", async () => {
			const secret = "!@#$%^&*()_+-=[]{}|;':\",./<>?";
			const plaintext = "test";
			const encrypted = await encrypt(plaintext, secret);
			const decrypted = await decrypt(encrypted, secret);
			expect(decrypted).toBe(plaintext);
		});
	});

	describe("performance benchmarks", () => {
		test("encrypt performance (100 iterations)", async () => {
			const secret = "a".repeat(32);
			const plaintext = "test message for performance";
			const iterations = 100;

			const start = performance.now();
			for (let i = 0; i < iterations; i++) {
				await encrypt(plaintext, secret);
			}
			const end = performance.now();

			const avgTime = (end - start) / iterations;
			console.log(`Average encrypt time: ${avgTime.toFixed(2)}ms`);
			expect(avgTime).toBeLessThan(100);
		});

		test("decrypt performance (100 iterations)", async () => {
			const secret = "a".repeat(32);
			const plaintext = "test message for performance";
			const encrypted = await encrypt(plaintext, secret);
			const iterations = 100;

			const start = performance.now();
			for (let i = 0; i < iterations; i++) {
				await decrypt(encrypted, secret);
			}
			const end = performance.now();

			const avgTime = (end - start) / iterations;
			console.log(`Average decrypt time: ${avgTime.toFixed(2)}ms`);
			expect(avgTime).toBeLessThan(100);
		});

		test("key derivation performance", async () => {
			const secret = "a".repeat(32);
			const plaintext = "test";
			const iterations = 50;

			const start = performance.now();
			for (let i = 0; i < iterations; i++) {
				await encrypt(plaintext, secret);
			}
			const end = performance.now();

			const totalTime = end - start;
			console.log(`Key derivation total time (${iterations} iterations): ${totalTime.toFixed(2)}ms`);
			expect(totalTime).toBeLessThan(10000);
		});

		test("large payload performance (100KB)", async () => {
			const secret = "a".repeat(32);
			const plaintext = "x".repeat(102400);

			const start = performance.now();
			const encrypted = await encrypt(plaintext, secret);
			const encryptTime = performance.now() - start;

			const decryptStart = performance.now();
			const decrypted = await decrypt(encrypted, secret);
			const decryptTime = performance.now() - decryptStart;

			console.log(`Large payload - Encrypt: ${encryptTime.toFixed(2)}ms, Decrypt: ${decryptTime.toFixed(2)}ms`);
			expect(decrypted).toBe(plaintext);
			expect(encryptTime).toBeLessThan(1000);
			expect(decryptTime).toBeLessThan(1000);
		});
	});

	describe("format validation", () => {
		test("encrypted format is salt:iv:tag:ciphertext", async () => {
			const secret = "a".repeat(32);
			const encrypted = await encrypt("test", secret);
			const parts = encrypted.split(":");

			expect(parts).toHaveLength(4);

			const [salt, iv, tag, ciphertext] = parts;

			expect(salt).toMatch(/^[0-9a-f]{32}$/);
			expect(iv).toMatch(/^[0-9a-f]{32}$/);
			expect(tag).toMatch(/^[0-9a-f]{32}$/);
			expect(ciphertext).toMatch(/^[0-9a-f]+$/);
		});

		test("hex encoding is lowercase", async () => {
			const secret = "a".repeat(32);
			const encrypted = await encrypt("test", secret);

			expect(encrypted).toBe(encrypted.toLowerCase());
		});
	});

	describe("deterministic salt", () => {
		test("salt is randomly generated", async () => {
			const secret = "a".repeat(32);
			const plaintext = "test";
			const salts = new Set<string>();

			for (let i = 0; i < 10; i++) {
				const encrypted = await encrypt(plaintext, secret);
				const salt = encrypted.split(":")[0];
				salts.add(salt!);
			}

			expect(salts.size).toBe(10);
		});
	});
});