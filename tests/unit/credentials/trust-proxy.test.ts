import { describe, expect, test } from "bun:test";
import { getRequestIP } from "../../../src/";

describe("credentials brute force IP resolution with trustProxy", () => {
	test("resolves real client IP from x-forwarded-for with trustProxy: true", async () => {
		const req = new Request("http://localhost:3000", {
			headers: {
				"x-forwarded-for": "203.0.113.50",
			},
		}) as unknown as Request & { socket?: { remoteAddress?: string } };
		req.socket = { remoteAddress: "10.0.0.1" };

		const ip = await getRequestIP(req, { trustProxy: true });
		expect(ip).toBe("203.0.113.50");
	});

	test("returns socket IP when trustProxy is false (ignores x-forwarded-for)", async () => {
		const req = new Request("http://localhost:3000", {
			headers: {
				"x-forwarded-for": "203.0.113.50",
			},
		}) as unknown as Request & { socket?: { remoteAddress?: string } };
		req.socket = { remoteAddress: "10.0.0.1" };

		const ip = await getRequestIP(req, { trustProxy: false });
		expect(ip).toBe("10.0.0.1");
	});

	test("trustProxy: true resolves from x-real-ip when no x-forwarded-for", async () => {
		const req = new Request("http://localhost:3000", {
			headers: {
				"x-real-ip": "198.51.100.42",
			},
		}) as unknown as Request & { socket?: { remoteAddress?: string } };
		req.socket = { remoteAddress: "10.0.0.1" };

		const ip = await getRequestIP(req, { trustProxy: true });
		expect(ip).toBe("198.51.100.42");
	});

	test("trustProxy: true picks last non-unknown entry from x-forwarded-for", async () => {
		const req = new Request("http://localhost:3000", {
			headers: {
				"x-forwarded-for": "unknown, 203.0.113.50",
			},
		}) as unknown as Request & { socket?: { remoteAddress?: string } };
		req.socket = { remoteAddress: "10.0.0.1" };

		const ip = await getRequestIP(req, { trustProxy: true });
		expect(ip).toBe("203.0.113.50");
	});
});

