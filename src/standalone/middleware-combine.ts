type MiddlewareFn = (
	request: Request,
) => Promise<Response | undefined> | Response | undefined;

export function combine(...middlewares: MiddlewareFn[]): MiddlewareFn {
	return async (request: Request) => {
		for (const middleware of middlewares) {
			const result = await middleware(request);
			if (result) return result;
		}
		return undefined;
	};
}
