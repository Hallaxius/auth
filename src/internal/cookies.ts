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

export interface SessionCookieOptions {
	maxAge?: number;
	path?: string;
	httpOnly?: boolean;
	secure?: boolean;
	sameSite?: "lax" | "strict" | "none";
}

export function createSessionCookie(
	name: string,
	value: string,
	options: SessionCookieOptions = {},
): string {
	const parts = [`${name}=${value}`];
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
	try {
		const nodeEnv =
			typeof process !== "undefined" ? process.env.NODE_ENV : undefined;
		return nodeEnv === "production";
	} catch {
		return false;
	}
}
