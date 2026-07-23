import type { SessionCookieOptions } from "../types";

export type { SessionCookieOptions };

/**
 * Parses Cookie header from HTTP request into key-value pairs
 * @param request - HTTP Request object
 * @returns Object with cookie names as keys and values as strings
 * @example
 * const cookies = parseCookies(request);
 * const sessionId = cookies['session_id'];
 */
export function parseCookies(request: Request): Record<string, string> {
	const header = request.headers.get("Cookie") ?? "";
	const cookies: Record<string, string> = {};
	for (const pair of header.split(";")) {
		const [key, ...rest] = pair.split("=");
		if (key) {
			cookies[key.trim()] = rest.join("=").trim();
		}
	}
	return cookies;
}

/**
 * Creates a Set-Cookie header value for session cookies
 * @param name - Cookie name
 * @param value - Cookie value (must be alphanumeric, dash, underscore, or dot only)
 * @param options - Cookie options (maxAge, path, httpOnly, secure, sameSite)
 * @returns Set-Cookie header string
 * @throws {Error} If value exceeds 4096 bytes or contains invalid characters
 * @security
 * - Validates cookie value length (max 4096 bytes)
 * - Sanitizes value by removing CR/LF characters to prevent header injection
 * - Only allows safe characters: a-zA-Z0-9-_.
 * - Supports HttpOnly, Secure, and SameSite attributes
 */
export function createSessionCookie(
	name: string,
	value: string,
	options: SessionCookieOptions = {},
): string {
	const sanitizedValue = value.replace(/[\r\n]/g, "");

	if (sanitizedValue.length > 4096) {
		throw new Error("Cookie value too large: exceeds 4096 bytes");
	}

	if (!/^[a-zA-Z0-9\-_.]+$/.test(sanitizedValue)) {
		throw new Error("Invalid cookie value: contains disallowed characters");
	}

	if (options.sameSite === "none") {
		options.secure = true;
	}

	const parts = [`${name}=${sanitizedValue}`];
	if (options.maxAge) parts.push(`Max-Age=${options.maxAge}`);
	if (options.path) parts.push(`Path=${options.path}`);
	if (options.httpOnly) parts.push("HttpOnly");
	if (options.secure) parts.push("Secure");
	if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
	return parts.join("; ");
}

/**
 * Creates a Set-Cookie header value to clear/delete a session cookie
 * @param name - Cookie name to clear
 * @param options - Cookie options (path, httpOnly, secure, sameSite)
 * @returns Set-Cookie header string with Max-Age=0 and past Expires date
 * @security
 * - Sets Max-Age=0 to immediately expire cookie
 * - Sets Expires to Unix epoch (Thu, 01 Jan 1970)
 * - Preserves path and security attributes for proper deletion
 */
export function clearSessionCookie(
	name: string,
	options: SessionCookieOptions = {},
): string {
	if (options.sameSite === "none") {
		options.secure = true;
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

/**
 * Returns default value for secure cookie flag based on environment
 * @returns true if NODE_ENV is "production", false otherwise
 * @security Use this to automatically enable Secure flag in production environments
 */
export function defaultSecureCookie(): boolean {
	try {
		const nodeEnv =
			typeof process !== "undefined" ? process.env.NODE_ENV : undefined;
		return nodeEnv === "production";
	} catch {
		return false;
	}
}

/**
 * Returns default SameSite attribute value based on environment
 * @returns "strict" in production, "lax" otherwise
 * @security
 * - Production: "strict" for maximum CSRF protection
 * - Development: "lax" to allow top-level navigations
 */
export function defaultSameSite(): "strict" | "lax" | "none" {
	try {
		const nodeEnv =
			typeof process !== "undefined" ? process.env.NODE_ENV : undefined;
		return nodeEnv === "production" ? "strict" : "lax";
	} catch {
		return "lax";
	}
}
