import { describe, expect, test } from "bun:test";
import type { AuthUserStorage } from "../../../src/";
import { credentials } from "../../../src/";
import { TestBruteForceStorage } from "../../helpers/storage";

function extractSessionToken(res: Response): string {
	const setCookie = res.headers.get("Set-Cookie");
	if (!setCookie) throw new Error("Missing Set-Cookie header");
	const match = setCookie.match(/credentials-session=([^;]+)/);
	if (!match) throw new Error("Missing session cookie in Set-Cookie");
	return match[1] as string;
}

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

	async verifyPassword(userId: string, password: string): Promise<boolean> {
		const user = this.users.get(userId);
		if (!user) return false;
		return user.password === password;
	}

	async findByDiscordId(_discordId: string): Promise<AuthUser | null> {
		return null;
	}
}

describe("credentials - handleMe coverage", () => {
	test("handleMe returns user with valid token", async () => {
		const storage = new InMemoryUserStorage();

		const config = {
			emailRequired: true,
			usernameRequired: true,
			bruteForce: { storage: new TestBruteForceStorage() },
			storage,
			session: {
				secret: process.env.TEST_SECRET || "5K8qN2mR9pL3vX7wJ4tY6hF1dS0aG8bC2eU5iO9xM3nZ7kV4rW1qP6yT0uI8oA2",
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
				username: "meuser",
				email: "me@example.com",
				password: "SecurePass123!",
			}),
		});

		const registerRes = await handlers.handleRegister(registerReq);
		const token = extractSessionToken(registerRes);

		const meReq = new Request("http://localhost/auth/me", {
			headers: { Cookie: `credentials-session=${token}` },
		});

		const meRes = await handlers.handleMe(meReq);
		expect(meRes.status).toBe(200);

		const body = await meRes.json();
		expect(body.username).toBe("meuser");
		expect(body.email).toBe("me@example.com");
	});

	test("handleMe returns 401 when token is missing", async () => {
		const storage = new InMemoryUserStorage();

		const config = {
			emailRequired: true,
			usernameRequired: true,
			bruteForce: { storage: new TestBruteForceStorage() },
			storage,
			session: {
				secret: process.env.TEST_SECRET || "5K8qN2mR9pL3vX7wJ4tY6hF1dS0aG8bC2eU5iO9xM3nZ7kV4rW1qP6yT0uI8oA2",
				expiresIn: "7d",
				cookieName: "credentials-session",
			},
			cookiePath: "/",
			sameSite: "lax" as const,
			secure: false,
			httpOnly: true,
		};

		const handlers = credentials(config);

		const meReq = new Request("http://localhost/auth/me");
		const meRes = await handlers.handleMe(meReq);

		expect(meRes.status).toBe(401);
		const body = await meRes.json();
		expect(body.error).toBe("Unauthorized");
	});

	test("handleMe returns 401 when token is invalid", async () => {
		const storage = new InMemoryUserStorage();

		const config = {
			emailRequired: true,
			usernameRequired: true,
			bruteForce: { storage: new TestBruteForceStorage() },
			storage,
			session: {
				secret: process.env.TEST_SECRET || "5K8qN2mR9pL3vX7wJ4tY6hF1dS0aG8bC2eU5iO9xM3nZ7kV4rW1qP6yT0uI8oA2",
				expiresIn: "7d",
				cookieName: "credentials-session",
			},
			cookiePath: "/",
			sameSite: "lax" as const,
			secure: false,
			httpOnly: true,
		};

		const handlers = credentials(config);

		const meReq = new Request("http://localhost/auth/me", {
			headers: { Cookie: "credentials-session=invalid-token" },
		});

		const meRes = await handlers.handleMe(meReq);
		expect(meRes.status).toBe(401);

		const body = await meRes.json();
		expect(body.error).toBe("Invalid session");
	});

	test("handleMe returns 401 when user not found", async () => {
		const storage = new InMemoryUserStorage();

		const config = {
			emailRequired: true,
			usernameRequired: true,
			bruteForce: { storage: new TestBruteForceStorage() },
			storage,
			session: {
				secret: process.env.TEST_SECRET || "5K8qN2mR9pL3vX7wJ4tY6hF1dS0aG8bC2eU5iO9xM3nZ7kV4rW1qP6yT0uI8oA2",
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
				username: "tempuser",
				email: "temp@example.com",
				password: "SecurePass123!",
			}),
		});

		const registerRes = await handlers.handleRegister(registerReq);
		const token = extractSessionToken(registerRes);

		await storage.delete("user-1");

		const meReq = new Request("http://localhost/auth/me", {
			headers: { Cookie: `credentials-session=${token}` },
		});

		const meRes = await handlers.handleMe(meReq);
		expect(meRes.status).toBe(401);

		const body = await meRes.json();
		expect(body.error).toBe("Invalid session");
	});

	test("handleMe handles verifySession returning null gracefully", async () => {
		const storage = new InMemoryUserStorage();

		const config = {
			emailRequired: true,
			usernameRequired: true,
			bruteForce: { storage: new TestBruteForceStorage() },
			storage,
			session: {
				secret: process.env.TEST_SECRET || "5K8qN2mR9pL3vX7wJ4tY6hF1dS0aG8bC2eU5iO9xM3nZ7kV4rW1qP6yT0uI8oA2",
				expiresIn: "7d",
				cookieName: "credentials-session",
			},
			cookiePath: "/",
			sameSite: "lax" as const,
			secure: false,
			httpOnly: true,
		};

		const handlers = credentials(config);

		const meReq = new Request("http://localhost/auth/me", {
			headers: { Cookie: "credentials-session=invalid-token" },
		});

		const meRes = await handlers.handleMe(meReq);
		expect(meRes.status).toBe(401);

		const body = await meRes.json();
		expect(body.error).toBe("Invalid session");
	});
});

