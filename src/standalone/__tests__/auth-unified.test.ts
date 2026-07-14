import { describe, expect, test } from "bun:test";
import type { AuthUserStorage } from "../../core/credentials/storage";
import type { PasswordHasher } from "../../core/credentials/hasher";
import { AuthStrategy } from "../../core/credentials/strategy";
import { auth } from "../auth";

const mockHasher: PasswordHasher = {
	async hash(password: string): Promise<string> {
		return `hashed:${password}`;
	},
	async verify(password: string, hash: string): Promise<boolean> {
		return hash === `hashed:${password}`;
	},
};

class MockStorage implements AuthUserStorage {
	private users = new Map<string, any>();

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
		return this.users.get(id) || null;
	}

	async create(data: any) {
		const id = crypto.randomUUID();
		const user = { ...data, id, createdAt: new Date(), updatedAt: new Date() };
		this.users.set(id, user);
		return user;
	}

	async update(id: string, data: Partial<any>) {
		const existing = this.users.get(id);
		if (!existing) throw new Error("User not found");
		const updated = { ...existing, ...data, updatedAt: new Date() };
		this.users.set(id, updated);
		return updated;
	}

	async delete(id: string) {
		this.users.delete(id);
	}
}

const SECRET = "test-secret-unified";
const storage = new MockStorage();
const hasher: PasswordHasher = mockHasher;

function makeRequest(
	method: string,
	path: string,
	body?: Record<string, unknown>,
	cookie?: string,
): Request {
	const url = `http://localhost${path}`;
	const headers = new Headers({ "Content-Type": "application/json" });
	if (cookie) {
		headers.set("cookie", cookie);
	}
	return new Request(url, {
		method,
		headers,
		body: body ? JSON.stringify(body) : undefined,
	});
}

