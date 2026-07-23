import { describe, expect, test } from "vitest";
import {
	auth,
	combine,
	deny,
	publicPath,
	redirect,
	required,
	role,
	session,
} from "../middleware";

describe("middleware - publicPath", () => {
	test("matches exact path", () => {
		expect(publicPath("/login", ["/login", "/register"])).toBe(true);
		expect(publicPath("/dashboard", ["/login", "/register"])).toBe(false);
	});

	test("matches wildcard prefix", () => {
		expect(publicPath("/api/users", ["/api/*"])).toBe(true);
		expect(publicPath("/api/users/123", ["/api/*"])).toBe(true);
		expect(publicPath("/api", ["/api/*"])).toBe(true);
		expect(publicPath("/other", ["/api/*"])).toBe(false);
	});

	test("matches exact with trailing slash", () => {
		expect(publicPath("/api/", ["/api/*"])).toBe(true);
	});

	test("returns false for empty patterns", () => {
		expect(publicPath("/anything", [])).toBe(false);
	});
});

describe("middleware - required", () => {
	const roleMap = {
		"/admin/*": ["admin"],
		"/editor/*": ["editor", "admin"],
		"/user/profile": ["user"],
	};

	test("returns roles for wildcard prefix", () => {
		expect(required("/admin/dashboard", roleMap)).toEqual(["admin"]);
		expect(required("/admin/users", roleMap)).toEqual(["admin"]);
		expect(required("/editor/posts", roleMap)).toEqual(["editor", "admin"]);
	});

	test("returns roles for exact match", () => {
		expect(required("/user/profile", roleMap)).toEqual(["user"]);
	});

	test("returns null for unmatched paths", () => {
		expect(required("/public", roleMap)).toBeNull();
		expect(required("/unknown", roleMap)).toBeNull();
	});
});

describe("middleware - redirect", () => {
	test("returns 302 with Location header", () => {
		const response = redirect("/login");
		expect(response.status).toBe(302);
		expect(response.headers.get("Location")).toBe("/login");
	});

	test("throws for absolute URLs", () => {
		expect(() => redirect("https://example.com/login")).toThrow();
	});

	test("allows protocol-relative URLs (implementation behavior)", () => {
		const response = redirect("//example.com/login");
		expect(response.status).toBe(302);
		expect(response.headers.get("Location")).toBe("//example.com/login");
	});
});

describe("middleware - deny", () => {
	test("returns 403 with error message", () => {
		const response = deny("Access denied");
		expect(response.status).toBe(403);
		expect(response.headers.get("Content-Type")).toBe("application/json");

		return response.json().then((body: { error: string; code: string }) => {
			expect(body.error).toBe("Access denied");
			expect(body.code).toBe("INSUFFICIENT_PERMISSIONS");
		});
	});

	test("uses default message", () => {
		const response = deny();
		return response.json().then((body: { error: string }) => {
			expect(body.error).toBe("Forbidden");
		});
	});
});

describe("middleware - session", () => {
	test("returns null for missing cookie", async () => {
		const request = new Request("http://localhost/");
		const result = await session(request, {
			secret: process.env.TEST_SECRET || "fallback-32-char-secret-key!!",
			cookieName: "auth-session",
		});
		expect(result).toBeNull();
	});

	test("returns null for invalid token", async () => {
		const request = new Request("http://localhost/", {
			headers: { Cookie: "auth-session=invalid-token" },
		});
		const result = await session(request, {
			secret: process.env.TEST_SECRET || "fallback-32-char-secret-key!!",
			cookieName: "auth-session",
		});
		expect(result).toBeNull();
	});
});

