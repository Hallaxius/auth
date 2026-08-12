import { describe, expect, test, mock, jest, spyOn } from "bun:test";
import type { DiscordAuthConfig } from "../../src/";
import {
	challenge,
	create,
	deriveStateSecret,
	pkce,
	processConfig,
	validateVerifier,
	verifier,
} from "../../src/";
import { TestStateStore } from "../helpers/storage";

const MINIMAL_CONFIG: DiscordAuthConfig = {
	clientId: "test-client-id",
	clientSecret: "test-client-secret",
	secret: process.env.TEST_SECRET || "5K8qN2mR9pL3vX7wJ4tY6hF1dS0aG8bC2eU5iO9xM3nZ7kV4rW1qP6yT0uI8oA2",
	callbackUrl: "/auth/callback",
	redirectUri: "http://localhost:3000/auth/callback",
	csrf: { storage: new TestStateStore() },
};

describe("processConfig", () => {
	test("throws when clientId is missing", async () => {
		await expect(
			processConfig({ ...MINIMAL_CONFIG, clientId: "" }),
		).rejects.toThrow("discord() requires clientId and clientSecret");
	});

	test("throws when clientSecret is missing", async () => {
		await expect(
			processConfig({ ...MINIMAL_CONFIG, clientSecret: "" }),
		).rejects.toThrow("discord() requires clientId and clientSecret");
	});

	test("throws when secret is missing", async () => {
		await expect(
			processConfig({ ...MINIMAL_CONFIG, secret: "" }),
		).rejects.toThrow("secret is required");
	});

	test("throws for invalid session.type", async () => {
		await expect(
			processConfig({
				...MINIMAL_CONFIG,
				session: { type: "invalid" as never, secret: "s" },
			}),
		).rejects.toThrow("session.type must be either 'jwt' or 'server'");
	});

	test("throws when guildRoleSync.enabled but no guildId", async () => {
		await expect(
			processConfig({ ...MINIMAL_CONFIG, guildRoleSync: { enabled: true } }),
		).rejects.toThrow("guildRoleSync.guildId is required");
	});

	test("throws when guildRoleSync.enabled but no botToken", async () => {
		await expect(
			processConfig({
				...MINIMAL_CONFIG,
				guildRoleSync: { enabled: true, guildId: "guild-1" },
			}),
		).rejects.toThrow("guildRoleSync.botToken is required");
	});

	test("returns internal config with defaults", async () => {
		const result = await processConfig(MINIMAL_CONFIG);
		expect(result.clientId).toBe("test-client-id");
		expect(result.session.type).toBe("jwt");
		expect(result.session.cookieName).toBe("discord-auth-session");
		expect(result.session.sameSite).toBe("lax");
		expect(result.scopes).toContain("identify");
		expect(result.prompt).toBe("consent");
		expect(result.redirectUri).toBe("http://localhost:3000/auth/callback");
		expect(result.meRoute).toBe("/auth/me");
		expect(result.stateSecret).toBeTruthy();
	});

	test("merges custom config with defaults", async () => {
		const result = await processConfig({
			...MINIMAL_CONFIG,
			session: { cookieName: "my-session", secret: "s" },
			scopes: ["guilds"],
			prompt: "none",
		});
		expect(result.session.cookieName).toBe("my-session");
		expect(result.scopes).toEqual(["guilds"]);
		expect(result.prompt).toBe("none");
	});

	test("uses DISCORD_REDIRECT_URI env fallback", async () => {
		process.env.DISCORD_REDIRECT_URI = "http://env-fallback/callback";
		const result = await processConfig({
			...MINIMAL_CONFIG,
			redirectUri: undefined,
		});
		expect(result.redirectUri).toBe("http://env-fallback/callback");
		delete process.env.DISCORD_REDIRECT_URI;
	});

	test("accepts custom stateSecret", async () => {
		const result = await processConfig({
			...MINIMAL_CONFIG,
			stateSecret: "custom-state-secret",
		});
		expect(result.stateSecret).toBe("custom-state-secret");
	});
});

