import { mock, describe, expect, test, beforeEach } from "bun:test";
import type {
	WebAuthnChallenge,
	WebAuthnConfig,
	WebAuthnCredential,
} from "../../src";

const SECRET = "webauthn-test-secret-0123456789abcdef";

let lastRegistrationCall: Record<string, unknown> = {};
let lastAuthenticationCall: Record<string, unknown> = {};

const simpleWebAuthn = {
	generateRegistrationOptions: mock((options: Record<string, unknown>) => {
		lastRegistrationCall = { ...options };
		return {
			challenge: "reg-challenge",
			rp: options.rpName,
			user: options.userName,
			excludeCredentials: options.excludeCredentials,
		};
	}),
	generateAuthenticationOptions: mock((options: Record<string, unknown>) => {
		lastAuthenticationCall = { ...options };
		return {
			challenge: "auth-challenge",
			allowCredentials: options.allowCredentials,
		};
	}),
	verifyRegistrationResponse: mock(
		(options: Record<string, unknown>) => {
			lastRegistrationCall = { ...lastRegistrationCall, ...options };
			return {
				verified: true,
				registrationInfo: {
					credential: {
						id: "cred-1",
						publicKey: new Uint8Array([1, 2, 3]) as Uint8Array & ArrayBuffer,
						counter: 5,
						transports: ["internal"],
					},
					aaguid: "a-a-a-a",
				},
			};
		},
	),
	verifyAuthenticationResponse: mock(
		(options: Record<string, unknown>) => {
			lastAuthenticationCall = { ...lastAuthenticationCall, ...options };
			return {
				verified: true,
				authenticationInfo: { newCounter: 6 },
			};
		},
	),
};

mock.module("@simplewebauthn/server", () => simpleWebAuthn);

const { signToken, ErrorCodes, ConfigurationError } = await import("../../src");
const { webauthn } = await import("../../src/webauthn");

type ConfigWithStores = WebAuthnConfig & {
	storage: {
		credentials: ReturnType<typeof createCredentialStore>;
		challenges: ReturnType<typeof createChallengeStore>;
	};
	audit: { sessions: Array<Record<string, unknown>> };
};

async function makeConfig(
	overrides?: Partial<WebAuthnConfig>,
): Promise<ConfigWithStores> {
	const audit = { sessions: [] as Array<Record<string, unknown>> };
	return {
		rp: {
			id: "login.example.com",
			name: "Example Login",
			origins: ["https://login.example.com"],
		},
		secret: SECRET,
		createSessionWithoutPassword: async (options) => {
			audit.sessions.push({ ...options });
			return { sessionToken: "session-1", idToken: "id-token-1" };
		},
		...overrides,
		storage: {
			credentials: createCredentialStore(),
			challenges: createChallengeStore(),
		},
		audit,
	} as ConfigWithStores;
}

function createCredentialStore() {
	const store = new Map<string, WebAuthnCredential>();
	return {
		map: store,
		async findById(tenantId: string, credentialId: string) {
			return store.get(`${tenantId}:${credentialId}`) ?? null;
		},
		async listByUser(tenantId: string, userId: string) {
			return [...store.values()].filter(
				(c) => c.tenantId === tenantId && c.userId === userId,
			);
		},
		async create(credential: WebAuthnCredential) {
			store.set(`${credential.tenantId}:${credential.credentialId}`, {
				...credential,
			});
		},
		async updateSignCount(
			tenantId: string,
			credentialId: string,
			signCount: number,
		) {
			const key = `${tenantId}:${credentialId}`;
			const existing = store.get(key);
			if (existing) store.set(key, { ...existing, signCount });
		},
		async delete(tenantId: string, credentialId: string) {
			store.delete(`${tenantId}:${credentialId}`);
		},
		async deleteByUser(tenantId: string, userId: string) {
			for (const [key, c] of store) {
				if (c.tenantId === tenantId && c.userId === userId) store.delete(key);
			}
		},
	};
}

