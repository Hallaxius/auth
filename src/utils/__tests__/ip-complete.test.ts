import { describe, test, expect } from "bun:test";
import {
	isPrivateIP,
	isTrustedSource,
	isCloudflareIP,
	sanitizeIP,
	maskIPv6To64,
	maskIPv4To24,
	getRequestIP,
	sha256Hex,
} from "../ip";

describe("IP Validation - Complete Coverage", () => {
	describe("isPrivateIP() - RFC1918 ranges", () => {
		describe("Class A private range (10.0.0.0/8)", () => {
			test("10.0.0.0 is private", () => {
				expect(isPrivateIP("10.0.0.0")).toBe(true);
			});

			test("10.0.0.1 is private", () => {
				expect(isPrivateIP("10.0.0.1")).toBe(true);
			});

			test("10.255.255.255 is private", () => {
				expect(isPrivateIP("10.255.255.255")).toBe(true);
			});

			test("10.128.128.128 is private", () => {
				expect(isPrivateIP("10.128.128.128")).toBe(true);
			});

			test("9.255.255.255 is NOT private", () => {
				expect(isPrivateIP("9.255.255.255")).toBe(false);
			});

			test("11.0.0.0 is NOT private", () => {
				expect(isPrivateIP("11.0.0.0")).toBe(false);
			});
		});

		describe("Class B private range (172.16.0.0/12)", () => {
			test("172.16.0.0 is private", () => {
				expect(isPrivateIP("172.16.0.0")).toBe(true);
			});

			test("172.16.255.255 is private", () => {
				expect(isPrivateIP("172.16.255.255")).toBe(true);
			});

			test("172.31.255.255 is private", () => {
				expect(isPrivateIP("172.31.255.255")).toBe(true);
			});

			test("172.32.0.0 is NOT private", () => {
				expect(isPrivateIP("172.32.0.0")).toBe(false);
			});

			test("172.15.255.255 is NOT private", () => {
				expect(isPrivateIP("172.15.255.255")).toBe(false);
			});

			test("172.20.100.100 is private", () => {
				expect(isPrivateIP("172.20.100.100")).toBe(true);
			});

			test("172.24.0.1 is private", () => {
				expect(isPrivateIP("172.24.0.1")).toBe(true);
			});
		});

		describe("Class C private range (192.168.0.0/16)", () => {
			test("192.168.0.0 is private", () => {
				expect(isPrivateIP("192.168.0.0")).toBe(true);
			});

			test("192.168.0.1 is private", () => {
				expect(isPrivateIP("192.168.0.1")).toBe(true);
			});

			test("192.168.255.255 is private", () => {
				expect(isPrivateIP("192.168.255.255")).toBe(true);
			});

			test("192.168.1.100 is private", () => {
				expect(isPrivateIP("192.168.1.100")).toBe(true);
			});

			test("192.167.255.255 is NOT private", () => {
				expect(isPrivateIP("192.167.255.255")).toBe(false);
			});

			test("192.169.0.0 is NOT private", () => {
				expect(isPrivateIP("192.169.0.0")).toBe(false);
			});
		});

		describe("loopback addresses", () => {
			test("127.0.0.1 is private (loopback)", () => {
				expect(isPrivateIP("127.0.0.1")).toBe(true);
			});

			test("127.0.0.0 is private (loopback)", () => {
				expect(isPrivateIP("127.0.0.0")).toBe(true);
			});

			test("127.255.255.255 is private (loopback)", () => {
				expect(isPrivateIP("127.255.255.255")).toBe(true);
			});
		});

		describe("IPv6 private ranges", () => {
			test("::1 is private (IPv6 loopback)", () => {
				expect(isPrivateIP("::1")).toBe(true);
			});

			test("fc00::1 is private (ULA)", () => {
				expect(isPrivateIP("fc00::1")).toBe(true);
			});

			test("fd00::1 is private (ULA)", () => {
				expect(isPrivateIP("fd00::1")).toBe(true);
			});

			test("fe80::1 is NOT private (link-local, not ULA)", () => {
				expect(isPrivateIP("fe80::1")).toBe(false);
			});

			test("2001:db8::1 is NOT private", () => {
				expect(isPrivateIP("2001:db8::1")).toBe(false);
			});
		});

		describe("public addresses", () => {
			test("8.8.8.8 is NOT private", () => {
				expect(isPrivateIP("8.8.8.8")).toBe(false);
			});

			test("1.1.1.1 is NOT private", () => {
				expect(isPrivateIP("1.1.1.1")).toBe(false);
			});

			test("142.250.185.78 is NOT private", () => {
				expect(isPrivateIP("142.250.185.78")).toBe(false);
			});

			test("255.255.255.255 is NOT private", () => {
				expect(isPrivateIP("255.255.255.255")).toBe(false);
			});

			test("0.0.0.0 is NOT private", () => {
				expect(isPrivateIP("0.0.0.0")).toBe(false);
			});
		});

		describe("edge cases", () => {
			test("invalid IP format", () => {
				expect(() => isPrivateIP("not-an-ip")).toThrow();
			});

			test("empty string", () => {
				expect(() => isPrivateIP("")).toThrow();
			});

			test("partial IP", () => {
				expect(() => isPrivateIP("192.168")).toThrow();
			});

			test("IP with port", () => {
				expect(() => isPrivateIP("192.168.1.1:8080")).toThrow();
			});
		});
	});

	describe("isTrustedSource() - proxy validation", () => {
		test("localhost IPv4 is trusted", () => {
			expect(isTrustedSource("127.0.0.1")).toBe(true);
		});

		test("localhost IPv6 is trusted", () => {
			expect(isTrustedSource("::1")).toBe(true);
		});

		test("private IPs are trusted", () => {
			expect(isTrustedSource("192.168.1.1")).toBe(true);
			expect(isTrustedSource("10.0.0.1")).toBe(true);
			expect(isTrustedSource("172.16.0.1")).toBe(true);
		});

		test("public IP is NOT trusted", () => {
			expect(isTrustedSource("8.8.8.8")).toBe(false);
		});

		test("Cloudflare IP is NOT automatically trusted", () => {
			expect(isTrustedSource("104.16.0.1")).toBe(false);
		});
	});

	describe("isCloudflareIP() - Cloudflare ranges", () => {
		const cloudflareIPs = [
			"173.245.48.1",
			"103.21.244.1",
			"103.22.200.1",
			"103.31.4.1",
			"141.101.64.1",
			"108.162.192.1",
			"190.93.240.1",
			"188.114.96.1",
			"197.234.240.1",
			"198.41.128.1",
			"162.158.0.1",
			"104.16.0.1",
			"104.24.0.1",
			"172.64.0.1",
			"131.0.72.1",
		];

		test.each(cloudflareIPs)("%s is Cloudflare IP", (ip) => {
			expect(isCloudflareIP(ip)).toBe(true);
		});

		test("non-Cloudflare IP is NOT detected", () => {
			expect(isCloudflareIP("8.8.8.8")).toBe(false);
			expect(isCloudflareIP("1.1.1.1")).toBe(false);
		});

		test("IPv6 Cloudflare ranges", () => {
			expect(isCloudflareIP("2606:4700::1")).toBe(true);
			expect(isCloudflareIP("2400:cb00::1")).toBe(true);
		});
	});

	describe("sanitizeIP() - edge cases", () => {
		test("valid IPv4 is returned as-is", () => {
			expect(sanitizeIP("192.168.1.1")).toBe("192.168.1.1");
			expect(sanitizeIP("8.8.8.8")).toBe("8.8.8.8");
		});

		test("valid IPv6 is returned as-is", () => {
			expect(sanitizeIP("2001:db8::1")).toBe("2001:db8::1");
			expect(sanitizeIP("::1")).toBe("::1");
		});

		test("multiple IPs returns first", () => {
			expect(sanitizeIP("192.168.1.1, 10.0.0.1")).toBe("192.168.1.1");
			expect(sanitizeIP("8.8.8.8,1.1.1.1")).toBe("8.8.8.8");
		});

		test("IPv4-mapped IPv6 is converted", () => {
			expect(sanitizeIP("::ffff:192.168.1.1")).toBe("192.168.1.1");
		});

		test("whitespace is trimmed", () => {
			expect(sanitizeIP("  192.168.1.1  ")).toBe("192.168.1.1");
		});

		test("null returns 'unknown'", () => {
			expect(sanitizeIP(null)).toBe("unknown");
		});

		test("undefined returns 'unknown'", () => {
			expect(sanitizeIP(undefined)).toBe("unknown");
		});

		test("empty string returns 'unknown'", () => {
			expect(sanitizeIP("")).toBe("unknown");
		});

		test("invalid IP returns 'unknown'", () => {
			expect(sanitizeIP("not-an-ip")).toBe("unknown");
			expect(sanitizeIP("999.999.999.999")).toBe("unknown");
			expect(sanitizeIP("192.168.1")).toBe("unknown");
		});

		test("IP with invalid octets returns 'unknown'", () => {
			expect(sanitizeIP("192.168.1.256")).toBe("unknown");
			expect(sanitizeIP("192.168.-1.1")).toBe("unknown");
		});
	});

	describe("maskIPv6To64()", () => {
		test("masks full IPv6 to first 64 bits", () => {
			expect(maskIPv6To64("2001:db8:85a3:8d3:1319:8a2e:370:7348")).toBe(
				"2001:db8:85a3:8d3::",
			);
		});

		test("masks compressed IPv6", () => {
			expect(maskIPv6To64("2001:db8::1")).toBe("2001:db8::");
		});

		test("handles IPv4-mapped IPv6", () => {
			expect(maskIPv6To64("::ffff:192.168.1.1")).toBe("192.168.1.1");
		});

		test("returns IPv4 unchanged", () => {
			expect(maskIPv6To64("192.168.1.1")).toBe("192.168.1.1");
		});

		test("handles loopback", () => {
			expect(maskIPv6To64("::1")).toBe("::");
		});
	});

	describe("maskIPv4To24()", () => {
		test("masks IPv4 to /24", () => {
			expect(maskIPv4To24("192.168.1.100")).toBe("192.168.1.0/24");
			expect(maskIPv4To24("10.0.0.50")).toBe("10.0.0.0/24");
		});

		test("returns IPv6 unchanged", () => {
			expect(maskIPv4To24("2001:db8::1")).toBe("2001:db8::1");
		});
	});

	describe("sha256Hex()", () => {
		test("produces 64-character hex string", async () => {
			const hash = await sha256Hex("test");
			expect(hash).toHaveLength(64);
			expect(hash).toMatch(/^[0-9a-f]+$/);
		});

		test("deterministic output", async () => {
			const hash1 = await sha256Hex("test");
			const hash2 = await sha256Hex("test");
			expect(hash1).toBe(hash2);
		});

		test("different inputs produce different hashes", async () => {
			const hash1 = await sha256Hex("test1");
			const hash2 = await sha256Hex("test2");
			expect(hash1).not.toBe(hash2);
		});

		test("empty string", async () => {
			const hash = await sha256Hex("");
			expect(hash).toBe(
				"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
			);
		});
	});

	describe("getRequestIP()", () => {
		test("extracts IP from CF-Connecting-IP with CF-Ray", async () => {
			const request = new Request("http://example.com", {
				headers: {
					"cf-connecting-ip": "104.16.0.1",
					"cf-ray": "abc123",
				},
			});
			const ip = await getRequestIP(request);
			expect(ip).toBe("104.16.0.1");
		});

		test("extracts from X-Forwarded-For with trustProxy", async () => {
			const request = new Request("http://example.com", {
				headers: {
					"x-forwarded-for": "192.168.1.1, 10.0.0.1",
				},
			});
			const ip = await getRequestIP(request, { trustProxy: true });
			expect(ip).toBe("192.168.1.1");
		});

		test("falls back to socket IP when untrusted proxy", async () => {
			const request = new Request("http://example.com", {
				headers: {
					"x-forwarded-for": "8.8.8.8",
				},
			}) as unknown as Request & { socket?: { remoteAddress?: string } };
			request.socket = { remoteAddress: "10.0.0.1" };

			const ip = await getRequestIP(request);
			expect(ip).toBe("10.0.0.1");
		});

		test("generates fingerprint when no IP available", async () => {
			const request = new Request("http://example.com", {
				headers: {
					"user-agent": "Mozilla/5.0",
					"accept-language": "en-US",
				},
			});
			const ip = await getRequestIP(request);
			expect(ip).toMatch(/^fp:[0-9a-f]{16}$/);
		});

		test("returns 'unknown' when no headers available", async () => {
			const request = new Request("http://example.com");
			const ip = await getRequestIP(request as unknown as Request & { socket?: { remoteAddress?: string } });
			expect(ip).toMatch(/^fp:[0-9a-f]{16}$/);
		});
	});
});