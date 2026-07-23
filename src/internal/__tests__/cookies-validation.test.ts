import { afterEach, describe, expect, it } from "bun:test";
import {
	clearSessionCookie,
	createSessionCookie,
	defaultSecureCookie,
} from "../cookies";

describe("createSessionCookie - value length validation", () => {
	it("should reject value larger than 4096 bytes", () => {
		const largeValue = "a".repeat(4097);
		expect(() => createSessionCookie("session", largeValue)).toThrow(
			"Cookie value too large: exceeds 4096 bytes",
		);
	});

	it("should reject value exactly at 4097 bytes", () => {
		const largeValue = "a".repeat(4097);
		expect(() => createSessionCookie("session", largeValue)).toThrow();
	});

	it("should accept value at exactly 4096 bytes", () => {
		const maxValue = "a".repeat(4096);
		const cookie = createSessionCookie("session", maxValue);
		expect(cookie).toContain("session=");
		expect(cookie).toContain(maxValue);
	});

	it("should accept value at 4095 bytes", () => {
		const value = "a".repeat(4095);
		const cookie = createSessionCookie("session", value);
		expect(cookie).toContain("session=");
	});

	it("should accept small values", () => {
		const cookie = createSessionCookie("session", "abc123");
		expect(cookie).toBe("session=abc123");
	});

	it("should accept single character value", () => {
		const cookie = createSessionCookie("session", "a");
		expect(cookie).toBe("session=a");
	});

	it("should reject empty value", () => {
		expect(() => createSessionCookie("session", "")).toThrow(
			"Invalid cookie value: contains disallowed characters",
		);
	});
});

describe("createSessionCookie - carriage return and newline sanitization", () => {
	it("should sanitize value containing \\r\\n (CRLF)", () => {
		const value = "abc\r\ndef";
		const cookie = createSessionCookie("session", value);
		expect(cookie).toBe("session=abcdef");
	});

	it("should sanitize value containing \\r (CR only)", () => {
		const value = "abc\rdef";
		const cookie = createSessionCookie("session", value);
		expect(cookie).toBe("session=abcdef");
	});

	it("should sanitize value containing \\n (LF only)", () => {
		const value = "abc\ndef";
		const cookie = createSessionCookie("session", value);
		expect(cookie).toBe("session=abcdef");
	});

	it("should sanitize value with multiple CRLF sequences", () => {
		const value = "line1\r\nline2\r\nline3";
		const cookie = createSessionCookie("session", value);
		expect(cookie).toBe("session=line1line2line3");
	});

	it("should sanitize value with CRLF at the beginning", () => {
		const value = "\r\nabc";
		const cookie = createSessionCookie("session", value);
		expect(cookie).toBe("session=abc");
	});

	it("should sanitize value with CRLF at the end", () => {
		const value = "abc\r\n";
		const cookie = createSessionCookie("session", value);
		expect(cookie).toBe("session=abc");
	});
});

