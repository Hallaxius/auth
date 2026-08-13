import { beforeEach, describe, expect, test } from "bun:test";
import {
	AuthError,
	ConfigurationError,
	credentials,
	CredentialsClient,
	MemoryTenantMembershipStore,
	MemoryTenantStore,
	createStorageAdapters,
	role,
	subdomainResolver,
	signToken,
	tenancy,
	verifyToken,
	validateCredentialsConfig,
	validateTenancyConfig,
	type AuthUserStorage,
	type TenantRecord,
} from "../../src/";
import { TestBruteForceStorage } from "../helpers/storage";

const SECRET = process.env.TEST_SECRET || "5K8qN2mR9pL3vX7wJ4tY6hF1dS0aG8bC2eU5iO9xM3nZ7kV4rW1qP6yT0uI8oA2";

function requestFor(host: string, path = "/"): Request {
	return new Request(`https://${host}${path}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({}),
	});
}

function tenantStore(records: Array<Partial<TenantRecord>>): MemoryTenantStore {
	const store = new MemoryTenantStore();
	for (const r of records) {
		store.set({
			id: r.id!,
			domain: r.domain!,
			status: r.status ?? "active",
			createdAt: r.createdAt ?? Date.now(),
		});
	}
	return store;
}

class InMemoryUserStorage implements AuthUserStorage {
	private users = new Map<
		string,
		{
			id: string;
			username: string | null;
			email: string | null;
			password: string;
			roles: string[];
			createdAt: Date;
			updatedAt: Date;
		}
	>();
	private idCounter = 0;

	async findByUsername(username: string) {
		for (const user of this.users.values()) {
			if (user.username === username) return user;
		}
		return null;
	}

	async findByEmail(email: string) {
		for (const user of this.users.values()) {
			if (user.email === email) return user;
		}
		return null;
	}

	async findById(id: string) {
		return this.users.get(id) ?? null;
	}

	async create(data: {
		username: string | null;
		email: string | null;
		password: string;
		roles?: string[];
	}) {
		const id = `user-${++this.idCounter}`;
		const now = new Date();
		const user = {
			...data,
			roles: data.roles ?? ["user"],
			id,
			createdAt: now,
			updatedAt: now,
		};
		this.users.set(id, user);
		return user;
	}

	async update(userId: string, data: Partial<{ roles: string[] }>) {
		const user = this.users.get(userId);
		if (!user) throw new Error("User not found");
		const updated = { ...user, ...data, updatedAt: new Date() };
		this.users.set(userId, updated);
		return updated;
	}

	async delete(userId: string) {
		this.users.delete(userId);
	}

	async verifyPassword(userId: string, password: string) {
		const user = this.users.get(userId);
		if (!user) return false;
		return user.password === password;
	}
}

describe("tenancy — subdomainResolver", () => {
	test("extracts the first label as tenant", async () => {
		const resolve = subdomainResolver();
		expect(await resolve(requestFor("acme.example.com"))).toBe("acme");
		expect(await resolve(requestFor("shop.example.co.uk"))).toBe("shop");
	});

	test("returns null for single-label hosts", async () => {
		const resolve = subdomainResolver();
		expect(await resolve(requestFor("localhost"))).toBeNull();
		expect(await resolve(requestFor("127.0.0.1"))).toBeNull();
	});

	test("respects baseDomains allowlist", async () => {
		const resolve = subdomainResolver({ baseDomains: ["example.com"] });
		expect(await resolve(requestFor("acme.example.com"))).toBe("acme");
		expect(await resolve(requestFor("example.com"))).toBeNull();
		expect(await resolve(requestFor("acme.other.com"))).toBeNull();
	});

	test("handles wildcard hosts and ports", async () => {
		const resolve = subdomainResolver();
		expect(await resolve(requestFor("acme.localhost:3000"))).toBe("acme");
	});
});

describe("tenancy — factory", () => {
	const records: Array<Partial<TenantRecord>> = [
		{ id: "tenant-a", domain: "acme", status: "active" },
		{ id: "tenant-b", domain: "globex", status: "suspended" },
	];

	beforeEach(() => {
		// keep memory stores isolated per test
	});

	function factory(overrides: Partial<Parameters<typeof tenancy>[0]> = {}) {
		return tenancy({
			enabled: true,
			baseDomains: [],
			required: false,
			storage: {
				tenant: tenantStore(records),
				tenantMembership: new MemoryTenantMembershipStore(),
			},
			...overrides,
		});
	}

	test("resolveTenantId resolves from the subdomain", async () => {
		const t = factory();
		expect(await t.resolveTenantId(requestFor("acme.localhost"))).toBe(
			"tenant-a",
		);
	});

	test("resolveTenant returns the record and null for unknown tenants", async () => {
		const t = factory();
		expect(await t.resolveTenant(requestFor("acme.localhost"))).toMatchObject({
			id: "tenant-a",
			domain: "acme",
			status: "active",
		});
		expect(await t.resolveTenant(requestFor("ghost.localhost"))).toBeNull();
	});

	test("suspended tenant → TENANT_SUSPENDED (403)", async () => {
		const t = factory();
		await expect(
			t.resolveTenant(requestFor("globex.localhost")),
		).rejects.toMatchObject({ code: "TENANT_SUSPENDED", statusCode: 403 });
	});

	test("divergent x-tenant-id header → TENANT_MISMATCH (403)", async () => {
		const t = factory();
		const request = requestFor("acme.localhost");
		request.headers.set("x-tenant-id", "tenant-b");
		await expect(t.resolveTenant(request)).rejects.toMatchObject({
			code: "TENANT_MISMATCH",
			statusCode: 403,
		});
	});

	test("matching x-tenant-id header is tolerated", async () => {
		const t = factory();
		const request = requestFor("acme.localhost");
		request.headers.set("x-tenant-id", "acme");
		expect(await t.resolveTenantId(request)).toBe("tenant-a");
	});

	test("required + unknown tenant → TENANT_NOT_FOUND (404)", async () => {
		const t = factory({ required: true });
		await expect(t.resolveTenant(requestFor("ghost.localhost"))).rejects.toMatchObject(
			{ code: "TENANT_NOT_FOUND", statusCode: 404 },
		);
	});

	test("unresolved + required → TENANT_REQUIRED (403) via requireTenant", async () => {
		const t = factory({ required: true });
		await expect(t.requireTenant(requestFor("localhost"))).rejects.toMatchObject(
			{ code: "TENANT_REQUIRED", statusCode: 403 },
		);
	});

	test("defaultTenantId fallback when not required", async () => {
		const t = factory({ defaultTenantId: "tenant-a" });
		expect(await t.resolveTenantId(requestFor("localhost"))).toBe("tenant-a");
		expect(await t.requireTenant(requestFor("localhost"))).toBe("tenant-a");
	});

	test("getRoles/isMember read per-tenant memberships (D4)", async () => {
		const t = factory();
		await t.getRoles("tenant-a", "u1").then((roles) => {
			expect(roles).toEqual([]);
		});
		expect(await t.isMember("tenant-a", "u1")).toBe(false);

		const membership = new MemoryTenantMembershipStore();
		await membership.setMembership("tenant-a", "u1", ["admin", "editor"]);
		const t2 = tenancy({
			enabled: true,
			storage: { tenant: tenantStore(records), tenantMembership: membership },
		});
		expect(await t2.getRoles("tenant-a", "u1")).toEqual(["admin", "editor"]);
		expect(await t2.getRoles("tenant-b", "u1")).toEqual([]);
		expect(await t2.isMember("tenant-a", "u1")).toBe(true);
		expect(await t2.isMember("tenant-b", "u1")).toBe(false);
	});

	test("missing storage → ConfigurationError", () => {
		expect(() => tenancy({ enabled: true })).toThrow(ConfigurationError);
	});

	test("getTenant uses getById", async () => {
		const t = factory();
		expect(await t.getTenant("tenant-a")).toMatchObject({ id: "tenant-a" });
		expect(await t.getTenant("ghost")).toBeNull();
	});
});

describe("tenancy — memory stores", () => {
	test("MemoryTenantStore CRUD + domain index", async () => {
		const store = new MemoryTenantStore();
		await store.set({ id: "t1", domain: "acme", status: "active", createdAt: 1 });
		expect(await store.getById("t1")).toMatchObject({ id: "t1" });
		expect(await store.getByDomain("acme")).toMatchObject({ id: "t1" });
		await store.set({ id: "t1", domain: "renamed", status: "active", createdAt: 1 });
		expect(await store.getByDomain("acme")).toBeNull();
		expect(await store.getByDomain("renamed")).toMatchObject({ id: "t1" });
		await store.delete("t1");
		expect(await store.getById("t1")).toBeNull();
	});

	test("MemoryTenantMembershipStore membership round-trip", async () => {
		const store = new MemoryTenantMembershipStore();
		await store.setMembership("t1", "u1", ["admin"]);
		await store.setMembership("t1", "u2", ["user"]);
		expect(await store.getMembers("t1")).toHaveLength(2);
		expect(await store.getMemberships("u1")).toEqual([
			{ tenantId: "t1", roles: ["admin"] },
		]);
		await store.deleteMembership("t1", "u1");
		expect(await store.getMemberships("u1")).toEqual([]);
	});

	test("createStorageAdapters exposes tenant stores", () => {
		const adapters = createStorageAdapters({ type: "memory" });
		expect(adapters.tenant).toBeInstanceOf(MemoryTenantStore);
		expect(adapters.tenantMembership).toBeInstanceOf(
			MemoryTenantMembershipStore,
		);
	});
});

describe("tenancy — credentials integration", () => {
	const tenantRecords: Array<Partial<TenantRecord>> = [
		{ id: "tenant-a", domain: "acme", status: "active" },
	];

	function buildCredentials(overrides: { tenancy?: object } = {}) {
		const storage = new InMemoryUserStorage();
		return {
			storage,
			auth: credentials({
				emailRequired: false,
				usernameRequired: true,
				storage,
				session: { secret: SECRET, expiresIn: "15m" },
				bruteForce: { enabled: false },
				tenancy: {
					enabled: true,
					baseDomains: ["localhost"],
					required: true,
					storage: {
						tenant: tenantStore(tenantRecords),
						tenantMembership: new MemoryTenantMembershipStore(),
					},
					...overrides.tenancy,
				},
			}),
		};
	}

	test("register on a tenant subdomain signs tenantId into session claims", async () => {
		const { auth, storage } = buildCredentials();
		await storage.create({
			username: "reg-user",
			email: null,
			password: "x",
			roles: ["user"],
		});
		await storage.delete("user-1");
		const res = await auth.handleRegister(
			new Request("https://acme.localhost/register", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
				username: "newbie",
				password: "Correct-Horse1!",
			}),
			}),
		);
		expect(res.status).toBe(201);
		const setCookie = res.headers.get("set-cookie");
		expect(setCookie).toBeTruthy();
		const token = setCookie!.split(";")[0]!.split("=")[1]!;
		const payload = await verifyToken<Record<string, unknown>>(token, SECRET);
		expect(payload?.tenantId).toBe("tenant-a");
		expect(payload?.userId).toBeDefined();
	});

	test("login on suspended tenant → 403 TENANT_SUSPENDED", async () => {
		const { auth } = buildCredentials({
			tenancy: {
				baseDomains: ["localhost"],
				storage: {
					tenant: tenantStore([
						{ id: "susp", domain: "dead", status: "suspended" },
					]),
					tenantMembership: new MemoryTenantMembershipStore(),
				},
			},
		});
		const res = await auth.handleLogin(
			requestFor("dead.localhost", "/login"),
		);
		expect(res.status).toBe(403);
		const body = (await res.json()) as { code: string };
		expect(body.code).toBe("TENANT_SUSPENDED");
	});

	test("divergent header on login → 403 TENANT_MISMATCH", async () => {
		const { auth } = buildCredentials();
		const request = requestFor("acme.localhost", "/login");
		request.headers.set("x-tenant-id", "other");
		const res = await auth.handleLogin(request);
		expect(res.status).toBe(403);
		const body = (await res.json()) as { code: string };
		expect(body.code).toBe("TENANT_MISMATCH");
	});

	test("tenancy disabled → fully inert (no tenant resolution)", async () => {
		const storage = new InMemoryUserStorage();
		const auth = credentials({
			emailRequired: false,
			usernameRequired: true,
			storage,
			session: { secret: SECRET },
			tenancy: { enabled: false },
		});
		const res = await auth.handleLogin(requestFor("acme.localhost", "/login"));
		expect(res.status).toBe(400); // no identifier supplied → validation error, no 403
	});

	test("tenancy enabled without storage → ConfigurationError", () => {
		expect(() =>
			credentials({
				emailRequired: false,
				usernameRequired: true,
				storage: new InMemoryUserStorage(),
				session: { secret: SECRET },
				tenancy: { enabled: true },
			}),
		).toThrow(ConfigurationError);
	});

	test("brute-force keys are scoped per tenant (ip:tenantId:accountId)", async () => {
		const storage = new InMemoryUserStorage();
		const bfStore = new TestBruteForceStorage();
		const client = new CredentialsClient(
			{
				emailRequired: false,
				usernameRequired: true,
				secret: SECRET,
			},
			storage,
			{ maxAttempts: 3, windowMs: 60000, blockDurationMs: 60000, storage: bfStore },
		);
		const request = requestFor("1.2.3.4");

		for (let i = 0; i < 2; i++) {
			await expect(
				client.login({ username: "ghost" }, "wrong", request, "tenant-a"),
			).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
		}
		// the 3rd failed attempt reaches maxAttempts and blocks tenant-a…
		await expect(
			client.login({ username: "ghost" }, "wrong", request, "tenant-a"),
		).rejects.toMatchObject({ code: "BRUTE_FORCE_BLOCKED" });
		// …subsequent attempts on tenant-a stay blocked…
		await expect(
			client.login({ username: "ghost" }, "wrong", request, "tenant-a"),
		).rejects.toMatchObject({ code: "BRUTE_FORCE_BLOCKED" });
		// …but tenant-b is unaffected (composite key includes tenantId)
		await expect(
			client.login({ username: "ghost" }, "wrong", request, "tenant-b"),
		).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
	});
});

describe("createSessionWithoutPassword", () => {
	const SECRET_KEY = SECRET;

	function build(roles: string[] = ["user"], overrides: { tenancy?: object } = {}) {
		const storage = new InMemoryUserStorage();
		const auth = credentials({
			emailRequired: false,
			usernameRequired: true,
			storage,
			session: { secret: SECRET_KEY },
			bruteForce: { enabled: false },
			tenancy: {
				enabled: true,
				baseDomains: ["localhost"],
				required: true,
				storage: {
					tenant: tenantStore([
						{ id: "tenant-a", domain: "acme", status: "active" },
					]),
					tenantMembership: new MemoryTenantMembershipStore(),
				},
				...overrides.tenancy,
			},
		});
		return { storage, auth };
	}

	test("mints a session without a password (guards 1, 5)", async () => {
		const { storage, auth } = build();
		const user = await storage.create({
			username: "alice",
			email: null,
			password: "irrelevant",
			roles: ["user"],
		});
		const result = await auth.createSessionWithoutPassword({
			userId: user.id,
			tenantId: "tenant-a",
			roles: ["editor"],
			ip: "1.2.3.4",
		});
		expect(result.sessionToken).toBe(result.idToken);
		const payload = await verifyToken<Record<string, unknown>>(
			result.sessionToken,
			SECRET_KEY,
		);
		expect(payload?.userId).toBe(user.id);
		expect(payload?.tenantId).toBe("tenant-a");
		expect(payload?.roles).toEqual(["editor"]);
		expect(payload?.type).toBe("passwordless");
	});

	test("unknown user → 404 USER_NOT_FOUND (guard 2)", async () => {
		const { auth } = build();
		await expect(
			auth.createSessionWithoutPassword({
				userId: "ghost",
				tenantId: "tenant-a",
				ip: "1.2.3.4",
			}),
		).rejects.toMatchObject({ code: "USER_NOT_FOUND", statusCode: 404 });
	});

	test("suspended user → 403 TENANT_FORBIDDEN (guard 2)", async () => {
		const { storage, auth } = build();
		const user = await storage.create({
			username: "banned",
			email: null,
			password: "x",
			roles: ["suspended"],
		});
		await expect(
			auth.createSessionWithoutPassword({
				userId: user.id,
				tenantId: "tenant-a",
				ip: "1.2.3.4",
			}),
		).rejects.toMatchObject({ code: "TENANT_FORBIDDEN", statusCode: 403 });
	});

	test("blocked passwordless key → 429 BRUTE_FORCE_BLOCKED (guard 3)", async () => {
		const storage = new InMemoryUserStorage();
		const user = await storage.create({
			username: "alice",
			email: null,
			password: "x",
			roles: ["user"],
		});
		const bfStore = new TestBruteForceStorage();
		const auth = credentials({
			emailRequired: false,
			usernameRequired: true,
			storage,
			session: { secret: SECRET_KEY },
			bruteForce: { enabled: true, maxAttempts: 3, storage: bfStore },
			tenancy: { enabled: false },
		});
		await bfStore.block(`bruteforce:passwordless:${user.id}`, 60000);
		await expect(
			auth.createSessionWithoutPassword({ userId: user.id, ip: "1.2.3.4" }),
		).rejects.toMatchObject({ code: "BRUTE_FORCE_BLOCKED", statusCode: 429 });
	});

	test("tenancy enabled without tenantId → 403 TENANT_REQUIRED (guard 4)", async () => {
		const { storage, auth } = build();
		const user = await storage.create({
			username: "alice",
			email: null,
			password: "x",
			roles: ["user"],
		});
		await expect(
			auth.createSessionWithoutPassword({ userId: user.id, ip: "1.2.3.4" }),
		).rejects.toMatchObject({ code: "TENANT_REQUIRED", statusCode: 403 });
	});

	test("tenancy enabled with unknown tenantId → 404 TENANT_NOT_FOUND (guard 4)", async () => {
		const { storage, auth } = build();
		const user = await storage.create({
			username: "alice",
			email: null,
			password: "x",
			roles: ["user"],
		});
		await expect(
			auth.createSessionWithoutPassword({
				userId: user.id,
				tenantId: "ghost",
				ip: "1.2.3.4",
			}),
		).rejects.toMatchObject({ code: "TENANT_NOT_FOUND", statusCode: 404 });
	});

	test("never calls verifyPassword (guard 1)", async () => {
		const storage = new InMemoryUserStorage();
		let verifyCalls = 0;
		const original = storage.verifyPassword.bind(storage);
		storage.verifyPassword = async (userId, password) => {
			verifyCalls++;
			return original(userId, password);
		};
		const auth = credentials({
			emailRequired: false,
			usernameRequired: true,
			storage,
			session: { secret: SECRET_KEY },
			tenancy: { enabled: false },
		});
		const user = await storage.create({
			username: "alice",
			email: null,
			password: "x",
			roles: ["user"],
		});
		await auth.createSessionWithoutPassword({ userId: user.id, ip: "1.2.3.4" });
		expect(verifyCalls).toBe(0);
	});
});

describe("tenancy — schema validation", () => {
	test("validateTenancyConfig accepts a valid config", () => {
		const result = validateTenancyConfig({
			enabled: true,
			required: true,
			baseDomains: ["example.com"],
			storage: {
				tenant: {
					getById: async () => null,
					getByDomain: async () => null,
					set: async () => {},
					delete: async () => {},
				},
				tenantMembership: {
					getMemberships: async () => [],
					getMembers: async () => [],
					setMembership: async () => {},
					deleteMembership: async () => {},
				},
			},
		});
		expect(result.enabled).toBe(true);
	});

	test("validateTenancyConfig rejects bad shapes", () => {
		expect(() => validateTenancyConfig({ baseDomains: [""] })).toThrow();
		expect(() => validateTenancyConfig({ defaultTenantId: "" })).toThrow();
	});

	test("validateCredentialsConfig accepts tenancy", () => {
		const result = validateCredentialsConfig({
			emailRequired: true,
			secret: SECRET,
			tenancy: { enabled: false },
		});
		expect(result.tenancy).toEqual({ enabled: false });
	});
});

describe("tenancy — middleware.role per-tenant", () => {
	const membership = new MemoryTenantMembershipStore();

	async function makeSessionToken(userId: string, tenantId?: string) {
		return signToken(
			{
				userId,
				discordId: userId,
				username: userId,
				roles: ["user"],
				...(tenantId ? { tenantId } : {}),
			},
			SECRET,
			"15m",
		);
	}

	test("roles are read per-tenant from membership (admin on tenant A)", async () => {
		await membership.setMembership("tenant-a", "u1", ["admin"]);
		const middleware = role({
			secret: SECRET,
			roles: { "/admin": ["admin"] },
			tenantIdFromRequest: subdomainResolver({
				baseDomains: ["example.com"],
			}),
			tenantMembership: membership,
		});

		const token = await makeSessionToken("u1", "tenant-a");
		const allowed = await middleware(
			new Request("https://tenant-a.example.com/admin", {
				headers: { cookie: `discord-auth-session=${token}` },
			}),
		);
		expect(allowed).toBeUndefined();

		const denied = await middleware(
			new Request("https://tenant-b.example.com/admin", {
				headers: { cookie: `discord-auth-session=${token}` },
			}),
		);
		expect(denied?.status).toBe(403);
	});

	test("legacy session-roles path still works without tenancy", async () => {
		const middleware = role({
			secret: SECRET,
			roles: { "/admin": ["admin"] },
		});
		const token = await signToken(
			{ discordId: "u1", username: "u1", roles: ["admin"] },
			SECRET,
			"15m",
		);
		const res = await middleware(
			new Request("https://example.com/admin", {
				headers: { cookie: `discord-auth-session=${token}` },
			}),
		);
		expect(res).toBeUndefined();
	});

	test("unresolved tenant → denied", async () => {
		const middleware = role({
			secret: SECRET,
			roles: { "/admin": ["admin"] },
			tenantIdFromRequest: subdomainResolver({
				baseDomains: ["example.com"],
			}),
			tenantMembership: membership,
		});
		const token = await makeSessionToken("u1", "tenant-a");
		const res = await middleware(
			new Request("https://example.com/admin", {
				headers: { cookie: `discord-auth-session=${token}` },
			}),
		);
		expect(res?.status).toBe(403);
	});
});

describe("tenancy — error classes", () => {
	test("tenant error classes carry correct codes", () => {
		expect(new AuthError("TENANT_NOT_FOUND", "x").code).toBe(
			"TENANT_NOT_FOUND",
		);
	});
});