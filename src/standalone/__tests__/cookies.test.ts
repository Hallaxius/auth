import { describe, expect, test } from "bun:test";
import type { SessionConfig } from "../../core/types";
import { clearSessionCookie, parseCookies, setSessionCookie } from "../cookies";

const baseConfig: SessionConfig = {
	type: "jwt",
	secret: "test-secret",
};

function makeRequest(cookieHeader?: string): Request {
	const headers = new Headers();
	if (cookieHeader) headers.set("cookie", cookieHeader);
	return new Request("http://localhost", { headers });
}

describe("parseCookies", () => {
	test("returns empty object when no cookie header", () => {
		expect(parseCookies(makeRequest())).toEqual({});
	});

	test("parses single cookie", () => {
		const req = makeRequest("foo=bar");
		expect(parseCookies(req)).toEqual({ foo: "bar" });
	});

	test("parses multiple cookies", () => {
		const req = makeRequest("foo=bar; baz=qux");
		expect(parseCookies(req)).toEqual({ foo: "bar", baz: "qux" });
	});

	test("handles URL-encoded values", () => {
		const req = makeRequest("token=hello%20world");
		expect(parseCookies(req)).toEqual({ token: "hello world" });
	});

	test("ignores malformed entries", () => {
		const req = makeRequest("foo; bar=baz");
		expect(parseCookies(req)).toEqual({ bar: "baz" });
	});
});

describe("setSessionCookie", () => {
	test("returns cookie string with defaults", () => {
		const cookie = setSessionCookie("session", "abc123", baseConfig);
		expect(cookie).toContain("session=abc123");
		expect(cookie).toContain("Path=/");
		expect(cookie).toContain("Max-Age=");
		expect(cookie).toContain("HttpOnly");
	});

	test("does not include secure when not configured", () => {
		const cookie = setSessionCookie("session", "abc123", baseConfig);
		expect(cookie).not.toContain("Secure");
	});

	test("includes Secure when config.secure is true", () => {
		const cookie = setSessionCookie("session", "abc123", {
			...baseConfig,
			secure: true,
		});
		expect(cookie).toContain("Secure");
	});

	test("uses custom sameSite", () => {
		const cookie = setSessionCookie("session", "abc123", {
			...baseConfig,
			sameSite: "strict",
		});
		expect(cookie).toContain("SameSite=strict");
	});
});

describe("clearSessionCookie", () => {
	test("returns cookie with Max-Age=0", () => {
		const cookie = clearSessionCookie("session", baseConfig);
		expect(cookie).toContain("session=");
		expect(cookie).toContain("Max-Age=0");
		expect(cookie).toContain("Path=/");
		expect(cookie).toContain("SameSite=");
	});
});
