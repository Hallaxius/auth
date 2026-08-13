import { beforeEach, describe, expect, test, mock } from "bun:test";
import type {
	MagicLinkConfig,
	MagicLinkNotifier,
	MagicLinkTokenStorage,
	PendingMagicLink,
} from "../../src/";
import {
	AuthError,
	ConfigurationError,
	ErrorCodes,
	magicLink,
} from "../../src/";
import { TestBruteForceStorage } from "../helpers/storage";

type StoreEntry = PendingMagicLink;

function createMockStorage(): MagicLinkTokenStorage & {
	entries(): Map<string, StoreEntry>;
} {
	const store = new Map<string, StoreEntry>();
	const consumed = new Map<string, StoreEntry>();
	return {
		entries: () => store,
		async findBySelector(tenantId, selector) {
			return (
				store.get(`${tenantId}:${selector}`) ??
				consumed.get(`${tenantId}:${selector}`) ??
				null
			);
		},
		async create(token) {
			store.set(`${token.tenantId}:${token.selector}`, { ...token });
		},
		async consume(tenantId, selector) {
			const key = `${tenantId}:${selector}`;
			const entry = store.get(key);
			if (!entry) return null;
			store.delete(key);
			consumed.set(key, { ...entry });
			return { ...entry };
		},
		async deleteByRecipient(tenantId, recipient) {
			for (const [key, entry] of store) {
				if (entry.tenantId === tenantId && entry.recipient === recipient) {
					store.delete(key);
				}
			}
		},
	};
}

function createMockNotifier(): MagicLinkNotifier & {
	emails: Array<Record<string, unknown>>;
} {
	const emails: Array<Record<string, unknown>> = [];
	return {
		emails,
		async sendEmail(input) {
			emails.push({ ...input });
		},
	};
}

function makeConfig(
	overrides?: Partial<MagicLinkConfig>,
): MagicLinkConfig {
	return {
		storage: createMockStorage(),
		notifier: createMockNotifier(),
		userLookup: async (recipient) =>
			recipient.startsWith("known") ? { userId: `user-${recipient}` } : null,
		requestLimit: { storage: new TestBruteForceStorage() },
		recipientLimit: { storage: new TestBruteForceStorage() },
		verifyLimit: { storage: new TestBruteForceStorage() },
		...overrides,
	};
}

