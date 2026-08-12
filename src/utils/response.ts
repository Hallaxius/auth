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

export function errorResponse(error: unknown, status?: number): Response {
	const message =
		error instanceof Error ? error.message : "Internal server error";
	const code = getCode(error);
	return jsonResponse({ error: message, code }, status ?? 500);
}

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

export function htmlResponse(
	body: string,
	status = 200,
	cookies?: string[],
	options?: SecurityHeadersOptions,
): Response {
	const headers = new Headers({ "Content-Type": "text/html; charset=utf-8" });
	addSecurityHeaders(headers, options);
	if (cookies) {
		for (const c of cookies) headers.append("Set-Cookie", c);
	}
	return new Response(escapeHtml(body), { status, headers });
}

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
