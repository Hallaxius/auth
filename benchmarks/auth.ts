import { bench, run } from "mitata";
import { credentials } from "../src/credentials";
import type { AuthUser, AuthUserStorage } from "../src/types";
import { TestBruteForceStorage } from "../tests/helpers/storage";

class TestUserStorage implements AuthUserStorage {
	private users = new Map<string, AuthUser>();

	async findByUsername(username: string) {
		return this.users.get(username) || null;
	}

	async findByEmail(email: string) {
		for (const user of this.users.values()) {
			if (user.email === email) return user;
		}
		return null;
	}

	async findById(id: string) {
		for (const user of this.users.values()) {
			if (user.id === id) return user;
		}
		return null;
	}

	async create(data: Omit<AuthUser, "id" | "createdAt" | "updatedAt">) {
		const id = `user_${Date.now()}`;
		const user: AuthUser = {
			id,
			username: data.username ?? null,
			email: data.email ?? null,
			password: data.password ?? "",
			roles: data.roles ?? [],
			createdAt: new Date(),
			updatedAt: new Date(),
		};
		if (user.username) this.users.set(user.username, user);
		if (user.email) this.users.set(user.email, user);
		return user;
	}

	async update(userId: string, data: Partial<AuthUser>) {
		for (const user of this.users.values()) {
			if (user.id === userId) {
				Object.assign(user, data, { updatedAt: new Date() });
				return user;
			}
		}
		throw new Error("User not found");
	}

	async delete(userId: string) {
		for (const [key, user] of this.users) {
			if (user.id === userId) {
				this.users.delete(key);
				return;
			}
		}
	}
}

const storage = new TestUserStorage();
await storage.create({
	username: "testuser",
	email: "test@example.com",
	password: "pre-hashed-password-hash-here",
	roles: ["user"],
});

const auth = credentials({
	emailRequired: true,
	usernameRequired: true,
	session: { secret: "test-secret-32-char-min-length!!", expiresIn: "1h" },
	storage,
	bruteForce: { enabled: false, storage: new TestBruteForceStorage() },
});

bench("login - valid credentials", async () => {
	const request = new Request("http://localhost", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			username: "testuser",
			password: "pre-hashed-password-hash-here",
		}),
	});
	await auth.handleLogin(request);
});

bench("login - invalid password", async () => {
	const request = new Request("http://localhost", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			username: "testuser",
			password: "wrong-password-hash",
		}),
	});
	try {
		await auth.handleLogin(request);
	} catch (_e) {}
});

bench("logout", async () => {
	const request = new Request("http://localhost", {
		method: "POST",
		headers: { Cookie: "session=valid_session_token" },
	});
	await auth.handleLogout(request);
});

await run();
