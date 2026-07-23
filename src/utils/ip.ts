import { isIPv6 as nodeIsIPv6 } from "node:net";

const TRUSTED_PROXIES = new Set([
	"127.0.0.1",
	"::1",
	"10.0.0.0/8",
	"172.16.0.0/12",
	"192.168.0.0/16",
	"fc00::/7",
]);

function ipToNumber(ip: string): number {
	const parts = ip.split(".").map(Number);
	return (parts[0]! << 24) + (parts[1]! << 16) + (parts[2]! << 8) + parts[3]!;
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

	const mask = ~(0xffffffff >> Number.parseInt(bits, 10));
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

export { isPrivateIP, isTrustedSource };

export function sanitizeIP(raw: string | null | undefined): string {
	const ip = raw?.split(",")[0]?.trim() ?? "unknown";
	const cleaned = ip.replace(/^::ffff:/, "");
	if (nodeIsIPv6(cleaned)) {
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
	return "127.0.0.1";
}

export function isIPv6(ip: string): boolean {
	return nodeIsIPv6(ip);
}

export function maskIPv6To64(ip: string): string {
	if (!ip.includes(":")) {
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

export function getRequestIP(
	request: Request,
	options?: { trustProxy?: boolean },
): string {
	const trustProxy = options?.trustProxy ?? false;

	const forwarded = request.headers.get("x-forwarded-for");
	if (forwarded) {
		const ip = sanitizeIP(forwarded);
		if (!trustProxy && !isTrustedSource(ip)) {
			console.warn(
				"[ip] Untrusted proxy detected. Ignoring x-forwarded-for header.",
			);
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
			console.warn("[ip] Untrusted proxy detected. Ignoring x-real-ip header.");
			const socketIP =
				(request as unknown as { socket?: { remoteAddress?: string } }).socket
					?.remoteAddress ?? "unknown";
			return sanitizeIP(socketIP ?? "unknown");
		}
		return ip;
	}

	const cfConnectingIP = request.headers.get("cf-connecting-ip");
	if (cfConnectingIP) {
		return sanitizeIP(cfConnectingIP);
	}

	return "unknown";
}

export async function sha256Hex(input: string): Promise<string> {
	const data = new TextEncoder().encode(input);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	return Array.from(new Uint8Array(hashBuffer))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}
