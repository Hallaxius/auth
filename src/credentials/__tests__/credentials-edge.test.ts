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

class TestHasher implements PasswordHasher {
	async hash(password: string): Promise<string> {
		return `hashed:${password}`;
	}

	async verify(password: string, hash: string): Promise<boolean> {
		return hash === `hashed:${password}`;
	}
}

function createCredentialsConfig(
	overrides: Partial<{
		strategy: AuthStrategy;
		storage: AuthUserStorage;
		hasher: PasswordHasher;
		bruteForce: {
			enabled: boolean;
			maxAttempts: number;
			windowMs: number;
			blockDurationMs: number;
		};
	}> = {},
) {
	return {
		strategy: overrides.strategy ?? AuthStrategy.UsernameEmail,
		storage: overrides.storage ?? new InMemoryUserStorage(),
		hasher: overrides.hasher ?? new TestHasher(),
		session: {
			secret: process.env.TEST_SECRET || "fallback-32-char-secret-key!!",
			expiresIn: "7d",
			cookieName: "credentials-session",
		},
		cookiePath: "/",
		sameSite: "lax" as const,
		secure: false,
		httpOnly: true,
		bruteForce: overrides.bruteForce ?? {
			enabled: true,
			maxAttempts: 5,
			windowMs: 15 * 60 * 1000,
			blockDurationMs: 30 * 60 * 1000,
		},
	};
}

describe("credentials - edge cases and validation", () => {
	test("register validates password length", async () => {
		const config = createCredentialsConfig();
		const handlers = credentials(config);

		const req = new Request("http://localhost/auth/register", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				username: "shortpass",
				email: "short@example.com",
				password: "123",
			}),
		});

		const res = await handlers.handleRegister(req);
		expect(res.status).toBe(400);

		const body = await res.json();
		expect(body.error).toContain("Password must be at least");
	});

	test("register validates email format", async () => {
		const config = createCredentialsConfig();
		const handlers = credentials(config);

		const req = new Request("http://localhost/auth/register", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				username: "bademail",
				email: "not-an-email",
				password: "password123",
			}),
		});

		const res = await handlers.handleRegister(req);
		expect(res.status).toBe(400);

		const body = await res.json();
		expect(body.error).toContain("Email format is invalid");
	});

	test("register requires username for UsernameOnly strategy", async () => {
		const config = createCredentialsConfig({
			strategy: AuthStrategy.UsernameOnly,
		});
		const handlers = credentials(config);

		const req = new Request("http://localhost/auth/register", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				email: "notneeded@example.com",
				password: "password123",
			}),
		});

		const res = await handlers.handleRegister(req);
		expect(res.status).toBe(400);

		const body = await res.json();
		expect(body.error).toContain("Username is required");
	});

	test("register requires email for EmailOnly strategy", async () => {
		const config = createCredentialsConfig({
			strategy: AuthStrategy.EmailOnly,
		});
		const handlers = credentials(config);

		const req = new Request("http://localhost/auth/register", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				username: "notneeded",
				password: "password123",
			}),
		});

		const res = await handlers.handleRegister(req);
		expect(res.status).toBe(400);

		const body = await res.json();
		expect(body.error).toContain("Email is required");
	});

	test("register handles invalid JSON body", async () => {
		const config = createCredentialsConfig();
		const handlers = credentials(config);

		const req = new Request("http://localhost/auth/register", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: "not valid json",
		});

		const res = await handlers.handleRegister(req);
		expect(res.status).toBe(400);

		const body = await res.json();
		expect(body.error).toBe("Invalid JSON body");
	});

	test("login handles invalid JSON body", async () => {
		const config = createCredentialsConfig();
		const handlers = credentials(config);

		const req = new Request("http://localhost/auth/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: "not valid json",
		});

		const res = await handlers.handleLogin(req);
		expect(res.status).toBe(400);

		const body = await res.json();
		expect(body.error).toBe("Invalid JSON body");
	});

	test("handleRegister rejects non-POST method", async () => {
		const config = createCredentialsConfig();
		const handlers = credentials(config);

		const req = new Request("http://localhost/auth/register", {
			method: "GET",
		});

		const res = await handlers.handleRegister(req);
		expect(res.status).toBe(405);

		const body = await res.json();
		expect(body.error).toBe("Method not allowed");
	});

	test("handleLogin rejects non-POST method", async () => {
		const config = createCredentialsConfig();
		const handlers = credentials(config);

		const req = new Request("http://localhost/auth/login", {
			method: "GET",
		});

		const res = await handlers.handleLogin(req);
		expect(res.status).toBe(405);

		const body = await res.json();
		expect(body.error).toBe("Method not allowed");
	});

	test("handleLogout rejects non-POST method", async () => {
		const config = createCredentialsConfig();
		const handlers = credentials(config);

		const req = new Request("http://localhost/auth/logout", {
			method: "GET",
		});

		const res = await handlers.handleLogout(req);
		expect(res.status).toBe(405);

		const body = await res.json();
		expect(body.error).toBe("Method not allowed");
	});

	test("handleMe returns 401 without cookie", async () => {
		const config = createCredentialsConfig();
		const handlers = credentials(config);

		const req = new Request("http://localhost/auth/me");

		const res = await handlers.handleMe(req);
		expect(res.status).toBe(401);

		const body = await res.json();
		expect(body.error).toBe("Unauthorized");
	});

	test("handleMe returns 401 with invalid token", async () => {
		const config = createCredentialsConfig();
		const handlers = credentials(config);

		const req = new Request("http://localhost/auth/me", {
			headers: { Cookie: "credentials-session=invalid-token" },
		});

		const res = await handlers.handleMe(req);
		expect(res.status).toBe(401);

		const body = await res.json();
		expect(body.error).toBe("Invalid session");
	});

	test("getSession returns null without token", async () => {
		const config = createCredentialsConfig();
		const handlers = credentials(config);

		const req = new Request("http://localhost/");
		const session = await handlers.getSession(req);
		expect(session).toBeNull();
	});

	test("getSession returns null with invalid token", async () => {
		const config = createCredentialsConfig();
		const handlers = credentials(config);

		const req = new Request("http://localhost/", {
			headers: { Cookie: "credentials-session=invalid" },
		});
		const session = await handlers.getSession(req);
		expect(session).toBeNull();
	});

	test("withAuth returns 401 without session", async () => {
		const config = createCredentialsConfig();
		const handlers = credentials(config);

		const protectedHandler = handlers.withAuth(async () => new Response("OK"));
		const req = new Request("http://localhost/protected");
		const res = await protectedHandler(req);

		expect(res.status).toBe(401);
		const body = await res.json();
		expect(body.error).toBe("Unauthorized");
	});

	test("errorResponse handles non-AuthError", async () => {
		const config = createCredentialsConfig();
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
		await handlers.handleRegister(registerReq);

		const loginReq = new Request("http://localhost/auth/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				username: "testuser",
				password: "wrongpassword",
			}),
		});
		const loginRes = await handlers.handleLogin(loginReq);
		expect(loginRes.status).toBe(401);
	});
});

