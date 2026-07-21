import { isIPv6 as nodeIsIPv6 } from "node:net";

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

export function getRequestIP(request: Request): string {
	const forwarded = request.headers.get("x-forwarded-for");
	if (forwarded) {
		return sanitizeIP(forwarded);
	}
	const realIP = request.headers.get("x-real-ip");
	if (realIP) {
		return sanitizeIP(realIP);
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
