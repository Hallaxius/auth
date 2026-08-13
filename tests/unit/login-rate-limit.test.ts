import { describe, expect, test } from "bun:test";
import type { AuthUser, AuthUserStorage, RateLimitStorage } from "../../src/types";
import { credentials } from "../../src";
import { TestBruteForceStorage, TestRateLimitStorage } from "../helpers/storage";

const SECRET =
	"5K8qN2mR9pL3vX7wJ4tY6hF1dS0aG8bC2eU5iO9xM3nZ7kV4rW1qP6yT0uI8oA2";
const TEST_IP = "10.0.0.1";

class InMemoryUserStorage implements AuthUserStorage {
	private users = new Map<string, AuthUser>();

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
		const id = `user-${this.users.size + 1}`;
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

	async verifyPassword(): Promise<boolean> {
		return false;
	}
}

function postFrom(ip: string, body: Record<string, unknown>): Request {
	const req = new Request("http://localhost/auth/login", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	}) as unknown as Request & { socket?: { remoteAddress?: string } };
	req.socket = { remoteAddress: ip };
	return req;
}

function loginRequest(ip: string): Request {
	return postFrom(ip, { username: "anyone", password: "wrong-password" });
}

function meRequest(ip: string): Request {
	const req = new Request("http://localhost/auth/me", {
		method: "POST",
	}) as unknown as Request & { socket?: { remoteAddress?: string } };
	req.socket = { remoteAddress: ip };
	return req;
}

function makeAuth(loginRateLimitStorage?: RateLimitStorage) {
	return credentials({
		emailRequired: false,
		usernameRequired: true,
		session: { secret: SECRET, expiresIn: "15m" },
		storage: new InMemoryUserStorage(),
		bruteForce: { enabled: false, storage: new TestBruteForceStorage() },
		loginRateLimitStorage,
	});
}

describe("P1-B — per-IP rate limit on /auth/login", () => {
	test("11 consecutive logins from the same IP: 429 from the 11th request", async () => {
		const handlers = makeAuth(new TestRateLimitStorage());
		for (let i = 1; i <= 10; i++) {
			const res = await handlers.handleLogin(loginRequest(TEST_IP));
			expect(res.status).not.toBe(429);
		}
		const blocked = await handlers.handleLogin(loginRequest(TEST_IP));
		expect(blocked.status).toBe(429);
		const body = (await blocked.json()) as Record<string, unknown>;
		expect(body.error).toBe("Rate limit exceeded");
		expect(blocked.headers.get("RateLimit-Limit")).toBe("10");
		expect(blocked.headers.get("Retry-After")).toBeTruthy();
	});

	test("a different IP is not throttled by the first IP's usage", async () => {
		const handlers = makeAuth(new TestRateLimitStorage());
		for (let i = 1; i <= 10; i++) {
			const res = await handlers.handleLogin(loginRequest(TEST_IP));
			expect(res.status).not.toBe(429);
		}
		const other = await handlers.handleLogin(loginRequest("10.0.0.2"));
		expect(other.status).not.toBe(429);
	});

	test("/auth/me from the same IP is not affected by the login limiter", async () => {
		const handlers = makeAuth(new TestRateLimitStorage());
		for (let i = 1; i <= 12; i++) {
			await handlers.handleLogin(loginRequest(TEST_IP));
		}
		for (let i = 1; i <= 12; i++) {
			const res = await handlers.handleMe(meRequest(TEST_IP));
			expect(res.status).not.toBe(429);
		}
	});

	test("without loginRateLimitStorage the behavior is identical (no 429)", async () => {
		const handlers = makeAuth(undefined);
		for (let i = 1; i <= 15; i++) {
			const res = await handlers.handleLogin(loginRequest(TEST_IP));
			expect(res.status).not.toBe(429);
		}
	});
});