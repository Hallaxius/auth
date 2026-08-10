import { describe, expect, test } from "bun:test";
import { ConfigurationError, discord } from "../../src/";
import type { StoredUser, UserStorage } from "../../src/";
import { TestBruteForceStorage } from "../helpers/storage";

const SECRET = "secret-key-32-chars-minimum-xxxxxx";

function createMockUserStorage(): UserStorage {
	const users = new Map<string, StoredUser>();
	return {
		async findByDiscordId(discordId: string) {
			return users.get(discordId) ?? null;
		},
		async create(data: StoredUser) {
			users.set(data.discordId, data);
			return data;
		},
		async update(discordId: string, data: Partial<StoredUser>) {
			const existing = users.get(discordId);
			if (!existing) throw new Error("User not found");
			const updated = { ...existing, ...data };
			users.set(discordId, updated);
			return updated;
		},
		async delete(discordId: string) {
			users.delete(discordId);
		},
	};
}

describe("discord() brute force configuration", () => {
	test("throws ConfigurationError when bruteForce is enabled (default) without storage", async () => {
		await expect(
			discord({
				clientId: "test-client-id",
				clientSecret: "test-client-secret",
				secret: SECRET,
				callbackUrl: "http://localhost:3000/auth/discord/callback",
				redirectUri: "http://localhost:3000/auth/discord/callback",
				storage: createMockUserStorage(),
				csrf: { enabled: false },
			}),
		).rejects.toThrow(ConfigurationError);
	});

	test("throws ConfigurationError with a helpful message mentioning bruteForce.storage", async () => {
		await expect(
			discord({
				clientId: "test-client-id",
				clientSecret: "test-client-secret",
				secret: SECRET,
				callbackUrl: "http://localhost:3000/auth/discord/callback",
				redirectUri: "http://localhost:3000/auth/discord/callback",
				storage: createMockUserStorage(),
				csrf: { enabled: false },
			}),
		).rejects.toThrow(/bruteForce\.storage/);
	});

	test("succeeds when bruteForce.enabled is explicitly false", async () => {
		const result = await discord({
			clientId: "test-client-id",
			clientSecret: "test-client-secret",
			secret: SECRET,
			callbackUrl: "http://localhost:3000/auth/discord/callback",
			redirectUri: "http://localhost:3000/auth/discord/callback",
			storage: createMockUserStorage(),
			csrf: { enabled: false },
			bruteForce: { enabled: false },
		});
		expect(result).toBeDefined();
		expect(result.handleLogin).toBeDefined();
		expect(result.handleCallback).toBeDefined();
		result.dispose?.();
	});

	test("succeeds when bruteForce.storage is provided (enabled by default)", async () => {
		const result = await discord({
			clientId: "test-client-id",
			clientSecret: "test-client-secret",
			secret: SECRET,
			callbackUrl: "http://localhost:3000/auth/discord/callback",
			redirectUri: "http://localhost:3000/auth/discord/callback",
			storage: createMockUserStorage(),
			csrf: { enabled: false },
			bruteForce: { storage: new TestBruteForceStorage() },
		});
		expect(result).toBeDefined();
		result.dispose?.();
	});

	test("succeeds when bruteForce.enabled is true but storage is still provided", async () => {
		const result = await discord({
			clientId: "test-client-id",
			clientSecret: "test-client-secret",
			secret: SECRET,
			callbackUrl: "http://localhost:3000/auth/discord/callback",
			redirectUri: "http://localhost:3000/auth/discord/callback",
			storage: createMockUserStorage(),
			csrf: { enabled: false },
			bruteForce: { enabled: true, storage: new TestBruteForceStorage() },
		});
		expect(result).toBeDefined();
		result.dispose?.();
	});
});
