import type { CredentialsClient } from "../core/credentials/client";
import {
	EmailTakenError,
	InvalidCredentialsError,
	CredentialsAuthError,
	CredentialsValidationError,
	UsernameTakenError,
} from "../core/credentials/errors";
import type { AuthUser } from "../core/credentials/types";
import { clearSessionCookie, parseCookies, setSessionCookie } from "./cookies";

interface CredentialsHandlerContext {
	client: CredentialsClient;
}

function jsonResponse(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "Content-Type": "application/json; charset=utf-8" },
	});
}

function redirectResponse(url: string, cookies?: string[]): Response {
	const headers = new Headers();
	headers.set("Location", url);
	if (cookies) {
		for (const c of cookies) headers.append("Set-Cookie", c);
	}
	return new Response(null, { status: 302, headers });
}

function errorResponse(error: unknown): Response {
	if (error instanceof CredentialsAuthError) {
		return jsonResponse({ error: error.message, code: error.code }, error.statusCode ?? 500);
	}
	return jsonResponse({ error: "Internal server error" }, 500);
}

function getSafeUser(user: AuthUser): Record<string, unknown> {
	const { passwordHash: _, ...safe } = user;
	return safe;
}

export function createCredentialsHandlers(ctx: CredentialsHandlerContext) {
	const { client } = ctx;

	const cookieName = "credentials-session";
	const cookiePath = "/";
	const sameSite: "lax" = "lax";
	const secure = false;
	const httpOnly = true;
	const expiresIn = "7d";

	const sessionConfig = {
		type: "jwt" as const,
		secret: "",
		cookieName,
		cookiePath,
		sameSite,
		secure,
		httpOnly,
		expiresIn,
	};

	async function handleRegister(request: Request): Promise<Response> {
		if (request.method !== "POST") {
			return jsonResponse({ error: "Method not allowed" }, 405);
		}

		let body: Record<string, unknown>;
		try {
			body = await request.json();
		} catch {
			return jsonResponse({ error: "Invalid JSON body" }, 400);
		}

		try {
			const result = await client.register(
				{
					username: body.username as string | undefined,
					email: body.email as string | undefined,
					password: body.password as string,
				},
				request,
			);

			const cookie = setSessionCookie(cookieName, result.token, sessionConfig);

			return redirectResponse("/auth/credentials/me", [cookie]);
		} catch (error) {
			return errorResponse(error);
		}
	}

	async function handleLogin(request: Request): Promise<Response> {
		if (request.method !== "POST") {
			return jsonResponse({ error: "Method not allowed" }, 405);
		}

		let body: Record<string, unknown>;
		try {
			body = await request.json();
		} catch {
			return jsonResponse({ error: "Invalid JSON body" }, 400);
		}

		try {
			const result = await client.login(
				{
					username: body.username as string | undefined,
					email: body.email as string | undefined,
				},
				body.password as string,
				request,
			);

			const cookie = setSessionCookie(cookieName, result.token, sessionConfig);

			return redirectResponse("/", [cookie]);
		} catch (error) {
			return errorResponse(error);
		}
	}

	async function handleLogout(request: Request): Promise<Response> {
		const clearCookie = clearSessionCookie(cookieName, sessionConfig);
		return redirectResponse("/", [clearCookie]);
	}

	async function handleMe(request: Request): Promise<Response> {
		const cookies = parseCookies(request);
		const sessionToken = cookies[cookieName];

		if (!sessionToken) {
			return jsonResponse({ error: "Unauthorized" }, 401);
		}

		try {
			const user = await client.verifySession(sessionToken);
			if (!user) {
				return jsonResponse({ error: "Invalid session" }, 401);
			}
			return jsonResponse(getSafeUser(user));
		} catch {
			return jsonResponse({ error: "Invalid session" }, 401);
		}
	}

	return {
		handleRegister,
		handleLogin,
		handleLogout,
		handleMe,
	};
}