describe("magicLink", () => {
	let config: MagicLinkConfig;
	let manager: ReturnType<typeof magicLink>;

	beforeEach(() => {
		mock.clearAllMocks();
		config = makeConfig();
		manager = magicLink(config);
	});

	describe("configuration", () => {
		test("throws ConfigurationError when storage is missing", () => {
			expect(() =>
				magicLink({ ...config, storage: undefined as never }),
			).toThrow(ConfigurationError);
		});

		test("throws ConfigurationError when notifier is missing", () => {
			expect(() =>
				magicLink({ ...config, notifier: undefined as never }),
			).toThrow(ConfigurationError);
		});

		test("clamps ttlMinutes to 5..15 via email TTL", async () => {
			config = makeConfig({ ttlMinutes: 1 });
			manager = magicLink(config);
			const notifier = config.notifier as ReturnType<
				typeof createMockNotifier
			>;
			await manager.sendTo("known@example.com");
			expect(notifier.emails[0]?.ttlMinutes).toBe(5);
			config = makeConfig({ ttlMinutes: 60 });
			manager = magicLink(config);
			const notifier60 = config.notifier as ReturnType<
				typeof createMockNotifier
			>;
			await manager.sendTo("known@example.com");
			expect(notifier60.emails[0]?.ttlMinutes).toBe(15);
		});

		test("clamps codeLength to 6..8", async () => {
			config = makeConfig({ mode: "code", codeLength: 3 });
			manager = magicLink(config);
			const notifier = config.notifier as ReturnType<
				typeof createMockNotifier
			>;
			await manager.sendTo("known@example.com");
			expect(notifier.emails[0]?.code).toHaveLength(6);
			config = makeConfig({ mode: "code", codeLength: 12 });
			manager = magicLink(config);
			const notifier8 = config.notifier as ReturnType<
				typeof createMockNotifier
			>;
			await manager.sendTo("known@example.com");
			expect(notifier8.emails[0]?.code).toHaveLength(8);
		});
	});

	describe("sendTo (link mode)", () => {
		test("known recipient: sends an email with a link", async () => {
			const notifier = config.notifier as ReturnType<
				typeof createMockNotifier
			>;
			const result = await manager.sendTo("known@example.com");
			expect(result.processed).toBe(true);
			expect(notifier.emails).toHaveLength(1);
			const link = notifier.emails[0]?.link as string;
			expect(link).toContain("/auth/magic-link?t=");
			const token = link.split("t=")[1] as string;
			expect(token.split(".")).toHaveLength(2);
		});

		test("known recipient: stores only the validator hash (ADR-005)", async () => {
			const notifier = config.notifier as ReturnType<
				typeof createMockNotifier
			>;
			const storage = config.storage as ReturnType<
				typeof createMockStorage
			>;
			await manager.sendTo("known@example.com");
			const link = notifier.emails[0]?.link as string;
			const token = link.split("t=")[1] as string;
			const [selector] = token.split(".");
			const entry = storage
				.entries()
				.get(`global:${selector}`) as StoreEntry;
			expect(entry).toBeDefined();
			expect(entry.tokenHash).not.toBe(token.split(".")[1]);
			expect(entry.tokenHash).toMatch(/^[0-9a-f]{64}$/);
			expect(entry.userId).toBe("user-known@example.com");
			expect(entry.purpose).toBe("login");
			expect(entry.recipient).toBe("known@example.com");
		});

		test("unknown recipient: identical response, nothing stored or sent", async () => {
			const notifier = config.notifier as ReturnType<
				typeof createMockNotifier
			>;
			const storage = config.storage as ReturnType<
				typeof createMockStorage
			>;
			const result = await manager.sendTo("unknown@example.com");
			expect(result.processed).toBe(true);
			expect(notifier.emails).toHaveLength(0);
			expect(storage.entries().size).toBe(0);
		});

		test("resend invalidates previous tokens of the same recipient", async () => {
			const notifier = config.notifier as ReturnType<
				typeof createMockNotifier
			>;
			const storage = config.storage as ReturnType<
				typeof createMockStorage
			>;
			await manager.sendTo("known@example.com");
			expect(storage.entries().size).toBe(1);
			await manager.sendTo("known@example.com");
			expect(storage.entries().size).toBe(1);
			expect(notifier.emails).toHaveLength(2);
		});

		test("rate limits per-IP requests", async () => {
			config = makeConfig({
				requestLimit: {
					maxAttempts: 2,
					windowMs: 60_000,
					blockDurationMs: 60_000,
					storage: new TestBruteForceStorage(),
				},
			});
			manager = magicLink(config);
			await manager.sendTo("known@example.com");
			await expect(manager.sendTo("known@example.com")).rejects.toMatchObject(
				{
					code: ErrorCodes.RATE_LIMITED,
					statusCode: 429,
				},
			);
		});

		test("uses a custom linkPath", async () => {
			config = makeConfig({ linkPath: "/login/magic" });
			manager = magicLink(config);
			const notifier = config.notifier as ReturnType<
				typeof createMockNotifier
			>;
			await manager.sendTo("known@example.com");
			expect(notifier.emails[0]?.link as string).toContain("/login/magic?t=");
		});
	});

	describe("sendTo (code mode)", () => {
		test("sends a numeric code of the configured length", async () => {
			config = makeConfig({ mode: "code" });
			manager = magicLink(config);
			const notifier = config.notifier as ReturnType<
				typeof createMockNotifier
			>;
			await manager.sendTo("known@example.com");
			expect(notifier.emails).toHaveLength(1);
			const code = notifier.emails[0]?.code as string;
			expect(code).toMatch(/^\d{6}$/);
			expect(notifier.emails[0]?.link).toBeUndefined();
		});

		test("unknown recipient in code mode: nothing sent", async () => {
			config = makeConfig({ mode: "code" });
			manager = magicLink(config);
			const notifier = config.notifier as ReturnType<
				typeof createMockNotifier
			>;
			await manager.sendTo("unknown@example.com");
			expect(notifier.emails).toHaveLength(0);
		});
	});

	describe("verify (link mode)", () => {
		async function issueAndVerify(
			recipient = "known@example.com",
			overrides?: Partial<MagicLinkConfig>,
			request?: Request,
		): Promise<{
			token: string;
			manager: ReturnType<typeof magicLink>;
			notifier: ReturnType<typeof createMockNotifier>;
			storage: ReturnType<typeof createMockStorage>;
		}> {
			const cfg = makeConfig(overrides);
			const m = magicLink(cfg);
			const notifier = cfg.notifier as ReturnType<typeof createMockNotifier>;
			if (request) {
				await m.sendTo(recipient, request);
			} else {
				await m.sendTo(recipient);
			}
			const link = notifier.emails[0]?.link as string;
			const token = link.split("t=")[1] as string;
			const storage = cfg.storage as ReturnType<typeof createMockStorage>;
			return { token, manager: m, notifier, storage };
		}

		test("valid token: returns the user and consumes the entry", async () => {
			const { token, manager: m, storage } = await issueAndVerify();
			const result = await m.verify({ token });
			expect(result).toEqual({
				userId: "user-known@example.com",
				recipient: "known@example.com",
				tenantId: "global",
				purpose: "login",
			});
			expect(storage.entries().size).toBe(0);
		});

		test("single-use: second verify with the same token is rejected", async () => {
			const { token, manager: m } = await issueAndVerify();
			await m.verify({ token });
			await expect(m.verify({ token })).rejects.toMatchObject({
				code: ErrorCodes.MAGIC_LINK_USED,
				statusCode: 400,
			});
		});

		test("wrong validator: rejected without consuming", async () => {
			const { manager: m } = await issueAndVerify();
			await expect(
				m.verify({ token: `wrong.validator` }),
			).rejects.toMatchObject({ code: ErrorCodes.MAGIC_LINK_INVALID });
		});

		test("malformed token (no dot): rejected", async () => {
			const { manager: m } = await issueAndVerify();
			await expect(m.verify({ token: "notoken" })).rejects.toMatchObject({
				code: ErrorCodes.MAGIC_LINK_INVALID,
			});
		});

		test("missing token: rejected", async () => {
			await expect(manager.verify({})).rejects.toMatchObject({
				code: ErrorCodes.MAGIC_LINK_INVALID,
			});
		});

		test("expired token: consumed and rejected as expired", async () => {
			const { token, manager: m, notifier, storage } =
				await issueAndVerify();
			const link = notifier.emails[0]?.link as string;
			const selector = (link.split("t=")[1] as string).split(".")[0] as string;
			const entry = storage.entries().get(`global:${selector}`) as StoreEntry;
			entry.expiresAt = Date.now() - 1;
			await expect(m.verify({ token })).rejects.toMatchObject({
				code: ErrorCodes.MAGIC_LINK_EXPIRED,
			});
			expect(storage.entries().get(`global:${selector}`)).toBeUndefined();
		});

		test("rate limits repeated failed verify attempts", async () => {
			const { manager: m } = await issueAndVerify();
			for (let i = 0; i < 10; i++) {
				await m.verify({ token: `bad.${i}` }).catch(() => undefined);
			}
			await expect(m.verify({ token: "bad.final" })).rejects.toMatchObject({
				code: ErrorCodes.RATE_LIMITED,
				statusCode: 429,
			});
		});

		test("resolves the tenant from the request when provided", async () => {
			const request = new Request("https://acme.example.com");
			const { token, manager: m } = await issueAndVerify(
				"known@example.com",
				{ tenantIdFromRequest: async () => "acme" },
				request,
			);
			const result = await m.verify({ token, request });
			expect(result.tenantId).toBe("acme");
		});

		test("onVerified hook replaces the default response", async () => {
			const onVerified = mock(async () => new Response("ok", { status: 200 }));
			const { token, manager: m } = await issueAndVerify(
				"known@example.com",
				{ onVerified },
			);
			const res = await m.handleVerify(
				new Request("https://example.com/auth/magic-link", {
					method: "POST",
					body: JSON.stringify({ token }),
					headers: { "Content-Type": "application/json" },
				}),
			);
			expect(res.status).toBe(200);
			expect(onVerified).toHaveBeenCalledWith(
				expect.objectContaining({ userId: "user-known@example.com" }),
			);
		});
	});

	describe("verify (code mode)", () => {
		async function issueCode(
			recipient = "known@example.com",
		): Promise<{ code: string; manager: ReturnType<typeof magicLink> }> {
			const cfg = makeConfig({ mode: "code" });
			const m = magicLink(cfg);
			const notifier = cfg.notifier as ReturnType<
				typeof createMockNotifier
			>;
			await m.sendTo(recipient);
			return { code: notifier.emails[0]?.code as string, manager: m };
		}

		test("valid code + recipient: returns the user", async () => {
			const { code, manager: m } = await issueCode();
			const result = await m.verify({
				code,
				recipient: "known@example.com",
			});
			expect(result.userId).toBe("user-known@example.com");
			expect(result.purpose).toBe("login");
		});

		test("code without recipient: rejected", async () => {
			const { code, manager: m } = await issueCode();
			await expect(m.verify({ code })).rejects.toMatchObject({
				code: ErrorCodes.MAGIC_LINK_INVALID,
			});
		});

		test("code with a different recipient: rejected", async () => {
			const { code, manager: m } = await issueCode();
			await expect(
				m.verify({ code, recipient: "someone-else@example.com" }),
			).rejects.toMatchObject({ code: ErrorCodes.MAGIC_LINK_INVALID });
		});

		test("wrong code: rejected", async () => {
			const { manager: m } = await issueCode();
			await expect(
				m.verify({ code: "000000", recipient: "known@example.com" }),
			).rejects.toMatchObject({ code: ErrorCodes.MAGIC_LINK_INVALID });
		});

		test("single-use: second verify with the same code is rejected", async () => {
			const { code, manager: m } = await issueCode();
			await m.verify({ code, recipient: "known@example.com" });
			await expect(
				m.verify({ code, recipient: "known@example.com" }),
			).rejects.toMatchObject({ code: ErrorCodes.MAGIC_LINK_USED });
		});
	});

	describe("handleRequest", () => {
		test("rejects non-POST", async () => {
			const res = await manager.handleRequest(
				new Request("https://example.com/auth/magic-link"),
			);
			expect(res.status).toBe(405);
		});

		test("requires a recipient", async () => {
			const res = await manager.handleRequest(
				new Request("https://example.com/auth/magic-link", {
					method: "POST",
					body: JSON.stringify({}),
					headers: { "Content-Type": "application/json" },
				}),
			);
			expect(res.status).toBe(400);
			expect(await res.json()).toEqual({ error: "recipient is required" });
		});

		test("rejects malformed JSON", async () => {
			const res = await manager.handleRequest(
				new Request("https://example.com/auth/magic-link", {
					method: "POST",
					body: "{not-json",
					headers: { "Content-Type": "application/json" },
				}),
			);
			expect(res.status).toBe(400);
			expect(await res.json()).toEqual({ error: "Invalid JSON body" });
		});

		test("returns success for a known recipient", async () => {
			const res = await manager.handleRequest(
				new Request("https://example.com/auth/magic-link", {
					method: "POST",
					body: JSON.stringify({ recipient: "known@example.com" }),
					headers: { "Content-Type": "application/json" },
				}),
			);
			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({ success: true });
		});
	});

	describe("handleVerify", () => {
		test("returns success by default", async () => {
			const notifier = config.notifier as ReturnType<
				typeof createMockNotifier
			>;
			await manager.sendTo("known@example.com");
			const link = notifier.emails[0]?.link as string;
			const token = link.split("t=")[1] as string;
			const res = await manager.handleVerify(
				new Request("https://example.com/auth/magic-link/verify", {
					method: "POST",
					body: JSON.stringify({ token }),
					headers: { "Content-Type": "application/json" },
				}),
			);
			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({ success: true });
		});

		test("maps AuthError to its status code", async () => {
			const res = await manager.handleVerify(
				new Request("https://example.com/auth/magic-link/verify", {
					method: "POST",
					body: JSON.stringify({ token: "bad.token" }),
					headers: { "Content-Type": "application/json" },
				}),
			);
			expect(res.status).toBe(400);
			const body = (await res.json()) as { code: string };
			expect(body.code).toBe(ErrorCodes.MAGIC_LINK_INVALID);
		});
	});

	describe("verify limiter interplay", () => {
		test("wraps quota exhaustion in RATE_LIMITED", async () => {
			config = makeConfig({
				verifyLimit: {
					maxAttempts: 2,
					windowMs: 60_000,
					blockDurationMs: 60_000,
					storage: new TestBruteForceStorage(),
				},
			});
			manager = magicLink(config);
			const notifier = config.notifier as ReturnType<
				typeof createMockNotifier
			>;
			await manager.sendTo("known@example.com");
			const link = notifier.emails[0]?.link as string;
			const token = link.split("t=")[1] as string;
			await manager.verify({ token: "bad.token" }).catch(() => undefined);
			await manager.verify({ token: "bad.token" }).catch(() => undefined);
			await expect(manager.verify({ token })).rejects.toMatchObject({
				code: ErrorCodes.RATE_LIMITED,
				statusCode: 429,
			});
		});
	});
});