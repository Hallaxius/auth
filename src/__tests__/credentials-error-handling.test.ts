import { describe, expect, test } from "vitest";
import { credentials } from "../credentials";
import type { AuthUserStorage, PasswordHasher } from "../types";
import { AuthStrategy } from "../types";

interface AuthUser {
	id: string;
	username: string | null;
	email: string | null;
	passwordHash: string;
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

class BrokenHasher implements PasswordHasher {
	async hash(_password: string): Promise<string> {
		throw new Error("Hasher is broken");
	}

	async verify(_password: string, _hash: string): Promise<boolean> {
		throw new Error("Hasher is broken");
	}
}

describe("credentials - error handling coverage", () => {
	test("register with broken hasher triggers console.error", async () => {
		const storage = new InMemoryUserStorage();
		const brokenHasher = new BrokenHasher();

		const config = {
			strategy: AuthStrategy.UsernameEmail as AuthStrategy,
			storage,
			hasher: brokenHasher,
			session: {
				secret: "test-session-secret-32-chars-long!!",
				expiresIn: "7d",
				cookieName: "credentials-session",
			},
			cookiePath: "/",
			sameSite: "lax" as const,
			secure: false,
			httpOnly: true,
		};

		const handlers = credentials(config);

		const registerReq = new Request("http://localhost/auth/register", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				username: "testuser",
				email: "test@example.com",
				password: "password123",
			}),
		});

		const registerRes = await handlers.handleRegister(registerReq);
		expect(registerRes.status).toBe(500);

		const body = await registerRes.json();
		expect(body.error).toContain("Hasher is broken");
	});

	test("login with broken hasher triggers console.error", async () => {
		const storage = new InMemoryUserStorage();
		const brokenHasher = new BrokenHasher();

		const config = {
			strategy: AuthStrategy.UsernameEmail as AuthStrategy,
			storage,
			hasher: brokenHasher,
			session: {
				secret: "test-session-secret-32-chars-long!!",
				expiresIn: "7d",
				cookieName: "credentials-session",
			},
			cookiePath: "/",
			sameSite: "lax" as const,
			secure: false,
			httpOnly: true,
		};

		const handlers = credentials(config);

		const loginReq = new Request("http://localhost/auth/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				username: "testuser",
				password: "password123",
			}),
		});

		const loginRes = await handlers.handleLogin(loginReq);
		expect(loginRes.status).toBe(500);

		const body = await loginRes.json();
		expect(body.error).toContain("Hasher is broken");
	});
});
