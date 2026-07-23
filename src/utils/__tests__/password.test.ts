import { describe, expect, test } from "vitest";
import {
	benchmarkPasswordHasher,
	createPasswordHasher,
	Pbkdf2Hasher,
} from "../password";

describe("Pbkdf2Hasher", () => {
	test("should hash a password", async () => {
		const hasher = new Pbkdf2Hasher();
		const hash = await hasher.hash("test-password");

		expect(hash).toBeDefined();
		expect(hash).toContain("$pbkdf2$");
		expect(hash.split("$")).toHaveLength(6);
	});

	test("should verify a correct password", async () => {
		const hasher = new Pbkdf2Hasher();
		const password = "test-password";
		const hash = await hasher.hash(password);

		const valid = await hasher.verify(password, hash);
		expect(valid).toBe(true);
	});

	test("should reject an incorrect password", async () => {
		const hasher = new Pbkdf2Hasher();
		const password = "test-password";
		const hash = await hasher.hash(password);

		const valid = await hasher.verify("wrong-password", hash);
		expect(valid).toBe(false);
	});

	test("should use custom iterations", async () => {
		const hasher = new Pbkdf2Hasher({ iterations: 50000 });
		const hash = await hasher.hash("test-password");

		expect(hash).toContain("$pbkdf2$50000$");
	});

	test("should use custom digest algorithm", async () => {
		const hasher = new Pbkdf2Hasher({ digest: "sha512" });
		const hash = await hasher.hash("test-password");

		expect(hash).toContain("$pbkdf2$100000$sha512$");
	});

	test("should reject invalid hash format", async () => {
		const hasher = new Pbkdf2Hasher();
		const valid = await hasher.verify("password", "invalid-hash");

		expect(valid).toBe(false);
	});

	test("should handle unicode passwords", async () => {
		const hasher = new Pbkdf2Hasher();
		const password = "senha-🔐-segura";
		const hash = await hasher.hash(password);

		const valid = await hasher.verify(password, hash);
		expect(valid).toBe(true);
	});
});

describe("benchmarkPasswordHasher", () => {
	test("should benchmark PBKDF2 hasher", async () => {
		const hasher = new Pbkdf2Hasher({ iterations: 10000 });
		const result = await benchmarkPasswordHasher(hasher, "test-password", 3);

		expect(result.averageMs).toBeGreaterThan(0);
		expect(result.minMs).toBeGreaterThan(0);
		expect(result.maxMs).toBeGreaterThan(0);
		expect(result.results).toHaveLength(3);
	});

	test("PBKDF2 should meet performance target (< 200ms)", {
		timeout: 10000,
	}, async () => {
		const hasher = new Pbkdf2Hasher({
			iterations: 100000,
			digest: "sha256",
		});
		const result = await benchmarkPasswordHasher(hasher, "test-password", 3);

		expect(result.averageMs).toBeLessThan(200);
	});
});

describe("createPasswordHasher", () => {
	test("should create PBKDF2 hasher by default", () => {
		const hasher = createPasswordHasher();
		expect(hasher).toBeInstanceOf(Pbkdf2Hasher);
	});

	test("should create PBKDF2 hasher explicitly", () => {
		const hasher = createPasswordHasher("pbkdf2");
		expect(hasher).toBeInstanceOf(Pbkdf2Hasher);
	});
});