describe("credentials - handleLogout coverage", () => {
	test("handleLogout returns 405 for non-POST method", async () => {
		const storage = new InMemoryUserStorage();

		const config = {
			emailRequired: true,
			usernameRequired: true,
			bruteForce: { storage: new TestBruteForceStorage() },
			storage,
			session: {
				secret: process.env.TEST_SECRET || "5K8qN2mR9pL3vX7wJ4tY6hF1dS0aG8bC2eU5iO9xM3nZ7kV4rW1qP6yT0uI8oA2",
				expiresIn: "7d",
				cookieName: "credentials-session",
			},
			cookiePath: "/",
			sameSite: "lax" as const,
			secure: false,
			httpOnly: true,
		};

		const handlers = credentials(config);

		const logoutReq = new Request("http://localhost/auth/logout", {
			method: "GET",
		});

		const logoutRes = await handlers.handleLogout(logoutReq);
		expect(logoutRes.status).toBe(405);

		const body = await logoutRes.json();
		expect(body.error).toBe("Method not allowed");
	});

	test("handleLogout succeeds with POST", async () => {
		const storage = new InMemoryUserStorage();

		const config = {
			emailRequired: true,
			usernameRequired: true,
			bruteForce: { storage: new TestBruteForceStorage() },
			storage,
			session: {
				secret: process.env.TEST_SECRET || "5K8qN2mR9pL3vX7wJ4tY6hF1dS0aG8bC2eU5iO9xM3nZ7kV4rW1qP6yT0uI8oA2",
				expiresIn: "7d",
				cookieName: "credentials-session",
			},
			cookiePath: "/",
			sameSite: "lax" as const,
			secure: false,
			httpOnly: true,
		};

		const handlers = credentials(config);

		const logoutReq = new Request("http://localhost/auth/logout", {
			method: "POST",
		});

		const logoutRes = await handlers.handleLogout(logoutReq);
		expect(logoutRes.status).toBe(200);

		const body = await logoutRes.json();
		expect(body.ok).toBe(true);

		const clearCookie = logoutRes.headers.get("Set-Cookie");
		expect(clearCookie).toContain("credentials-session=");
		expect(clearCookie).toContain("Max-Age=0");
	});
});


