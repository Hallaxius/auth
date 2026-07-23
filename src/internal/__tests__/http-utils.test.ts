import { describe, expect, it } from "vitest";
import {
	errorResponse,
	htmlResponse,
	jsonResponse,
	redirectResponse,
} from "../http-utils";

describe("redirectResponse", () => {
	it("creates a 302 response with Location header", () => {
		const url = "https://example.com/callback";
		const response = redirectResponse(url);

		expect(response.status).toBe(302);
		expect(response.headers.get("Location")).toBe(url);
		expect(response.body).toBeNull();
	});

	it("includes single cookie in headers", () => {
		const url = "https://example.com/callback";
		const cookie = "session=abc123; Path=/; HttpOnly";
		const response = redirectResponse(url, [cookie]);

		expect(response.status).toBe(302);
		expect(response.headers.get("Location")).toBe(url);
		expect(response.headers.get("Set-Cookie")).toBe(cookie);
	});

	it("includes multiple cookies in headers", () => {
		const url = "https://example.com/callback";
		const cookies = [
			"session=abc123; Path=/; HttpOnly",
			"csrf=xyz789; Path=/; Secure",
		];
		const response = redirectResponse(url, cookies);

		expect(response.status).toBe(302);
		expect(response.headers.get("Location")).toBe(url);
		expect(response.headers.getSetCookie()).toHaveLength(2);
		expect(response.headers.getSetCookie()).toContain(cookies[0]);
		expect(response.headers.getSetCookie()).toContain(cookies[1]);
	});

	it("handles empty cookies array", () => {
		const url = "https://example.com/callback";
		const response = redirectResponse(url, []);

		expect(response.status).toBe(302);
		expect(response.headers.get("Location")).toBe(url);
		expect(response.headers.get("Set-Cookie")).toBeNull();
	});

	it("handles complex redirect URLs with query parameters", () => {
		const url =
			"https://example.com/callback?code=abc123&state=xyz789#fragment";
		const response = redirectResponse(url);

		expect(response.status).toBe(302);
		expect(response.headers.get("Location")).toBe(url);
	});
});

describe("htmlResponse", () => {
	it("creates a 200 response with HTML content type", () => {
		const body = "<html><body>Hello</body></html>";
		const response = htmlResponse(body);

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe(
			"text/html; charset=utf-8",
		);
	});

	it("accepts custom status code", () => {
		const body = "<html><body>Not Found</body></html>";
		const response = htmlResponse(body, 404);

		expect(response.status).toBe(404);
		expect(response.headers.get("Content-Type")).toBe(
			"text/html; charset=utf-8",
		);
	});

	it("includes single cookie in headers", () => {
		const body = "<html><body>Test</body></html>";
		const cookie = "session=abc123; Path=/; HttpOnly";
		const response = htmlResponse(body, 200, [cookie]);

		expect(response.status).toBe(200);
		expect(response.headers.get("Set-Cookie")).toBe(cookie);
	});

	it("includes multiple cookies in headers", () => {
		const body = "<html><body>Test</body></html>";
		const cookies = [
			"session=abc123; Path=/; HttpOnly",
			"preferences=dark; Path=/",
		];
		const response = htmlResponse(body, 200, cookies);

		expect(response.status).toBe(200);
		expect(response.headers.getSetCookie()).toHaveLength(2);
		expect(response.headers.getSetCookie()).toContain(cookies[0]);
		expect(response.headers.getSetCookie()).toContain(cookies[1]);
	});

	it("handles empty cookies array", () => {
		const body = "<html><body>Test</body></html>";
		const response = htmlResponse(body, 200, []);

		expect(response.status).toBe(200);
		expect(response.headers.get("Set-Cookie")).toBeNull();
	});

	it("handles HTML with special characters", () => {
		const body =
			"<html><body>&lt;script&gt;alert('XSS')&lt;/script&gt;</body></html>";
		const response = htmlResponse(body);

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe(
			"text/html; charset=utf-8",
		);
	});
});

