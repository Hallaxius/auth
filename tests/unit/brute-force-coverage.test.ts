import { describe, expect, test } from "bun:test";
import type { AuthUserStorage } from "../../src/";
import { TestBruteForceStorage } from "../helpers/storage";

interface AuthUser {
	id: string;
	username: string | null;
	email: string | null;
	passwordHash: string;
	roles: string[];
	createdAt: Date;
	updatedAt: Date;
}

describe("TestBruteForceStorage - full coverage", () => {
	test("increment returns existing count when within window", async () => {
		const storage = new TestBruteForceStorage();
		const key = "test-key";

		const first = await storage.increment(key, 60000);
		expect(first).toBe(1);

		const second = await storage.increment(key, 60000);
		expect(second).toBe(2);

		const third = await storage.increment(key, 60000);
		expect(third).toBe(3);
	});

	test("increment resets count after window expires", async () => {
		const storage = new TestBruteForceStorage();
		const key = "test-expiry";

		await storage.increment(key, 10);
		await new Promise((resolve) => setTimeout(resolve, 20));

		const afterExpiry = await storage.increment(key, 60000);
		expect(afterExpiry).toBe(1);
	});

	test("isBlocked returns true when blocked", async () => {
		const storage = new TestBruteForceStorage();
		const key = "blocked-key";

		await storage.block(key, 60000);
		const blocked = await storage.isBlocked(key);
		expect(blocked).toBe(true);
	});

	test("isBlocked returns false when not blocked", async () => {
		const storage = new TestBruteForceStorage();
		const key = "not-blocked-key";

		const blocked = await storage.isBlocked(key);
		expect(blocked).toBe(false);
	});

	test("isBlocked returns false after block expires", async () => {
		const storage = new TestBruteForceStorage();
		const key = "temp-blocked-key";

		await storage.block(key, 10);
		await new Promise((resolve) => setTimeout(resolve, 20));

		const blocked = await storage.isBlocked(key);
		expect(blocked).toBe(false);
	});

	test("reset clears attempts and block", async () => {
		const storage = new TestBruteForceStorage();
		const key = "reset-key";

		await storage.increment(key, 60000);
		await storage.block(key, 60000);
		await storage.reset(key);

		const count = await storage.getCount(key);
		expect(count).toBe(0);

		const blocked = await storage.isBlocked(key);
		expect(blocked).toBe(false);
	});

	test("getCount returns 0 for unknown key", async () => {
		const storage = new TestBruteForceStorage();
		const count = await storage.getCount("unknown-key");
		expect(count).toBe(0);
	});
});

describe("BruteForceProtection - blocked scenario", () => {
	test("login throws BRUTE_FORCE_BLOCKED when already blocked", async () => {
		const { CredentialsClient } = await import("../../src");

		class InMemoryUserStorage {
			private users = new Map();
			private idCounter = 0;

			async findByUsername(username: string) {
				for (const user of this.users.values()) {
					if (user.username === username) return user;
				}
				return null;
			}

			async findByEmail(email: string) {
				for (const user of this.users.values()) {
					if (user.email === email) return user;
				}
				return null;
			}

			async findById(id: string) {
				return this.users.get(id) ?? null;
			}

			async create(data: Omit<AuthUser, "id" | "createdAt" | "updatedAt">) {
				const id = `user-${++this.idCounter}`;
				const now = new Date();
				const user = { ...data, id, createdAt: now, updatedAt: now };
				this.users.set(id, user);
				return user;
			}

			async findByDiscordId() {
				return null;
			}
		}

		const storage = new InMemoryUserStorage() as unknown as AuthUserStorage;

		await storage.create({
			username: "blockeduser",
			email: "blocked@example.com",
			passwordHash: "pre-hashed-password",
			roles: ["user"],
		});

		const bruteForceStorage = new TestBruteForceStorage();
		const rawKey = "credentials-login:127.0.0.1:blockeduser";
		await bruteForceStorage.block(`bruteforce:${rawKey}`, 60000);

		const client = new CredentialsClient(
			{
				emailRequired: true,
				usernameRequired: true,
				secret:
					process.env.TEST_SECRET ||
					"5K8qN2mR9pL3vX7wJ4tY6hF1dS0aG8bC2eU5iO9xM3nZ7kV4rW1qP6yT0uI8oA2",
				expiresIn: "7d",
				cookieName: "test-session",
			},
			storage,
			{
				enabled: true,
				maxAttempts: 5,
				windowMs: 60000,
				blockDurationMs: 60000,
				storage: bruteForceStorage,
			},
		);

		const request = new Request("http://localhost/login", {
			headers: { "x-forwarded-for": "127.0.0.1" },
		}) as unknown as { socket: { remoteAddress?: string } };
		request.socket = { remoteAddress: "127.0.0.1" };

		await expect(
			client.login({ username: "blockeduser" }, "pre-hashed-password", request),
		).rejects.toThrow("Account temporarily locked");
	});
});


