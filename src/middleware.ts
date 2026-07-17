/**
 * v3 Middleware — Self-contained implementations
 *
 * Edge-compatible middleware for Next.js, Bun, Node, Cloudflare Workers, Deno.
 */

import { jwtVerify } from "jose";

// ============================================================================
// Types
// ============================================================================

export interface EdgeAuthConfig {
	/** JWT secret for verifying session tokens */
	secret: string;
	/** Cookie name(s) to check — supports multiple cookies for multi-provider auth */
	cookies?: Array<{ name: string; secret: string }>;
	/** Single cookie name (legacy, use cookies array instead) */
	cookieName?: string;
	/** Login URL for redirects (default: "/auth/discord") */
	loginUrl?: string;
	/** Paths that bypass auth (supports * wildcard) */
	publicPaths?: string[];
}

export interface EdgeRoleConfig {
	/** JWT secret for verifying session tokens */
	secret: string;
	/** Cookie name (default: "discord-auth-session") */
	cookieName?: string;
	/** Login URL for redirects (default: "/auth/discord") */
	loginUrl?: string;
	/** Path pattern -> required roles mapping (supports * wildcard) */
	roles: Record<string, string[]>;
}

export interface MiddlewareAuthConfig {
	cookies: Array<{ name: string; secret: string }>;
	publicPaths: string[];
	loginUrl: string;
}

export interface MiddlewareRoleConfig {
	secret: string;
	cookieName: string;
	loginUrl: string;
	roles: Record<string, string[]>;
}

// ============================================================================
// Cookie parsing (inlined from standalone/cookies.ts)
// ============================================================================

function parseCookies(request: Request): Record<string, string> {
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

// ============================================================================
// JWT verification (inlined from standalone/jwt.ts)
// ============================================================================

function secretToKey(secret: string): Uint8Array {
	return new TextEncoder().encode(secret);
}

async function verifyToken<T extends Record<string, unknown>>(
	token: string,
	secret: string,
): Promise<T | null> {
	try {
		const { payload } = await jwtVerify(token, secretToKey(secret));
		return payload as T;
	} catch {
		return null;
	}
}

// ============================================================================
// Path matching utilities (inlined from standalone/edge.ts)
// ============================================================================

export function isPublicPath(path: string, patterns: string[]): boolean {
	for (const pattern of patterns) {
		if (pattern.endsWith("/*")) {
			const prefix = pattern.slice(0, -2);
			if (
				path === prefix ||
				path.startsWith(`${prefix}/`) ||
				path === `${prefix}/`
			) {
				return true;
			}
		} else if (path === pattern) {
			return true;
		}
	}
	return false;
}

export function requiredRole(
	path: string,
	roleMap: Record<string, string[]>,
): string[] | null {
	for (const [pattern, roles] of Object.entries(roleMap)) {
		if (pattern.endsWith("/*")) {
			const prefix = pattern.slice(0, -2);
			if (path === prefix || path.startsWith(`${prefix}/`)) {
				return roles;
			}
		} else if (path === pattern) {
			return roles;
		}
	}
	return null;
}

// ============================================================================
// Response helpers
// ============================================================================

export function redirect(url: string): Response {
	return new Response(null, { status: 302, headers: { Location: url } });
}

export function denied(message = "Forbidden"): Response {
	return new Response(JSON.stringify({ error: message }), {
		status: 403,
		headers: { "Content-Type": "application/json" },
	});
}

// ============================================================================
// Session extraction
// ============================================================================

export async function getSession(
	request: Request,
	config: { secret: string; cookieName?: string },
): Promise<SessionData | null> {
	const cookieName = config.cookieName ?? "discord-auth-session";
	const cookies = parseCookies(request);
	const token = cookies[cookieName];
	if (!token) return null;

	const payload = await verifyToken<Record<string, unknown>>(
		token,
		config.secret,
	);
	if (!payload) return null;

	return {
		discordId: payload.discordId as string,
		username: payload.username as string,
		globalName: (payload.globalName as string) ?? null,
		avatar: (payload.avatar as string) ?? null,
		email: (payload.email as string) ?? null,
		locale: payload.locale as string,
		roles: (payload.roles as string[]) ?? undefined,
	};
}

export interface SessionData {
	discordId: string;
	username: string;
	globalName: string | null;
	avatar: string | null;
	email: string | null;
	locale: string;
	roles?: string[];
}

// ============================================================================
// Auth middleware (supports multiple cookies for multi-provider)
// ============================================================================

export function middlewareAuth(config: EdgeAuthConfig) {
	const loginUrl = config.loginUrl ?? "/auth/discord";
	const publicPaths = config.publicPaths ?? [];

	// Normalize cookie configs
	const cookieConfigs =
		config.cookies ??
		(config.cookieName
			? [{ name: config.cookieName, secret: config.secret }]
			: []);

	return async function authMiddleware(
		request: Request,
	): Promise<Response | undefined> {
		const url = new URL(request.url);
		const path = url.pathname;

		if (isPublicPath(path, publicPaths)) {
			return undefined;
		}

		for (const cookie of cookieConfigs) {
			const user = await getSession(request, {
				secret: cookie.secret,
				cookieName: cookie.name,
			});
			if (user) {
				return undefined;
			}
		}

		return redirect(`${loginUrl}?redirect=${encodeURIComponent(path)}`);
	};
}

// ============================================================================
// Role middleware
// ============================================================================

export function middlewareRole(config: EdgeRoleConfig) {
	const loginUrl = config.loginUrl ?? "/auth/discord";
	const cookieName = config.cookieName ?? "discord-auth-session";
	const roles = config.roles;

	return async function roleMiddleware(
		request: Request,
	): Promise<Response | undefined> {
		const url = new URL(request.url);
		const path = url.pathname;

		const required = requiredRole(path, roles);
		if (!required) {
			return undefined; // No role requirement for this path
		}

		const user = await getSession(request, {
			secret: config.secret,
			cookieName,
		});

		if (!user) {
			return redirect(`${loginUrl}?redirect=${encodeURIComponent(path)}`);
		}

		if (!user.roles || !required.some((r) => user.roles?.includes(r))) {
			return denied("Insufficient permissions");
		}

		return undefined;
	};
}

// ============================================================================
// Middleware combinator
// ============================================================================

export function combine(
	...middlewares: Array<(request: Request) => Promise<Response | undefined>>
) {
	return async function combinedMiddleware(
		request: Request,
	): Promise<Response | undefined> {
		for (const middleware of middlewares) {
			const result = await middleware(request);
			if (result) return result;
		}
		return undefined;
	};
}
