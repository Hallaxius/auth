import { describe, expect, it } from "bun:test";
import {
	getRequestIP,
	isPrivateIP,
	isTrustedSource,
	sanitizeIP,
} from "../../../src/";

describe("IP Spoofing Prevention", () => {
	it("should sanitize valid IPv4 addresses", () => {
		expect(sanitizeIP("192.168.1.1")).toBe("192.168.1.1");
		expect(sanitizeIP("10.0.0.1")).toBe("10.0.0.1");
		expect(sanitizeIP("8.8.8.8")).toBe("8.8.8.8");
	});

	it("should sanitize valid IPv6 addresses", () => {
		expect(sanitizeIP("::1")).toBe("::1");
		expect(sanitizeIP("2001:db8::1")).toBe("2001:db8::1");
	});

	it("should handle x-forwarded-for with multiple IPs", () => {
		expect(sanitizeIP("192.168.1.1, 10.0.0.1, 8.8.8.8")).toBe("192.168.1.1");
	});

	it("should reject invalid IP addresses", () => {
		expect(sanitizeIP("invalid")).toBe("unknown");
		expect(sanitizeIP("256.256.256.256")).toBe("unknown");
		expect(sanitizeIP(null)).toBe("unknown");
		expect(sanitizeIP(undefined)).toBe("unknown");
	});

	it("should identify private IP addresses", () => {
		expect(isPrivateIP("127.0.0.1")).toBe(true);
		expect(isPrivateIP("10.0.0.1")).toBe(true);
		expect(isPrivateIP("172.16.0.1")).toBe(true);
		expect(isPrivateIP("192.168.1.1")).toBe(true);
		expect(isPrivateIP("::1")).toBe(true);
		expect(isPrivateIP("fc00::1")).toBe(true);
	});

	it("should identify public IP addresses", () => {
		expect(isPrivateIP("8.8.8.8")).toBe(false);
		expect(isPrivateIP("1.1.1.1")).toBe(false);
		expect(isPrivateIP("203.0.113.1")).toBe(false);
	});

	it("should trust private sources", () => {
		expect(isTrustedSource("127.0.0.1")).toBe(true);
		expect(isTrustedSource("10.0.0.1")).toBe(true);
		expect(isTrustedSource("192.168.1.1")).toBe(true);
		expect(isTrustedSource("::1")).toBe(true);
	});

	it("should not trust public sources by default", () => {
		expect(isTrustedSource("203.0.113.1")).toBe(false);
		expect(isTrustedSource("198.51.100.1")).toBe(false);
	});
});

describe("IP Spoofing Prevention - trustProxy behavior", () => {
	it("trustProxy: true resolves real client IP from x-forwarded-for behind a trusted proxy", async () => {
		const req = new Request("http://localhost:3000", {
			headers: {
				"x-forwarded-for": "203.0.113.50",
			},
		}) as unknown as Request & { socket?: { remoteAddress?: string } };
		req.socket = { remoteAddress: "10.0.0.1" };

		const ip = await getRequestIP(req, { trustProxy: true });
		expect(ip).toBe("203.0.113.50");
	});

	it("trustProxy: false ignores x-forwarded-for and returns socket IP", async () => {
		const req = new Request("http://localhost:3000", {
			headers: {
				"x-forwarded-for": "203.0.113.50",
			},
		}) as unknown as Request & { socket?: { remoteAddress?: string } };
		req.socket = { remoteAddress: "10.0.0.1" };

		const ip = await getRequestIP(req, { trustProxy: false });
		expect(ip).toBe("10.0.0.1");
	});
});