describe("middleware - auth", () => {
	test("allows access to public paths", async () => {
		const middleware = auth({
			cookies: [
				{ name: "auth-session", secret: (process.env.TEST_SECRET || "fallback-32-char-secret-key!!") },
			],
			publicPaths: ["/login", "/register", "/public/*"],
			loginUrl: "/login",
		});

		const publicReq = new Request("http://localhost/public/page");
		const result = await middleware(publicReq);
		expect(result).toBeUndefined();
	});

	test("redirects to login for protected paths without session", async () => {
		const middleware = auth({
			cookies: [
				{ name: "auth-session", secret: (process.env.TEST_SECRET || "fallback-32-char-secret-key!!") },
			],
			publicPaths: ["/login"],
			loginUrl: "/login",
		});

		const protectedReq = new Request("http://localhost/dashboard");
		const result = await middleware(protectedReq);

		expect(result).not.toBeUndefined();
		expect(result?.status).toBe(302);
		expect(result?.headers.get("Location")).toContain("/login");
	});

	test("allows access with valid session from first cookie", async () => {
		const middleware = auth({
			cookies: [
				{ name: "auth-session", secret: (process.env.TEST_SECRET || "fallback-32-char-secret-key!!-1") },
				{
					name: "backup-session",
					secret: process.env.TEST_SECRET || "fallback-32-char-secret-key!!-2",
				},
			],
			publicPaths: ["/login"],
			loginUrl: "/login",
		});

		const { SignJWT } = await import("jose");
		const token = await new SignJWT({ discordId: "user-123", username: "test" })
			.setProtectedHeader({ alg: "HS256" })
			.setIssuedAt()
			.setExpirationTime("1h")
			.sign(new TextEncoder().encode((process.env.TEST_SECRET || "fallback-32-char-secret-key!!-1")));

		const req = new Request("http://localhost/dashboard", {
			headers: { Cookie: `auth-session=${token}` },
		});
		const result = await middleware(req);
		expect(result).toBeUndefined();
	});

	test("allows access with valid session from second cookie", async () => {
		const middleware = auth({
			cookies: [
				{ name: "auth-session", secret: (process.env.TEST_SECRET || "fallback-32-char-secret-key!!-1") },
				{
					name: "backup-session",
					secret: process.env.TEST_SECRET || "fallback-32-char-secret-key!!-2",
				},
			],
			publicPaths: ["/login"],
			loginUrl: "/login",
		});

		const { SignJWT } = await import("jose");
		const token = await new SignJWT({ discordId: "user-123", username: "test" })
			.setProtectedHeader({ alg: "HS256" })
			.setIssuedAt()
			.setExpirationTime("1h")
			.sign(new TextEncoder().encode("test-secret-key-minimum-32-chars-2"));

		const req = new Request("http://localhost/dashboard", {
			headers: { Cookie: `backup-session=${token}` },
		});
		const result = await middleware(req);
		expect(result).toBeUndefined();
	});

	test("redirects with encoded redirect parameter", async () => {
		const middleware = auth({
			cookies: [
				{ name: "auth-session", secret: (process.env.TEST_SECRET || "fallback-32-char-secret-key!!") },
			],
			publicPaths: ["/login"],
			loginUrl: "/login",
		});

		const req = new Request("http://localhost/admin/users?sort=name");
		const result = await middleware(req);

		expect(result?.status).toBe(302);
		const location = result?.headers.get("Location");
		expect(location).toContain("/login");
		expect(location).toContain("redirect=");
	});
});

