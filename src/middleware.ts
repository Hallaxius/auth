import { parseCookies } from "./internal/cookies";
import { verifyToken } from "./internal/jwt";
import type { EdgeAuthConfig, EdgeRoleConfig, SessionData } from "./types";

export function publicPath(path: string, patterns: string[]): boolean {
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

export function required(
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

export function redirect(url: string): Response {
	if (!url.startsWith("/")) {
		throw new Error("redirect url must be a relative path starting with /");
	}
	return new Response(null, { status: 302, headers: { Location: url } });
}

export function deny(message = "Forbidden"): Response {
	return new Response(
		JSON.stringify({ error: message, code: "INSUFFICIENT_PERMISSIONS" }),
		{
			status: 403,
			headers: { "Content-Type": "application/json" },
		},
	);
}

export async function session(
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

export function auth(config: EdgeAuthConfig) {
	const loginUrl = config.loginUrl ?? "/auth/discord";
	const publicPaths = config.publicPaths ?? [];
	const cookieConfigs = config.cookies ?? [];

	return async function authMiddleware(
		request: Request,
	): Promise<Response | undefined> {
		const url = new URL(request.url);
		const path = url.pathname;

		if (publicPath(path, publicPaths)) {
			return undefined;
		}

		for (const cookie of cookieConfigs) {
			const user = await session(request, {
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

export function role(config: EdgeRoleConfig) {
	const loginUrl = config.loginUrl ?? "/auth/discord";
	const cookieName = config.cookieName ?? "discord-auth-session";
	const roles = config.roles;

	return async function roleMiddleware(
		request: Request,
	): Promise<Response | undefined> {
		const url = new URL(request.url);
		const path = url.pathname;

		const requiredRoles = required(path, roles);
		if (!requiredRoles) {
			return undefined;
		}

		const user = await session(request, {
			secret: config.secret,
			cookieName,
		});

		if (!user) {
			return redirect(`${loginUrl}?redirect=${encodeURIComponent(path)}`);
		}

		if (!user.roles || !requiredRoles.some((r) => user.roles?.includes(r))) {
			return deny("Insufficient permissions");
		}

		return undefined;
	};
}

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
