import {
	denied,
	type EdgeAuthConfig,
	type EdgeRoleConfig,
	getSession,
	isPublicPath,
	redirect,
	requiredRole,
} from "./edge";

export function middlewareAuth(config: EdgeAuthConfig) {
	const loginUrl = config.loginUrl ?? "/auth/discord";
	const publicPaths = config.publicPaths ?? [];
	const cookieName = config.cookieName ?? "discord-auth-session";

	return async function authMiddleware(
		request: Request,
	): Promise<Response | undefined> {
		const url = new URL(request.url);
		const path = url.pathname;

		if (isPublicPath(path, publicPaths)) {
			return undefined;
		}

		const user = await getSession(request, {
			secret: config.secret,
			cookieName,
		});

		if (!user) {
			return redirect(`${loginUrl}?redirect=${encodeURIComponent(path)}`);
		}

		return undefined;
	};
}

export function middlewareRole(config: EdgeRoleConfig) {
	const loginUrl = config.loginUrl ?? "/auth/discord";
	const roles = config.roles;
	const cookieName = config.cookieName ?? "discord-auth-session";

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
