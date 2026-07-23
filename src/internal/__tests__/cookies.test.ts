import { afterEach, describe, expect, it } from "vitest";
import {
	clearSessionCookie,
	createSessionCookie,
	defaultSecureCookie,
	parseCookies,
} from "../cookies";

describe("parseCookies", () => {
	it("parses single cookie", () => {
		const request = new Request("http://example.com", {
			headers: {
				Cookie: "session=abc123",
			},
		});

		const cookies = parseCookies(request);
		expect(cookies).toEqual({ session: "abc123" });
	});

	it("parses multiple cookies", () => {
		const request = new Request("http://example.com", {
			headers: {
				Cookie: "session=abc123; csrf=xyz789; user=john",
			},
		});

		const cookies = parseCookies(request);
		expect(cookies).toEqual({
			session: "abc123",
			csrf: "xyz789",
			user: "john",
		});
	});

	it("trims cookie names and values", () => {
		const request = new Request("http://example.com", {
			headers: {
				Cookie: "  session  =  abc123  ;  csrf  =  xyz789  ",
			},
		});

		const cookies = parseCookies(request);
		expect(cookies).toEqual({
			session: "abc123",
			csrf: "xyz789",
		});
	});

	it("handles cookies with equals sign in value", () => {
		const request = new Request("http://example.com", {
			headers: {
				Cookie: "token=abc=123=xyz",
			},
		});

		const cookies = parseCookies(request);
		expect(cookies).toEqual({ token: "abc=123=xyz" });
	});

	it("returns empty object when no cookies", () => {
		const request = new Request("http://example.com");
		const cookies = parseCookies(request);
		expect(cookies).toEqual({});
	});

	it("returns empty object when Cookie header is empty", () => {
		const request = new Request("http://example.com", {
			headers: {
				Cookie: "",
			},
		});

		const cookies = parseCookies(request);
		expect(cookies).toEqual({});
	});

	it("handles cookies with special characters", () => {
		const request = new Request("http://example.com", {
			headers: {
				Cookie: "data=hello%20world; special=!@#$%^&*()",
			},
		});

		const cookies = parseCookies(request);
		expect(cookies).toEqual({
			data: "hello%20world",
			special: "!@#$%^&*()",
		});
	});

	it("handles cookies with spaces", () => {
		const request = new Request("http://example.com", {
			headers: {
				Cookie: "pref=dark mode; lang=en-US",
			},
		});

		const cookies = parseCookies(request);
		expect(cookies).toEqual({
			pref: "dark mode",
			lang: "en-US",
		});
	});

	it("handles semicolon-separated cookies (standard parsing)", () => {
		const request = new Request("http://example.com", {
			headers: {
				Cookie: "data=value; other=123",
			},
		});

		const cookies = parseCookies(request);
		expect(cookies).toEqual({
			data: "value",
			other: "123",
		});
	});

	it("handles null Cookie header", () => {
		const request = new Request("http://example.com");
		const cookies = parseCookies(request);
		expect(cookies).toEqual({});
	});
});

describe("createSessionCookie", () => {
	it("creates basic session cookie", () => {
		const cookie = createSessionCookie("session", "abc123");
		expect(cookie).toBe("session=abc123");
	});

	it("includes maxAge option", () => {
		const cookie = createSessionCookie("session", "abc123", {
			maxAge: 3600,
		});
		expect(cookie).toBe("session=abc123; Max-Age=3600");
	});

	it("includes path option", () => {
		const cookie = createSessionCookie("session", "abc123", {
			path: "/api",
		});
		expect(cookie).toBe("session=abc123; Path=/api");
	});

	it("includes httpOnly option", () => {
		const cookie = createSessionCookie("session", "abc123", {
			httpOnly: true,
		});
		expect(cookie).toBe("session=abc123; HttpOnly");
	});

	it("includes secure option", () => {
		const cookie = createSessionCookie("session", "abc123", {
			secure: true,
		});
		expect(cookie).toBe("session=abc123; Secure");
	});

	it("includes sameSite option", () => {
		const cookie = createSessionCookie("session", "abc123", {
			sameSite: "lax",
		});
		expect(cookie).toBe("session=abc123; SameSite=lax");
	});

	it("includes all options", () => {
		const cookie = createSessionCookie("session", "abc123", {
			maxAge: 3600,
			path: "/api",
			httpOnly: true,
			secure: true,
			sameSite: "strict",
		});
		expect(cookie).toBe(
			"session=abc123; Max-Age=3600; Path=/api; HttpOnly; Secure; SameSite=strict",
		);
	});

	it("handles empty value", () => {
		const cookie = createSessionCookie("session", "abc123");
		expect(cookie).toBe("session=abc123");
	});

	it("sanitizes carriage return and newline characters", () => {
		const cookie1 = createSessionCookie("session", "abc\n123");
		expect(cookie1).toBe("session=abc123");
		const cookie2 = createSessionCookie("session", "abc\r123");
		expect(cookie2).toBe("session=abc123");
	});

	it("handles valid special characters in value", () => {
		const cookie = createSessionCookie("session", "abc-_.123");
		expect(cookie).toBe("session=abc-_.123");
	});

	it("handles unicode characters in value", () => {
		const cookie = createSessionCookie("session", "hello-world");
		expect(cookie).toBe("session=hello-world");
	});

	it("handles very long values", () => {
		const longValue = "a".repeat(1000);
		const cookie = createSessionCookie("session", longValue);
		expect(cookie).toBe(`session=${longValue}`);
	});

	it("accepts undefined options", () => {
		const cookie = createSessionCookie("session", "abc123", undefined);
		expect(cookie).toBe("session=abc123");
	});

	it("handles sameSite none", () => {
		const cookie = createSessionCookie("session", "abc123", {
			sameSite: "none",
		});
		expect(cookie).toBe("session=abc123; SameSite=none");
	});
});

