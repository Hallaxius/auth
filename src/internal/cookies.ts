import type { SessionCookieOptions } from "../types";
import { isProduction, validateCookieValue } from "../utils/validation";

export type { SessionCookieOptions };

export function parseCookies(request: Request): Record<string, string> {
	const header = request.headers.get("Cookie") ?? "";
	const cookies: Record<string, string> = {};
	for (const pair of header.split(";")) {
		const [key, ...rest] = pair.split("=");
		if (key) {
			const value = rest.join("=");
			try {
				cookies[key.trim()] = decodeURIComponent(value.trim());
			} catch {
				cookies[key.trim()] = value.trim();
			}
		}
	}
	return cookies;
}

export function createSessionCookie(
	name: string,
	value: string,
	options: SessionCookieOptions = {},
): string {
	const sanitizedValue = value.replace(/[\r\n]/g, "");

	validateCookieValue(sanitizedValue);

	if (options.sameSite === "none") {
		options = { ...options, secure: true };
	}

	const parts = [`${name}=${sanitizedValue}`];
	if (options.maxAge) parts.push(`Max-Age=${options.maxAge}`);
	if (options.path) parts.push(`Path=${options.path}`);
	if (options.httpOnly) parts.push("HttpOnly");
	if (options.secure) parts.push("Secure");
	if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
	return parts.join("; ");
}

export function clearSessionCookie(
	name: string,
	options: SessionCookieOptions = {},
): string {
	if (options.sameSite === "none") {
		options = { ...options, secure: true };
	}

	const parts = [
		`${name}=`,
		"Max-Age=0",
		"Expires=Thu, 01 Jan 1970 00:00:00 GMT",
	];
	if (options.path) parts.push(`Path=${options.path}`);
	if (options.httpOnly) parts.push("HttpOnly");
	if (options.secure) parts.push("Secure");
	if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
	return parts.join("; ");
}

export function defaultSecureCookie(): boolean {
	return isProduction();
}

export function defaultSameSite(): "strict" | "lax" | "none" {
	return isProduction() ? "strict" : "lax";
}