describe("middleware - role", () => {
	test("allows access when user has required role", async () => {
		const middleware = role({
			secret: process.env.TEST_SECRET || "fallback-32-char-secret-key!!",
			cookieName: "auth-session",
			roles: {
				"/admin/*": ["admin"],
				"/editor/*": ["editor", "admin"],
			},
			loginUrl: "/login",
		});

		const { SignJWT } = await import("jose");
		const token = await new SignJWT({
			discordId: "user-123",
			username: "admin",
			roles: ["admin"],
		})
			.setProtectedHeader({ alg: "HS256" })
			.setIssuedAt()
			.setExpirationTime("1h")
			.sign(new TextEncoder().encode((process.env.TEST_SECRET || "fallback-32-char-secret-key!!")));

		const req = new Request("http://localhost/admin/dashboard", {
			headers: { Cookie: `auth-session=${token}` },
		});
		const result = await middleware(req);
		expect(result).toBeUndefined();
	});

	test("denies access when user lacks required role", async () => {
		const middleware = role({
			secret: process.env.TEST_SECRET || "fallback-32-char-secret-key!!",
			cookieName: "auth-session",
			roles: {
				"/admin/*": ["admin"],
			},
			loginUrl: "/login",
		});

		const { SignJWT } = await import("jose");
		const token = await new SignJWT({
			discordId: "user-123",
			username: "user",
			roles: ["user"],
		})
			.setProtectedHeader({ alg: "HS256" })
			.setIssuedAt()
			.setExpirationTime("1h")
			.sign(new TextEncoder().encode((process.env.TEST_SECRET || "fallback-32-char-secret-key!!")));

		const req = new Request("http://localhost/admin/dashboard", {
			headers: { Cookie: `auth-session=${token}` },
		});
		const result = await middleware(req);

		expect(result).not.toBeUndefined();
		expect(result?.status).toBe(403);
		const body = await result?.json();
		expect(body.error).toBe("Insufficient permissions");
		expect(body.code).toBe("INSUFFICIENT_PERMISSIONS");
	});

	test("redirects to login when no session", async () => {
		const middleware = role({
			secret: process.env.TEST_SECRET || "fallback-32-char-secret-key!!",
			cookieName: "auth-session",
			roles: { "/admin/*": ["admin"] },
			loginUrl: "/login",
		});

		const req = new Request("http://localhost/admin/dashboard");
		const result = await middleware(req);

		expect(result?.status).toBe(302);
		expect(result?.headers.get("Location")).toContain("/login");
	});

	test("allows access when path has no role requirements", async () => {
		const middleware = role({
			secret: process.env.TEST_SECRET || "fallback-32-char-secret-key!!",
			cookieName: "auth-session",
			roles: { "/admin/*": ["admin"] },
			loginUrl: "/login",
		});

		const { SignJWT } = await import("jose");
		const token = await new SignJWT({
			discordId: "user-123",
			username: "user",
			roles: ["user"],
		})
			.setProtectedHeader({ alg: "HS256" })
			.setIssuedAt()
			.setExpirationTime("1h")
			.sign(new TextEncoder().encode((process.env.TEST_SECRET || "fallback-32-char-secret-key!!")));

		const req = new Request("http://localhost/public", {
			headers: { Cookie: `auth-session=${token}` },
		});
		const result = await middleware(req);
		expect(result).toBeUndefined();
	});
});

describe("middleware - combine", () => {
	test("executes middlewares in order", async () => {
		const mw1 = async (req: Request) => {
			if (req.url.includes("/blocked1"))
				return new Response("Blocked 1", { status: 403 });
			return undefined;
		};

		const mw2 = async (req: Request) => {
			if (req.url.includes("/blocked2"))
				return new Response("Blocked 2", { status: 403 });
			return undefined;
		};

		const combined = combine(mw1, mw2);

		const allowed = await combined(new Request("http://localhost/allowed"));
		expect(allowed).toBeUndefined();

		const blocked1 = await combined(new Request("http://localhost/blocked1"));
		expect(blocked1?.status).toBe(403);
		expect(await blocked1?.text()).toBe("Blocked 1");

		const blocked2 = await combined(new Request("http://localhost/blocked2"));
		expect(blocked2?.status).toBe(403);
		expect(await blocked2?.text()).toBe("Blocked 2");
	});

	test("stops at first middleware that returns response", async () => {
		const mw1 = async () => new Response("First", { status: 401 });
		const mw2 = async () => new Response("Second", { status: 403 });

		const combined = combine(mw1, mw2);
		const result = await combined(new Request("http://localhost/"));

		expect(result?.status).toBe(401);
		expect(await result?.text()).toBe("First");
	});

	test("returns undefined when all middlewares allow", async () => {
		const mw1 = async () => undefined;
		const mw2 = async () => undefined;

		const combined = combine(mw1, mw2);
		const result = await combined(new Request("http://localhost/"));
		expect(result).toBeUndefined();
	});

	test("works with auth and role middleware combination", async () => {
		const authMiddleware = auth({
			cookies: [
				{ name: "auth-session", secret: (process.env.TEST_SECRET || "fallback-32-char-secret-key!!") },
			],
			publicPaths: ["/login"],
			loginUrl: "/login",
		});

		const roleMiddleware = role({
			secret: process.env.TEST_SECRET || "fallback-32-char-secret-key!!",
			cookieName: "auth-session",
			roles: { "/admin/*": ["admin"] },
			loginUrl: "/login",
		});

		const combined = combine(authMiddleware, roleMiddleware);

		const req = new Request("http://localhost/admin");
		const result = await combined(req);
		expect(result?.status).toBe(302);
		expect(result?.headers.get("Location")).toContain("/login");
	});
});
