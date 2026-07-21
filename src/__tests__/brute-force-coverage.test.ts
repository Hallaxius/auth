import { describe, expect, test } from "vitest";
import { MemoryBruteForceStorage } from "../credentials";

describe("MemoryBruteForceStorage - full coverage", () => {
	test("increment returns existing count when within window", async () => {
		const storage = new MemoryBruteForceStorage();
		const key = "test-key";

		const first = await storage.increment(key, 60000);
		expect(first).toBe(1);

		const second = await storage.increment(key, 60000);
		expect(second).toBe(2);

		const third = await storage.increment(key, 60000);
		expect(third).toBe(3);
	});

	test("increment resets count after window expires", async () => {
		const storage = new MemoryBruteForceStorage();
		const key = "test-expiry";

		await storage.increment(key, 10);
		await new Promise((resolve) => setTimeout(resolve, 20));

		const afterExpiry = await storage.increment(key, 60000);
		expect(afterExpiry).toBe(1);
	});

	test("isBlocked returns true when blocked", async () => {
		const storage = new MemoryBruteForceStorage();
		const key = "blocked-key";

		await storage.block(key, 60000);
		const blocked = await storage.isBlocked(key);
		expect(blocked).toBe(true);
	});

	test("isBlocked returns false when not blocked", async () => {
		const storage = new MemoryBruteForceStorage();
		const key = "not-blocked-key";

		const blocked = await storage.isBlocked(key);
		expect(blocked).toBe(false);
	});

	test("isBlocked returns false after block expires", async () => {
		const storage = new MemoryBruteForceStorage();
		const key = "temp-blocked-key";

		await storage.block(key, 10);
		await new Promise((resolve) => setTimeout(resolve, 20));

		const blocked = await storage.isBlocked(key);
		expect(blocked).toBe(false);
	});

	test("reset clears attempts and block", async () => {
		const storage = new MemoryBruteForceStorage();
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
		const storage = new MemoryBruteForceStorage();
		const count = await storage.getCount("unknown-key");
		expect(count).toBe(0);
	});
});

describe("BruteForceProtection - blocked scenario", () => {
	test("login throws BRUTE_FORCE_BLOCKED when already blocked", async () => {
		const { CredentialsClient } = await import("../credentials");
		const { AuthStrategy } = await import("../types");

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

			async create(data: any) {
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

		class TestHasher {
			async hash(password: string) {
				return `hashed:${password}`;
			}

			async verify(password: string, hash: string) {
				return hash === `hashed:${password}`;
			}
		}

		const storage = new InMemoryUserStorage() as any;
		const hasher = new TestHasher() as any;

		await storage.create({
			username: "blockeduser",
			email: "blocked@example.com",
			passwordHash: "hashed:password123",
			roles: ["user"],
		});

		const bruteForceStorage = new MemoryBruteForceStorage();
		const bruteForceKey = "credentials-login:username-email:127.0.0.1";
		await bruteForceStorage.block(bruteForceKey, 60000);

		const client = new CredentialsClient(
			{
				strategy: AuthStrategy.UsernameEmail,
				secret: "test-secret",
				expiresIn: "7d",
				cookieName: "test-session",
			},
			storage,
			hasher,
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
		});

		await expect(
			client.login({ username: "blockeduser" }, "password123", request),
		).rejects.toThrow("Account temporarily locked");
	});
});
