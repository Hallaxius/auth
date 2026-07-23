import { describe, expect, it } from "bun:test";
import { isPrivateIP, isTrustedSource, sanitizeIP } from "../utils/ip";

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
		expect(sanitizeIP("invalid")).toBe("127.0.0.1");
		expect(sanitizeIP("256.256.256.256")).toBe("127.0.0.1");
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
		expect(isTrustedSource("8.8.8.8")).toBe(false);
		expect(isTrustedSource("1.1.1.1")).toBe(false);
	});
});
