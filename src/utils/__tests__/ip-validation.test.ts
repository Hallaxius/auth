import { describe, expect, it } from "bun:test";
import { isPrivateIP, isTrustedSource } from "../ip";

describe("isPrivateIP - RFC1918 ranges", () => {
	it("should identify Class A private range (10.x.x.x)", () => {
		expect(isPrivateIP("10.0.0.1")).toBe(true);
		expect(isPrivateIP("10.255.255.255")).toBe(true);
		expect(isPrivateIP("10.0.0.0")).toBe(true);
		expect(isPrivateIP("10.1.2.3")).toBe(true);
		expect(isPrivateIP("10.255.0.1")).toBe(true);
	});

	it("should identify Class B private range (172.16-31.x.x)", () => {
		expect(isPrivateIP("172.16.0.1")).toBe(true);
		expect(isPrivateIP("172.31.255.255")).toBe(true);
		expect(isPrivateIP("172.16.0.0")).toBe(true);
		expect(isPrivateIP("172.31.0.0")).toBe(true);
		expect(isPrivateIP("172.20.1.1")).toBe(true);
		expect(isPrivateIP("172.24.100.100")).toBe(true);

		expect(isPrivateIP("172.15.0.1")).toBe(false);
		expect(isPrivateIP("172.32.0.1")).toBe(false);
	});

	it("should identify Class C private range (192.168.x.x)", () => {
		expect(isPrivateIP("192.168.0.1")).toBe(true);
		expect(isPrivateIP("192.168.255.255")).toBe(true);
		expect(isPrivateIP("192.168.0.0")).toBe(true);
		expect(isPrivateIP("192.168.1.100")).toBe(true);
		expect(isPrivateIP("192.168.100.100")).toBe(true);
	});

	it("should identify loopback address", () => {
		expect(isPrivateIP("127.0.0.1")).toBe(true);
	});

	it("should identify IPv6 private addresses", () => {
		expect(isPrivateIP("::1")).toBe(true);
		expect(isPrivateIP("fc00::1")).toBe(true);
		expect(isPrivateIP("fd00::1")).toBe(true);
		expect(isPrivateIP("fc00::")).toBe(true);
		expect(isPrivateIP("fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff")).toBe(true);
	});

	it("should reject public IP addresses", () => {
		expect(isPrivateIP("8.8.8.8")).toBe(false);
		expect(isPrivateIP("1.1.1.1")).toBe(false);
		expect(isPrivateIP("203.0.113.1")).toBe(false);
		expect(isPrivateIP("198.51.100.1")).toBe(false);
		expect(isPrivateIP("172.15.255.255")).toBe(false);
		expect(isPrivateIP("172.32.0.0")).toBe(false);
		expect(isPrivateIP("192.167.0.1")).toBe(false);
		expect(isPrivateIP("192.169.0.1")).toBe(false);
	});
});

describe("isTrustedSource - known proxies", () => {
	it("should trust localhost", () => {
		expect(isTrustedSource("127.0.0.1")).toBe(true);
		expect(isTrustedSource("::1")).toBe(true);
	});

	it("should trust private IP ranges", () => {
		expect(isTrustedSource("10.0.0.1")).toBe(true);
		expect(isTrustedSource("172.16.0.1")).toBe(true);
		expect(isTrustedSource("192.168.1.1")).toBe(true);
		expect(isTrustedSource("fc00::1")).toBe(true);
	});

	it("should not trust public IPs outside known ranges", () => {
		expect(isTrustedSource("8.8.8.8")).toBe(false);
		expect(isTrustedSource("203.0.113.50")).toBe(false);
	});
});

describe("isPrivateIP - edge cases", () => {
	it("should handle boundary values correctly", () => {
		expect(isPrivateIP("10.0.0.0")).toBe(true);
		expect(isPrivateIP("10.255.255.255")).toBe(true);
		expect(isPrivateIP("172.15.255.255")).toBe(false);
		expect(isPrivateIP("172.16.0.0")).toBe(true);
		expect(isPrivateIP("172.31.255.255")).toBe(true);
		expect(isPrivateIP("172.32.0.0")).toBe(false);
		expect(isPrivateIP("192.167.255.255")).toBe(false);
		expect(isPrivateIP("192.168.0.0")).toBe(true);
		expect(isPrivateIP("192.168.255.255")).toBe(true);
		expect(isPrivateIP("192.169.0.0")).toBe(false);
	});
});
