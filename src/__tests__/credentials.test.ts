import { beforeEach, describe, expect, test } from "bun:test";
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
			secret: "test-session-secret-32-chars-long!!",
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

describe("credentials - integration flow", () => {
	let config: ReturnType<typeof createCredentialsConfig>;
	let handlers: ReturnType<typeof credentials>;

	beforeEach(() => {
		config = createCredentialsConfig();
		handlers = credentials(config);
	});

	test("InMemoryUserStorage update and delete", async () => {
		const storage = new InMemoryUserStorage();
		const user = await storage.create({
			username: "testuser",
			email: "test@example.com",
			passwordHash: "hash",
			roles: ["user"],
		});

		const updated = await storage.update(user.id, { username: "updated" });
		expect(updated.username).toBe("updated");

		await storage.delete(user.id);
		const found = await storage.findById(user.id);
		expect(found).toBeNull();
	});

	test("InMemoryUserStorage update throws on missing user", async () => {
		const storage = new InMemoryUserStorage();
		await expect(
			storage.update("nonexistent", { username: "x" }),
		).rejects.toThrow("User not found");
	});

	test("register → login → me → logout flow", async () => {
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
		expect(registerRes.status).toBe(201);

		const registerBody = await registerRes.json();
		expect(registerBody.user.username).toBe("testuser");
		expect(registerBody.user.email).toBe("test@example.com");
		expect(registerBody.token).toBeDefined();

		const sessionCookie = registerRes.headers.get("Set-Cookie");
		expect(sessionCookie).toContain("credentials-session=");

		const loginReq = new Request("http://localhost/auth/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				username: "testuser",
				password: "password123",
			}),
		});
		const loginRes = await handlers.handleLogin(loginReq);
		expect(loginRes.status).toBe(200);

		const loginBody = await loginRes.json();
		expect(loginBody.user.username).toBe("testuser");

		const loginCookie = loginRes.headers.get("Set-Cookie");

		const meReq = new Request("http://localhost/auth/me", {
			headers: { Cookie: loginCookie ?? "" },
		});
		const meRes = await handlers.handleMe(meReq);
		expect(meRes.status).toBe(200);

		const meBody = await meRes.json();
		expect(meBody.username).toBe("testuser");

		const logoutReq = new Request("http://localhost/auth/logout", {
			method: "POST",
			headers: { Cookie: loginCookie ?? "" },
		});
		const logoutRes = await handlers.handleLogout(logoutReq);
		expect(logoutRes.status).toBe(200);

		const logoutBody = await logoutRes.json();
		expect(logoutBody.ok).toBe(true);

		const clearCookie = logoutRes.headers.get("Set-Cookie");
		expect(clearCookie).toContain("credentials-session=");
		expect(clearCookie).toContain("Max-Age=0");
	});

	test("register with email only strategy", async () => {
		const emailOnlyConfig = createCredentialsConfig({
			strategy: AuthStrategy.EmailOnly,
		});
		const emailHandlers = credentials(emailOnlyConfig);

		const req = new Request("http://localhost/auth/register", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				email: "emailonly@example.com",
				password: "password123",
			}),
		});
		const res = await emailHandlers.handleRegister(req);
		expect(res.status).toBe(201);
	});

	test("register with username only strategy", async () => {
		const usernameOnlyConfig = createCredentialsConfig({
			strategy: AuthStrategy.UsernameOnly,
		});
		const usernameHandlers = credentials(usernameOnlyConfig);

		const req = new Request("http://localhost/auth/register", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				username: "usernameonly",
				password: "password123",
			}),
		});
		const res = await usernameHandlers.handleRegister(req);
		expect(res.status).toBe(201);
	});

	test("register rejects duplicate username", async () => {
		const req = new Request("http://localhost/auth/register", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				username: "duplicate",
				email: "dup@example.com",
				password: "password123",
			}),
		});
		await handlers.handleRegister(req);

		const req2 = new Request("http://localhost/auth/register", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				username: "duplicate",
				email: "other@example.com",
				password: "password123",
			}),
		});
		const res2 = await handlers.handleRegister(req2);
		expect(res2.status).toBe(409);

		const body = await res2.json();
		expect(body.code).toBe("USERNAME_TAKEN");
	});

	test("register rejects duplicate email", async () => {
		const req = new Request("http://localhost/auth/register", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				username: "user1",
				email: "same@example.com",
				password: "password123",
			}),
		});
		await handlers.handleRegister(req);

		const req2 = new Request("http://localhost/auth/register", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				username: "user2",
				email: "same@example.com",
				password: "password123",
			}),
		});
		const res2 = await handlers.handleRegister(req2);
		expect(res2.status).toBe(409);

		const body = await res2.json();
		expect(body.code).toBe("EMAIL_TAKEN");
	});

	test("login rejects invalid credentials", async () => {
		const req = new Request("http://localhost/auth/register", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				username: "validuser",
				email: "valid@example.com",
				password: "correctpassword",
			}),
		});
		await handlers.handleRegister(req);

		const loginReq = new Request("http://localhost/auth/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				username: "validuser",
				password: "wrongpassword",
			}),
		});
		const loginRes = await handlers.handleLogin(loginReq);
		expect(loginRes.status).toBe(401);

		const body = await loginRes.json();
		expect(body.code).toBe("INVALID_CREDENTIALS");
	});

	test("login rejects non-existent user", async () => {
		const loginReq = new Request("http://localhost/auth/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				username: "nonexistent",
				password: "password123",
			}),
		});
		const loginRes = await handlers.handleLogin(loginReq);
		expect(loginRes.status).toBe(401);

		const body = await loginRes.json();
		expect(body.code).toBe("INVALID_CREDENTIALS");
	});

	test("brute force protection blocks after max attempts", async () => {
		const bruteForceConfig = createCredentialsConfig({
			bruteForce: {
				enabled: true,
				maxAttempts: 3,
				windowMs: 60000,
				blockDurationMs: 60000,
			},
		});
		const bfHandlers = credentials(bruteForceConfig);

		// First register a user with the brute force handlers
		const registerReq = new Request("http://localhost/auth/register", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				username: "bruteuser",
				email: "brute@example.com",
				password: "correctpass",
			}),
		});
		const regRes = await bfHandlers.handleRegister(registerReq);
		expect(regRes.status).toBe(201);

		const makeLoginReq = () =>
			new Request("http://localhost/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					username: "bruteuser",
					password: "wrongpass",
				}),
			});

		// First 2 attempts should return 401 (not yet blocked)
		for (let i = 0; i < 2; i++) {
			const res = await bfHandlers.handleLogin(makeLoginReq());
			expect(res.status).toBe(401);
		}

		// 3rd attempt should be blocked (429)
		const blockedRes = await bfHandlers.handleLogin(makeLoginReq());
		expect(blockedRes.status).toBe(429);

		const body = await blockedRes.json();
		expect(body.code).toBe("BRUTE_FORCE_BLOCKED");
	});

	test("brute force resets on successful login", async () => {
		const bruteForceConfig = createCredentialsConfig({
			bruteForce: {
				enabled: true,
				maxAttempts: 2,
				windowMs: 60000,
				blockDurationMs: 60000,
			},
		});
		const bfHandlers = credentials(bruteForceConfig);

		await bfHandlers.handleRegister(
			new Request("http://localhost/auth/register", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					username: "brutetest",
					email: "brute@example.com",
					password: "correctpass",
				}),
			}),
		);

		const makeBadReq = () =>
			new Request("http://localhost/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					username: "brutetest",
					password: "wrongpass",
				}),
			});

		await bfHandlers.handleLogin(makeBadReq());

		const goodReq = new Request("http://localhost/auth/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				username: "brutetest",
				password: "correctpass",
			}),
		});
		const goodRes = await bfHandlers.handleLogin(goodReq);
		expect(goodRes.status).toBe(200);
	});

	test("getSession returns user with valid token", async () => {
		const registerReq = new Request("http://localhost/auth/register", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				username: "sessionuser",
				email: "session@example.com",
				password: "password123",
			}),
		});
		const registerRes = await handlers.handleRegister(registerReq);
		const token = (await registerRes.json()).token;

		const session = await handlers.getSession(
			new Request("http://localhost/", {
				headers: { Cookie: `credentials-session=${token}` },
			}),
		);
		expect(session).not.toBeNull();
		expect(session?.username).toBe("sessionuser");
	});

	test("getSession returns null for invalid token", async () => {
		const session = await handlers.getSession(
			new Request("http://localhost/", {
				headers: { Cookie: "credentials-session=invalid-token" },
			}),
		);
		expect(session).toBeNull();
	});

	test("withAuth middleware protects routes", async () => {
		const registerReq = new Request("http://localhost/auth/register", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				username: "authuser",
				email: "auth@example.com",
				password: "password123",
			}),
		});
		const registerRes = await handlers.handleRegister(registerReq);
		const token = (await registerRes.json()).token;

		const protectedHandler = handlers.withAuth(async (_req, ctx) => {
			return new Response(JSON.stringify({ userId: ctx.user.id }), {
				headers: { "Content-Type": "application/json" },
			});
		});

		const protectedReq = new Request("http://localhost/protected", {
			headers: { Cookie: `credentials-session=${token}` },
		});
		const protectedRes = await protectedHandler(protectedReq);
		expect(protectedRes.status).toBe(200);
		const body = await protectedRes.json();
		expect(body.userId).toBeDefined();
	});

	test("withAuth returns 401 without session", async () => {
		const protectedHandler = handlers.withAuth(async () => new Response("OK"));

		const req = new Request("http://localhost/protected");
		const res = await protectedHandler(req);
		expect(res.status).toBe(401);
	});
});

