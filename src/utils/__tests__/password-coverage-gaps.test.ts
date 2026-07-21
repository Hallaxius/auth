import { describe, expect, test } from "vitest";
import { BcryptHasher, Pbkdf2Hasher } from "../password";

describe("BcryptHasher - coverage gaps", () => {
	test("verify returns false for non-bcrypt hash", async () => {
		const hasher = new BcryptHasher();
		const hash = "$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$hash";

		const result = await hasher.verify("password", hash);
		expect(result).toBe(false);
	});

	test("verify returns false for malformed hash (wrong parts count)", async () => {
		const hasher = new BcryptHasher();
		const hash = "$bcrypt$10$salt";

		const result = await hasher.verify("password", hash);
		expect(result).toBe(false);
	});

	test("verify returns false for hash with invalid format", async () => {
		const hasher = new BcryptHasher();
		const hash = "$bcrypt$10$invalid";

		const result = await hasher.verify("password", hash);
		expect(result).toBe(false);
	});

	test("verify handles hash with empty parts", async () => {
		const hasher = new BcryptHasher();
		const hash = "$bcrypt$10$$";

		const result = await hasher.verify("password", hash);
		expect(result).toBe(false);
	});

	test("hash generates valid bcrypt format", async () => {
		const hasher = new BcryptHasher();
		const password = "test-password-123";

		const hash = await hasher.hash(password);
		expect(hash).toMatch(/^\$bcrypt\$\d+\$[a-f0-9]{32}\$[a-f0-9]{64}$/);
	});

	test("verify with valid hash and password", async () => {
		const hasher = new BcryptHasher();
		const password = "correct-password";

		const hash = await hasher.hash(password);
		const result = await hasher.verify(password, hash);
		expect(result).toBe(true);
	});

	test("verify with valid hash but wrong password", async () => {
		const hasher = new BcryptHasher();
		const password = "correct-password";
		const wrongPassword = "wrong-password";

		const hash = await hasher.hash(password);
		const result = await hasher.verify(wrongPassword, hash);
		expect(result).toBe(false);
	});

	test("hash with different salt rounds", async () => {
		const hasher = new BcryptHasher({ saltRounds: 8 });
		const password = "test";

		const hash = await hasher.hash(password);
		expect(hash).toMatch(/^\$bcrypt\$8\$/);
	});

	test("hash with high salt rounds", async () => {
		const hasher = new BcryptHasher({ saltRounds: 15 });
		const password = "test";

		const hash = await hasher.hash(password);
		expect(hash).toMatch(/^\$bcrypt\$15\$/);
	});
});

describe("Pbkdf2Hasher - coverage gaps", () => {
	test("verify returns false for non-pbkdf2 hash", async () => {
		const hasher = new Pbkdf2Hasher();
		const hash = "$bcrypt$10$hash";

		const result = await hasher.verify("password", hash);
		expect(result).toBe(false);
	});

	test("verify returns false for malformed hash (wrong parts count) - line 139", async () => {
		const hasher = new Pbkdf2Hasher();
		const hash = "$pbkdf2$10000$sha256$salt";

		const result = await hasher.verify("password", hash);
		expect(result).toBe(false);
	});

	test("verify with different digest algorithms", async () => {
		const hasherSha1 = new Pbkdf2Hasher({ digest: "sha1" });
		const hasherSha512 = new Pbkdf2Hasher({ digest: "sha512" });
		const password = "test";

		const hash1 = await hasherSha1.hash(password);
		const hash512 = await hasherSha512.hash(password);

		expect(hash1).toMatch(/^\$pbkdf2\$\d+\$sha1\$/);
		expect(hash512).toMatch(/^\$pbkdf2\$\d+\$sha512\$/);

		expect(await hasherSha1.verify(password, hash1)).toBe(true);
		expect(await hasherSha512.verify(password, hash512)).toBe(true);
	});

	test("constantTimeCompare returns false for different lengths - line 195", async () => {
		const hasher = new Pbkdf2Hasher();
		const password = "test";

		const hash = await hasher.hash(password);
		const wrongHash = `${hash}extra`;

		const result = await hasher.verify(password, wrongHash);
		expect(result).toBe(false);
	});
});
