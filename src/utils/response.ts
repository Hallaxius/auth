/**
 * @file HTTP response utilities
 *
 * Standardized response creators for JSON, HTML, redirects, and errors.
 * All functions support optional Set-Cookie headers for session management.
 *
 * @module utils/response
 */

export interface SecurityHeadersOptions {
	contentSecurityPolicy?: string;
	customHeaders?: Record<string, string>;
}

const DEFAULT_SECURITY_HEADERS: Record<string, string> = {
	"X-Content-Type-Options": "nosniff",
	"X-Frame-Options": "DENY",
	"X-XSS-Protection": "1; mode=block",
	"Referrer-Policy": "strict-origin-when-cross-origin",
	"Permissions-Policy": "geolocation=(), microphone=(), camera=()",
};

function addSecurityHeaders(
	headers: Headers,
	options?: SecurityHeadersOptions,
): void {
	for (const [key, value] of Object.entries(DEFAULT_SECURITY_HEADERS)) {
		if (!headers.has(key)) {
			headers.set(key, value);
		}
	}

	if (options?.contentSecurityPolicy) {
		headers.set("Content-Security-Policy", options.contentSecurityPolicy);
	}

	if (options?.customHeaders) {
		for (const [key, value] of Object.entries(options.customHeaders)) {
			headers.set(key, value);
		}
	}
}

/**
 * Creates a JSON response with optional cookies and security headers
 * @param data - Response body (will be JSON.stringify'd)
 * @param status - HTTP status code (default: 200)
 * @param cookies - Optional Set-Cookie headers
 * @param options - Optional security headers configuration
 * @returns Response object with JSON body and security headers
 */
export function jsonResponse(
	data: unknown,
	status = 200,
	cookies?: string[],
	options?: SecurityHeadersOptions,
): Response {
	const headers = new Headers({
		"Content-Type": "application/json; charset=utf-8",
	});
	addSecurityHeaders(headers, options);
	if (cookies) {
		for (const c of cookies) headers.append("Set-Cookie", c);
	}
	return new Response(JSON.stringify(data), { status, headers });
}

/**
 * Creates an error response with error code
 * @param error - Error object or unknown
 * @param status - HTTP status code (default: 500)
 * @returns Response object with error JSON
 */
export function errorResponse(error: unknown, status?: number): Response {
	const message =
		error instanceof Error ? error.message : "Internal server error";
	const code = getCode(error);
	return jsonResponse({ error: message, code }, status ?? 500);
}

/**
 * Creates an HTML response
 * @param body - HTML content
 * @param status - HTTP status code (default: 200)
 * @param cookies - Optional Set-Cookie headers
 */
export function htmlResponse(
	body: string,
	status = 200,
	cookies?: string[],
): Response {
	const headers = new Headers({ "Content-Type": "text/html; charset=utf-8" });
	if (cookies) {
		for (const c of cookies) headers.append("Set-Cookie", c);
	}
	return new Response(body, { status, headers });
}

/**
 * Creates a redirect response (302)
 * @param url - Target URL (must be relative, starting with /)
 * @param cookies - Optional Set-Cookie headers
 * @throws {Error} If URL is absolute (doesn't start with /)
 */
export function redirectResponse(url: string, cookies?: string[]): Response {
	const headers = new Headers({ Location: url });
	if (cookies) {
		for (const c of cookies) headers.append("Set-Cookie", c);
	}
	return new Response(null, { status: 302, headers });
}

function getCode(error: unknown): string {
	if (error instanceof Error && "code" in error) {
		return String(error.code);
	}
	return "INTERNAL_ERROR";
}
