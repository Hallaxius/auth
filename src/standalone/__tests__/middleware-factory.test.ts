import { describe, expect, test } from "bun:test";
import { signToken } from "../jwt";
import { middlewareAuth, middlewareRole } from "../middleware-factory";

const SECRET = "test-secret-mw";
const CREDENTIALS_SECRET = "test-secret-credentials";

async function makeRequest(
	path: string,
	cookieName?: string,
	token?: string,
): Promise<Request> {
	const url = `http://localhost${path}`;
	const headers = new Headers();
	if (token) {
		headers.set("cookie", `${cookieName ?? "discord-auth-session"}=${token}`);
	}
	return new Request(url, { headers });
}

async function makeMultiCookieRequest(
	path: string,
	cookies: Array<{ name: string; value: string }>,
): Promise<Request> {
	const url = `http://localhost${path}`;
	const headers = new Headers();
	const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
	headers.set("cookie", cookieStr);
	return new Request(url, { headers });
}

describe("middlewareAuth", () => {
	test("passes public paths", async () => {
		const mw = middlewareAuth({
			secret: SECRET,
			publicPaths: ["/", "/auth/*"],
		});
		const result = await mw(await makeRequest("/auth/login"));
		expect(result).toBeUndefined();
	});

	test("redirects unauthenticated requests to login", async () => {
		const mw = middlewareAuth({
			secret: SECRET,
			loginUrl: "/auth/discord",
		});
		const result = await mw(await makeRequest("/dashboard"));
		expect(result).not.toBeUndefined();
		expect(result?.status).toBe(302);
		expect(result?.headers.get("Location")).toContain("/auth/discord");
	});

	test("allows authenticated requests", async () => {
		const token = await signToken(
			{ discordId: "1", username: "tester" },
			SECRET,
		);
		const mw = middlewareAuth({ secret: SECRET });
		const result = await mw(
			await makeRequest("/dashboard", "discord-auth-session", token),
		);
		expect(result).toBeUndefined();
	});
});

describe("middlewareAuth - MultiProviderAuthConfig", () => {
	test("allows request with first cookie (discord)", async () => {
		const token = await signToken(
			{ discordId: "1", username: "discord-user" },
			SECRET,
		);
		const mw = middlewareAuth({
			cookies: [
				{ name: "discord-auth-session", secret: SECRET },
				{ name: "credentials-session", secret: CREDENTIALS_SECRET },
			],
		});
		const result = await mw(
			await makeRequest("/dashboard", "discord-auth-session", token),
		);
		expect(result).toBeUndefined();
	});

	test("allows request with second cookie (credentials)", async () => {
		const token = await signToken(
			{ userId: "2", username: "local-user" },
			CREDENTIALS_SECRET,
		);
		const mw = middlewareAuth({
			cookies: [
				{ name: "discord-auth-session", secret: SECRET },
				{ name: "credentials-session", secret: CREDENTIALS_SECRET },
			],
		});
		const result = await mw(
			await makeRequest("/dashboard", "credentials-session", token),
		);
		expect(result).toBeUndefined();
	});

	test("redirects when no cookies match", async () => {
		const mw = middlewareAuth({
			cookies: [
				{ name: "discord-auth-session", secret: SECRET },
				{ name: "credentials-session", secret: CREDENTIALS_SECRET },
			],
			loginUrl: "/login",
		});
		const result = await mw(await makeRequest("/dashboard"));
		expect(result?.status).toBe(302);
		expect(result?.headers.get("Location")).toContain("/login");
	});

	test("redirects when cookie token is invalid", async () => {
		const mw = middlewareAuth({
			cookies: [
				{ name: "discord-auth-session", secret: SECRET },
				{ name: "credentials-session", secret: CREDENTIALS_SECRET },
			],
			loginUrl: "/login",
		});
		const result = await mw(
			await makeRequest("/dashboard", "discord-auth-session", "invalid-token"),
		);
		expect(result?.status).toBe(302);
	});

	test("passes public paths with multi-cookie config", async () => {
		const mw = middlewareAuth({
			cookies: [
				{ name: "discord-auth-session", secret: SECRET },
				{ name: "credentials-session", secret: CREDENTIALS_SECRET },
			],
			publicPaths: ["/", "/public/*"],
		});
		const result = await mw(await makeRequest("/public/page"));
		expect(result).toBeUndefined();
	});
});

describe("middlewareRole", () => {
	test("passes paths without role requirement", async () => {
		const mw = middlewareRole({
			secret: SECRET,
			roles: { "/admin/*": ["admin"] },
		});
		const result = await mw(await makeRequest("/dashboard"));
		expect(result).toBeUndefined();
	});

	test("redirects unauthenticated requests to login", async () => {
		const mw = middlewareRole({
			secret: SECRET,
			loginUrl: "/auth/discord",
			roles: { "/admin/*": ["admin"] },
		});
		const result = await mw(await makeRequest("/admin"));
		expect(result?.status).toBe(302);
	});

	test("denies access when user lacks required role", async () => {
		const token = await signToken(
			{ discordId: "1", username: "tester", roles: ["user"] },
			SECRET,
		);
		const mw = middlewareRole({
			secret: SECRET,
			loginUrl: "/auth/discord",
			roles: { "/admin/*": ["admin"] },
		});
		const result = await mw(
			await makeRequest("/admin/users", "discord-auth-session", token),
		);
		expect(result?.status).toBe(403);
	});

	test("allows access when user has required role", async () => {
		const token = await signToken(
			{ discordId: "1", username: "admin", roles: ["admin"] },
			SECRET,
		);
		const mw = middlewareRole({
			secret: SECRET,
			roles: { "/admin/*": ["admin"] },
		});
		const result = await mw(
			await makeRequest("/admin/users", "discord-auth-session", token),
		);
		expect(result).toBeUndefined();
	});
});