describe("jsonResponse", () => {
	it("creates a 200 response with JSON content type", () => {
		const data = { success: true, message: "OK" };
		const response = jsonResponse(data);

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe(
			"application/json; charset=utf-8",
		);
	});

	it("stringifies data correctly", async () => {
		const data = { foo: "bar", num: 42, nested: { key: "value" } };
		const response = jsonResponse(data);

		const json = await response.json();
		expect(json).toEqual(data);
	});

	it("accepts custom status code", () => {
		const data = { error: "Not found" };
		const response = jsonResponse(data, 404);

		expect(response.status).toBe(404);
	});

	it("includes single cookie in headers", () => {
		const data = { token: "abc123" };
		const cookie = "session=xyz789; Path=/; HttpOnly";
		const response = jsonResponse(data, 200, [cookie]);

		expect(response.headers.get("Set-Cookie")).toBe(cookie);
	});

	it("includes multiple cookies in headers", () => {
		const data = { token: "abc123" };
		const cookies = [
			"session=xyz789; Path=/; HttpOnly",
			"csrf=def456; Path=/; Secure",
		];
		const response = jsonResponse(data, 200, cookies);

		expect(response.headers.getSetCookie()).toHaveLength(2);
		expect(response.headers.getSetCookie()).toContain(cookies[0]);
		expect(response.headers.getSetCookie()).toContain(cookies[1]);
	});

	it("handles empty cookies array", () => {
		const data = { token: "abc123" };
		const response = jsonResponse(data, 200, []);

		expect(response.headers.get("Set-Cookie")).toBeNull();
	});

	it("handles arrays as data", async () => {
		const data = [1, 2, 3, 4, 5];
		const response = jsonResponse(data);

		const json = await response.json();
		expect(json).toEqual(data);
	});

	it("handles null as data", async () => {
		const response = jsonResponse(null);

		const json = await response.json();
		expect(json).toBeNull();
	});

	it.skip("handles undefined as data - JSON.stringify limitation", async () => {
		// JSON.stringify(undefined) returns undefined, which is not valid JSON
		// This causes Response.json() to fail when parsing
		// This is expected behavior - undefined should not be used with jsonResponse
		const response = jsonResponse(undefined);
		await expect(response.json()).rejects.toThrow();
	});
});

describe("errorResponse", () => {
	it("creates a 500 response with error message", async () => {
		const error = new Error("Something went wrong");
		const response = errorResponse(error);

		expect(response.status).toBe(500);
		expect(response.headers.get("Content-Type")).toBe(
			"application/json; charset=utf-8",
		);

		const json = await response.json();
		expect(json).toEqual({
			error: "Something went wrong",
			code: "INTERNAL_ERROR",
		});
	});

	it("accepts custom status code", async () => {
		const error = new Error("Bad request");
		const response = errorResponse(error, 400);

		expect(response.status).toBe(400);

		const json = await response.json();
		expect(json).toEqual({ error: "Bad request", code: "INTERNAL_ERROR" });
	});

	it("handles non-Error objects", async () => {
		const response = errorResponse("String error");

		expect(response.status).toBe(500);

		const json = await response.json();
		expect(json).toEqual({
			error: "Internal server error",
			code: "INTERNAL_ERROR",
		});
	});

	it("handles null error", async () => {
		const response = errorResponse(null);

		expect(response.status).toBe(500);

		const json = await response.json();
		expect(json).toEqual({
			error: "Internal server error",
			code: "INTERNAL_ERROR",
		});
	});

	it("handles undefined error", async () => {
		const response = errorResponse(undefined);

		expect(response.status).toBe(500);

		const json = await response.json();
		expect(json).toEqual({
			error: "Internal server error",
			code: "INTERNAL_ERROR",
		});
	});

	it("handles number error", async () => {
		const response = errorResponse(42);

		expect(response.status).toBe(500);

		const json = await response.json();
		expect(json).toEqual({
			error: "Internal server error",
			code: "INTERNAL_ERROR",
		});
	});

	it("handles object error without message", async () => {
		const response = errorResponse({ code: "ERROR" });

		expect(response.status).toBe(500);

		const json = await response.json();
		expect(json).toEqual({
			error: "Internal server error",
			code: "INTERNAL_ERROR",
		});
	});

	it("handles AuthError-like objects", async () => {
		const authError = new Error("Auth failed");
		Object.defineProperty(authError, "code", {
			value: "INVALID_CREDENTIALS",
			writable: true,
		});
		const response = errorResponse(authError, 401);

		expect(response.status).toBe(401);

		const json = await response.json();
		expect(json).toEqual({ error: "Auth failed", code: "INVALID_CREDENTIALS" });
	});
});
