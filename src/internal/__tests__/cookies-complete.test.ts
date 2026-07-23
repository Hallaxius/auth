import { describe, test, expect } from "bun:test";
import {
	parseCookies,
	createSessionCookie,
	clearSessionCookie,
	defaultSecureCookie,
	defaultSameSite,
} from "../cookies";

describe("Cookies - Complete Coverage", () => {
	describe("parseCookies() - all formats", () => {
		test("parses single cookie", () => {
			const request = new Request("http://example.com", {
				headers: {
					Cookie: "session=abc123",
				},
			});
			const cookies = parseCookies(request);
			expect(cookies).toEqual({ session: "abc123" });
		});

		test("parses multiple cookies", () => {
			const request = new Request("http://example.com", {
				headers: {
					Cookie: "session=abc123; user=john; token=xyz",
				},
			});
			const cookies = parseCookies(request);
			expect(cookies).toEqual({
				session: "abc123",
				user: "john",
				token: "xyz",
			});
		});

		test("parses cookies with spaces", () => {
			const request = new Request("http://example.com", {
				headers: {
					Cookie: "session=abc123; user=john doe; token=xyz",
				},
			});
			const cookies = parseCookies(request);
			expect(cookies).toEqual({
				session: "abc123",
				user: "john doe",
				token: "xyz",
			});
		});

		test("parses cookies with equals sign in value", () => {
			const request = new Request("http://example.com", {
				headers: {
					Cookie: "data=key=value; session=abc",
				},
			});
			const cookies = parseCookies(request);
			expect(cookies).toEqual({
				data: "key=value",
				session: "abc",
			});
		});

		test("trims whitespace from keys and values", () => {
			const request = new Request("http://example.com", {
				headers: {
					Cookie: "  session  =  abc123  ;  user  =  john  ",
				},
			});
			const cookies = parseCookies(request);
			expect(cookies).toEqual({
				session: "abc123",
				user: "john",
			});
		});

		test("handles empty Cookie header", () => {
			const request = new Request("http://example.com", {
				headers: {
					Cookie: "",
				},
			});
			const cookies = parseCookies(request);
			expect(cookies).toEqual({});
		});

		test("handles missing Cookie header", () => {
			const request = new Request("http://example.com");
			const cookies = parseCookies(request);
			expect(cookies).toEqual({});
		});

		test("handles cookie without value", () => {
			const request = new Request("http://example.com", {
				headers: {
					Cookie: "session=; user=john",
				},
			});
			const cookies = parseCookies(request);
			expect(cookies).toEqual({
				session: "",
				user: "john",
			});
		});

		test("handles semicolon-only Cookie header", () => {
			const request = new Request("http://example.com", {
				headers: {
					Cookie: ";;;",
				},
			});
			const cookies = parseCookies(request);
			expect(cookies).toEqual({});
		});

		test("handles cookie with only key", () => {
			const request = new Request("http://example.com", {
				headers: {
					Cookie: "session",
				},
			});
			const cookies = parseCookies(request);
			expect(cookies).toEqual({ session: "" });
		});

		test("handles special characters in values", () => {
			const request = new Request("http://example.com", {
				headers: {
					Cookie: "data=!@#$%^&*(); token=abc-_.123",
				},
			});
			const cookies = parseCookies(request);
			expect(cookies).toEqual({
				data: "!@#$%^&*()",
				token: "abc-_.123",
			});
		});

		test("handles unicode characters in values", () => {
			const request = new Request("http://example.com", {
				headers: {
					Cookie: "user=日本語; emoji=🌍",
				},
			});
			const cookies = parseCookies(request);
			expect(cookies).toEqual({
				user: "日本語",
				emoji: "🌍",
			});
		});
	});

	describe("createSessionCookie() - validation", () => {
		test("creates basic session cookie", () => {
			const result = createSessionCookie("session", "abc123");
			expect(result).toBe("session=abc123");
		});

		test("includes Max-Age option", () => {
			const result = createSessionCookie("session", "abc123", {
				maxAge: 3600,
			});
			expect(result).toBe("session=abc123; Max-Age=3600");
		});

		test("includes Path option", () => {
			const result = createSessionCookie("session", "abc123", {
				path: "/api",
			});
			expect(result).toBe("session=abc123; Path=/api");
		});

		test("includes HttpOnly flag", () => {
			const result = createSessionCookie("session", "abc123", {
				httpOnly: true,
			});
			expect(result).toBe("session=abc123; HttpOnly");
		});

		test("includes Secure flag", () => {
			const result = createSessionCookie("session", "abc123", {
				secure: true,
			});
			expect(result).toBe("session=abc123; Secure");
		});

		test("includes SameSite=strict", () => {
			const result = createSessionCookie("session", "abc123", {
				sameSite: "strict",
			});
			expect(result).toBe("session=abc123; SameSite=strict");
		});

		test("includes SameSite=lax", () => {
			const result = createSessionCookie("session", "abc123", {
				sameSite: "lax",
			});
			expect(result).toBe("session=abc123; SameSite=lax");
		});

		test("includes SameSite=none", () => {
			const result = createSessionCookie("session", "abc123", {
				sameSite: "none",
			});
			expect(result).toBe("session=abc123; SameSite=none");
		});

		test("combines multiple options", () => {
			const result = createSessionCookie("session", "abc123", {
				maxAge: 3600,
				path: "/api",
				httpOnly: true,
				secure: true,
				sameSite: "strict",
			});
			expect(result).toContain("session=abc123");
			expect(result).toContain("Max-Age=3600");
			expect(result).toContain("Path=/api");
			expect(result).toContain("HttpOnly");
			expect(result).toContain("Secure");
			expect(result).toContain("SameSite=strict");
		});

		test("SameSite=none forces Secure=true", () => {
			const result = createSessionCookie("session", "abc123", {
				sameSite: "none",
				secure: false,
			});
			expect(result).toContain("Secure");
			expect(result).toContain("SameSite=none");
		});

		test("validates cookie value length (max 4096 bytes)", () => {
			const longValue = "a".repeat(4097);
			expect(() => createSessionCookie("session", longValue)).toThrow(
				"Cookie value too large: exceeds 4096 bytes",
			);
		});

		test("accepts maximum length value (4096 bytes)", () => {
			const maxValue = "a".repeat(4096);
			expect(() => createSessionCookie("session", maxValue)).not.toThrow();
		});

		test("validates cookie value characters (safe chars only)", () => {
			expect(() => createSessionCookie("session", "abc 123")).toThrow(
				"Invalid cookie value: contains disallowed characters",
			);
			expect(() => createSessionCookie("session", "abc;123")).toThrow(
				"Invalid cookie value: contains disallowed characters",
			);
			expect(() => createSessionCookie("session", "abc,123")).toThrow(
				"Invalid cookie value: contains disallowed characters",
			);
		});

		test("allows safe characters: a-zA-Z0-9-_.", () => {
			expect(() =>
				createSessionCookie("session", "abc-ABC_123.xyz"),
			).not.toThrow();
		});

		test("sanitizes CR/LF characters from value", () => {
			const result = createSessionCookie("session", "abc\r\n123");
			expect(result).toBe("session=abc123");
		});

		test("sanitizes CR character from value", () => {
			const result = createSessionCookie("session", "abc\r123");
			expect(result).toBe("session=abc123");
		});

		test("sanitizes LF character from value", () => {
			const result = createSessionCookie("session", "abc\n123");
			expect(result).toBe("session=abc123");
		});

		test("empty value is allowed", () => {
			const result = createSessionCookie("session", "");
			expect(result).toBe("session=");
		});

		test("empty name is allowed (but not recommended)", () => {
			const result = createSessionCookie("", "abc123");
			expect(result).toBe("=abc123");
		});
	});

	describe("clearSessionCookie() - headers", () => {
		test("creates clear cookie with Max-Age=0", () => {
			const result = clearSessionCookie("session");
			expect(result).toContain("Max-Age=0");
		});

		test("includes past Expires date", () => {
			const result = clearSessionCookie("session");
			expect(result).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
		});

		test("clears value (empty)", () => {
			const result = clearSessionCookie("session");
			expect(result).toContain("session=");
		});

		test("includes Path option", () => {
			const result = clearSessionCookie("session", { path: "/api" });
			expect(result).toContain("Path=/api");
		});

		test("includes HttpOnly flag", () => {
			const result = clearSessionCookie("session", { httpOnly: true });
			expect(result).toContain("HttpOnly");
		});

		test("includes Secure flag", () => {
			const result = clearSessionCookie("session", { secure: true });
			expect(result).toContain("Secure");
		});

		test("includes SameSite option", () => {
			const result = clearSessionCookie("session", { sameSite: "strict" });
			expect(result).toContain("SameSite=strict");
		});

		test("SameSite=none forces Secure=true", () => {
			const result = clearSessionCookie("session", {
				sameSite: "none",
				secure: false,
			});
			expect(result).toContain("Secure");
		});

		test("combines all options", () => {
			const result = clearSessionCookie("session", {
				path: "/api",
				httpOnly: true,
				secure: true,
				sameSite: "strict",
			});
			expect(result).toContain("session=");
			expect(result).toContain("Max-Age=0");
			expect(result).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
			expect(result).toContain("Path=/api");
			expect(result).toContain("HttpOnly");
			expect(result).toContain("Secure");
			expect(result).toContain("SameSite=strict");
		});
	});

	describe("defaultSecureCookie() - environments", () => {
		test("returns true in production", () => {
			const originalEnv = process.env.NODE_ENV;
			try {
				process.env.NODE_ENV = "production";
				expect(defaultSecureCookie()).toBe(true);
			} finally {
				process.env.NODE_ENV = originalEnv;
			}
		});

		test("returns false in development", () => {
			const originalEnv = process.env.NODE_ENV;
			try {
				process.env.NODE_ENV = "development";
				expect(defaultSecureCookie()).toBe(false);
			} finally {
				process.env.NODE_ENV = originalEnv;
			}
		});

		test("returns false in test", () => {
			const originalEnv = process.env.NODE_ENV;
			try {
				process.env.NODE_ENV = "test";
				expect(defaultSecureCookie()).toBe(false);
			} finally {
				process.env.NODE_ENV = originalEnv;
			}
		});

		test("returns false when NODE_ENV is undefined", () => {
			const originalEnv = process.env.NODE_ENV;
			try {
				delete process.env.NODE_ENV;
				expect(defaultSecureCookie()).toBe(false);
			} finally {
				if (originalEnv) {
					process.env.NODE_ENV = originalEnv;
				}
			}
		});

		test("returns false for unknown NODE_ENV values", () => {
			const originalEnv = process.env.NODE_ENV;
			try {
				process.env.NODE_ENV = "staging";
				expect(defaultSecureCookie()).toBe(false);
			} finally {
				process.env.NODE_ENV = originalEnv;
			}
		});
	});

	describe("defaultSameSite() - values", () => {
		test("returns 'strict' in production", () => {
			const originalEnv = process.env.NODE_ENV;
			try {
				process.env.NODE_ENV = "production";
				expect(defaultSameSite()).toBe("strict");
			} finally {
				process.env.NODE_ENV = originalEnv;
			}
		});

		test("returns 'lax' in development", () => {
			const originalEnv = process.env.NODE_ENV;
			try {
				process.env.NODE_ENV = "development";
				expect(defaultSameSite()).toBe("lax");
			} finally {
				process.env.NODE_ENV = originalEnv;
			}
		});

		test("returns 'lax' in test", () => {
			const originalEnv = process.env.NODE_ENV;
			try {
				process.env.NODE_ENV = "test";
				expect(defaultSameSite()).toBe("lax");
			} finally {
				process.env.NODE_ENV = originalEnv;
			}
		});

		test("returns 'lax' when NODE_ENV is undefined", () => {
			const originalEnv = process.env.NODE_ENV;
			try {
				delete process.env.NODE_ENV;
				expect(defaultSameSite()).toBe("lax");
			} finally {
				if (originalEnv) {
					process.env.NODE_ENV = originalEnv;
				}
			}
		});

		test("returns 'lax' for unknown NODE_ENV values", () => {
			const originalEnv = process.env.NODE_ENV;
			try {
				process.env.NODE_ENV = "staging";
				expect(defaultSameSite()).toBe("lax");
			} finally {
				process.env.NODE_ENV = originalEnv;
			}
		});
	});
});