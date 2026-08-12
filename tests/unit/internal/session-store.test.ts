import { afterEach, describe, expect, test } from "bun:test";
import { createEncryptedSessionCookie } from "../../../src/internal/encrypted-cookies";
import { DEFAULT_SESSION_TTL_SECONDS } from "../../../src/internal/defaults";
import { MemorySessionStore } from "../../../src/internal/session-store";

const SECRET =
	"5K8qN2mR9pL3vX7wJ4tY6hF1dS0aG8bC2eU5iO9xM3nZ7kV4rW1qP6yT0uI8oA2";

describe("session store TTL default", () => {
	const store = new MemorySessionStore(60_000);

	afterEach(() => {
		store.dispose();
	});

	test("defaults to the 7d aligned TTL when no ttl is given", async () => {
		await store.set("s1", { userId: "u1" });

		const fresh = await store.get("s1");
		expect(fresh).not.toBeNull();
		expect(fresh!.userId).toBe("u1");
		expect(DEFAULT_SESSION_TTL_SECONDS).toBe(604800);

		const clock = Date.now;
		Date.now = () => clock() + DEFAULT_SESSION_TTL_SECONDS * 1000 + 1000;
		try {
			const expired = await store.get("s1");
			expect(expired).toBeNull();
		} finally {
			Date.now = clock;
		}
	});

	test("honors an explicit ttl override", async () => {
		await store.set("s2", { userId: "u2" }, 60);

		const clock = Date.now;
		Date.now = () => clock() + 61_000;
		try {
			const expired = await store.get("s2");
			expect(expired).toBeNull();
		} finally {
			Date.now = clock;
		}
	});
});

describe("encrypted session cookie TTL default", () => {
	test("sets a 7d Max-Age when no maxAge option is provided", async () => {
		const cookie = await createEncryptedSessionCookie(
			"sess",
			"some-value",
			SECRET,
		);
		expect(cookie).toContain(`Max-Age=${DEFAULT_SESSION_TTL_SECONDS}`);
		expect(cookie).toContain("HttpOnly");
	});

	test("honors an explicit maxAge option", async () => {
		const cookie = await createEncryptedSessionCookie(
			"sess",
			"some-value",
			SECRET,
			{ maxAge: 300 },
		);
		expect(cookie).toContain("Max-Age=300");
	});
});