describe("createSessionCookie - allowed characters validation", () => {
	it("should accept only alphanumeric characters", () => {
		const value = "abc123ABC789";
		const cookie = createSessionCookie("session", value);
		expect(cookie).toBe("session=abc123ABC789");
	});

	it("should accept dash character", () => {
		const value = "abc-123-xyz";
		const cookie = createSessionCookie("session", value);
		expect(cookie).toBe("session=abc-123-xyz");
	});

	it("should accept underscore character", () => {
		const value = "abc_123_xyz";
		const cookie = createSessionCookie("session", value);
		expect(cookie).toBe("session=abc_123_xyz");
	});

	it("should accept dot character", () => {
		const value = "abc.123.xyz";
		const cookie = createSessionCookie("session", value);
		expect(cookie).toBe("session=abc.123.xyz");
	});

	it("should reject equals character", () => {
		const value = "abc=123=xyz";
		expect(() => createSessionCookie("session", value)).toThrow(
			"Invalid cookie value: contains disallowed characters",
		);
	});

	it("should accept combination of allowed characters", () => {
		const value = "abc-123_XYZ.test456";
		const cookie = createSessionCookie("session", value);
		expect(cookie).toBe("session=abc-123_XYZ.test456");
	});

	it("should reject space character", () => {
		const value = "abc 123";
		expect(() => createSessionCookie("session", value)).toThrow(
			"Invalid cookie value: contains disallowed characters",
		);
	});

	it("should reject special characters (!@#$%^&*)", () => {
		expect(() => createSessionCookie("session", "abc!123")).toThrow(
			"Invalid cookie value: contains disallowed characters",
		);
		expect(() => createSessionCookie("session", "abc@123")).toThrow(
			"Invalid cookie value: contains disallowed characters",
		);
		expect(() => createSessionCookie("session", "abc#123")).toThrow(
			"Invalid cookie value: contains disallowed characters",
		);
		expect(() => createSessionCookie("session", "abc$123")).toThrow(
			"Invalid cookie value: contains disallowed characters",
		);
		expect(() => createSessionCookie("session", "abc%123")).toThrow(
			"Invalid cookie value: contains disallowed characters",
		);
		expect(() => createSessionCookie("session", "abc^123")).toThrow(
			"Invalid cookie value: contains disallowed characters",
		);
		expect(() => createSessionCookie("session", "abc&123")).toThrow(
			"Invalid cookie value: contains disallowed characters",
		);
		expect(() => createSessionCookie("session", "abc*123")).toThrow(
			"Invalid cookie value: contains disallowed characters",
		);
	});

	it("should reject parentheses", () => {
		expect(() => createSessionCookie("session", "abc(123)")).toThrow(
			"Invalid cookie value: contains disallowed characters",
		);
	});

	it("should reject brackets", () => {
		expect(() => createSessionCookie("session", "abc[123]")).toThrow(
			"Invalid cookie value: contains disallowed characters",
		);
		expect(() => createSessionCookie("session", "abc{123}")).toThrow(
			"Invalid cookie value: contains disallowed characters",
		);
	});

	it("should reject quotes", () => {
		expect(() => createSessionCookie("session", "abc'123'")).toThrow(
			"Invalid cookie value: contains disallowed characters",
		);
		expect(() => createSessionCookie("session", 'abc"123"')).toThrow(
			"Invalid cookie value: contains disallowed characters",
		);
	});

	it("should reject semicolon and colon", () => {
		expect(() => createSessionCookie("session", "abc;123")).toThrow(
			"Invalid cookie value: contains disallowed characters",
		);
		expect(() => createSessionCookie("session", "abc:123")).toThrow(
			"Invalid cookie value: contains disallowed characters",
		);
	});

	it("should reject slash and backslash", () => {
		expect(() => createSessionCookie("session", "abc/123")).toThrow(
			"Invalid cookie value: contains disallowed characters",
		);
		expect(() => createSessionCookie("session", "abc\\123")).toThrow(
			"Invalid cookie value: contains disallowed characters",
		);
	});

	it("should reject pipe and question mark", () => {
		expect(() => createSessionCookie("session", "abc|123")).toThrow(
			"Invalid cookie value: contains disallowed characters",
		);
		expect(() => createSessionCookie("session", "abc?123")).toThrow(
			"Invalid cookie value: contains disallowed characters",
		);
	});

	it("should reject comma and period (except dot)", () => {
		expect(() => createSessionCookie("session", "abc,123")).toThrow(
			"Invalid cookie value: contains disallowed characters",
		);
	});

	it("should reject unicode characters", () => {
		expect(() => createSessionCookie("session", "abc世界 123")).toThrow(
			"Invalid cookie value: contains disallowed characters",
		);
		expect(() => createSessionCookie("session", "abc🌍123")).toThrow(
			"Invalid cookie value: contains disallowed characters",
		);
	});
});

describe("defaultSecureCookie - NODE_ENV detection", () => {
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

	it("should return true for NODE_ENV=production", () => {
		process.env.NODE_ENV = "production";
		const result = defaultSecureCookie();
		expect(result).toBe(true);
	});

	it("should return false for NODE_ENV=development", () => {
		process.env.NODE_ENV = "development";
		const result = defaultSecureCookie();
		expect(result).toBe(false);
	});

	it("should return false for NODE_ENV=test", () => {
		process.env.NODE_ENV = "test";
		const result = defaultSecureCookie();
		expect(result).toBe(false);
	});

	it("should return false for NODE_ENV=staging", () => {
		process.env.NODE_ENV = "staging";
		const result = defaultSecureCookie();
		expect(result).toBe(false);
	});

	it("should return false when NODE_ENV is undefined", () => {
		if (process.env) {
			delete process.env.NODE_ENV;
		}
		const result = defaultSecureCookie();
		expect(result).toBe(false);
	});

	it("should return false when process is undefined", () => {
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

	it("should return false when accessing env throws", () => {
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
	it("should create cookie with secure flag in production", () => {
		const originalEnv = process.env.NODE_ENV;
		process.env.NODE_ENV = "production";

		try {
			const cookie = createSessionCookie("session", "abc123", {
				secure: defaultSecureCookie(),
			});
			expect(cookie).toContain("Secure");
		} finally {
			process.env.NODE_ENV = originalEnv;
		}
	});

	it("should create cookie without secure flag in development", () => {
		const originalEnv = process.env.NODE_ENV;
		process.env.NODE_ENV = "development";

		try {
			const cookie = createSessionCookie("session", "abc123", {
				secure: defaultSecureCookie(),
			});
			expect(cookie).not.toContain("Secure");
		} finally {
			process.env.NODE_ENV = originalEnv;
		}
	});

	it("should handle clear cookie with same options", () => {
		const options = {
			path: "/api",
			httpOnly: true,
			secure: true,
			sameSite: "strict" as const,
		};

		const createCookie = createSessionCookie("session", "abc123", options);
		const clearCookie = clearSessionCookie("session", options);

		expect(createCookie).toContain("session=abc123");
		expect(createCookie).toContain("Path=/api");
		expect(createCookie).toContain("HttpOnly");
		expect(createCookie).toContain("Secure");
		expect(createCookie).toContain("SameSite=strict");

		expect(clearCookie).toContain("session=");
		expect(clearCookie).toContain("Max-Age=0");
		expect(clearCookie).toContain("Path=/api");
		expect(clearCookie).toContain("HttpOnly");
		expect(clearCookie).toContain("Secure");
		expect(clearCookie).toContain("SameSite=strict");
	});
});
