import { describe, expect, mock, test } from "bun:test";
import type {
	SafeStoredUser,
	SessionData,
	StoredUser,
	UserStorage,
} from "../../core/types";
import { signToken } from "../jwt";
import { createMiddlewares } from "../middleware";

const SECRET = "test-secret-middleware";
const COOKIE_NAME = "session";

function createDeps(storage?: UserStorage) {
	return {
		secret: SECRET,
		sessionType: "jwt" as const,
		cookieName: COOKIE_NAME,
		storage,
	};
}

function makeRequest(token?: string): Request {
	const headers = new Headers();
	if (token) headers.set("cookie", `${COOKIE_NAME}=${token}`);
	return new Request("http://localhost/api/data", { headers });
}

function jsonHandler(
	_req: Request,
	ctx: { user: SessionData | null; storedUser: SafeStoredUser | null },
): Response {
	return new Response(
		JSON.stringify({ user: ctx.user, storedUser: ctx.storedUser }),
		{
			headers: { "Content-Type": "application/json" },
		},
	);
}

describe("createMiddlewares", () => {
	describe("withAuth", () => {
		test("returns 401 when no token", async () => {
			const { withAuth } = createMiddlewares(createDeps());
			const handler = withAuth(jsonHandler);
			const res = await handler(makeRequest());
			expect(res.status).toBe(401);
		});

		test("returns 401 on invalid token", async () => {
			const { withAuth } = createMiddlewares(createDeps());
			const handler = withAuth(jsonHandler);
			const res = await handler(makeRequest("bad-token"));
			expect(res.status).toBe(401);
		});

		test("injects user for valid token", async () => {
			const token = await signToken(
				{ discordId: "123", username: "test" },
				SECRET,
			);
			const { withAuth } = createMiddlewares(createDeps());
			const handler = withAuth(jsonHandler);
			const res = await handler(makeRequest(token));
			const body = await res.json();
			expect(body.user.discordId).toBe("123");
			expect(body.user.username).toBe("test");
		});

		test("injects storedUser when storage exists", async () => {
			const storedUser: StoredUser = {
				id: "db-1",
				discordId: "123",
				username: "test",
				globalName: null,
				avatar: null,
				email: null,
				locale: "en",
				roles: ["admin"],
				accessToken: "at",
				refreshToken: "rt",
				tokenExpiresAt: 9999999999,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const storage: UserStorage = {
				findByDiscordId: mock(async () => storedUser),
				create: mock(async (d) => ({
					...storedUser,
					...d,
					id: "db-1",
					createdAt: new Date(),
					updatedAt: new Date(),
				})),
				update: mock(async (_id, _d) => storedUser),
				delete: mock(async () => {}),
			};

			const token = await signToken(
				{ discordId: "123", username: "test" },
				SECRET,
			);
			const { withAuth } = createMiddlewares(createDeps(storage));
			const handler = withAuth(jsonHandler);
			const res = await handler(makeRequest(token));
			const body = await res.json();
			expect(body.storedUser).not.toBeNull();
			expect(body.storedUser.roles).toEqual(["admin"]);
			expect(body.storedUser.accessToken).toBeUndefined();
		});
	});

	describe("withOptionalAuth", () => {
		test("passes null user when no token", async () => {
			const { withOptionalAuth } = createMiddlewares(createDeps());
			const handler = withOptionalAuth(jsonHandler);
			const res = await handler(makeRequest());
			const body = await res.json();
			expect(body.user).toBeNull();
		});

		test("injects user when token exists", async () => {
			const token = await signToken({ discordId: "123" }, SECRET);
			const { withOptionalAuth } = createMiddlewares(createDeps());
			const handler = withOptionalAuth(jsonHandler);
			const res = await handler(makeRequest(token));
			const body = await res.json();
			expect(body.user.discordId).toBe("123");
		});
	});

	describe("withRole", () => {
		test("returns 401 when no token", async () => {
			const storage: UserStorage = {
				findByDiscordId: mock(async () => null),
				create: mock(async () => null as unknown as StoredUser),
				update: mock(async () => null as unknown as StoredUser),
				delete: mock(async () => {}),
			};
			const { withRole } = createMiddlewares(createDeps(storage));
			const handler = withRole("admin")(jsonHandler);
			const res = await handler(makeRequest());
			expect(res.status).toBe(401);
		});

		test("returns 403 when user lacks role", async () => {
			const storedUser: StoredUser = {
				id: "db-1",
				discordId: "123",
				username: "test",
				globalName: null,
				avatar: null,
				email: null,
				locale: "en",
				roles: ["user"],
				accessToken: "at",
				refreshToken: "rt",
				tokenExpiresAt: 9999999999,
				createdAt: new Date(),
				updatedAt: new Date(),
			};
			const storage: UserStorage = {
				findByDiscordId: mock(async () => storedUser),
				create: mock(async () => storedUser),
				update: mock(async () => storedUser),
				delete: mock(async () => {}),
			};
			const token = await signToken({ discordId: "123" }, SECRET);
			const { withRole } = createMiddlewares(createDeps(storage));
			const handler = withRole("admin")(jsonHandler);
			const res = await handler(makeRequest(token));
			expect(res.status).toBe(403);
		});

		test("passes when user has required role", async () => {
			const storedUser: StoredUser = {
				id: "db-1",
				discordId: "123",
				username: "admin",
				globalName: null,
				avatar: null,
				email: null,
				locale: "en",
				roles: ["admin"],
				accessToken: "at",
				refreshToken: "rt",
				tokenExpiresAt: 9999999999,
				createdAt: new Date(),
				updatedAt: new Date(),
			};
			const storage: UserStorage = {
				findByDiscordId: mock(async () => storedUser),
				create: mock(async () => storedUser),
				update: mock(async () => storedUser),
				delete: mock(async () => {}),
			};
			const token = await signToken({ discordId: "123" }, SECRET);
			const { withRole } = createMiddlewares(createDeps(storage));
			const handler = withRole("admin")(jsonHandler);
			const res = await handler(makeRequest(token));
			expect(res.status).toBe(200);
		});
	});
});
