import { beforeEach, describe, expect, test } from "bun:test";
import { AuthError, ConfigurationError, ErrorCodes, smsOtp, signToken } from "../../src";
import type {
	MfaStorage,
	OtpCode,
	OtpStorage,
	PendingTokenEntry,
	SmsConfig,
} from "../../src";
import { TestBruteForceStorage } from "../helpers/storage";

const SECRET = "sms-otp-test-secret-0123456789abcdef";
const PHONE = "+5511999998888";

type OtpEntries = Map<string, OtpCode>;

function createOtpStore() {
	const store = new Map<string, OtpCode>();
	return {
		entries: () => store,
		async set(phoneHash: string, purpose: string, code: OtpCode) {
			store.set(`${phoneHash}:${purpose}`, { ...code });
		},
		async getAndConsume(
			phoneHash: string,
			purpose: string,
		): Promise<OtpCode | null> {
			const key = `${phoneHash}:${purpose}`;
			const entry = store.get(key);
			if (!entry) return null;
			store.delete(key);
			return { ...entry };
		},
		async delete(phoneHash: string, purpose: string) {
			store.delete(`${phoneHash}:${purpose}`);
		},
	};
}

function createNotifier() {
	const sent: Array<Record<string, unknown>> = [];
	return {
		sent,
		async send(input: {
			to: string;
			code: string;
			ttlMinutes: number;
			purpose: string;
			tenantId?: string;
		}) {
			sent.push({ ...input });
		},
	};
}

function createMfaStorage(): MfaStorage {
	const pending = new Map<string, PendingTokenEntry>();
	return {
		async getSecret() {
			return null;
		},
		async setSecret() {},
		async deleteSecret() {},
		async getBackupCodes() {
			return null;
		},
		async setBackupCodes() {},
		async consumeBackupCode() {},
		async getLastUsedCounter() {
			return null;
		},
		async setLastUsedCounter() {},
		async getPendingToken(userId) {
			return pending.get(userId) ?? null;
		},
		async setPendingToken(userId, entry) {
			pending.set(userId, { ...entry });
		},
		async deletePendingToken(userId) {
			pending.delete(userId);
		},
	};
}

function makeConfig(
	overrides?: Partial<SmsConfig>,
): SmsConfig & {
	storage: ReturnType<typeof createOtpStore>;
	notifier: ReturnType<typeof createNotifier>;
	mfaStorage: MfaStorage;
} {
	return {
		notifier: createNotifier(),
		smsPasswordless: true,
		storage: createOtpStore(),
		bruteForceStorage: new TestBruteForceStorage(),
		mfaStorage: createMfaStorage(),
		secret: SECRET,
		phoneLookup: async (phoneHash) =>
			phoneHash === (await import("../../src").then((m) => m.sha256Hex(PHONE)))
				? { userId: "user-1" }
				: null,
		createSessionWithoutPassword: async ({ userId }) => ({
			sessionToken: `session-${userId}`,
			idToken: `id-${userId}`,
		}),
		...overrides,
	} as SmsConfig & {
		storage: ReturnType<typeof createOtpStore>;
		notifier: ReturnType<typeof createNotifier>;
		mfaStorage: MfaStorage;
	};
}

function post(
	url = "https://example.com/auth/sms",
	body: Record<string, unknown> = {},
	cookie?: string,
): Request {
	const headers: Record<string, string> = { "Content-Type": "application/json" };
	if (cookie) headers["Cookie"] = cookie;
	return new Request(url || "https://example.com/auth/sms", {
		method: "POST",
		body: JSON.stringify(body),
		headers,
	});
}

