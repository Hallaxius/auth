import type { SessionData } from "../core/types";
import { verifyToken } from "./jwt";

export interface EdgeSessionConfig {
	secret: string;
	cookieName?: string;
}

export interface EdgeAuthConfig extends EdgeSessionConfig {
	loginUrl?: string;
	publicPaths?: string[];
}

export interface EdgeRoleConfig extends EdgeSessionConfig {
	loginUrl?: string;
	roles: Record<string, string[]>;
}

/** Extracts session data from a Request (works in Edge Runtime). */
export async function getSession(
	request: Request,
	config: EdgeSessionConfig,
): Promise<SessionData | null> {
	const cookieHeader = request.headers.get("cookie");
	if (!cookieHeader) return null;

	const cookieName = config.cookieName ?? "discord-auth-session";

	const cookies: Record<string, string> = {};
	for (const entry of cookieHeader.split(";")) {
		const idx = entry.indexOf("=");
		if (idx === -1) continue;
		cookies[entry.slice(0, idx).trim()] = decodeURIComponent(
			entry.slice(idx + 1).trim(),
		);
	}

	const token = cookies[cookieName];
	if (!token) return null;

	return verifySessionToken(token, config.secret);
}

/** Checks if a path matches a pattern (supports * wildcard). */
function matchPath(path: string, pattern: string): boolean {
	if (pattern.endsWith("/*")) {
		const prefix = pattern.slice(0, -2);
		return path === prefix || path.startsWith(`${prefix}/`);
	}
	if (pattern.endsWith("*")) {
		return path.startsWith(pattern.slice(0, -1));
	}
	return path === pattern;
}

/** Returns true if path is in the public paths list. */
export function isPublicPath(path: string, publicPaths: string[]): boolean {
	return publicPaths.some((p) => matchPath(path, p));
}

/** Returns the required role for a path, or null if unrestricted. */
export function requiredRole(
	path: string,
	roleMap: Record<string, string[]>,
): string[] | null {
	for (const [pattern, roles] of Object.entries(roleMap)) {
		if (matchPath(path, pattern)) return roles;
	}
	return null;
}

export function redirect(url: string): Response {
	if (!url.startsWith("/")) {
		throw new Error("Only relative URLs allowed for redirect");
	}
	return new Response(null, {
		status: 302,
		headers: { Location: url },
	});
}

/** Creates a denied access Response (JSON). */
export function denied(message = "Forbidden"): Response {
	return new Response(JSON.stringify({ error: message }), {
		status: 403,
		headers: { "Content-Type": "application/json" },
	});
}

async function verifySessionToken(
	token: string,
	secret: string,
): Promise<SessionData | null> {
	const payload = await verifyToken<Record<string, unknown>>(token, secret);
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
