import { describe, expect, test } from "bun:test";
import type { AuthUserIdentifier, AuthUserStorage } from "../../../src/";
import { CredentialsClient } from "../../../src/";
import { TestBruteForceStorage } from "../../helpers/storage";

interface AuthUser {
	id: string;
	username: string | null;
	email: string | null;
	password: string;
	roles: string[];
	createdAt: Date;
	updatedAt: Date;
}

class InMemoryUserStorage implements AuthUserStorage {
	private users = new Map<string, AuthUser>();
	private idCounter = 0;

	async findByUsername(username: string): Promise<AuthUser | null> {
		for (const user of this.users.values()) {
			if (user.username === username) return user;
		}
		return null;
	}

	async findByEmail(email: string): Promise<AuthUser | null> {
		for (const user of this.users.values()) {
			if (user.email === email) return user;
		}
		return null;
	}

	async findById(id: string): Promise<AuthUser | null> {
		return this.users.get(id) ?? null;
	}

	async create(
		data: Omit<AuthUser, "id" | "createdAt" | "updatedAt">,
	): Promise<AuthUser> {
		const id = `user-${++this.idCounter}`;
		const now = new Date();
		const user: AuthUser = { ...data, id, createdAt: now, updatedAt: now };
		this.users.set(id, user);
		return user;
	}

	async update(userId: string, data: Partial<AuthUser>): Promise<AuthUser> {
		const user = this.users.get(userId);
		if (!user) throw new Error("User not found");
		const updated = { ...user, ...data, updatedAt: new Date() };
		this.users.set(userId, updated);
		return updated;
	}

	async delete(userId: string): Promise<void> {
		this.users.delete(userId);
	}

	async findByDiscordId(_discordId: string): Promise<AuthUser | null> {
		return null;
	}
}

describe("CredentialsClient - findUserByIdentifier coverage", () => {
	test("finds user by email when username is not provided in UsernameEmail strategy", async () => {
		const storage = new InMemoryUserStorage();

		await storage.create({
			username: "testuser",
			email: "test@example.com",
			password: "hashed:password123",
			roles: ["user"],
		});

		const client = new CredentialsClient(
			{
				emailRequired: true,
				usernameRequired: true,
				secret: "5K8qN2mR9pL3vX7wJ4tY6hF1dS0aG8bC2eU5iO9xM3nZ7kV4rW1qP6yT0uI8oA2",
				expiresIn: "7d",
				cookieName: "test-session",
			},
			storage,
			{ storage: new TestBruteForceStorage() },
		);

		const user = await (
			client as unknown as {
				findUserByIdentifier: (
					id: AuthUserIdentifier,
				) => Promise<AuthUser | null>;
			}
		).findUserByIdentifier({
			username: undefined,
			email: "test@example.com",
		});

		expect(user).not.toBeNull();
		expect(user?.email).toBe("test@example.com");
	});

	test("returns null when identifier has no username or email", async () => {
		const storage = new InMemoryUserStorage();

		const client = new CredentialsClient(
			{
				emailRequired: true,
				usernameRequired: true,
				secret: "5K8qN2mR9pL3vX7wJ4tY6hF1dS0aG8bC2eU5iO9xM3nZ7kV4rW1qP6yT0uI8oA2",
				expiresIn: "7d",
				cookieName: "test-session",
			},
			storage,
			{ storage: new TestBruteForceStorage() },
		);

		const user = await (
			client as unknown as {
				findUserByIdentifier: (
					id: AuthUserIdentifier,
				) => Promise<AuthUser | null>;
			}
		).findUserByIdentifier({
			username: undefined,
			email: "test@example.com",
		});

		expect(user).toBeNull();
	});

	test("findUserByIdentifier with UsernameOnly strategy finds by username", async () => {
		const storage = new InMemoryUserStorage();

		await storage.create({
			username: "usernameonly",
			email: null,
			password: "hashed:password123",
			roles: ["user"],
		});

		const client = new CredentialsClient(
			{
				usernameRequired: true,
				secret: "5K8qN2mR9pL3vX7wJ4tY6hF1dS0aG8bC2eU5iO9xM3nZ7kV4rW1qP6yT0uI8oA2",
				expiresIn: "7d",
				cookieName: "test-session",
			},
			storage,
			{ storage: new TestBruteForceStorage() },
		);

		const user = await (
			client as unknown as {
				findUserByIdentifier: (
					id: AuthUserIdentifier,
				) => Promise<AuthUser | null>;
			}
		).findUserByIdentifier({
			username: "usernameonly",
			email: undefined,
		});

		expect(user).not.toBeNull();
		expect(user?.username).toBe("usernameonly");
	});

	test("findUserByIdentifier with EmailOnly strategy finds by email", async () => {
		const storage = new InMemoryUserStorage();

		await storage.create({
			username: null,
			email: "emailonly@example.com",
			password: "hashed:password123",
			roles: ["user"],
		});

		const client = new CredentialsClient(
			{
				emailRequired: true,
				secret: "5K8qN2mR9pL3vX7wJ4tY6hF1dS0aG8bC2eU5iO9xM3nZ7kV4rW1qP6yT0uI8oA2",
				expiresIn: "7d",
				cookieName: "test-session",
			},
			storage,
			{ storage: new TestBruteForceStorage() },
		);

		const user = await (
			client as unknown as {
				findUserByIdentifier: (
					id: AuthUserIdentifier,
				) => Promise<AuthUser | null>;
			}
		).findUserByIdentifier({
			username: undefined,
			email: "emailonly@example.com",
		});

		expect(user).not.toBeNull();
		expect(user?.email).toBe("emailonly@example.com");
	});

	test("findUserByIdentifier with UsernameOnly returns null without username", async () => {
		const storage = new InMemoryUserStorage();

		const client = new CredentialsClient(
			{
				usernameRequired: true,
				secret: "5K8qN2mR9pL3vX7wJ4tY6hF1dS0aG8bC2eU5iO9xM3nZ7kV4rW1qP6yT0uI8oA2",
				expiresIn: "7d",
				cookieName: "test-session",
			},
			storage,
			{ storage: new TestBruteForceStorage() },
		);

		const user = await (
			client as unknown as {
				findUserByIdentifier: (
					id: AuthUserIdentifier,
				) => Promise<AuthUser | null>;
			}
		).findUserByIdentifier({
			username: undefined,
			email: "test@example.com",
		});

		expect(user).toBeNull();
	});

	test("findUserByIdentifier with EmailOnly returns null without email", async () => {
		const storage = new InMemoryUserStorage();

		const client = new CredentialsClient(
			{
				emailRequired: true,
				secret: "5K8qN2mR9pL3vX7wJ4tY6hF1dS0aG8bC2eU5iO9xM3nZ7kV4rW1qP6yT0uI8oA2",
				expiresIn: "7d",
				cookieName: "test-session",
			},
			storage,
			{ storage: new TestBruteForceStorage() },
		);

		const user = await (
			client as unknown as {
				findUserByIdentifier: (
					id: AuthUserIdentifier,
				) => Promise<AuthUser | null>;
			}
		).findUserByIdentifier({
			username: undefined,
			email: undefined,
		});

		expect(user).toBeNull();
	});
});