describe("smsOtp", () => {
	let config: ReturnType<typeof makeConfig>;
	let handlers: ReturnType<typeof smsOtp>;

	beforeEach(() => {
		config = makeConfig();
		handlers = smsOtp(config);
	});

	describe("configuration", () => {
		test("throws ConfigurationError when the notifier is missing", () => {
			expect(() => smsOtp({ ...config, notifier: undefined as never })).toThrow(
				ConfigurationError,
			);
		});

		test("clamps ttlSeconds to <= 600 and codeLength to 4..10", async () => {
			const cfg = makeConfig({ ttlSeconds: 9999, codeLength: 2 });
			const manager = smsOtp(cfg);
			const res = await manager.handleSmsRequest(post("", { phone: PHONE }));
			expect(res.status).toBe(200);
			const body = (await res.json()) as { expiresInSeconds: number };
			expect(body.expiresInSeconds).toBe(600);
			const notifier = cfg.notifier as ReturnType<typeof createNotifier>;
			expect(notifier.sent[0]?.code as string).toHaveLength(4);
		});
	});

	describe("passwordless request + verify", () => {
		test("known phone: sends the code and verifies into a session", async () => {
			const created: Array<Record<string, unknown>> = [];
			config = makeConfig({
				createSessionWithoutPassword: async (options) => {
					created.push({ ...options });
					return { sessionToken: "st", idToken: "it" };
				},
			});
			handlers = smsOtp(config);

			const req = await handlers.handleSmsRequest(post("", { phone: PHONE }));
			expect(req.status).toBe(200);
			expect(await req.json()).toEqual({
				success: true,
				purpose: "sms-login",
				expiresInSeconds: 600,
			});
			const notifier = config.notifier as ReturnType<typeof createNotifier>;
			expect(notifier.sent).toHaveLength(1);
			const code = notifier.sent[0]?.code as string;
			expect(code).toMatch(/^\d{6}$/);
			expect(notifier.sent[0]).toMatchObject({
				to: PHONE,
				purpose: "sms-login",
				ttlMinutes: 10,
			});

			const verify = await handlers.handleSmsVerify(
				post("", { phone: PHONE, code }),
			);
			expect(verify.status).toBe(200);
			expect(await verify.json()).toEqual({
				sessionToken: "st",
				idToken: "it",
			});
			expect(created).toHaveLength(1);
			expect(created[0]).toMatchObject({
				userId: "user-1",
				tenantId: undefined,
			});
		});

		test("stores only the code hash, never the raw code (ADR-005)", async () => {
			await handlers.handleSmsRequest(post("", { phone: PHONE }));
			const notifier = config.notifier as ReturnType<typeof createNotifier>;
			const code = notifier.sent[0]?.code as string;
			const phoneHash = await (
				await import("../../src")
			).sha256Hex(PHONE);
			const stored = config.storage.entries().get(`${phoneHash}:sms-login`);
			expect(stored).toBeDefined();
			expect(stored?.codeHash).toMatch(/^[0-9a-f]{64}$/);
			expect(stored?.codeHash).not.toBe(code);
			expect(stored?.userId).toBe("user-1");
			expect(stored?.tenantId).toBeNull();
		});
	});

	describe("anti-enumeration", () => {
		test("unknown phone: identical envelope, no notifier call, nothing stored", async () => {
			const start = config.storage.entries().size;
			const res = await handlers.handleSmsRequest(
				post("", { phone: "+5511987654321" }),
			);
			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({
				success: true,
				purpose: "sms-login",
				expiresInSeconds: 600,
			});
			const notifier = config.notifier as ReturnType<typeof createNotifier>;
			expect(notifier.sent).toHaveLength(0);
			expect(config.storage.entries().size).toBe(start);
		});

		test("disallowed country prefix: dummy path (no send, no storage)", async () => {
			config = makeConfig({ allowedCountryPrefixes: ["+55"] });
			handlers = smsOtp(config);
			const res = await handlers.handleSmsRequest(
				post("", { phone: "+12025551234" }),
			);
			expect(res.status).toBe(200);
			const notifier = config.notifier as ReturnType<typeof createNotifier>;
			expect(notifier.sent).toHaveLength(0);
			expect(config.storage.entries().size).toBe(0);
		});
	});

	describe("rate limits (anti-bombing)", () => {
		test("cooldown: a second request within 30s is rejected with 429", async () => {
			const first = await handlers.handleSmsRequest(post("", { phone: PHONE }));
			expect(first.status).toBe(200);
			const second = await handlers.handleSmsRequest(
				post("", { phone: PHONE }),
			);
			expect(second.status).toBe(429);
			const body = (await second.json()) as { code: string };
			expect(body.code).toBe(ErrorCodes.RATE_LIMITED);
		});

		test("daily per-phone limit: quota is exhausted by the second send", async () => {
			config = makeConfig({
				dailyPerPhoneLimit: 2,
				cooldownMs: 0,
				bruteForceStorage: new TestBruteForceStorage(),
			});
			handlers = smsOtp(config);
			const first = await handlers.handleSmsRequest(
				post("", { phone: PHONE }),
			);
			expect(first.status).toBe(200);
			const second = await handlers.handleSmsRequest(
				post("", { phone: PHONE }),
			);
			expect(second.status).toBe(429);
			expect(((await second.json()) as { code: string }).code).toBe(
				ErrorCodes.RATE_LIMITED,
			);
		});

		test("per-IP limiter: the 6th send from the same IP is rejected", async () => {
			config = makeConfig({
				cooldownMs: 0,
				bruteForceStorage: new TestBruteForceStorage(),
				phoneLookup: async () => ({ userId: "user-1" }),
			});
			handlers = smsOtp(config);
			for (let i = 1; i <= 5; i++) {
				const res = await handlers.handleSmsRequest(
					post("", { phone: `+551199999990${i}` }),
				);
				expect(res.status).toBe(200);
			}
			const blocked = await handlers.handleSmsRequest(
				post("", { phone: "+551199999996" }),
			);
			expect(blocked.status).toBe(429);
			expect(((await blocked.json()) as { code: string }).code).toBe(
				ErrorCodes.RATE_LIMITED,
			);
		});
	});

	describe("verify hardening", () => {
		async function issueCode(): Promise<string> {
			await handlers.handleSmsRequest(post("", { phone: PHONE }));
			const notifier = config.notifier as ReturnType<typeof createNotifier>;
			return notifier.sent[0]?.code as string;
		}

		test("wrong code: 400 INVALID_CODE and consumes the record", async () => {
			await issueCode();
			const res = await handlers.handleSmsVerify(
				post("", { phone: PHONE, code: "000000" }),
			);
			expect(res.status).toBe(400);
			expect(((await res.json()) as { code: string }).code).toBe(
				ErrorCodes.INVALID_CODE,
			);
		});

		test("maxAttempts wrong codes exhaust the code: 429, then correct code is dead", async () => {
			config = makeConfig({ maxAttempts: 5 });
			handlers = smsOtp(config);
			const code = await issueCode();
			for (let i = 0; i < 4; i++) {
				const res = await handlers.handleSmsVerify(
					post("", { phone: PHONE, code: "111111" }),
				);
				expect(res.status).toBe(400);
			}
			const fifth = await handlers.handleSmsVerify(
				post("", { phone: PHONE, code: "111111" }),
			);
			expect(fifth.status).toBe(429);
			expect(((await fifth.json()) as { code: string }).code).toBe(
				ErrorCodes.RATE_LIMITED,
			);

			const locked = await handlers.handleSmsVerify(
				post("", { phone: PHONE, code }),
			);
			expect(locked.status).toBe(400);
			expect(((await locked.json()) as { code: string }).code).toBe(
				ErrorCodes.INVALID_CODE,
			);
		});

		test("rejected with 403 FORBIDDEN when passwordless is disabled", async () => {
			config = makeConfig({ smsPasswordless: false });
			handlers = smsOtp(config);
			await handlers.handleSmsRequest(post("", { phone: PHONE }));
			const notifier = config.notifier as ReturnType<typeof createNotifier>;
			const code = notifier.sent[0]?.code as string;
			const res = await handlers.handleSmsVerify(
				post("", { phone: PHONE, code }),
			);
			expect(res.status).toBe(403);
			expect(((await res.json()) as { code: string }).code).toBe(
				ErrorCodes.FORBIDDEN,
			);
		});

		test("verify without a known user mapping: 400 INVALID_CODE", async () => {
			config = makeConfig({
				phoneLookup: async () => null,
				smsPasswordless: true,
			});
			handlers = smsOtp(config);
			await handlers.handleSmsRequest(
				post("", { phone: "+12025551234" }),
			);
			const notifier = config.notifier as ReturnType<typeof createNotifier>;
			expect(notifier.sent).toHaveLength(0);
		});
	});

	describe("post-auth enroll + step-up (MFA)", () => {
		async function cookieFor(userId: string): Promise<string> {
			const token = await signToken({ userId }, SECRET);
			return `session=${token}`;
		}

		test("enroll: returns a pending token and verifies via onEnrolled", async () => {
			const enrolled: Array<Record<string, unknown>> = [];
			config = makeConfig({
				onEnrolled: async (input) => {
					enrolled.push({ ...input });
				},
			});
			handlers = smsOtp(config);
			const cookie = await cookieFor("user-1");

			const enroll = await handlers.handleSmsEnroll(
				post("", { phone: PHONE }, cookie),
			);
			expect(enroll.status).toBe(200);
			const enrollBody = (await enroll.json()) as { pendingToken: string };
			expect(enrollBody.pendingToken).toMatch(/^[0-9a-f]{64}:[0-9a-f]{64}$/);
			const notifier = config.notifier as ReturnType<typeof createNotifier>;
			const code = notifier.sent[0]?.code as string;

			const verify = await handlers.handleSmsVerifyMfa(
				post(
					"",
					{ phone: PHONE, code, pendingToken: enrollBody.pendingToken },
					cookie,
				),
			);
			expect(verify.status).toBe(200);
			expect(await verify.json()).toEqual({ success: true, userId: "user-1" });
			expect(enrolled).toHaveLength(1);
			expect(enrolled[0]).toMatchObject({ userId: "user-1" });
		});

		test("enroll requires authentication: 401 without a session cookie", async () => {
			const res = await handlers.handleSmsEnroll(
				post("", { phone: PHONE }),
			);
			expect(res.status).toBe(401);
		});

		test("enrolling the same phone again: 409 MFA_ALREADY_SETUP", async () => {
			const cookie = await cookieFor("user-1");
			config = makeConfig({
				getBinding: async () => ({
					phoneHash: await (await import("../../src")).sha256Hex(PHONE),
				}),
			});
			handlers = smsOtp(config);
			const res = await handlers.handleSmsEnroll(
				post("", { phone: PHONE }, cookie),
			);
			expect(res.status).toBe(409);
			expect(((await res.json()) as { code: string }).code).toBe(
				ErrorCodes.MFA_ALREADY_SETUP,
			);
		});

		test("re-binding a different phone: requires the verifyPassword hook and re-auth", async () => {
			const cookie = await cookieFor("user-1");
			const makeRebindConfig = (
				verifyPassword?: (id: string, p: string) => Promise<boolean>,
			) =>
				makeConfig({
					getBinding: async () => ({ phoneHash: "other-hash" }),
					verifyPassword,
				});
			config = makeRebindConfig();
			handlers = smsOtp(config);
			const noPassword = await handlers.handleSmsEnroll(
				post("", { phone: PHONE }, cookie),
			);
			expect(noPassword.status).toBe(401);
			const noHook = await handlers.handleSmsEnroll(
				post("", { phone: PHONE, password: "nope" }, cookie),
			);
			expect(noHook.status).toBe(500);

			config = makeRebindConfig(async (userId, password) =>
				userId === "user-1" && password === "correct-password",
			);
			handlers = smsOtp(config);
			const wrongPassword = await handlers.handleSmsEnroll(
				post("", { phone: PHONE, password: "nope" }, cookie),
			);
			expect(wrongPassword.status).toBe(401);
			const withPassword = await handlers.handleSmsEnroll(
				post("", { phone: PHONE, password: "correct-password" }, cookie),
			);
			expect(withPassword.status).toBe(200);
		});

		test("step-up verify: wrong pending token is rejected with 401", async () => {
			const cookie = await cookieFor("user-1");
			const enroll = await handlers.handleSmsEnroll(
				post("", { phone: PHONE }, cookie),
			);
			expect(enroll.status).toBe(200);
			const notifier = config.notifier as ReturnType<typeof createNotifier>;
			const code = notifier.sent[0]?.code as string;
			const res = await handlers.handleSmsVerifyMfa(
				post("", { phone: PHONE, code, pendingToken: "bad.token" }, cookie),
			);
			expect(res.status).toBe(401);
			expect(((await res.json()) as { code: string }).code).toBe(
				ErrorCodes.INVALID_TOKEN,
			);
		});

		test("resend: 429 while the 30s cooldown is active", async () => {
			const first = await handlers.handleSmsRequest(post("", { phone: PHONE }));
			expect(first.status).toBe(200);
			const resend = await handlers.handleSmsResend(
				post("", { phone: PHONE }),
			);
			expect(resend.status).toBe(429);
		});
	});

	describe("notifier failure", () => {
		test("upstream failure maps to 502 UPSTREAM_ERROR", async () => {
			config = makeConfig({
				notifier: {
					async send() {
						throw new Error("provider down");
					},
				},
			});
			handlers = smsOtp(config);
			const res = await handlers.handleSmsRequest(post("", { phone: PHONE }));
			expect(res.status).toBe(502);
			expect(((await res.json()) as { code: string }).code).toBe(
				ErrorCodes.UPSTREAM_ERROR,
			);
		});
	});

	describe("handler errors", () => {
		test("invalid phone: 400", async () => {
			for (const phone of [undefined, "not-a-number", "911", "+123"]) {
				const res = await handlers.handleSmsRequest(
					post("", { phone: phone as string }),
				);
				expect(res.status).toBe(400);
			}
		});

		test("fictional/invalid country codes are rejected (libphonenumber-js)", async () => {
			for (const phone of ["+99912345678", "+0012345678", "+55119999988881"]) {
				const res = await handlers.handleSmsRequest(
					post("", { phone: phone as string }),
				);
				expect(res.status).toBe(400);
				expect(((await res.json()) as { error: string }).error).toBe(
					"phone must be a valid E.164 number",
				);
			}
		});

		test("rejects non-POST", async () => {
			const res = await handlers.handleSmsRequest(new Request("https://a"));
			expect(res.status).toBe(405);
		});

		test("unauthenticated verify path cannot be enumerated (missing code → 400)", async () => {
			const res = await handlers.handleSmsVerify(
				post("", { phone: PHONE }),
			);
			expect(res.status).toBe(400);
		});
	});
});