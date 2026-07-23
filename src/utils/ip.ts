import { LruCache } from "./lru";
import { sha256 } from "./crypto-helpers";

const TRUSTED_PROXIES = new Set([
	"127.0.0.1",
	"::1",
	"10.0.0.0/8",
	"172.16.0.0/12",
	"192.168.0.0/16",
	"fc00::/7",
]);

const fingerprintCache = new LruCache<string, string>(1000);

const CLOUDFLARE_IP_RANGES = [
	"173.245.48.0/20",
	"103.21.244.0/22",
	"103.22.200.0/22",
	"103.31.4.0/22",
	"141.101.64.0/18",
	"108.162.192.0/18",
	"190.93.240.0/20",
	"188.114.96.0/20",
	"197.234.240.0/22",
	"198.41.128.0/17",
	"162.158.0.0/15",
	"104.16.0.0/13",
	"104.24.0.0/14",
	"172.64.0.0/13",
	"131.0.72.0/22",
	"2400:cb00::/32",
	"2606:4700::/32",
	"2803:f800::/32",
	"2405:b500::/32",
	"2405:8100::/32",
	"2c9f:1c00::/32",
];

function ipToNumber(ip: string): number {
	const parts = ip.split(".").map(Number);
	return (
		(parts[0]! & 0xff) * 16777216 +
		(parts[1]! & 0xff) * 65536 +
		(parts[2]! & 0xff) * 256 +
		(parts[3]! & 0xff)
	);
}

function _isIPv6(ip: string): boolean {
	return ip.includes(":");
}

function isPrivateIP(ip: string): boolean {
	if (ip.includes(":")) {
		return ip.startsWith("fc") || ip.startsWith("fd") || ip === "::1";
	}

	const num = ipToNumber(ip);
	return (
		(num >= ipToNumber("10.0.0.0") && num <= ipToNumber("10.255.255.255")) ||
		(num >= ipToNumber("172.16.0.0") && num <= ipToNumber("172.31.255.255")) ||
		(num >= ipToNumber("192.168.0.0") &&
			num <= ipToNumber("192.168.255.255")) ||
		num === ipToNumber("127.0.0.1")
	);
}

function isInCIDR(ip: string, cidr: string): boolean {
	const [range, bits] = cidr.split("/");
	if (!range || !bits) return false;

	const numBits = Number.parseInt(bits, 10);
	const mask = numBits === 0 ? 0 : 0xffffffff << (32 - numBits);
	const ipNum = ipToNumber(ip);
	const rangeNum = ipToNumber(range);

	return (ipNum & mask) === (rangeNum & mask);
}

function isTrustedSource(ip: string): boolean {
	if (isPrivateIP(ip)) {
		return true;
	}

	for (const cidr of TRUSTED_PROXIES) {
		if (cidr.includes("/")) {
			if (isInCIDR(ip, cidr)) {
				return true;
			}
		} else if (ip === cidr) {
			return true;
		}
	}

	return false;
}

function isCloudflareIP(ip: string): boolean {
	for (const cidr of CLOUDFLARE_IP_RANGES) {
		if (cidr.includes("/")) {
			if (isInCIDR(ip, cidr)) {
				return true;
			}
		} else if (ip === cidr) {
			return true;
		}
	}
	return false;
}

export { isIPv6Internal as isIPv6, isPrivateIP, isTrustedSource };

export function sanitizeIP(raw: string | null | undefined): string {
	const ip = raw?.split(",")[0]?.trim() ?? "unknown";
	const cleaned = ip.replace(/^::ffff:/, "");
	if (isIPv6Internal(cleaned)) {
		return cleaned;
	}
	const ipv4Regex = /^(?:\d{1,3}\.){3}\d{1,3}$/;
	if (ipv4Regex.test(cleaned)) {
		const parts = cleaned.split(".");
		const valid = parts.every((p) => {
			const num = Number.parseInt(p, 10);
			return !Number.isNaN(num) && num >= 0 && num <= 255;
		});
		if (valid) return cleaned;
	}
	return "unknown";
}

function isIPv6Internal(ip: string): boolean {
	return ip.includes(":");
}

/**
 * Masks IPv6 address to first 64 bits (network prefix) for privacy
 * @param ip - IPv6 address to mask
 * @returns Masked IPv6 address (first 4 segments only) or original if IPv4
 * @security
 * - Preserves only /64 network prefix for rate limiting
 * - Handles IPv4-mapped IPv6 addresses (::ffff:x.x.x.x)
 * - Handles compressed IPv6 notation (::)
 * @example
 * maskIPv6To64("2001:db8:85a3:8d3:1319:8a2e:370:7348") // returns "2001:db8:85a3:8d3::"
 * maskIPv6To64("::ffff:192.168.1.1") // returns "192.168.1.1"
 */
