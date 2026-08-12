import { afterEach, describe, expect, mock, test } from "bun:test";
import type { BruteForceStorage } from "../../src/types";
import type { StoredUser, UserStorage } from "../../src/";
import { discord } from "../../src/";
import { TestBruteForceStorage } from "../helpers/storage";

const SECRET = "5K8qN2mR9pL3vX7wJ4tY6hF1dS0aG8bC2eU5iO9xM3nZ7kV4rW1qP6yT0uI8oA2";

class RecordingBruteForceStorage implements BruteForceStorage {
	public increments: string[] = [];

	async increment(key: string): Promise<number> {
		this.increments.push(key);
		return this.increments.length;
	}

	async isBlocked(): Promise<boolean> {
		return false;
	}

	async reset(): Promise<void> {}

	async block(): Promise<void> {}

	async getCount(key: string): Promise<number> {
		return this.increments.filter((k) => k === key).length;
	}
}

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
	test("falls back to in-memory store when bruteForce is enabled (default) without storage", async () => {
		const result = await discord({
			clientId: "test-client-id",
			clientSecret: "test-client-secret",
			secret: SECRET,
			callbackUrl: "http://localhost:3000/auth/discord/callback",
			redirectUri: "http://localhost:3000/auth/discord/callback",
			storage: createMockUserStorage(),
			csrf: { enabled: false },
		});
		expect(result).toBeDefined();
		expect(result.handleLogin).toBeDefined();
		expect(result.handleCallback).toBeDefined();
		result.dispose?.();
	});

	test("succeeds with an in-memory fallback when bruteForce.storage is not provided", async () => {
		const result = await discord({
			clientId: "test-client-id",
			clientSecret: "test-client-secret",
			secret: SECRET,
			callbackUrl: "http://localhost:3000/auth/discord/callback",
			redirectUri: "http://localhost:3000/auth/discord/callback",
			storage: createMockUserStorage(),
			csrf: { enabled: false },
		});
		expect(result).toBeDefined();
		result.dispose?.();
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

	describe("brute force attempt recording", () => {
		const originalFetch = global.fetch;

		afterEach(() => {
			global.fetch = originalFetch;
		});

		test("records an attempt when the OAuth code exchange fails with 401", async () => {
			global.fetch = mock(
				async () =>
					new Response(
						JSON.stringify({ error: "invalid_grant" }),
						{ status: 401 },
					),
			) as unknown as typeof fetch;

			const bruteForce = new RecordingBruteForceStorage();
			const result = await discord({
				clientId: "test-client-id",
				clientSecret: "test-client-secret",
				secret: SECRET,
				callbackUrl: "http://localhost:3000/auth/discord/callback",
				redirectUri: "http://localhost:3000/auth/discord/callback",
				storage: createMockUserStorage(),
				csrf: { enabled: false },
				bruteForce: { storage: bruteForce },
			});

			const loginResponse = await result.handleLogin(
				new Request("http://localhost:3000/auth/discord/login", {
					headers: { "user-agent": "TestBrowser/1.0" },
				}),
			);
			const stateCookie = loginResponse.headers.get("Set-Cookie");
			const loginUrl = new URL(loginResponse.headers.get("Location")!);
			const state = loginUrl.searchParams.get("state");

			const callbackResponse = await result.handleCallback(
				new Request(
					`http://localhost:3000/auth/discord/callback?code=bad-code&state=${state}`,
					{ headers: { Cookie: stateCookie ?? "" } },
				),
			);

			expect(callbackResponse.status).toBe(401);
			expect(bruteForce.increments).toHaveLength(1);
			expect(bruteForce.increments[0]).toMatch(/(^|:)discord:/);
			result.dispose?.();
		});
	});
});