function createChallengeStore() {
	const store = new Map<string, WebAuthnChallenge>();
	return {
		map: store,
		async set(tenantId: string, challengeId: string, record: WebAuthnChallenge) {
			store.set(`${tenantId}:${challengeId}`, { ...record });
		},
		async getAndConsume(
			tenantId: string,
			challengeId: string,
		): Promise<WebAuthnChallenge | null> {
			const key = `${tenantId}:${challengeId}`;
			const entry = store.get(key);
			if (!entry) return null;
			store.delete(key);
			return entry;
		},
	};
}

function post(
	body: Record<string, unknown> = {},
	cookie?: string,
): Request {
	const headers: Record<string, string> = { "Content-Type": "application/json" };
	if (cookie) headers["Cookie"] = cookie;
	return new Request("https://login.example.com/webauthn", {
		method: "POST",
		body: JSON.stringify(body),
		headers,
	});
}

async function cookieFor(userId: string): Promise<string> {
	const token = await signToken({ userId }, SECRET);
	return `session=${token}`;
}

describe("webauthn", () => {
	let config: Awaited<ReturnType<typeof makeConfig>>;
	let handlers: Awaited<ReturnType<typeof webauthn>>;
	let ask: typeof simpleWebAuthn;

	beforeEach(async () => {
		simpleWebAuthn.generateRegistrationOptions.mockClear();
		simpleWebAuthn.generateAuthenticationOptions.mockClear();
		simpleWebAuthn.verifyRegistrationResponse.mockClear();
		simpleWebAuthn.verifyAuthenticationResponse.mockClear();
		config = await makeConfig();
		handlers = await webauthn(config);
		ask = simpleWebAuthn;
	});

	describe("configuration", () => {
		test("throws ConfigurationError when rp or storage is incomplete", async () => {
			await expect(
				webauthn({ ...config, rp: undefined as never }),
			).rejects.toThrow(ConfigurationError);
			await expect(
				webauthn({
					...config,
					rp: { id: "a", name: "b", origins: [] },
				}),
			).rejects.toThrow(ConfigurationError);
			await expect(
				webauthn({
					...config,
					rp: { id: "a", name: "b", origins: ["https://a"] },
					storage: undefined as never,
				}),
			).rejects.toThrow(ConfigurationError);
		});

		test("registration and authentication options are empty when the user has no credentials yet", async () => {
			const cookie = await cookieFor("user-1");
			const res = await handlers.handleRegisterStart(post({}, cookie));
			expect(res.status).toBe(200);
			const body = (await res.json()) as { options: { excludeCredentials: unknown } };
			expect(body.options.excludeCredentials).toEqual([]);
			expect(ask.generateRegistrationOptions).toHaveBeenCalledTimes(1);
		});
	});

	describe("registration flow (post-auth)", () => {
		test("start requires an authenticated session: 401", async () => {
			const res = await handlers.handleRegisterStart(post());
			expect(res.status).toBe(401);
			expect(((await res.json()) as { code: string }).code).toBe(
				ErrorCodes.INVALID_TOKEN,
			);
		});

		test("start returns challengeId + options and stores a single-use challenge", async () => {
			const cookie = await cookieFor("user-1");
			const res = await handlers.handleRegisterStart(post({}, cookie));
			expect(res.status).toBe(200);
			const body = (await res.json()) as { challengeId: string; options: { challenge: string } };
			expect(body.challengeId).toBeString();
			expect(body.options.challenge).toBe("reg-challenge");
			expect(
				[...config.storage.challenges.map.values()].some(
					(e) => e.type === "registration",
				),
			).toBe(true);
		});

		test("verify persists the credential with a base64url public key", async () => {
			const cookie = await cookieFor("user-1");
			const start = await handlers.handleRegisterStart(post({}, cookie));
			const { challengeId } = (await start.json()) as { challengeId: string };
			const res = await handlers.handleRegisterVerify(
				post({ challengeId, response: { id: "cred-1" } }, cookie),
			);
			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({ credentialId: "cred-1" });
			const stored = config.storage!.credentials.map.get("global:cred-1");
			expect(stored).toBeDefined();
			expect(stored!.tenantId).toBe("global");
			expect(stored!.userId).toBe("user-1");
			expect(stored!.publicKey).toBe("AQID");
			expect(stored!.signCount).toBe(5);
			expect(stored!.transports).toEqual(["internal"]);
			expect(ask.verifyRegistrationResponse).toHaveBeenCalledTimes(1);
			const { expectedChallenge, expectedOrigin, expectedRPID } =
				ask.verifyRegistrationResponse.mock.calls[0][0] as Record<
					string,
					unknown
				>;
			expect(expectedChallenge).toBe("reg-challenge");
			expect(expectedOrigin).toEqual(["https://login.example.com"]);
			expect(expectedRPID).toBe("login.example.com");
		});

		test("a challenge issued for another user is rejected with 401", async () => {
			const cookieA = await cookieFor("user-1");
			const cookieB = await cookieFor("user-2");
			const start = await handlers.handleRegisterStart(post({}, cookieA));
			const { challengeId } = (await start.json()) as { challengeId: string };
			const res = await handlers.handleRegisterVerify(
				post({ challengeId, response: { id: "cred-1" } }, cookieB),
			);
			expect(res.status).toBe(401);
		});

		test("failed verification maps to 400 VERIFICATION_FAILED", async () => {
			ask.verifyRegistrationResponse.mockImplementationOnce(
				() => ({ verified: false }) as never,
			);
			const cookie = await cookieFor("user-1");
			const start = await handlers.handleRegisterStart(post({}, cookie));
			const { challengeId } = (await start.json()) as { challengeId: string };
			const res = await handlers.handleRegisterVerify(
				post({ challengeId, response: { id: "cred-1" } }, cookie),
			);
			expect(res.status).toBe(400);
			expect(((await res.json()) as { code: string }).code).toBe(
				ErrorCodes.VERIFICATION_FAILED,
			);
		});
	});

	describe("authentication flow (ante-auth)", () => {
		test("start without userId: userless discovery options, challenge stored", async () => {
			const res = await handlers.handleAuthenticateStart(post());
			expect(res.status).toBe(200);
			const body = (await res.json()) as {
				challengeId: string;
				options: { challenge: string; allowCredentials: unknown };
			};
			expect(body.options.challenge).toBe("auth-challenge");
			expect(body.options.allowCredentials).toBeUndefined();
			const record = [...config.storage.challenges.map.values()].find(
				(e) => e.type === "authentication",
			);
			expect(record?.userId).toBeNull();
		});

		test("start with userId: challenge is scoped to that user's credentials", async () => {
			await config.storage!.credentials.create({
				tenantId: "global",
				userId: "user-1",
				credentialId: "cred-1",
				publicKey: "AQID",
				signCount: 1,
				aaguid: "x",
				createdAt: 1,
				lastUsedAt: 1,
			});
			const res = await handlers.handleAuthenticateStart(
				post({ userId: "user-1" }),
			);
			expect(res.status).toBe(200);
			const body = (await res.json()) as {
				options: { allowCredentials: Array<{ id: string }> };
			};
			expect(body.options.allowCredentials).toEqual([{ id: "cred-1" }]);
		});

		test("verify mints a session and updates the sign counter", async () => {
			await config.storage!.credentials.create({
				tenantId: "global",
				userId: "user-1",
				credentialId: "cred-1",
				publicKey: "AQID",
				signCount: 1,
				aaguid: "x",
				createdAt: 1,
				lastUsedAt: 1,
			});
			const start = await handlers.handleAuthenticateStart(
				post({ userId: "user-1" }),
			);
			const { challengeId } = (await start.json()) as { challengeId: string };
			const res = await handlers.handleAuthenticateVerify(
				post({ challengeId, response: { id: "cred-1" } }),
			);
			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({
				sessionToken: "session-1",
				idToken: "id-token-1",
			});
			expect(config.storage!.credentials.map.get("global:cred-1")!.signCount).toBe(
				6,
			);
			expect(config.audit.sessions).toHaveLength(1);
			expect(config.audit.sessions[0]).toMatchObject({
				userId: "user-1",
				tenantId: undefined,
			});
			expect(
				ask.verifyAuthenticationResponse.mock.calls[0][0],
			).toMatchObject({
				expectedChallenge: "auth-challenge",
				expectedRPID: "login.example.com",
			});
		});

		test("failed assertion maps to 400 VERIFICATION_FAILED", async () => {
			await config.storage!.credentials.create({
				tenantId: "global",
				userId: "user-1",
				credentialId: "cred-1",
				publicKey: "AQID",
				signCount: 1,
				aaguid: "x",
				createdAt: 1,
				lastUsedAt: 1,
			});
			ask.verifyAuthenticationResponse.mockImplementationOnce(
				() => ({ verified: false }) as never,
			);
			const start = await handlers.handleAuthenticateStart(post());
			const { challengeId } = (await start.json()) as { challengeId: string };
			const res = await handlers.handleAuthenticateVerify(
				post({ challengeId, response: { id: "cred-1" } }),
			);
			expect(res.status).toBe(400);
			expect(((await res.json()) as { code: string }).code).toBe(
				ErrorCodes.VERIFICATION_FAILED,
			);
		});

		test("unknown credential id: 400 CHALLENGE_INVALID", async () => {
			const start = await handlers.handleAuthenticateStart(post());
			const { challengeId } = (await start.json()) as { challengeId: string };
			const res = await handlers.handleAuthenticateVerify(
				post({ challengeId, response: { id: "nope" } }),
			);
			expect(res.status).toBe(400);
			expect(((await res.json()) as { code: string }).code).toBe(
				ErrorCodes.CHALLENGE_INVALID,
			);
		});
	});

	describe("challenge hardening", () => {
		test("challenges are single-use: replaying a challengeId fails with 400", async () => {
			await config.storage!.credentials.create({
				tenantId: "global",
				userId: "user-1",
				credentialId: "cred-1",
				publicKey: "AQID",
				signCount: 1,
				aaguid: "x",
				createdAt: 1,
				lastUsedAt: 1,
			});
			const start = await handlers.handleAuthenticateStart(post());
			const { challengeId } = (await start.json()) as { challengeId: string };
			const first = await handlers.handleAuthenticateVerify(
				post({ challengeId, response: { id: "cred-1" } }),
			);
			expect(first.status).toBe(200);
			const replay = await handlers.handleAuthenticateVerify(
				post({ challengeId, response: { id: "cred-1" } }),
			);
			expect(replay.status).toBe(400);
			expect(((await replay.json()) as { code: string }).code).toBe(
				ErrorCodes.CHALLENGE_INVALID,
			);
			expect(config.audit.sessions).toHaveLength(1);
		});

		test("a registration challenge cannot be used for authentication", async () => {
			const cookie = await cookieFor("user-1");
			const start = await handlers.handleRegisterStart(post({}, cookie));
			const { challengeId } = (await start.json()) as { challengeId: string };
			const res = await handlers.handleAuthenticateVerify(
				post({ challengeId, response: { id: "cred-1" } }),
			);
			expect(res.status).toBe(400);
			expect(((await res.json()) as { code: string }).code).toBe(
				ErrorCodes.CHALLENGE_INVALID,
			);
		});

		test("an unexpected user binding on authentication returns 401", async () => {
			await config.storage!.credentials.create({
				tenantId: "global",
				userId: "user-2",
				credentialId: "cred-2",
				publicKey: "AQID",
				signCount: 1,
				aaguid: "x",
				createdAt: 1,
				lastUsedAt: 1,
			});
			const start = await handlers.handleAuthenticateStart(
				post({ userId: "user-1" }),
			);
			const { challengeId } = (await start.json()) as { challengeId: string };
			const res = await handlers.handleAuthenticateVerify(
				post({ challengeId, response: { id: "cred-2" } }),
			);
			expect(res.status).toBe(401);
			expect(((await res.json()) as { code: string }).code).toBe(
				ErrorCodes.INVALID_TOKEN,
			);
		});
	});

	describe("tenancy (D3)", () => {
		test("tenant-scoped keys: challenges and credentials are isolated per tenant", async () => {
			config = await makeConfig({
				tenantIdFromRequest: async () => "tenant-x",
			});
			handlers = await webauthn(config);
			await config.storage!.credentials.create({
				tenantId: "tenant-x",
				userId: "user-1",
				credentialId: "cred-1",
				publicKey: "AQID",
				signCount: 1,
				aaguid: "x",
				createdAt: 1,
				lastUsedAt: 1,
			});
			const start = await handlers.handleAuthenticateStart(
				post({ userId: "user-1" }),
			);
			const { challengeId } = (await start.json()) as { challengeId: string };
			const res = await handlers.handleAuthenticateVerify(
				post({ challengeId, response: { id: "cred-1" } }),
			);
			expect(res.status).toBe(200);
			expect(config.audit.sessions[0]).toMatchObject({ tenantId: "tenant-x" });
			expect(await config.storage!.credentials.map.get("tenant-x:cred-1")).toBeDefined();
		});

		test("session tenantId is undefined without a tenant hook", async () => {
			const start = await handlers.handleAuthenticateStart(
				post({ userId: "user-1" }),
			);
			const { challengeId } = (await start.json()) as { challengeId: string };
			const res = await handlers.handleAuthenticateVerify(
				post({ challengeId, response: { id: "unknown" } }),
			);
			expect(res.status).toBe(400);
			expect(config.audit.sessions).toHaveLength(0);
		});
	});

	describe("remove credential (post-auth, owner-only)", () => {
		async function seedCredential() {
			await config.storage!.credentials.create({
				tenantId: "global",
				userId: "user-1",
				credentialId: "cred-1",
				publicKey: "AQID",
				signCount: 1,
				aaguid: "x",
				createdAt: 1,
				lastUsedAt: 1,
			});
		}

		test("requires authentication: 401", async () => {
			const res = await handlers.handleRemoveCredential(
				post({ credentialId: "cred-1" }),
			);
			expect(res.status).toBe(401);
		});

		test("unknown credential: 404", async () => {
			const cookie = await cookieFor("user-1");
			const res = await handlers.handleRemoveCredential(
				post({ credentialId: "nope" }, cookie),
			);
			expect(res.status).toBe(404);
			expect(((await res.json()) as { code: string }).code).toBe(
				ErrorCodes.CREDENTIALS_VALIDATION_ERROR,
			);
		});

		test("another user's credential: 403 FORBIDDEN", async () => {
			await seedCredential();
			const cookie = await cookieFor("user-2");
			const res = await handlers.handleRemoveCredential(
				post({ credentialId: "cred-1" }, cookie),
			);
			expect(res.status).toBe(403);
			expect(((await res.json()) as { code: string }).code).toBe(
				ErrorCodes.FORBIDDEN,
			);
		});

		test("the owner can remove the credential", async () => {
			await seedCredential();
			const cookie = await cookieFor("user-1");
			const res = await handlers.handleRemoveCredential(
				post({ credentialId: "cred-1" }, cookie),
			);
			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({ success: true });
			expect(config.storage!.credentials.map.has("global:cred-1")).toBe(false);
		});
	});

	describe("handler guards", () => {
		test("rejects non-POST with 405", async () => {
			const res = await handlers.handleRegisterStart(
				new Request("https://login.example.com/webauthn"),
			);
			expect(res.status).toBe(405);
		});

		test("register verify requires challengeId + response: 400", async () => {
			const cookie = await cookieFor("user-1");
			const res = await handlers.handleRegisterVerify(post({}, cookie));
			expect(res.status).toBe(400);
		});
	});
});