describe("BruteForceProtection - additional methods", () => {
	test("extractKey constructs correct key", async () => {
		const { BruteForceProtection } = await import("../credentials");
		const req = new Request("http://localhost", {
			headers: {
				"x-forwarded-for": "10.0.0.1, 10.0.0.2",
				"user-agent": "TestAgent/1.0",
			},
		});
		const key = BruteForceProtection.extractKey(req);
		expect(key).toContain("10.0.0.1");
		expect(key).toContain("TestAgent/1.0");
	});

	test("extractKey falls back to x-real-ip", async () => {
		const { BruteForceProtection } = await import("../credentials");
		const req = new Request("http://localhost", {
			headers: {
				"x-real-ip": "10.0.0.5",
				"user-agent": "Agent",
			},
		});
		const key = BruteForceProtection.extractKey(req);
		expect(key).toContain("10.0.0.5");
	});

	test("extractKey handles missing headers", async () => {
		const { BruteForceProtection } = await import("../credentials");
		const req = new Request("http://localhost");
		const key = BruteForceProtection.extractKey(req);
		expect(key).toContain("unknown");
	});

	test("getRemainingAttempts returns 0 when blocked", async () => {
		const { BruteForceProtection, MemoryBruteForceStorage } = await import(
			"../credentials"
		);
		const storage = new MemoryBruteForceStorage();
		const bf = new BruteForceProtection({
			enabled: true,
			maxAttempts: 3,
			windowMs: 60000,
			blockDurationMs: 60000,
			storage,
		});
		await storage.block("test-key", 60000);
		const remaining = await bf.getRemainingAttempts("test-key");
		expect(remaining).toBe(0);
	});

	test("getRemainingAttempts returns max when disabled", async () => {
		const { BruteForceProtection } = await import("../credentials");
		const bf = new BruteForceProtection({ enabled: false });
		const remaining = await bf.getRemainingAttempts("any-key");
		expect(remaining).toBe(5);
	});

	test("getRetryAfter returns block duration", async () => {
		const { BruteForceProtection } = await import("../credentials");
		const bf = new BruteForceProtection({
			enabled: true,
			blockDurationMs: 12345,
		});
		const retryAfter = await bf.getRetryAfter("key");
		expect(retryAfter).toBe(12345);
	});

	test("getRetryAfter returns undefined when disabled", async () => {
		const { BruteForceProtection } = await import("../credentials");
		const bf = new BruteForceProtection({ enabled: false });
		const retryAfter = await bf.getRetryAfter("key");
		expect(retryAfter).toBeUndefined();
	});

	test("reset does nothing when disabled", async () => {
		const { BruteForceProtection } = await import("../credentials");
		const bf = new BruteForceProtection({ enabled: false });
		await expect(bf.reset("key")).resolves.toBeUndefined();
	});

	test("MemoryBruteForceStorage block and getCount", async () => {
		const { MemoryBruteForceStorage } = await import("../credentials");
		const storage = new MemoryBruteForceStorage();
		await storage.block("block-key", 60000);
		const count = await storage.getCount("block-key");
		expect(count).toBe(0);
	});

	test("MemoryBruteForceStorage getCount returns 0 for expired entry", async () => {
		const { MemoryBruteForceStorage } = await import("../credentials");
		const storage = new MemoryBruteForceStorage();
		await storage.increment("exp-count", -1000);
		const count = await storage.getCount("exp-count");
		expect(count).toBe(0);
	});

	test("MemoryBruteForceStorage block stops isBlocked from returning true after expiry", async () => {
		const { MemoryBruteForceStorage } = await import("../credentials");
		const storage = new MemoryBruteForceStorage();
		await storage.block("temp-block", 1);
		await new Promise((r) => setTimeout(r, 5));
		const blocked = await storage.isBlocked("temp-block");
		expect(blocked).toBe(false);
	});
});
