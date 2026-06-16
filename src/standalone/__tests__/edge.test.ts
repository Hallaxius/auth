import { describe, expect, test } from "bun:test";
import {
	denied,
	getSession,
	isPublicPath,
	redirect,
	requiredRole,
} from "../edge";
import { signToken } from "../jwt";

const SECRET = "test-secret-edge";

describe("getSession", () => {
	async function makeRequestWithCookie(
		cookieName: string,
		value?: string,
	): Promise<Request> {
		const headers = new Headers();
		if (value) headers.set("cookie", `${cookieName}=${value}`);
		return new Request("http://localhost", { headers });
	}

	test("returns null when no cookie", async () => {
		const req = await makeRequestWithCookie("session");
		const result = await getSession(req, {
			secret: SECRET,
			cookieName: "session",
		});
		expect(result).toBeNull();
	});

	test("returns SessionData for valid token", async () => {
		const token = await signToken(
			{ discordId: "123", username: "test-user" },
			SECRET,
		);
		const req = await makeRequestWithCookie("session", token);
		const result = await getSession(req, {
			secret: SECRET,
			cookieName: "session",
		});
		expect(result).not.toBeNull();
		expect(result?.discordId).toBe("123");
		expect(result?.username).toBe("test-user");
	});

	test("returns null for invalid token", async () => {
		const req = await makeRequestWithCookie("session", "bad-token");
		const result = await getSession(req, {
			secret: SECRET,
			cookieName: "session",
		});
		expect(result).toBeNull();
	});

	test("uses default cookie name", async () => {
		const token = await signToken({ discordId: "1" }, SECRET);
		const headers = new Headers();
		headers.set("cookie", `discord-auth-session=${token}`);
		const req = new Request("http://localhost", { headers });
		const result = await getSession(req, { secret: SECRET });
		expect(result).not.toBeNull();
	});
});

describe("isPublicPath", () => {
	test("matches exact path", () => {
		expect(isPublicPath("/", ["/"])).toBeTrue();
		expect(isPublicPath("/login", ["/login"])).toBeTrue();
	});

	test("matches wildcard prefix", () => {
		expect(isPublicPath("/auth/login", ["/auth/*"])).toBeTrue();
		expect(isPublicPath("/auth", ["/auth/*"])).toBeTrue();
	});

	test("rejects non-matching path", () => {
		expect(isPublicPath("/dashboard", ["/auth/*"])).toBeFalse();
	});

	test("handles multiple patterns", () => {
		expect(isPublicPath("/api/public", ["/auth/*", "/api/public"])).toBeTrue();
	});
});

describe("requiredRole", () => {
	test("returns role for matching path", () => {
		const result = requiredRole("/admin/users", {
			"/admin/*": ["admin"],
		});
		expect(result).toEqual(["admin"]);
	});

	test("returns null for non-matching path", () => {
		const result = requiredRole("/dashboard", {
			"/admin/*": ["admin"],
		});
		expect(result).toBeNull();
	});
});

describe("redirect", () => {
	test("returns 302 with Location header", () => {
		const res = redirect("/login");
		expect(res.status).toBe(302);
		expect(res.headers.get("Location")).toBe("/login");
	});

	test("blocks absolute URLs (open redirect protection)", () => {
		const res = redirect("https://evil.com/phish");
		expect(res.headers.get("Location")).toBe("/");
	});
});

describe("denied", () => {
	test("returns 403 with JSON body", async () => {
		const res = denied();
		expect(res.status).toBe(403);
		const body = await res.json();
		expect(body.error).toBe("Forbidden");
	});

	test("returns custom message", async () => {
		const res = denied("Not allowed");
		const body = await res.json();
		expect(body.error).toBe("Not allowed");
	});
});
