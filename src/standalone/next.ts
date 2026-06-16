import type { EdgeAuthConfig, EdgeRoleConfig } from "./edge";
import { middlewareAuth, middlewareRole } from "./middleware-factory";

function toNextMiddleware(
	mw: (
		request: Request,
	) => Promise<Response | undefined> | Response | undefined,
) {
	return async (request: Request): Promise<Response | undefined> => {
		const result = await mw(request);
		if (!result) return undefined;

		return new Response(result.body, {
			status: result.status,
			headers: result.headers,
		});
	};
}

export function nextAuth(config: EdgeAuthConfig) {
	return toNextMiddleware(middlewareAuth(config));
}

export function nextRole(config: EdgeRoleConfig) {
	return toNextMiddleware(middlewareRole(config));
}