describe("auth() unified API", () => {
	describe("provider: 'credentials'", () => {
		test("returns credentials handlers mapped to generic names", () => {
			const result = auth({
				provider: "credentials",
				credentials: {
					strategy: AuthStrategy.UsernameEmail,
					session: { type: "jwt", secret: SECRET, expiresIn: "7d", cookieName: "credentials-session" },
					storage,
					hasher,
				},
			});

			expect(result.handleLogin).toBeDefined();
			expect(result.handleLogout).toBeDefined();
			expect(result.handleMe).toBeDefined();
			expect(result.handleCallback).toBeUndefined();
		});

		test("register creates user and sets session cookie", async () => {
			const result = auth({
				provider: "credentials",
				credentials: {
					strategy: AuthStrategy.UsernameEmail,
					session: { type: "jwt", secret: SECRET, expiresIn: "7d", cookieName: "credentials-session" },
					storage,
					hasher,
				},
			});

			const res = await result.handleRegister!(
				makeRequest("POST", "/auth/credentials/register", {
					username: "unifieduser",
					email: "unified@example.com",
					password: "password123",
				}),
			);
			expect(res.status).toBe(302);
			expect(res.headers.get("Set-Cookie")).toContain("credentials-session");
		});

		test("login works after register", async () => {
			const result = auth({
				provider: "credentials",
				credentials: {
					strategy: AuthStrategy.UsernameEmail,
					session: { type: "jwt", secret: SECRET, expiresIn: "7d", cookieName: "credentials-session" },
					storage,
					hasher,
				},
			});

			await result.handleRegister!(
				makeRequest("POST", "/auth/credentials/register", {
					username: "loginunified",
					email: "loginunified@example.com",
					password: "password123",
				}),
			);

			const loginRes = await result.handleLogin(
				makeRequest("POST", "/auth/credentials/login", {
					username: "loginunified",
					password: "password123",
				}),
			);
			expect(loginRes.status).toBe(302);
			expect(loginRes.headers.get("Set-Cookie")).toContain("credentials-session");
		});

		test("me returns user data with valid session", async () => {
			const result = auth({
				provider: "credentials",
				credentials: {
					strategy: AuthStrategy.UsernameEmail,
					session: { type: "jwt", secret: SECRET, expiresIn: "7d", cookieName: "credentials-session" },
					storage,
					hasher,
				},
			});

			const registerRes = await result.handleRegister!(
				makeRequest("POST", "/auth/credentials/register", {
					username: "meunified",
					email: "meunified@example.com",
					password: "password123",
				}),
			);

			const setCookie = registerRes.headers.get("Set-Cookie")!;
			const tokenMatch = setCookie.match(/credentials-session=([^;]+)/);
			const token = tokenMatch?.[1];
			expect(token).toBeTruthy();

			const meRes = await result.handleMe(
				makeRequest("GET", "/auth/credentials/me", undefined, `credentials-session=${token}`),
			);
			expect(meRes.status).toBe(200);
			const user = await meRes.json();
			expect(user.username).toBe("meunified");
			expect(user.email).toBe("meunified@example.com");
			expect(user.passwordHash).toBeUndefined();
		});

		test("logout clears session cookie", async () => {
			const result = auth({
				provider: "credentials",
				credentials: {
					strategy: AuthStrategy.UsernameEmail,
					session: { type: "jwt", secret: SECRET, expiresIn: "7d", cookieName: "credentials-session" },
					storage,
					hasher,
				},
			});

			const logoutRes = await result.handleLogout(
				makeRequest("GET", "/auth/credentials/logout"),
			);
			expect(logoutRes.status).toBe(302);
			expect(logoutRes.headers.get("Location")).toBe("/");
			const setCookie = logoutRes.headers.get("Set-Cookie")!;
			expect(setCookie).toContain("credentials-session=");
			expect(setCookie).toContain("Max-Age=0");
		});
	});

	describe("provider: 'both'", () => {
		test("returns handleLogin and handleCallback as stubs (501)", () => {
			const result = auth({
				provider: "both",
				clientId: "mock-client-id",
				clientSecret: "mock-client-secret",
				session: { type: "jwt", secret: SECRET },
				credentials: {
					strategy: AuthStrategy.UsernameEmail,
					session: { type: "jwt", secret: SECRET, expiresIn: "7d", cookieName: "credentials-session" },
					storage,
					hasher,
				},
			});

			expect(result.handleLogin).toBeDefined();
			expect(result.handleCallback).toBeDefined();
			expect(result.handleLogout).toBeDefined();
			expect(result.handleMe).toBeDefined();
		});

		test("credentials handlers accessible with prefixed names", async () => {
			const result = auth({
				provider: "both",
				clientId: "mock-client-id",
				clientSecret: "mock-client-secret",
				session: { type: "jwt", secret: SECRET },
				credentials: {
					strategy: AuthStrategy.UsernameEmail,
					session: { type: "jwt", secret: SECRET, expiresIn: "7d", cookieName: "credentials-session" },
					storage,
					hasher,
				},
			});

			const res = await (result as any).handleCredentialsRegister!(
				makeRequest("POST", "/auth/credentials/register", {
					username: "bothuser",
					email: "both@example.com",
					password: "password123",
				}),
			);
			expect(res.status).toBe(302);
			expect(res.headers.get("Set-Cookie")).toContain("credentials-session");
		});
	});

	describe("validation", () => {
		test("throws if provider is 'credentials' but credentials config is missing", () => {
			expect(() =>
				auth({
					provider: "credentials",
				}),
			).toThrow("Credentials provider requires credentials config");
		});

		test("throws if provider is 'discord' but clientId is missing", () => {
			expect(() =>
				auth({
					provider: "discord",
					clientSecret: "secret",
					session: { type: "jwt", secret: SECRET },
				}),
			).toThrow("Discord provider requires clientId and clientSecret");
		});

		test("throws if provider is 'both' but credentials config is missing", () => {
			expect(() =>
				auth({
					provider: "both",
					clientId: "id",
					clientSecret: "secret",
					session: { type: "jwt", secret: SECRET },
				}),
			).toThrow("Credentials provider requires credentials config");
		});

		test("throws if provider is 'both' but clientId is missing", () => {
			expect(() =>
				auth({
					provider: "both",
					session: { type: "jwt", secret: SECRET },
					credentials: {
						strategy: AuthStrategy.UsernameEmail,
						session: { type: "jwt", secret: SECRET },
						storage,
						hasher,
					},
				}),
			).toThrow("Discord provider requires clientId and clientSecret");
		});
	});
});
