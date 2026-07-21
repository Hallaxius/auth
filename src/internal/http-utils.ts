export function redirectResponse(url: string, cookies?: string[]): Response {
	const headers = new Headers();
	headers.set("Location", url);
	if (cookies) {
		for (const c of cookies) headers.append("Set-Cookie", c);
	}
	return new Response(null, { status: 302, headers });
}

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

export function jsonResponse(
	data: unknown,
	status = 200,
	cookies?: string[],
): Response {
	const headers = new Headers({
		"Content-Type": "application/json; charset=utf-8",
	});
	if (cookies) {
		for (const c of cookies) headers.append("Set-Cookie", c);
	}
	return new Response(JSON.stringify(data), { status, headers });
}

export function errorResponse(error: unknown, status?: number): Response {
	const message =
		error instanceof Error ? error.message : "Internal server error";
	return jsonResponse({ error: message }, status ?? 500);
}
