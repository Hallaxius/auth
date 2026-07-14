import { describe, expect, test } from "bun:test";
import { CredentialsClient } from "../../core/credentials/client";
import { AuthStrategy } from "../../core/credentials/strategy";
import type { AuthUserStorage } from "../../core/credentials/storage";
import type { PasswordHasher } from "../../core/credentials/hasher";
import { createCredentialsHandlers } from "../credentials";

// Mock storage implementation for tests
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

const SECRET = "test-secret-local-handlers";
const storage = new MockStorage();
const hasher: PasswordHasher = {
	hash: async (password: string) => `hashed:${password}`,
	verify: async (password: string, hash: string) => hash === `hashed:${password}`,
};

function createTestClient() {
	return new CredentialsClient(
		{
			strategy: AuthStrategy.UsernameEmail,
			secret: SECRET,
			cookieName: "credentials-session",
			expiresIn: "7d",
		},
		storage,
		hasher,
	);
}

function makeRequest(
	method: string,
	path: string,
	body?: Record<string, unknown>,
	cookie?: string,
): Request {
	const url = `http://localhost${path}`;
	const headers = new Headers({
		"Content-Type": "application/json",
	});
	if (cookie) {
		headers.set("cookie", cookie);
	}
	return new Request(url, {
		method,
		headers,
		body: body ? JSON.stringify(body) : undefined,
	});
}

