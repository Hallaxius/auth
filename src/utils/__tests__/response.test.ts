import { describe, expect, test } from "vitest";
import {
	jsonResponse,
	errorResponse,
	htmlResponse,
	redirectResponse,
} from "../response";

describe("jsonResponse", () => {
	test("returns JSON response with correct content type", () => {
		const data = { message: "success", count: 42 };
		const response = jsonResponse(data);

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe(
			"application/json; charset=utf-8",
		);
	});

	test("accepts custom status code", () => {
		const response = jsonResponse({ error: "not found" }, 404);
		expect(response.status).toBe(404);
	});

	test("includes cookies when provided", () => {
		const cookies = ["session=abc123; Path=/; HttpOnly", "user=xyz; Path=/"];
		const response = jsonResponse({ data: "test" }, 200, cookies);

		const setCookieHeader = response.headers.get("Set-Cookie");
		expect(setCookieHeader).toContain("session=abc123");
		expect(setCookieHeader).toContain("user=xyz");
	});

	test("serializes complex data structures", () => {
		const data = {
			user: { id: 1, name: "Test" },
			roles: ["admin", "user"],
			active: true,
		};
		const response = jsonResponse(data);

		expect(response.status).toBe(200);
	});
});

describe("errorResponse", () => {
	test("returns 500 with error message", () => {
		const error = new Error("Something went wrong");
		const response = errorResponse(error);

		expect(response.status).toBe(500);
		expect(response.headers.get("Content-Type")).toBe(
			"application/json; charset=utf-8",
		);
	});

	test("extracts message from Error object", async () => {
		const error = new Error("Custom error message");
		const response = errorResponse(error);
		const body = await response.json();

		expect(body.error).toBe("Custom error message");
	});

	test("uses generic message for non-Error objects", async () => {
		const response = errorResponse("string error");
		const body = await response.json();

		expect(body.error).toBe("Internal server error");
	});

	test("accepts custom status code", () => {
		const error = new Error("Not found");
		const response = errorResponse(error, 404);

		expect(response.status).toBe(404);
	});

	test("includes error code when available", async () => {
		const error = new Error("Rate limit exceeded");
		(error as Error & { code: string }).code = "RATE_LIMIT_EXCEEDED";
		const response = errorResponse(error);
		const body = await response.json();

		expect(body.code).toBe("RATE_LIMIT_EXCEEDED");
	});

	test("defaults to INTERNAL_ERROR when no code", async () => {
		const error = new Error("Generic error");
		const response = errorResponse(error);
		const body = await response.json();

		expect(body.code).toBe("INTERNAL_ERROR");
	});
});

describe("htmlResponse", () => {
	test("returns HTML response with correct content type", () => {
		const body = "<html><body><h1>Hello</h1></body></html>";
		const response = htmlResponse(body);

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe(
			"text/html; charset=utf-8",
		);
	});

	test("accepts custom status code", () => {
		const body = "<html><body><h1>404 Not Found</h1></body></html>";
		const response = htmlResponse(body, 404);

		expect(response.status).toBe(404);
	});

	test("includes cookies when provided", () => {
		const body = "<html><body>Test</body></html>";
		const cookies = ["session=abc; Path=/"];
		const response = htmlResponse(body, 200, cookies);

		const setCookieHeader = response.headers.get("Set-Cookie");
		expect(setCookieHeader).toContain("session=abc");
	});

	test("handles empty HTML body", () => {
		const response = htmlResponse("");
		expect(response.status).toBe(200);
	});
});

describe("redirectResponse", () => {
	test("returns 302 redirect with Location header", () => {
		const url = "/dashboard";
		const response = redirectResponse(url);

		expect(response.status).toBe(302);
		expect(response.headers.get("Location")).toBe("/dashboard");
	});

	test("accepts absolute URLs", () => {
		const url = "https://example.com/callback";
		const response = redirectResponse(url);

		expect(response.headers.get("Location")).toBe(
			"https://example.com/callback",
		);
	});

	test("includes cookies when provided", () => {
		const url = "/auth/callback";
		const cookies = ["session=xyz123; Path=/; HttpOnly"];
		const response = redirectResponse(url, cookies);

		const setCookieHeader = response.headers.get("Set-Cookie");
		expect(setCookieHeader).toContain("session=xyz123");
	});

	test("includes multiple cookies", () => {
		const url = "/redirect";
		const cookies = [
			"session=abc; Path=/",
			"user=123; Path=/",
			"prefs=dark; Path=/",
		];
		const response = redirectResponse(url, cookies);

		const setCookieHeader = response.headers.get("Set-Cookie");
		expect(setCookieHeader).toContain("session=abc");
		expect(setCookieHeader).toContain("user=123");
		expect(setCookieHeader).toContain("prefs=dark");
	});

	test("has empty body", () => {
		const response = redirectResponse("/somewhere");
		expect(response.body).toBe(null);
	});
});
