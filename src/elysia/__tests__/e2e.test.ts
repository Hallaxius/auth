import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { type Context, Elysia } from "elysia";
import type { SessionData } from "../../core/types";
import { discordAuth, signTestJwt } from "../plugin";

const TEST_SECRET = "test-secret-key-for-e2e-12345678901234567890";
const TEST_CLIENT_ID = "test-client-id-12345";
const TEST_CLIENT_SECRET = "test-client-secret-67890";

type TestContext = Context & {
	user?: SessionData;
};

let server: ReturnType<(typeof Elysia)["prototype"]["listen"]>;
let port: number;

// Helper para fazer fetch sem seguir redirects
async function fetchNoRedirect(url: string, options?: RequestInit) {
	return fetch(url, { ...options, redirect: "manual" });
}

beforeAll(async () => {
	port = 34573;

	const app = new Elysia({ prefix: "" })
		.use(
			discordAuth({
				clientId: TEST_CLIENT_ID,
				clientSecret: TEST_CLIENT_SECRET,
				session: {
					type: "jwt",
					secret: TEST_SECRET,
					secure: false,
					httpOnly: true,
					sameSite: "lax",
				},
				disablePKCE: true,
			}),
		)
		.get(
			"/protected",
			(ctx: TestContext) => {
				return { user: ctx.user?.username ?? "anonymous" };
			},
			{ auth: true },
		)
		.get(
			"/optional",
			(ctx: TestContext) => {
				return { user: ctx.user?.username ?? null };
			},
			{ optionalAuth: true },
		)
		.get("/public", () => {
			return { message: "public" };
		});

	server = app.listen(port);

	// Aguardar servidor subir
	await new Promise((resolve) => setTimeout(resolve, 1000));
});

afterAll(() => {
	server?.stop();
});

describe("E2E Elysia Plugin Tests", () => {
	describe("Routes Registration", () => {
		it("should register /auth/discord route and redirect", async () => {
			const res = await fetchNoRedirect(
				`http://127.0.0.1:${port}/auth/discord`,
			);
			expect(res.status).toBe(302);
			const location = res.headers.get("Location");
			expect(location).toContain("discord.com/oauth2/authorize");
			expect(location).toContain(`client_id=${TEST_CLIENT_ID}`);
		});

		it("should include state parameter in auth redirect", async () => {
			const res = await fetchNoRedirect(
				`http://127.0.0.1:${port}/auth/discord`,
			);
			const location = res.headers.get("Location");
			expect(location).toContain("state=");
		});

		it("should not include PKCE when disabled", async () => {
			const res = await fetchNoRedirect(
				`http://127.0.0.1:${port}/auth/discord`,
			);
			const location = res.headers.get("Location");
			expect(location).not.toContain("code_challenge");
			expect(location).not.toContain("code_challenge_method");
		});
	});

	describe("Macros", () => {
		it("should protect /protected route without auth", async () => {
			const res = await fetch(`http://127.0.0.1:${port}/protected`);
			expect(res.status).toBe(401);
		});

		it("should allow /optional route without auth", async () => {
			const res = await fetch(`http://127.0.0.1:${port}/optional`);
			expect(res.status).toBe(200);
			const data = await res.json();
			expect(data.user).toBeNull();
		});

		it("should allow /public route", async () => {
			const res = await fetch(`http://127.0.0.1:${port}/public`);
			expect(res.status).toBe(200);
			const data = await res.json();
			expect(data.message).toBe("public");
		});
	});

	describe("JWT Session Validation", () => {
		it("should accept valid JWT in protected route", async () => {
			const userData = {
				discordId: "123456789",
				username: "testuser",
				globalName: "Test User",
				avatar: null,
				email: "test@example.com",
				locale: "en-US",
				roles: [] as string[],
			};

			const token = await signTestJwt(userData, TEST_SECRET);

			const res = await fetch(`http://127.0.0.1:${port}/protected`, {
				headers: {
					Cookie: `discord-auth-session=${token}`,
				},
			});

			expect(res.status).toBe(200);
			const data = await res.json();
			expect(data.user).toBe("testuser");
		});

		it("should reject invalid JWT in protected route", async () => {
			const token = await signTestJwt(
				{ discordId: "123", username: "test", locale: "en", roles: [] },
				"wrong-secret",
			);

			const res = await fetch(`http://127.0.0.1:${port}/protected`, {
				headers: {
					Cookie: `discord-auth-session=${token}`,
				},
			});

			expect(res.status).toBe(401);
		});

		it("should reject expired JWT in protected route", async () => {
			const token = await signTestJwt(
				{ discordId: "123", username: "test", locale: "en", roles: [] },
				TEST_SECRET,
				"0s", // Expira agora
			);

			const res = await fetch(`http://127.0.0.1:${port}/protected`, {
				headers: {
					Cookie: `discord-auth-session=${token}`,
				},
			});

			expect(res.status).toBe(401);
		});

		it("should accept valid JWT in optional route", async () => {
			const userData = {
				discordId: "987654321",
				username: "optionaluser",
				globalName: null,
				avatar: null,
				email: null,
				locale: "en",
				roles: [] as string[],
			};

			const token = await signTestJwt(userData, TEST_SECRET);

			const res = await fetch(`http://127.0.0.1:${port}/optional`, {
				headers: {
					Cookie: `discord-auth-session=${token}`,
				},
			});

			expect(res.status).toBe(200);
			const data = await res.json();
			expect(data.user).toBe("optionaluser");
		});
	});

	describe("Logout", () => {
		it("should redirect on logout", async () => {
			const res = await fetchNoRedirect(
				`http://127.0.0.1:${port}/auth/discord/logout`,
			);
			expect(res.status).toBe(302);
			const location = res.headers.get("Location");
			expect(location).toBe("/");
		});

		it("should clear session cookie on logout", async () => {
			const userData = {
				discordId: "logout-test",
				username: "logoutuser",
				globalName: null,
				avatar: null,
				email: null,
				locale: "en",
				roles: [] as string[],
			};

			const token = await signTestJwt(userData, TEST_SECRET);

			const res = await fetchNoRedirect(
				`http://127.0.0.1:${port}/auth/discord/logout`,
				{
					headers: {
						Cookie: `discord-auth-session=${token}`,
					},
				},
			);

			expect(res.status).toBe(302);
			const setCookie = res.headers.get("Set-Cookie");
			expect(setCookie).toContain("discord-auth-session");
			expect(setCookie).toContain("Max-Age=0");
		});
	});
});