describe("createCredentialsHandlers", () => {
	describe("handleRegister", () => {
		test("rejects non-POST requests", async () => {
			const client = createTestClient();
			const { handleRegister } = createCredentialsHandlers({ client });
			const result = await handleRegister(makeRequest("GET", "/auth/credentials/register"));
			expect(result.status).toBe(405);
		});

		test("rejects invalid JSON body", async () => {
			const client = createTestClient();
			const { handleRegister } = createCredentialsHandlers({ client });
			const req = new Request("http://localhost/auth/credentials/register", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: "not-json",
			});
			const result = await handleRegister(req);
			expect(result.status).toBe(400);
		});

		test("registers a new user successfully", async () => {
			const client = createTestClient();
			const { handleRegister } = createCredentialsHandlers({ client });
			const result = await handleRegister(
				makeRequest("POST", "/auth/credentials/register", {
					username: "testuser",
					email: "test@example.com",
					password: "password123",
				}),
			);
			expect(result.status).toBe(302);
			expect(result.headers.get("Location")).toBe("/auth/credentials/me");
			expect(result.headers.get("Set-Cookie")).toContain("credentials-session");
		});

		test("rejects duplicate username", async () => {
			const client = createTestClient();
			const { handleRegister } = createCredentialsHandlers({ client });

			// First registration
			await handleRegister(
				makeRequest("POST", "/auth/credentials/register", {
					username: "duplicate",
					email: "dup1@example.com",
					password: "password123",
				}),
			);

			// Second registration with same username
			const result = await handleRegister(
				makeRequest("POST", "/auth/credentials/register", {
					username: "duplicate",
					email: "dup2@example.com",
					password: "password123",
				}),
			);
			expect(result.status).toBe(409);
			const json = await result.json();
			expect(json.code).toBe("USERNAME_TAKEN");
		});

		test("rejects duplicate email", async () => {
			const client = createTestClient();
			const { handleRegister } = createCredentialsHandlers({ client });

			// First registration
			await handleRegister(
				makeRequest("POST", "/auth/credentials/register", {
					username: "user1",
					email: "same@example.com",
					password: "password123",
				}),
			);

			// Second registration with same email
			const result = await handleRegister(
				makeRequest("POST", "/auth/credentials/register", {
					username: "user2",
					email: "same@example.com",
					password: "password123",
				}),
			);
			expect(result.status).toBe(409);
			const json = await result.json();
			expect(json.code).toBe("EMAIL_TAKEN");
		});
	});

	describe("handleLogin", () => {
		test("rejects non-POST requests", async () => {
			const client = createTestClient();
			const { handleLogin } = createCredentialsHandlers({ client });
			const result = await handleLogin(makeRequest("GET", "/auth/credentials/login"));
			expect(result.status).toBe(405);
		});

		test("rejects invalid credentials", async () => {
			const client = createTestClient();
			const { handleLogin, handleRegister } = createCredentialsHandlers({ client });

			// Register first
			await handleRegister(
				makeRequest("POST", "/auth/credentials/register", {
					username: "loginuser",
					email: "login@example.com",
					password: "password123",
				}),
			);

			// Try login with wrong password
			const result = await handleLogin(
				makeRequest("POST", "/auth/credentials/login", {
					username: "loginuser",
					password: "wrongpassword",
				}),
			);
			expect(result.status).toBe(401);
			const json = await result.json();
			expect(json.code).toBe("INVALID_CREDENTIALS");
		});

		test("logs in successfully with username", async () => {
			const client = createTestClient();
			const { handleLogin, handleRegister } = createCredentialsHandlers({ client });

			// Register first
			await handleRegister(
				makeRequest("POST", "/auth/credentials/register", {
					username: "successuser",
					email: "success@example.com",
					password: "password123",
				}),
			);

			// Login with username
			const result = await handleLogin(
				makeRequest("POST", "/auth/credentials/login", {
					username: "successuser",
					password: "password123",
				}),
			);
			expect(result.status).toBe(302);
			expect(result.headers.get("Location")).toBe("/");
			expect(result.headers.get("Set-Cookie")).toContain("credentials-session");
		});

		test("logs in successfully with email", async () => {
			const client = createTestClient();
			const { handleLogin, handleRegister } = createCredentialsHandlers({ client });

			// Register first
			await handleRegister(
				makeRequest("POST", "/auth/credentials/register", {
					username: "emailuser",
					email: "emailuser@example.com",
					password: "password123",
				}),
			);

			// Login with email
			const result = await handleLogin(
				makeRequest("POST", "/auth/credentials/login", {
					email: "emailuser@example.com",
					password: "password123",
				}),
			);
			expect(result.status).toBe(302);
			expect(result.headers.get("Location")).toBe("/");
			expect(result.headers.get("Set-Cookie")).toContain("credentials-session");
		});
	});

	describe("handleMe", () => {
		test("rejects requests without session cookie", async () => {
			const client = createTestClient();
			const { handleMe } = createCredentialsHandlers({ client });
			const result = await handleMe(makeRequest("GET", "/auth/credentials/me"));
			expect(result.status).toBe(401);
		});

		test("returns user data for valid session", async () => {
			const client = createTestClient();
			const { handleRegister, handleMe } = createCredentialsHandlers({ client });

			// Register to get session
			const registerResult = await handleRegister(
				makeRequest("POST", "/auth/credentials/register", {
					username: "meuser",
					email: "me@example.com",
					password: "password123",
				}),
			);

			// Extract cookie from redirect
			const setCookie = registerResult.headers.get("Set-Cookie")!;
			const tokenMatch = setCookie.match(/credentials-session=([^;]+)/);
			const token = tokenMatch ? tokenMatch[1] : null;
			expect(token).toBeTruthy();

			// Call /me with session cookie
			const result = await handleMe(
				makeRequest("GET", "/auth/credentials/me", undefined, `credentials-session=${token}`),
			);
			expect(result.status).toBe(200);
			const user = await result.json();
			expect(user.username).toBe("meuser");
			expect(user.email).toBe("me@example.com");
			expect(user.passwordHash).toBeUndefined(); // Should not expose password hash
		});

		test("rejects invalid session token", async () => {
			const client = createTestClient();
			const { handleMe } = createCredentialsHandlers({ client });
			const result = await handleMe(
				makeRequest("GET", "/auth/credentials/me", undefined, "credentials-session=invalid-token"),
			);
			expect(result.status).toBe(401);
		});
	});

	describe("handleLogout", () => {
		test("clears session cookie", async () => {
			const client = createTestClient();
			const { handleLogout } = createCredentialsHandlers({ client });
			const result = await handleLogout(makeRequest("GET", "/auth/credentials/logout"));
			expect(result.status).toBe(302);
			expect(result.headers.get("Location")).toBe("/");
			const setCookie = result.headers.get("Set-Cookie")!;
			expect(setCookie).toContain("credentials-session=");
			expect(setCookie).toContain("Max-Age=0"); // Cookie should be cleared
		});
	});
});