import type { CredentialsClient } from "../core/credentials/client";
import { parseCookies } from "./cookies";
import {
	denied,
	type EdgeAuthConfig,
	type EdgeRoleConfig,
	getSession,
	isPublicPath,
	redirect,
	requiredRole,
} from "./edge";

export interface CredentialsMiddlewareConfig {
	/** CredentialsClient instance for session verification */
	credentialsClient: CredentialsClient;
	/** Cookie name to read the session token from (default: "credentials-session") */
	cookieName?: string;
	/** Redirect URL for unauthenticated users (default: "/auth/credentials/login") */
	loginUrl?: string;
	/** Paths that bypass auth (supports * wildcard) */
	publicPaths?: string[];
}

export interface CredentialsRoleMiddlewareConfig {
	/** CredentialsClient instance for session verification */
	credentialsClient: CredentialsClient;
	/** Cookie name to read the session token from (default: "credentials-session") */
	cookieName?: string;
	/** Redirect URL for unauthenticated users (default: "/auth/credentials/login") */
	loginUrl?: string;
	/** Path pattern → required roles */
	roles: Record<string, string[]>;
}

/**
 * @deprecated Use `middlewareAuth()` with multi-cookie config instead.
 * This function will be removed in the next major version.
 */
export function middlewareCredentialsAuth(config: CredentialsMiddlewareConfig) {
	const loginUrl = config.loginUrl ?? "/auth/credentials/login";
	const publicPaths = config.publicPaths ?? [];
	const cookieName = config.cookieName ?? "credentials-session";

	return async function credentialsAuthMiddleware(
		request: Request,
	): Promise<Response | undefined> {
		const url = new URL(request.url);
		const path = url.pathname;

		if (isPublicPath(path, publicPaths)) {
			return undefined;
		}

		const cookies = parseCookies(request);
		const token = cookies[cookieName];

		if (!token) {
			return redirect(`${loginUrl}?redirect=${encodeURIComponent(path)}`);
		}

		const user = await config.credentialsClient.verifySession(token);
		if (!user) {
			return redirect(`${loginUrl}?redirect=${encodeURIComponent(path)}`);
		}

		return undefined;
	};
}

/**
 * @deprecated Use `middlewareRole()` with multi-cookie config instead.
 * This function will be removed in the next major version.
 */
export function middlewareCredentialsRole(config: CredentialsRoleMiddlewareConfig) {
	const loginUrl = config.loginUrl ?? "/auth/credentials/login";
	const roles = config.roles;
	const cookieName = config.cookieName ?? "credentials-session";

	return async function credentialsRoleMiddleware(
		request: Request,
	): Promise<Response | undefined> {
		const url = new URL(request.url);
		const path = url.pathname;

		const requiredRoles = requiredRole(path, roles);
		if (!requiredRoles) {
			return undefined;
		}

		const cookies = parseCookies(request);
		const token = cookies[cookieName];

		if (!token) {
			return redirect(`${loginUrl}?redirect=${encodeURIComponent(path)}`);
		}

		const user = await config.credentialsClient.verifySession(token);
		if (!user) {
			return redirect(`${loginUrl}?redirect=${encodeURIComponent(path)}`);
		}

		const userRoles = user.roles ?? [];
		const hasRole = requiredRoles.some((r) => userRoles.includes(r));

		if (!hasRole) {
			return denied();
		}

		return undefined;
	};
}

export interface MultiProviderAuthConfig {
	/** Cookie configs for each provider - middleware tries each in order */
	cookies: Array<{
		name: string;
		secret: string;
	}>;
	loginUrl?: string;
	publicPaths?: string[];
}

function isMultiProviderConfig(
	config: MultiProviderAuthConfig | EdgeAuthConfig,
): config is MultiProviderAuthConfig {
	return (
		"cookies" in config &&
		Array.isArray((config as MultiProviderAuthConfig).cookies)
	);
}

export function middlewareAuth(
	config: MultiProviderAuthConfig | EdgeAuthConfig,
) {
	const loginUrl = config.loginUrl ?? "/auth/discord";
	const publicPaths = config.publicPaths ?? [];

	const cookieConfigs: Array<{ name: string; secret: string }> =
		isMultiProviderConfig(config)
			? config.cookies
			: [
					{
						name: config.cookieName ?? "discord-auth-session",
						secret: config.secret,
					},
				];

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

export function middlewareRole(config: EdgeRoleConfig) {
	const loginUrl = config.loginUrl ?? "/auth/discord";
	const roles = config.roles;
	const cookieName = config.cookieName;

	return async function roleMiddleware(
		request: Request,
	): Promise<Response | undefined> {
		const url = new URL(request.url);
		const path = url.pathname;

		const requiredRoles = requiredRole(path, roles);
		if (!requiredRoles) {
			return undefined;
		}

		const user = await getSession(request, {
			secret: config.secret,
			cookieName,
		});

		if (!user) {
			return redirect(`${loginUrl}?redirect=${encodeURIComponent(path)}`);
		}

		const userRoles = user.roles ?? [];
		const hasRole = requiredRoles.some((r) => userRoles.includes(r));

		if (!hasRole) {
			return denied();
		}

		return undefined;
	};
}
