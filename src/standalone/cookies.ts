import type { SessionConfig } from "../core/types";
import { parseExpiresIn } from "../core/utils";

export function parseCookies(request: Request): Record<string, string> {
	const cookieHeader = request.headers.get("cookie");
	if (!cookieHeader) return {};

	const cookies: Record<string, string> = {};
	for (const entry of cookieHeader.split(";")) {
		const idx = entry.indexOf("=");
		if (idx === -1) continue;
		const key = entry.slice(0, idx).trim();
		const value = entry.slice(idx + 1).trim();
		if (key) cookies[key] = decodeURIComponent(value);
	}
	return cookies;
}

export function setSessionCookie(
	name: string,
	value: string,
	config: SessionConfig,
): string {
	const maxAge = parseExpiresIn(config.expiresIn);

	const parts: string[] = [
		`${encodeURIComponent(name)}=${encodeURIComponent(value)}`,
		`Path=${config.cookiePath ?? "/"}`,
		`Max-Age=${maxAge}`,
		`SameSite=${config.sameSite ?? "lax"}`,
	];

	if (config.httpOnly !== false) parts.push("HttpOnly");
	if (config.secure) parts.push("Secure");

	return parts.join("; ");
}

export function clearSessionCookie(
	name: string,
	config: SessionConfig,
): string {
	const parts: string[] = [
		`${encodeURIComponent(name)}=`,
		`Path=${config.cookiePath ?? "/"}`,
		"Max-Age=0",
		`SameSite=${config.sameSite ?? "lax"}`,
	];

	return parts.join("; ");
}
