import { sha256 } from "./crypto-helpers";

const TRUSTED_PROXIES = new Set([
	"127.0.0.1",
	"::1",
	"10.0.0.0/8",
	"172.16.0.0/12",
	"192.168.0.0/16",
	"fc00::/7",
]);

interface FingerprintEntry {
	value: string;
	expiresAt: number;
}

const fingerprintCache = new Map<string, FingerprintEntry>();
const MAX_FINGERPRINT_CACHE = 1000;
const FINGERPRINT_CACHE_TTL_MS = 5 * 60 * 1000;

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

function isValidIPv4(ip: string): boolean {
	const ipv4Regex = /^(?:\d{1,3}\.){3}\d{1,3}$/;
	if (!ipv4Regex.test(ip)) return false;
	const parts = ip.split(".");
	return parts.every((p) => {
		const num = Number.parseInt(p, 10);
		return !Number.isNaN(num) && num >= 0 && num <= 255;
	});
}

const IPV6_REGEX =
	/^(([0-9a-f]{1,4}:){7}[0-9a-f]{1,4}|([0-9a-f]{1,4}:){1,7}:|([0-9a-f]{1,4}:){1,6}:[0-9a-f]{1,4}|([0-9a-f]{1,4}:){1,5}(:[0-9a-f]{1,4}){1,2}|([0-9a-f]{1,4}:){1,4}(:[0-9a-f]{1,4}){1,3}|([0-9a-f]{1,4}:){1,3}(:[0-9a-f]{1,4}){1,4}|([0-9a-f]{1,4}:){1,2}(:[0-9a-f]{1,4}){1,5}|[0-9a-f]{1,4}:((:[0-9a-f]{1,4}){1,6})|:((:[0-9a-f]{1,4}){1,7}|:))$/;

export function isPrivateIP(ip: string): boolean {
	const normalized = ip.toLowerCase();
	if (!isValidIPv4(ip)) {
		if (normalized.includes(":") && IPV6_REGEX.test(normalized)) {
			return (
				normalized.startsWith("fc") ||
				normalized.startsWith("fd") ||
				normalized === "::1"
			);
		}
		return false;
	}

	const num = ipToNumber(ip);
	const loopbackStart = ipToNumber("127.0.0.0");
	const loopbackEnd = ipToNumber("127.255.255.255");
	return (
		(num >= ipToNumber("10.0.0.0") && num <= ipToNumber("10.255.255.255")) ||
		(num >= ipToNumber("172.16.0.0") && num <= ipToNumber("172.31.255.255")) ||
		(num >= ipToNumber("192.168.0.0") &&
			num <= ipToNumber("192.168.255.255")) ||
		(num >= loopbackStart && num <= loopbackEnd)
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

export function isCloudflareIP(ip: string): boolean {
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

export { isIPv6Internal as isIPv6, isTrustedSource };

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

	if (ip === "::1") {
		return "::";
	}

	const expanded = expandIPv6(ip);
	const groups = expanded.split(":");
	const masked = groups.slice(0, 4);
	while (masked.length > 1 && masked[masked.length - 1] === "0") {
		masked.pop();
	}
	return `${masked.join(":")}::`;
}

function expandIPv6(ip: string): string {
	if (!ip.includes("::")) {
		return ip;
	}

	const parts = ip.split("::");
	const left = parts[0] ? parts[0].split(":") : [];
	const right = parts[1] ? parts[1].split(":") : [];
	const missing = 8 - left.length - right.length;
	const zeros = Array(missing).fill("0");
	return [...left, ...zeros, ...right].join(":");
}

export function maskIPv4To24(ip: string): string {
	if (!ip.includes(":")) {
		const parts = ip.split(".");
		if (parts.length === 4) {
			return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
		}
	}
	return ip;
}

export interface GetRequestIPOptions {
	trustProxy?: boolean;

	proxyIPs?: string[];
}

function getSocketIP(request: Request): string {
	const socketIP = (
		request as unknown as { socket?: { remoteAddress?: string } }
	).socket?.remoteAddress;
	return sanitizeIP(socketIP ?? "unknown");
}

function isExplicitProxy(ip: string, proxyIPs: string[]): boolean {
	for (const entry of proxyIPs) {
		if (entry.includes("/")) {
			if (isInCIDR(ip, entry)) {
				return true;
			}
		} else if (ip === entry) {
			return true;
		}
	}
	return false;
}

function isTrustedPeer(peer: string, proxyIPs?: string[]): boolean {
	if (peer === "unknown") return false;
	if (proxyIPs && proxyIPs.length > 0) {
		return isExplicitProxy(peer, proxyIPs);
	}
	return isTrustedSource(peer) || isCloudflareIP(peer);
}

function pickForwardedIP(forwarded: string): string {
	const entries = forwarded.split(",").map((entry) => sanitizeIP(entry.trim()));
	for (let i = entries.length - 1; i >= 0; i--) {
		if (entries[i] !== "unknown") {
			return entries[i]!;
		}
	}
	return "unknown";
}

function envProxyIPs(): string[] | undefined {
	if (typeof process === "undefined" || !process.env.TRUSTED_PROXY_IPS) {
		return undefined;
	}
	const ips = process.env.TRUSTED_PROXY_IPS.split(",")
		.map((entry) => entry.trim())
		.filter(Boolean);
	return ips.length > 0 ? ips : undefined;
}

export async function getRequestIP(
	request: Request,
	options?: GetRequestIPOptions,
): Promise<string> {
	const trustProxy = options?.trustProxy ?? false;
	const proxyIPs = options?.proxyIPs ?? envProxyIPs();

	const peer = getSocketIP(request);
	const peerTrusted = trustProxy && isTrustedPeer(peer, proxyIPs);

	const cfConnectingIP = request.headers.get("cf-connecting-ip");
	if (cfConnectingIP && trustProxy && isCloudflareIP(peer)) {
		const ip = sanitizeIP(cfConnectingIP);
		if (ip !== "unknown") return ip;
	}

	if (peerTrusted) {
		const forwarded = request.headers.get("x-forwarded-for");
		if (forwarded) {
			const ip = pickForwardedIP(forwarded);
			if (ip !== "unknown") return ip;
		}

		const realIP = request.headers.get("x-real-ip");
		if (realIP) {
			const ip = sanitizeIP(realIP);
			if (ip !== "unknown") return ip;
		}
	}

	if (peer !== "unknown") return peer;

	const ua = request.headers.get("user-agent") || "unknown";
	const now = Date.now();
	const cached = fingerprintCache.get(ua);
	if (cached && cached.expiresAt > now) return cached.value;
	if (cached) fingerprintCache.delete(ua);

	const lang = request.headers.get("accept-language") || "";
	const secUa = request.headers.get("sec-ch-ua") || "";

	const combined = `${ua}|${lang}|${secUa}`;
	const fingerprint = await sha256(combined);
	const result = `fp:${fingerprint.slice(0, 16)}`;

	if (fingerprintCache.size >= MAX_FINGERPRINT_CACHE) {
		const firstKey = fingerprintCache.keys().next().value;
		if (firstKey) fingerprintCache.delete(firstKey);
	}
	fingerprintCache.set(ua, {
		value: result,
		expiresAt: now + FINGERPRINT_CACHE_TTL_MS,
	});
	return result;
}

export { sha256 as sha256Hex };
