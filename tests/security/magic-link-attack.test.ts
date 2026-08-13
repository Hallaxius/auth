import { describe, expect, test } from "bun:test";
import type {
	MagicLinkConfig,
	MagicLinkNotifier,
	MagicLinkTokenStorage,
	PendingMagicLink,
} from "../../src/";
import { ErrorCodes, magicLink } from "../../src/";
import { TestBruteForceStorage } from "../helpers/storage";

type StoreEntry = PendingMagicLink;

function createMockStorage(): MagicLinkTokenStorage & {
	entries(): Map<string, StoreEntry>;
	consumed(): Map<string, StoreEntry>;
} {
	const store = new Map<string, StoreEntry>();
	const consumed = new Map<string, StoreEntry>();
	return {
		entries: () => store,
		consumed: () => consumed,
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

async function issueLink(
	overrides?: Partial<MagicLinkConfig>,
	recipient = "known@example.com",
): Promise<{
	manager: ReturnType<typeof magicLink>;
	notifier: ReturnType<typeof createMockNotifier>;
	storage: ReturnType<typeof createMockStorage>;
	token: string;
}> {
	const cfg = makeConfig(overrides);
	const manager = magicLink(cfg);
	const notifier = cfg.notifier as ReturnType<typeof createMockNotifier>;
	const storage = cfg.storage as ReturnType<typeof createMockStorage>;
	await manager.sendTo(recipient);
	const link = notifier.emails[0]?.link as string;
	const token = link.split("t=")[1] as string;
	return { manager, notifier, storage, token };
}

describe("magicLink — attacker-facing security (no duplicate coverage of tests/unit)", () => {
	test("anti-enumeration: known and unknown recipients return byte-identical responses", async () => {
		const manager = magicLink(makeConfig());
		const known = await manager.handleRequest(
			new Request("https://example.com/auth/magic-link", {
				method: "POST",
				body: JSON.stringify({ recipient: "known@example.com" }),
				headers: { "Content-Type": "application/json" },
			}),
		);
		const unknown = await manager.handleRequest(
			new Request("https://example.com/auth/magic-link", {
				method: "POST",
				body: JSON.stringify({ recipient: "unknown@example.com" }),
				headers: { "Content-Type": "application/json" },
			}),
		);
		expect(known.status).toBe(unknown.status);
		expect(await known.text()).toBe(await unknown.text());
	});

	test("anti-timing: unknown recipient never completes faster than a known one beyond a small slack", async () => {
		const manager = magicLink(makeConfig());
		const send = async (recipient: string) => {
			const start = performance.now();
			await manager.sendTo(recipient);
			return performance.now() - start;
		};
		const known = await send("known@example.com");
		const unknown = await send("unknown@example.com");
		expect(unknown).toBeGreaterThanOrEqual(known - 30);
	});

	test("anti-enumeration: a malformed token fails identically for known and unknown recipients", async () => {
		const manager = magicLink(makeConfig());
		const issue = async (recipient: string) => {
			return manager.handleVerify(
				new Request("https://example.com/auth/magic-link/verify", {
					method: "POST",
					body: JSON.stringify({
						token: "AAAAAAAAAAAAAAAAAAAAAAAA.badvalidator",
						recipient,
					}),
					headers: { "Content-Type": "application/json" },
				}),
			);
		};
		const knownRes = await issue("known@example.com");
		const unknownRes = await issue("unknown@example.com");
		expect(knownRes.status).toBe(unknownRes.status);
		expect(await knownRes.text()).toBe(await unknownRes.text());
	});

	test("resend invalidation: a captured pre-resend link becomes INVALID, never verifies", async () => {
		const { manager, notifier, storage } = await issueLink();
		await manager.sendTo("known@example.com");
		const secondLink = notifier.emails[1]?.link as string;
		const secondToken = secondLink.split("t=")[1] as string;
		const firstLink = notifier.emails[0]?.link as string;
		const firstToken = firstLink.split("t=")[1] as string;
		expect(storage.entries().size).toBe(1);
		expect(firstToken).not.toBe(secondToken);
		await expect(manager.verify({ token: firstToken })).rejects.toMatchObject({
			code: ErrorCodes.MAGIC_LINK_INVALID,
		});
	});

	test("single-use: replay of a consumed token is rejected as USED, not accepted", async () => {
		const { manager, token } = await issueLink();
		await manager.verify({ token });
		await expect(manager.verify({ token })).rejects.toMatchObject({
			code: ErrorCodes.MAGIC_LINK_USED,
		});
	});

	test("TTL: an expired token is rejected as EXPIRED and removed (no retry window)", async () => {
		const { manager, storage, token } = await issueLink();
		const selector = token.split(".")[0] as string;
		const entry = storage.entries().get(`global:${selector}`) as StoreEntry;
		entry.expiresAt = Date.now() - 1;
		await expect(manager.verify({ token })).rejects.toMatchObject({
			code: ErrorCodes.MAGIC_LINK_EXPIRED,
		});
		expect(storage.entries().get(`global:${selector}`)).toBeUndefined();
	});

	test("per-recipient cooldown: resend bomb of a single recipient hits 429 (recipient limiter)", async () => {
		const manager = magicLink(
			makeConfig({
				requestLimit: {
					maxAttempts: 10,
					windowMs: 60_000,
					blockDurationMs: 60_000,
					storage: new TestBruteForceStorage(),
				},
				recipientLimit: {
					maxAttempts: 3,
					windowMs: 60_000,
					blockDurationMs: 60_000,
					storage: new TestBruteForceStorage(),
				},
			}),
		);
		await manager.sendTo("known@example.com");
		await manager.sendTo("known@example.com");
		await expect(manager.sendTo("known@example.com")).rejects.toMatchObject({
			code: ErrorCodes.RATE_LIMITED,
			statusCode: 429,
		});
	});

	test("different recipients do not share failure state (per-recipient keys)", async () => {
		const manager = magicLink(
			makeConfig({
				requestLimit: {
					maxAttempts: 10,
					windowMs: 60_000,
					blockDurationMs: 60_000,
					storage: new TestBruteForceStorage(),
				},
				recipientLimit: {
					maxAttempts: 3,
					windowMs: 60_000,
					blockDurationMs: 60_000,
					storage: new TestBruteForceStorage(),
				},
			}),
		);
		await manager.sendTo("known-a@example.com");
		await manager.sendTo("known-a@example.com");
		const result = await manager.sendTo("known-b@example.com");
		expect(result.processed).toBe(true);
	});
});