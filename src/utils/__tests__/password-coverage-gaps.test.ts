import { describe, expect, test } from "vitest";
import { Pbkdf2Hasher } from "../password";

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
