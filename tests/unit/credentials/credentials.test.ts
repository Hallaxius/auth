import { beforeEach, describe, expect, test, mock } from "bun:test";
import type { AuthUserStorage } from "../../../src/";
import { credentials } from "../../../src/";
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

function createCredentialsConfig(
	overrides: Partial<{
		emailRequired: boolean;
		usernameRequired: boolean;
		storage: AuthUserStorage;
		bruteForce: {
			enabled: boolean;
			maxAttempts: number;
			windowMs: number;
			blockDurationMs: number;
			storage?: unknown;
		};
	}> = {},
) {
	return {
		emailRequired: overrides.emailRequired ?? true,
		usernameRequired: overrides.usernameRequired ?? true,
		storage: overrides.storage ?? new InMemoryUserStorage(),
		session: {
			secret: process.env.TEST_SECRET || "5K8qN2mR9pL3vX7wJ4tY6hF1dS0aG8bC2eU5iO9xM3nZ7kV4rW1qP6yT0uI8oA2",
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
			storage: new TestBruteForceStorage(),
		},
	};
}

describe("credentials - core flows", () => {
	let storage: InMemoryUserStorage;
	let handlers: ReturnType<typeof credentials>;

	function extractSessionToken(res: Response): string {
		const setCookie = res.headers.get("Set-Cookie");
		if (!setCookie) throw new Error("Missing Set-Cookie header");
		const match = setCookie.match(/credentials-session=([^;]+)/);
		if (!match) throw new Error("Missing session cookie in Set-Cookie");
		return match[1] as string;
	}

	beforeEach(() => {
		storage = new InMemoryUserStorage();
		handlers = credentials(createCredentialsConfig({ storage }));
	});

	test("register creates a user and returns a token", async () => {
		const req = new Request("http://localhost/auth/register", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				username: "newuser",
				email: "new@example.com",
				password: "SecurePass123!",
			}),
		});

		const res = await handlers.handleRegister(req);
		expect(res.status).toBe(201);

		const body = await res.json();
		expect(body.user.username).toBe("newuser");
		expect(body.user.email).toBe("new@example.com");
		expect(body.token).toBeUndefined();
		expect(extractSessionToken(res)).toBeTruthy();
	});

	test("register validates password is provided", async () => {
		const req = new Request("http://localhost/auth/register", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				username: "nopass",
				email: "nopass@example.com",
				password: "",
			}),
		});

		const res = await handlers.handleRegister(req);
		expect(res.status).toBe(400);

		const body = await res.json();
		expect(body.error).toContain("Password is required");
	});

	test("register validates email format", async () => {
		const req = new Request("http://localhost/auth/register", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				username: "badmail",
				email: "invalid-email",
				password: "SecurePass123!",
			}),
		});

		const res = await handlers.handleRegister(req);
		expect(res.status).toBe(400);

		const body = await res.json();
		expect(body.error).toContain("Email format is invalid");
	});

	test("register rejects duplicate username", async () => {
		const req = new Request("http://localhost/auth/register", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				username: "dupuser",
				email: "dup@example.com",
				password: "SecurePass123!",
			}),
		});

		await handlers.handleRegister(req);

		const second = await handlers.handleRegister(
			new Request("http://localhost/auth/register", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					username: "dupuser",
					email: "other@example.com",
					password: "SecurePass123!",
				}),
			}),
		);
		expect(second.status).toBe(409);
	});

	test("register rejects duplicate email", async () => {
		const req = new Request("http://localhost/auth/register", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				username: "mailuser",
				email: "dup@example.com",
				password: "SecurePass123!",
			}),
		});

		await handlers.handleRegister(req);

		const second = await handlers.handleRegister(
			new Request("http://localhost/auth/register", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					username: "other",
					email: "dup@example.com",
					password: "SecurePass123!",
				}),
			}),
		);
		expect(second.status).toBe(409);
	});

	test("login succeeds with valid credentials", async () => {
		await handlers.handleRegister(
			new Request("http://localhost/auth/register", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					username: "loginuser",
					email: "login@example.com",
					password: "SecurePass123!",
				}),
			}),
		);

		const req = new Request("http://localhost/auth/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				username: "loginuser",
				password: "SecurePass123!",
			}),
		});

		const res = await handlers.handleLogin(req);
		expect(res.status).toBe(200);

		const body = await res.json();
		expect(body.token).toBeUndefined();
		expect(extractSessionToken(res)).toBeTruthy();
	});

	test("login returns 401 with invalid credentials", async () => {
		await handlers.handleRegister(
			new Request("http://localhost/auth/register", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					username: "loginuser",
					email: "login@example.com",
					password: "SecurePass123!",
				}),
			}),
		);

		const req = new Request("http://localhost/auth/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				username: "loginuser",
				password: "wrongpassword",
			}),
		});

		const res = await handlers.handleLogin(req);
		expect(res.status).toBe(401);
	});

	test("login returns 401 for unknown user", async () => {
		const req = new Request("http://localhost/auth/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				username: "ghostuser",
				password: "SecurePass123!",
			}),
		});

		const res = await handlers.handleLogin(req);
		expect(res.status).toBe(401);
	});

	test("login uses the verifyPassword hook when present", async () => {
		class HashingStore extends InMemoryUserStorage {
			async verifyPassword(_userId: string, password: string) {
				return password === "hashed-value";
			}
		}
		const hashingHandlers = credentials(
			createCredentialsConfig({ storage: new HashingStore() }),
		);
		await hashingHandlers.handleRegister(
			new Request("http://localhost/auth/register", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					username: "hashuser",
					email: "hash@example.com",
					password: "SecurePass123!",
				}),
			}),
		);

		const res = await hashingHandlers.handleLogin(
			new Request("http://localhost/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					username: "hashuser",
					password: "hashed-value",
				}),
			}),
		);
		expect(res.status).toBe(200);
	});

	test("login rejects when verifyPassword returns false", async () => {
		class RejectingStore extends InMemoryUserStorage {
			async verifyPassword() {
				return false;
			}
		}
		const rejectingHandlers = credentials(
			createCredentialsConfig({ storage: new RejectingStore() }),
		);
		await rejectingHandlers.handleRegister(
			new Request("http://localhost/auth/register", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					username: "hashuser",
					email: "hash@example.com",
					password: "SecurePass123!",
				}),
			}),
		);

		const res = await rejectingHandlers.handleLogin(
			new Request("http://localhost/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					username: "hashuser",
					password: "hashed-value",
				}),
			}),
		);
		expect(res.status).toBe(401);
	});


	test("handleMe returns user with valid token", async () => {
		const registerRes = await handlers.handleRegister(
			new Request("http://localhost/auth/register", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					username: "meuser",
					email: "me@example.com",
					password: "SecurePass123!",
				}),
			}),
		);
		const token = extractSessionToken(registerRes);

		const meRes = await handlers.handleMe(
			new Request("http://localhost/auth/me", {
				headers: { Cookie: `credentials-session=${token}` },
			}),
		);
		expect(meRes.status).toBe(200);

		const body = await meRes.json();
		expect(body.username).toBe("meuser");
	});

	test("handleMe returns 401 without token", async () => {
		const meRes = await handlers.handleMe(new Request("http://localhost/auth/me"));
		expect(meRes.status).toBe(401);
	});

	test("handleLogout returns 405 for GET", async () => {
		const res = await handlers.handleLogout(
			new Request("http://localhost/auth/logout", { method: "GET" }),
		);
		expect(res.status).toBe(405);
	});

	test("handleLogout clears session cookie on POST", async () => {
		const res = await handlers.handleLogout(
			new Request("http://localhost/auth/logout", { method: "POST" }),
		);
		expect(res.status).toBe(200);

		const setCookie = res.headers.get("Set-Cookie");
		expect(setCookie).toContain("credentials-session=");
		expect(setCookie).toContain("Max-Age=0");
	});

	test("withAuth passes user context to handler", async () => {
		const registerRes = await handlers.handleRegister(
			new Request("http://localhost/auth/register", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					username: "authuser",
					email: "auth@example.com",
					password: "SecurePass123!",
				}),
			}),
		);
		const token = extractSessionToken(registerRes);

		const wrapped = handlers.withAuth(async (_request, ctx) => {
			return new Response(
				JSON.stringify({ ok: true, username: ctx.user.username }),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			);
		});

		const res = await wrapped(
			new Request("http://localhost/auth/protected", {
				headers: { Cookie: `credentials-session=${token}` },
			}),
		);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: true, username: "authuser" });
	});
});


