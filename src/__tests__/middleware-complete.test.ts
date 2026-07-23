import { describe, test, expect } from "bun:test";
import {
	auth,
	role,
	combine,
	session,
	redirect,
	deny,
	publicPath,
	required,
} from "../middleware";
import type { EdgeAuthConfig, EdgeRoleConfig } from "../types";

describe("Middleware - Complete Coverage", () => {
	describe("publicPath() - pattern matching", () => {
		test("exact match returns true", () => {
			expect(publicPath("/api/users", ["/api/users"])).toBe(true);
			expect(publicPath("/login", ["/login"])).toBe(true);
		});

		test("exact mismatch returns false", () => {
			expect(publicPath("/api/users", ["/api/posts"])).toBe(false);
			expect(publicPath("/login", ["/logout"])).toBe(false);
		});

		test("wildcard /* matches sub-paths", () => {
			expect(publicPath("/api/users/123", ["/api/users/*"])).toBe(true);
			expect(publicPath("/api/users/123/posts", ["/api/users/*"])).toBe(true);
			expect(publicPath("/api/users/", ["/api/users/*"])).toBe(true);
		});

		test("wildcard matches exact prefix", () => {
			expect(publicPath("/api/users", ["/api/users/*"])).toBe(true);
		});

		test("wildcard does not match parent paths", () => {
			expect(publicPath("/api", ["/api/users/*"])).toBe(false);
			expect(publicPath("/api/user", ["/api/users/*"])).toBe(false);
		});

		test("multiple patterns - one match returns true", () => {
			expect(
				publicPath("/api/users", ["/api/posts", "/api/users", "/api/comments"]),
			).toBe(true);
			expect(
				publicPath("/api/users/123", ["/api/posts/*", "/api/users/*"]),
			).toBe(true);
		});

		test("empty patterns array returns false", () => {
			expect(publicPath("/api/users", [])).toBe(false);
		});

		test("trailing slash handling", () => {
			expect(publicPath("/api/users/", ["/api/users"])).toBe(true);
			expect(publicPath("/api/users", ["/api/users/"])).toBe(true);
		});
	});

	describe("required() - role mapping", () => {
		test("exact match returns roles", () => {
			const roleMap = { "/api/admin": ["admin"] };
			expect(required("/api/admin", roleMap)).toEqual(["admin"]);
		});

		test("wildcard match returns roles", () => {
			const roleMap = { "/api/admin/*": ["admin", "superadmin"] };
			expect(required("/api/admin/users", roleMap)).toEqual([
				"admin",
				"superadmin",
			]);
		});

		test("no match returns null", () => {
			const roleMap = { "/api/admin": ["admin"] };
			expect(required("/api/users", roleMap)).toBeNull();
		});

		test("multiple patterns - first match wins", () => {
			const roleMap = {
				"/api/*": ["user"],
				"/api/admin/*": ["admin"],
			};
			expect(required("/api/admin/users", roleMap)).toEqual(["user"]);
		});

		test("empty role map returns null", () => {
			expect(required("/api/users", {})).toBeNull();
		});

		test("multiple roles for single path", () => {
			const roleMap = { "/api/admin": ["admin", "moderator", "owner"] };
			expect(required("/api/admin", roleMap)).toEqual([
				"admin",
				"moderator",
				"owner",
			]);
		});
	});

	describe("redirect() - validation", () => {
		test("valid relative path creates 302 redirect", () => {
			const response = redirect("/login");
			expect(response.status).toBe(302);
			expect(response.headers.get("Location")).toBe("/login");
			expect(response.body).toBeNull();
		});

		test("includes redirect query parameter", () => {
			const response = redirect("/auth/discord?redirect=/dashboard");
			expect(response.status).toBe(302);
			expect(response.headers.get("Location")).toBe(
				"/auth/discord?redirect=/dashboard",
			);
		});

		test("absolute path throws error", () => {
			expect(() => redirect("https://example.com")).toThrow(
				"redirect url must be a relative path starting with /",
			);
		});

		test("URL without leading slash throws error", () => {
			expect(() => redirect("login")).toThrow(
				"redirect url must be a relative path starting with /",
			);
		});

		test("empty string throws error", () => {
			expect(() => redirect("")).toThrow(
				"redirect url must be a relative path starting with /",
			);
		});

		test("path with only slash is valid", () => {
			const response = redirect("/");
			expect(response.status).toBe(302);
			expect(response.headers.get("Location")).toBe("/");
		});

		test("nested path is valid", () => {
			const response = redirect("/api/users/123/settings");
			expect(response.status).toBe(302);
			expect(response.headers.get("Location")).toBe(
				"/api/users/123/settings",
			);
		});
	});

	describe("deny() - responses", () => {
		test("default message returns 403", () => {
			const response = deny();
			expect(response.status).toBe(403);
			expect(response.headers.get("Content-Type")).toBe(
				"application/json",
			);
		});

		test("default response body", () => {
			const response = deny();
			const body = JSON.parse(response.text());
			expect(body).toEqual({
				error: "Forbidden",
				code: "INSUFFICIENT_PERMISSIONS",
			});
		});

		test("custom message is included", () => {
			const response = deny("Custom error message");
			const body = JSON.parse(response.text());
			expect(body).toEqual({
				error: "Custom error message",
				code: "INSUFFICIENT_PERMISSIONS",
			});
		});

		test("empty message is allowed", () => {
			const response = deny("");
			const body = JSON.parse(response.text());
			expect(body).toEqual({
				error: "",
				code: "INSUFFICIENT_PERMISSIONS",
			});
		});

		test("unicode message is handled", () => {
			const response = deny("Acesso negado 🔒");
			const body = JSON.parse(response.text());
			expect(body).toEqual({
				error: "Acesso negado 🔒",
				code: "INSUFFICIENT_PERMISSIONS",
			});
		});
	});

	describe("session() - extraction", () => {
		const secret = "a".repeat(32);

		test("returns null when no cookie present", async () => {
			const request = new Request("http://example.com");
			const result = await session(request, { secret });
			expect(result).toBeNull();
		});

		test("returns null with invalid token", async () => {
			const request = new Request("http://example.com", {
				headers: {
					Cookie: "discord-auth-session=invalid.token",
				},
			});
			const result = await session(request, { secret });
			expect(result).toBeNull();
		});

		test("returns null with expired token", async () => {
			const { signToken } = await import("../jwt");
			const expiredToken = await signToken(
				{ discordId: "123" },
				secret,
				"1s",
			);
			await new Promise((resolve) => setTimeout(resolve, 1100));

			const request = new Request("http://example.com", {
				headers: {
					Cookie: `discord-auth-session=${expiredToken}`,
				},
			});
			const result = await session(request, { secret });
			expect(result).toBeNull();
		});

		test("extracts valid session data", async () => {
			const { signToken } = await import("../jwt");
			const token = await signToken(
				{
					discordId: "123456789",
					username: "testuser",
					globalName: "Test User",
					avatar: "avatar_hash",
					email: "test@example.com",
					locale: "en-US",
					roles: ["admin", "user"],
				},
				secret,
			);

			const request = new Request("http://example.com", {
				headers: {
					Cookie: `discord-auth-session=${token}`,
				},
			});
			const result = await session(request, { secret });

			expect(result).toBeDefined();
			expect(result?.discordId).toBe("123456789");
			expect(result?.username).toBe("testuser");
			expect(result?.globalName).toBe("Test User");
			expect(result?.avatar).toBe("avatar_hash");
			expect(result?.email).toBe("test@example.com");
			expect(result?.locale).toBe("en-US");
			expect(result?.roles).toEqual(["admin", "user"]);
		});

		test("handles null optional fields", async () => {
			const { signToken } = await import("../jwt");
			const token = await signToken(
				{
					discordId: "123",
					username: "test",
					globalName: null,
					avatar: null,
					email: null,
					locale: "en-US",
				},
				secret,
			);

			const request = new Request("http://example.com", {
				headers: {
					Cookie: `discord-auth-session=${token}`,
				},
			});
			const result = await session(request, { secret });

			expect(result?.globalName).toBeNull();
			expect(result?.avatar).toBeNull();
			expect(result?.email).toBeNull();
		});

		test("handles undefined roles", async () => {
			const { signToken } = await import("../jwt");
			const token = await signToken(
				{
					discordId: "123",
					username: "test",
					locale: "en-US",
				},
				secret,
			);

			const request = new Request("http://example.com", {
				headers: {
					Cookie: `discord-auth-session=${token}`,
				},
			});
			const result = await session(request, { secret });

			expect(result?.roles).toBeUndefined();
		});

		test("uses custom cookie name", async () => {
			const { signToken } = await import("../jwt");
			const token = await signToken(
				{ discordId: "123", username: "test", locale: "en-US" },
				secret,
			);

			const request = new Request("http://example.com", {
				headers: {
					Cookie: `custom-session=${token}`,
				},
			});
			const result = await session(request, {
				secret,
				cookieName: "custom-session",
			});

			expect(result).toBeDefined();
			expect(result?.discordId).toBe("123");
		});

		test("handles tampered token", async () => {
			const { signToken } = await import("../jwt");
			const validToken = await signToken(
				{ discordId: "123", username: "test", locale: "en-US" },
				secret,
			);
			const tamperedToken = validToken + "tampered";

			const request = new Request("http://example.com", {
				headers: {
					Cookie: `discord-auth-session=${tamperedToken}`,
				},
			});
			const result = await session(request, { secret });
			expect(result).toBeNull();
		});

		test("handles token signed with different secret", async () => {
			const { signToken } = await import("../jwt");
			const token = await signToken(
				{ discordId: "123", username: "test", locale: "en-US" },
				"different_secret_" + "a".repeat(15),
			);

			const request = new Request("http://example.com", {
				headers: {
					Cookie: `discord-auth-session=${token}`,
				},
			});
			const result = await session(request, { secret });
			expect(result).toBeNull();
		});
	});

	describe("auth() - all scenarios", () => {
		const secret = "a".repeat(32);

		test("allows access to public paths", async () => {
			const config: EdgeAuthConfig = {
				secret,
				publicPaths: ["/public/*", "/api/health"],
			};
			const middleware = auth(config);

			const request = new Request("http://example.com/public/data");
			const result = await middleware(request);
			expect(result).toBeUndefined();
		});

		test("allows access when authenticated", async () => {
			const { signToken } = await import("../jwt");
			const token = await signToken(
				{ discordId: "123", username: "test", locale: "en-US" },
				secret,
			);

			const config: EdgeAuthConfig = { secret };
			const middleware = auth(config);

			const request = new Request("http://example.com/protected", {
				headers: {
					Cookie: `discord-auth-session=${token}`,
				},
			});
			const result = await middleware(request);
			expect(result).toBeUndefined();
		});

		test("redirects to login when not authenticated", async () => {
			const config: EdgeAuthConfig = { secret };
			const middleware = auth(config);

			const request = new Request("http://example.com/protected");
			const result = await middleware(request);

			expect(result).toBeDefined();
			expect(result?.status).toBe(302);
			expect(result?.headers.get("Location")).toContain("/auth/discord");
		});

		test("includes redirect query parameter", async () => {
			const config: EdgeAuthConfig = { secret };
			const middleware = auth(config);

			const request = new Request("http://example.com/protected/path");
			const result = await middleware(request);

			expect(result?.headers.get("Location")).toBe(
				"/auth/discord?redirect=/protected/path",
			);
		});

		test("uses custom login URL", async () => {
			const config: EdgeAuthConfig = {
				secret,
				loginUrl: "/custom/login",
			};
			const middleware = auth(config);

			const request = new Request("http://example.com/protected");
			const result = await middleware(request);

			expect(result?.headers.get("Location")).toContain("/custom/login");
		});

		test("supports multiple cookie configurations", async () => {
			const secret2 = "b".repeat(32);
			const { signToken } = await import("../jwt");
			const token2 = await signToken(
				{ discordId: "123", username: "test", locale: "en-US" },
				secret2,
			);

			const config: EdgeAuthConfig = {
				secret,
				cookies: [
					{ name: "session1", secret },
					{ name: "session2", secret: secret2 },
				],
			};
			const middleware = auth(config);

			const request = new Request("http://example.com/protected", {
				headers: {
					Cookie: `session2=${token2}`,
				},
			});
			const result = await middleware(request);
			expect(result).toBeUndefined();
		});

		test("checks all cookie configurations", async () => {
			const config: EdgeAuthConfig = {
				secret,
				cookies: [
					{ name: "session1", secret },
					{ name: "session2", secret: "b".repeat(32) },
				],
			};
			const middleware = auth(config);

			const request = new Request("http://example.com/protected");
			const result = await middleware(request);

			expect(result?.status).toBe(302);
		});

		test("handles empty public paths array", async () => {
			const config: EdgeAuthConfig = {
				secret,
				publicPaths: [],
			};
			const middleware = auth(config);

			const request = new Request("http://example.com/any-path");
			const result = await middleware(request);

			expect(result?.status).toBe(302);
		});

		test("handles undefined public paths", async () => {
			const config: EdgeAuthConfig = { secret };
			const middleware = auth(config);

			const request = new Request("http://example.com/any-path");
			const result = await middleware(request);

			expect(result?.status).toBe(302);
		});
	});

	describe("role() - validation", () => {
		const secret = "a".repeat(32);

		test("allows access when no role required for path", async () => {
			const config: EdgeRoleConfig = {
				secret,
				roles: {
					"/admin/*": ["admin"],
				},
			};
			const middleware = role(config);

			const request = new Request("http://example.com/public");
			const result = await middleware(request);
			expect(result).toBeUndefined();
		});

		test("allows access when user has required role", async () => {
			const { signToken } = await import("../jwt");
			const token = await signToken(
				{
					discordId: "123",
					username: "test",
					locale: "en-US",
					roles: ["admin"],
				},
				secret,
			);

			const config: EdgeRoleConfig = {
				secret,
				roles: {
					"/admin/*": ["admin"],
				},
			};
			const middleware = role(config);

			const request = new Request("http://example.com/admin/users", {
				headers: {
					Cookie: `discord-auth-session=${token}`,
				},
			});
			const result = await middleware(request);
			expect(result).toBeUndefined();
		});

		test("allows access when user has one of required roles", async () => {
			const { signToken } = await import("../jwt");
			const token = await signToken(
				{
					discordId: "123",
					username: "test",
					locale: "en-US",
					roles: ["moderator"],
				},
				secret,
			);

			const config: EdgeRoleConfig = {
				secret,
				roles: {
					"/api/*": ["admin", "moderator", "user"],
				},
			};
			const middleware = role(config);

			const request = new Request("http://example.com/api/data", {
				headers: {
					Cookie: `discord-auth-session=${token}`,
				},
			});
			const result = await middleware(request);
			expect(result).toBeUndefined();
		});

		test("denies access when user lacks required role", async () => {
			const { signToken } = await import("../jwt");
			const token = await signToken(
				{
					discordId: "123",
					username: "test",
					locale: "en-US",
					roles: ["user"],
				},
				secret,
			);

			const config: EdgeRoleConfig = {
				secret,
				roles: {
					"/admin/*": ["admin"],
				},
			};
			const middleware = role(config);

			const request = new Request("http://example.com/admin/users", {
				headers: {
					Cookie: `discord-auth-session=${token}`,
				},
			});
			const result = await middleware(request);

			expect(result).toBeDefined();
			expect(result?.status).toBe(403);
		});

		test("redirects to login when not authenticated", async () => {
			const config: EdgeRoleConfig = {
				secret,
				roles: {
					"/admin/*": ["admin"],
				},
			};
			const middleware = role(config);

			const request = new Request("http://example.com/admin/users");
			const result = await middleware(request);

			expect(result).toBeDefined();
			expect(result?.status).toBe(302);
			expect(result?.headers.get("Location")).toContain("/auth/discord");
		});

		test("uses custom login URL", async () => {
			const config: EdgeRoleConfig = {
				secret,
				loginUrl: "/custom/login",
				roles: {
					"/admin/*": ["admin"],
				},
			};
			const middleware = role(config);

			const request = new Request("http://example.com/admin/users");
			const result = await middleware(request);

			expect(result?.headers.get("Location")).toContain("/custom/login");
		});

		test("uses custom cookie name", async () => {
			const { signToken } = await import("../jwt");
			const token = await signToken(
				{
					discordId: "123",
					username: "test",
					locale: "en-US",
					roles: ["admin"],
				},
				secret,
			);

			const config: EdgeRoleConfig = {
				secret,
				cookieName: "custom-session",
				roles: {
					"/admin/*": ["admin"],
				},
			};
			const middleware = role(config);

			const request = new Request("http://example.com/admin/users", {
				headers: {
					Cookie: `custom-session=${token}`,
				},
			});
			const result = await middleware(request);
			expect(result).toBeUndefined();
		});

		test("handles user without roles field", async () => {
			const { signToken } = await import("../jwt");
			const token = await signToken(
				{
					discordId: "123",
					username: "test",
					locale: "en-US",
				},
				secret,
			);

			const config: EdgeRoleConfig = {
				secret,
				roles: {
					"/admin/*": ["admin"],
				},
			};
			const middleware = role(config);

			const request = new Request("http://example.com/admin/users", {
				headers: {
					Cookie: `discord-auth-session=${token}`,
				},
			});
			const result = await middleware(request);

			expect(result?.status).toBe(403);
		});

		test("handles user with empty roles array", async () => {
			const { signToken } = await import("../jwt");
			const token = await signToken(
				{
					discordId: "123",
					username: "test",
					locale: "en-US",
					roles: [],
				},
				secret,
			);

			const config: EdgeRoleConfig = {
				secret,
				roles: {
					"/admin/*": ["admin"],
				},
			};
			const middleware = role(config);

			const request = new Request("http://example.com/admin/users", {
				headers: {
					Cookie: `discord-auth-session=${token}`,
				},
			});
			const result = await middleware(request);

			expect(result?.status).toBe(403);
		});
	});

	describe("combine() - chaining", () => {
		test("combines multiple middlewares", async () => {
			const middleware1 = async (request: Request) => {
				return undefined;
			};
			const middleware2 = async (request: Request) => {
				return undefined;
			};

			const combined = combine(middleware1, middleware2);
			const request = new Request("http://example.com");
			const result = await combined(request);

			expect(result).toBeUndefined();
		});

		test("returns first non-undefined result", async () => {
			const middleware1 = async (request: Request) => {
				return new Response("Blocked by middleware 1", { status: 403 });
			};
			const middleware2 = async (request: Request) => {
				return undefined;
			};

			const combined = combine(middleware1, middleware2);
			const request = new Request("http://example.com");
			const result = await combined(request);

			expect(result?.status).toBe(403);
			expect(await result?.text()).toBe("Blocked by middleware 1");
		});

		test("short-circuits on first response", async () => {
			let middleware2Called = false;

			const middleware1 = async (request: Request) => {
				return new Response("Blocked", { status: 403 });
			};
			const middleware2 = async (request: Request) => {
				middleware2Called = true;
				return undefined;
			};

			const combined = combine(middleware1, middleware2);
			const request = new Request("http://example.com");
			await combined(request);

			expect(middleware2Called).toBe(false);
		});

		test("handles empty middlewares array", async () => {
			const combined = combine();
			const request = new Request("http://example.com");
			const result = await combined(request);
			expect(result).toBeUndefined();
		});

		test("chains auth and role middlewares", async () => {
			const secret = "a".repeat(32);
			const authMiddleware = auth({ secret });
			const roleMiddleware = role({
				secret,
				roles: { "/admin/*": ["admin"] },
			});

			const combined = combine(authMiddleware, roleMiddleware);
			const { signToken } = await import("../jwt");
			const token = await signToken(
				{
					discordId: "123",
					username: "test",
					locale: "en-US",
					roles: ["admin"],
				},
				secret,
			);

			const request = new Request("http://example.com/admin/users", {
				headers: {
					Cookie: `discord-auth-session=${token}`,
				},
			});
			const result = await combined(request);
			expect(result).toBeUndefined();
		});

		test("fails fast when auth fails", async () => {
			const secret = "a".repeat(32);
			const authMiddleware = auth({ secret });
			const roleMiddleware = role({
				secret,
				roles: { "/admin/*": ["admin"] },
			});

			const combined = combine(authMiddleware, roleMiddleware);

			const request = new Request("http://example.com/admin/users");
			const result = await combined(request);

			expect(result?.status).toBe(302);
		});
	});
});