describe("credentials - brute force edge cases", () => {
	test("brute force protection blocks on exact maxAttempts", async () => {
		const config = createCredentialsConfig({
			bruteForce: {
				enabled: true,
				maxAttempts: 2,
				windowMs: 60000,
				blockDurationMs: 60000,
			},
		});
		const handlers = credentials(config);

		await handlers.handleRegister(
			new Request("http://localhost/auth/register", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					username: "bfuser",
					email: "bf@example.com",
					password: "correctpass",
				}),
			}),
		);

		const makeLoginReq = () =>
			new Request("http://localhost/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					username: "bfuser",
					password: "wrongpass",
				}),
			});

		const firstFail = await handlers.handleLogin(makeLoginReq());
		expect(firstFail.status).toBe(401);

		const blocked = await handlers.handleLogin(makeLoginReq());
		expect(blocked.status).toBe(429);

		const body = await blocked.json();
		expect(body.code).toBe("BRUTE_FORCE_BLOCKED");
		expect(blocked.headers.get("Retry-After")).toBeDefined();
		expect(blocked.headers.get("RateLimit-Limit")).toBe("5");
		expect(blocked.headers.get("RateLimit-Remaining")).toBe("0");
	});

	test("brute force key includes strategy and IP", async () => {
		const { BruteForceProtection } = await import("../credentials");
		const req = new Request("http://localhost", {
			headers: {
				"x-forwarded-for": "192.168.1.50",
				"user-agent": "TestBrowser/1.0",
			},
		});

		const key = await BruteForceProtection.extractKey(
			req,
			AuthStrategy.UsernameOnly,
		);
		expect(key).toContain("username-only");
		expect(key).toContain("192.168.1.50");
		expect(key).toContain("TestBrowser/1.0");
	});
});

describe("credentials - custom password length", () => {
	test("register uses default min password length of 8", async () => {
		const config = createCredentialsConfig();
		const handlers = credentials(config);

		const req = new Request("http://localhost/auth/register", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				username: "custompass",
				email: "custom@example.com",
				password: "short123",
			}),
		});

		const res = await handlers.handleRegister(req);
		expect(res.status).toBe(201);
	});
});

describe("credentials - response headers", () => {
	test("brute force blocked response includes rate limit headers", async () => {
		const config = createCredentialsConfig({
			bruteForce: {
				enabled: true,
				maxAttempts: 1,
				windowMs: 60000,
				blockDurationMs: 60000,
			},
		});
		const handlers = credentials(config);

		await handlers.handleRegister(
			new Request("http://localhost/auth/register", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					username: "headeruser",
					email: "header@example.com",
					password: "password123",
				}),
			}),
		);

		const loginReq = new Request("http://localhost/auth/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				username: "headeruser",
				password: "wrongpass",
			}),
		});

		const blockedRes = await handlers.handleLogin(loginReq);
		expect(blockedRes.status).toBe(429);

		expect(blockedRes.headers.get("RateLimit-Limit")).toBe("5");
		expect(blockedRes.headers.get("RateLimit-Remaining")).toBe("0");
		expect(blockedRes.headers.get("RateLimit-Reset")).toBeDefined();
		expect(blockedRes.headers.get("Retry-After")).toBeDefined();
	});
});
