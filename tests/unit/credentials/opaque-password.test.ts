import { describe, expect, test } from "bun:test";
import { credentials, type AuthUserStorage } from "../../../src/";
import { TestBruteForceStorage } from "../../helpers/storage";

interface StoredUser {
	id: string;
	username: string | null;
	email: string | null;
	password: string;
	roles: string[];
	createdAt: Date;
	updatedAt: Date;
}

class InMemoryUserStorage implements AuthUserStorage {
	users = new Map<string, StoredUser>();
	private idCounter = 0;

	async findByUsername(username: string): Promise<StoredUser | null> {
		for (const user of this.users.values()) {
			if (user.username === username) return user;
		}
		return null;
	}

	async findByEmail(email: string): Promise<StoredUser | null> {
		for (const user of this.users.values()) {
			if (user.email === email) return user;
		}
		return null;
	}

	async findById(id: string): Promise<StoredUser | null> {
		return this.users.get(id) ?? null;
	}

	async create(
		data: Omit<StoredUser, "id" | "createdAt" | "updatedAt">,
	): Promise<StoredUser> {
		const id = `user-${++this.idCounter}`;
		const now = new Date();
		const user: StoredUser = { ...data, id, createdAt: now, updatedAt: now };
		this.users.set(id, user);
		return user;
	}

	async update(userId: string, data: Partial<StoredUser>): Promise<StoredUser> {
		const user = this.users.get(userId);
		if (!user) throw new Error("User not found");
		const updated = { ...user, ...data, updatedAt: new Date() };
		this.users.set(userId, updated);
		return updated;
	}

	async delete(userId: string): Promise<void> {
		this.users.delete(userId);
	}
}

function createConfig(storage: AuthUserStorage): Parameters<typeof credentials>[0] {
	return {
		storage,
		emailRequired: true,
		session: {
			secret: "5K8qN2mR9pL3vX7wJ4tY6hF1dS0aG8bC2eU5iO9xM3nZ7kV4rW1qP6yT0uI8oA2",
			expiresIn: "1h",
		},
		validatePassword: false,
		bruteForce: { storage: new TestBruteForceStorage() },
	};
}

describe("credentials - opaque password contract", () => {
	test("register stores exactly the input value (no library-side hashing)", async () => {
		const storage = new InMemoryUserStorage();
		const handlers = credentials(createConfig(storage));

		await handlers.handleRegister(
			new Request("http://localhost/auth/register", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: "opaque@example.com",
					password: "hashed:bcrypt:$2b$10$abcdefghijklmnopqrstuv",
				}),
			}),
		);

		const user = await storage.findByEmail("opaque@example.com");
		expect(user?.password).toBe("hashed:bcrypt:$2b$10$abcdefghijklmnopqrstuv");
	});

	test("login authenticates with identical pre-hashed value and rejects divergent", async () => {
		const storage = new InMemoryUserStorage();
		const handlers = credentials(createConfig(storage));

		await handlers.handleRegister(
			new Request("http://localhost/auth/register", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: "opaque2@example.com",
					password: "hashed:argon2:same-value-123",
				}),
			}),
		);

		const success = await handlers.handleLogin(
			new Request("http://localhost/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: "opaque2@example.com",
					password: "hashed:argon2:same-value-123",
				}),
			}),
		);
		expect(success.status).toBe(200);

		const rejected = await handlers.handleLogin(
			new Request("http://localhost/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: "opaque2@example.com",
					password: "hashed:argon2:different-value-456",
				}),
			}),
		);
		expect(rejected.status).toBe(401);

		const rejectedPromise = await handlers.handleLogin(
			new Request("http://localhost/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: "opaque2@example.com",
					password: "hashed:bcrypt:same-length-000",
				}),
			}),
		);
		expect(rejectedPromise.status).toBe(401);
	});
});