describe("deriveStateSecret", () => {
	test("derives a hex string from session secret", async () => {
		const secret = await deriveStateSecret(
			MINIMAL_CONFIG.secret,
			"fixed-salt-for-test",
		);
		expect(secret).toBeTruthy();
		expect(typeof secret).toBe("string");
		expect(secret.length).toBe(64);
	});

	test("derives consistent results for same input and salt", async () => {
		const salt = "fixed-salt-consistency-test";
		const secret1 = await deriveStateSecret(MINIMAL_CONFIG.secret, salt);
		const secret2 = await deriveStateSecret(MINIMAL_CONFIG.secret, salt);
		expect(secret1).toBe(secret2);
	});

	test("derives different results for different input", async () => {
		const salt = "fixed-salt-test";
		const secret1 = await deriveStateSecret(
			"secret-one-32-chars-long-for-test!",
			salt,
		);
		const secret2 = await deriveStateSecret(
			"secret-two-32-chars-long-for-test!",
			salt,
		);
		expect(secret1).not.toBe(secret2);
	});

	test("accepts optional salt parameter", async () => {
		const secret1 = await deriveStateSecret(
			MINIMAL_CONFIG.secret,
			"custom-salt-123",
		);
		const secret2 = await deriveStateSecret(
			MINIMAL_CONFIG.secret,
			"custom-salt-123",
		);
		const secret3 = await deriveStateSecret(
			MINIMAL_CONFIG.secret,
			"different-salt-456",
		);

		expect(secret1).toBe(secret2);
		expect(secret1).not.toBe(secret3);
	});

	test("uses AUTH_SALT env var when salt parameter not provided", async () => {
		process.env.AUTH_SALT = "env-salt-789-this-is-at-least-32-chars";
		const secret1 = await deriveStateSecret(MINIMAL_CONFIG.secret);
		const secret2 = await deriveStateSecret(MINIMAL_CONFIG.secret);

		expect(secret1).toBe(secret2);
		expect(secret1).not.toBe(
			await deriveStateSecret(MINIMAL_CONFIG.secret, "custom"),
		);

		delete process.env.AUTH_SALT;
	});

	test("is deterministic without salt or AUTH_SALT", async () => {
		delete process.env.AUTH_SALT;
		const secret1 = await deriveStateSecret(MINIMAL_CONFIG.secret);
		const secret2 = await deriveStateSecret(MINIMAL_CONFIG.secret);

		expect(secret1).toBe(secret2);
		expect(secret1).toHaveLength(64);
	});

	test("does not call crypto.randomUUID on the derivation path", async () => {
		delete process.env.AUTH_SALT;
		const spy = spyOn(crypto, "randomUUID");
		try {
			await deriveStateSecret(MINIMAL_CONFIG.secret);
			await deriveStateSecret(MINIMAL_CONFIG.secret, "explicit-salt");
			process.env.AUTH_SALT = "env-salt-this-is-at-least-32-chars";
			await deriveStateSecret(MINIMAL_CONFIG.secret);
			expect(spy).not.toHaveBeenCalled();
		} finally {
			spy.mockRestore();
			delete process.env.AUTH_SALT;
		}
	});

	test("parameter salt takes precedence over env var", async () => {
		process.env.AUTH_SALT = "env-salt-this-is-at-least-32-chars-long";
		const secret = await deriveStateSecret(MINIMAL_CONFIG.secret, "param-salt");
		const expected = await deriveStateSecret(
			MINIMAL_CONFIG.secret,
			"param-salt",
		);

		expect(secret).toBe(expected);
		expect(secret).not.toBe(await deriveStateSecret(MINIMAL_CONFIG.secret));

		delete process.env.AUTH_SALT;
	});

	test("derivation is deterministic with same salt", async () => {
		const salt = "test-salt-deterministic";
		const results = await Promise.all(
			Array(10)
				.fill(null)
				.map(() => deriveStateSecret(MINIMAL_CONFIG.secret, salt)),
		);

		expect(new Set(results).size).toBe(1);
	});
});

describe("verifier", () => {
	test("generates a base64url string", () => {
		const v = verifier();
		expect(v).toBeTruthy();
		expect(typeof v).toBe("string");
		expect(v).toMatch(/^[A-Za-z0-9\-_]+$/);
	});

	test("generates unique values", () => {
		const v1 = verifier();
		const v2 = verifier();
		expect(v1).not.toBe(v2);
	});
});

describe("validateVerifier", () => {
	test("throws for non-string", () => {
		expect(() => validateVerifier(123 as never)).toThrow(
			"code_verifier must be a string",
		);
	});

	test("throws for too short verifier", () => {
		expect(() => validateVerifier("short")).toThrow(
			"code_verifier must be between 43 and 128 characters",
		);
	});

	test("throws for too long verifier", () => {
		expect(() => validateVerifier("a".repeat(200))).toThrow(
			"code_verifier must be between 43 and 128 characters",
		);
	});

	test("throws for invalid characters", () => {
		expect(() => validateVerifier(`${"a".repeat(43)}!`)).toThrow(
			"code_verifier contains invalid characters",
		);
	});

	test("accepts valid verifier", () => {
		const v = verifier();
		expect(() => validateVerifier(v)).not.toThrow();
	});
});

describe("challenge", () => {
	test("generates a base64url challenge from verifier", async () => {
		const v = verifier();
		const c = await challenge(v);
		expect(c).toBeTruthy();
		expect(typeof c).toBe("string");
		expect(c).toMatch(/^[A-Za-z0-9\-_]+$/);
	});

	test("throws for invalid verifier", async () => {
		await expect(challenge("short")).rejects.toThrow();
	});
});

describe("pkce.create", () => {
	test("creates verifier, challenge, and method", async () => {
		const result = await create();
		expect(result.verifier).toBeTruthy();
		expect(result.challenge).toBeTruthy();
		expect(result.codeChallengeMethod).toBe("S256");
		expect(result.verifier.length).toBeGreaterThanOrEqual(43);
	});
});

describe("pkce namespace", () => {
	test("exports verifier, challenge, create", () => {
		expect(pkce.verifier).toBe(verifier);
		expect(pkce.challenge).toBe(challenge);
		expect(pkce.create).toBe(create);
	});
});