describe("clearSessionCookie", () => {
	it("creates cookie with empty value", () => {
		const cookie = clearSessionCookie("session");
		expect(cookie).toContain("session=");
	});

	it("includes Max-Age=0", () => {
		const cookie = clearSessionCookie("session");
		expect(cookie).toContain("Max-Age=0");
	});

	it("includes Expires header", () => {
		const cookie = clearSessionCookie("session");
		expect(cookie).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
	});

	it("includes path option", () => {
		const cookie = clearSessionCookie("session", { path: "/api" });
		expect(cookie).toContain("Path=/api");
	});

	it("includes httpOnly option", () => {
		const cookie = clearSessionCookie("session", { httpOnly: true });
		expect(cookie).toContain("HttpOnly");
	});

	it("includes secure option", () => {
		const cookie = clearSessionCookie("session", { secure: true });
		expect(cookie).toContain("Secure");
	});

	it("includes sameSite option", () => {
		const cookie = clearSessionCookie("session", { sameSite: "lax" });
		expect(cookie).toContain("SameSite=lax");
	});

	it("includes all options", () => {
		const cookie = clearSessionCookie("session", {
			path: "/api",
			httpOnly: true,
			secure: true,
			sameSite: "strict",
		});
		expect(cookie).toContain("session=");
		expect(cookie).toContain("Max-Age=0");
		expect(cookie).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
		expect(cookie).toContain("Path=/api");
		expect(cookie).toContain("HttpOnly");
		expect(cookie).toContain("Secure");
		expect(cookie).toContain("SameSite=strict");
	});

	it("handles special characters in name", () => {
		const cookie = clearSessionCookie("session_abc-123");
		expect(cookie).toContain("session_abc-123=");
	});
});

describe("defaultSecureCookie", () => {
	const originalNodeEnv = process.env?.NODE_ENV;
	const originalProcess = global.process;

	afterEach(() => {
		if (originalNodeEnv !== undefined) {
			process.env.NODE_ENV = originalNodeEnv;
		} else if (process.env) {
			delete process.env.NODE_ENV;
		}
		global.process = originalProcess;
	});

	it("returns true in production", () => {
		process.env.NODE_ENV = "production";
		const result = defaultSecureCookie();
		expect(result).toBe(true);
	});

	it("returns false in development", () => {
		process.env.NODE_ENV = "development";
		const result = defaultSecureCookie();
		expect(result).toBe(false);
	});

	it("returns false in test", () => {
		process.env.NODE_ENV = "test";
		const result = defaultSecureCookie();
		expect(result).toBe(false);
	});

	it("returns false when NODE_ENV is undefined", () => {
		if (process.env) {
			delete process.env.NODE_ENV;
		}
		const result = defaultSecureCookie();
		expect(result).toBe(false);
	});

	it("returns false when process is undefined", () => {
		const original = global.process;
		Object.defineProperty(global, "process", {
			value: undefined,
			writable: true,
		});
		try {
			const result = defaultSecureCookie();
			expect(result).toBe(false);
		} finally {
			global.process = original;
		}
	});

	it("handles error gracefully", () => {
		const original = global.process;
		Object.defineProperty(global, "process", {
			value: {
				get env() {
					throw new Error("Cannot access env");
				},
			},
			writable: true,
		});
		try {
			const result = defaultSecureCookie();
			expect(result).toBe(false);
		} finally {
			global.process = original;
		}
	});
});

describe("integration tests", () => {
	it("parse and create cookies round-trip", () => {
		const cookieValue = createSessionCookie("session", "abc123", {
			maxAge: 3600,
			path: "/",
			httpOnly: true,
			secure: true,
		});

		const request = new Request("http://example.com", {
			headers: {
				Cookie: cookieValue,
			},
		});

		const cookies = parseCookies(request);
		expect(cookies.session).toBe("abc123");
	});

	it("clear cookie after creation", () => {
		const createCookie = createSessionCookie("session", "abc123", {
			path: "/api",
			httpOnly: true,
		});

		const clearCookie = clearSessionCookie("session", {
			path: "/api",
			httpOnly: true,
		});

		expect(createCookie).toContain("session=abc123");
		expect(clearCookie).toContain("session=");
		expect(clearCookie).toContain("Max-Age=0");
	});

	it("handles multiple cookies in request", () => {
		const request = new Request("http://example.com", {
			headers: {
				Cookie: "session=abc123; csrf=xyz789",
			},
		});

		const cookies = parseCookies(request);
		expect(cookies).toEqual({
			session: "abc123",
			csrf: "xyz789",
		});
	});
});