export function maskIPv6To64(ip: string): string {
	if (!isIPv6Internal(ip)) {
		return ip;
	}

	if (ip.includes("::ffff:") && ip.includes(".")) {
		const parts = ip.split("::ffff:");
		if (parts.length === 2) {
			return parts[1]!;
		}
	}

	const parts = ip.split(":");
	const nonEmptyParts = parts.filter((p) => p !== "");

	if (nonEmptyParts.length < 4) {
		if (ip.startsWith("::")) {
			return "::";
		}
		return `${parts.slice(0, 4).join(":")}::`;
	}

	return `${parts.slice(0, 4).join(":")}::`;
}

/**
 * Masks IPv4 address to /24 network prefix for privacy
 * @param ip - IPv4 address to mask
 * @returns Masked IPv4 address with last octet as 0/24, or original if IPv6
 * @security
 * - Preserves only /24 network prefix for rate limiting
 * - Prevents tracking of individual devices behind same router
 * @example
 * maskIPv4To24("192.168.1.100") // returns "192.168.1.0/24"
 */
export function maskIPv4To24(ip: string): string {
	if (!ip.includes(":")) {
		const parts = ip.split(".");
		if (parts.length === 4) {
			return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
		}
	}
	return ip;
}

/**
 * Extracts client IP address from HTTP request with proxy support
 * @param request - HTTP Request object
 * @param options - Optional configuration
 * @param options.trustProxy - Whether to trust X-Forwarded-For headers (default: false)
 * @returns Client IP address or fingerprint if unavailable
 * @throws Never - always returns a string
 * @security
 * - Prioritizes CF-Connecting-IP when behind Cloudflare
 * - Validates X-Forwarded-For source is trusted proxy when trustProxy=false
 * - Falls back to user-agent fingerprint if no IP available
 * - Sanitizes all IP values to prevent injection
 * @example
 * // Behind Cloudflare
 * const ip = await getRequestIP(request);
 *
 * // Behind trusted load balancer
 * const ip = await getRequestIP(request, { trustProxy: true });
 */
export async function getRequestIP(
	request: Request,
	options?: { trustProxy?: boolean },
): Promise<string> {
	const trustProxy = options?.trustProxy ?? false;

	const cfConnectingIP = request.headers.get("cf-connecting-ip");
	const cfRay = request.headers.get("cf-ray");
	if (cfConnectingIP && cfRay) {
		const ip = sanitizeIP(cfConnectingIP);
		if (isCloudflareIP(ip)) {
			return ip;
		}
	}

	const forwarded = request.headers.get("x-forwarded-for");
	if (forwarded) {
		const ip = sanitizeIP(forwarded);
		if (!trustProxy && !isTrustedSource(ip)) {
			const socketIP =
				(request as unknown as { socket?: { remoteAddress?: string } }).socket
					?.remoteAddress ?? "unknown";
			return sanitizeIP(socketIP ?? "unknown");
		}
		return ip;
	}

	const realIP = request.headers.get("x-real-ip");
	if (realIP) {
		const ip = sanitizeIP(realIP);
		if (!trustProxy && !isTrustedSource(ip)) {
			const socketIP =
				(request as unknown as { socket?: { remoteAddress?: string } }).socket
					?.remoteAddress ?? "unknown";
			return sanitizeIP(socketIP ?? "unknown");
		}
		return ip;
	}

	if (cfConnectingIP) {
		const ip = sanitizeIP(cfConnectingIP);
		if (isCloudflareIP(ip)) {
			return ip;
		}
	}

	const ua = request.headers.get("user-agent") || "unknown";
	const cached = fingerprintCache.get(ua);
	if (cached) return cached;

	const lang = request.headers.get("accept-language") || "";
	const secUa = request.headers.get("sec-ch-ua") || "";

	const combined = `${ua}|${lang}|${secUa}`;
	const fingerprint = await sha256Hex(combined);
	const result = `fp:${fingerprint.slice(0, 16)}`;

	fingerprintCache.set(ua, result, 3600000);
	return result;
}

/**
 * Computes SHA-256 hash of input string as hexadecimal
 * @param input - String to hash
 * @returns 64-character hexadecimal string
 * @security Uses Web Crypto API for constant-time hashing
 * @example
 * const hash = await sha256Hex("user-agent-string");
 * // returns "a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e"
 */
export async function sha256Hex(input: string): Promise<string> {
	const data = new TextEncoder().encode(input);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	return Array.from(new Uint8Array(hashBuffer))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}
