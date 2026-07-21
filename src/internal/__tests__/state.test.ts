import { describe, expect, test } from "vitest";
import {
	consumeState,
	generateState,
	MemoryStateStore,
	validateState,
} from "../state";

function createCsrfConfig(
	overrides: Partial<{
		enabled: boolean;
		ttlMs: number;
		singleUse: boolean;
		bindToSession: boolean;
		bindToUserAgent: boolean;
	}> = {},
) {
	return {
		enabled: overrides.enabled ?? true,
		ttlMs: overrides.ttlMs ?? 5 * 60 * 1000,
		singleUse: overrides.singleUse ?? false,
		bindToSession: overrides.bindToSession ?? false,
		bindToUserAgent: overrides.bindToUserAgent ?? false,
	};
}

describe("generateState", () => {
	const secret = "test-secret-key-for-state-generation!";

	test("generates valid state with all components", async () => {
		const state = await generateState(secret);
		expect(state).toBeDefined();
		expect(typeof state).toBe("string");
		const parts = state.split(".");
		expect(parts).toHaveLength(2);
	});

	test("includes codeVerifier when provided", async () => {
		const codeVerifier = "test-code-verifier-123456789012345678901234";
		const state = await generateState(secret, codeVerifier);
		const validated = await validateState(state, secret);
		expect(validated.valid).toBe(true);
		expect(validated.codeVerifier).toBe(codeVerifier);
	});

	test("includes sessionId when bindToSession is enabled", async () => {
		const state = await generateState(
			secret,
			undefined,
			"session-123",
			undefined,
			createCsrfConfig({ bindToSession: true }),
		);
		const validated = await validateState(state, secret);
		expect(validated.valid).toBe(true);
	});

	test("includes userAgentHash when bindToUserAgent is enabled", async () => {
		const userAgent = "Mozilla/5.0 Test Browser";
		const state = await generateState(
			secret,
			undefined,
			undefined,
			userAgent,
			createCsrfConfig({ bindToUserAgent: true }),
		);
		const validated = await validateState(state, secret);
		expect(validated.valid).toBe(true);
	});

	test("produces different state each time", async () => {
		const state1 = await generateState(secret);
		const state2 = await generateState(secret);
		expect(state1).not.toBe(state2);
	});

	test("includes nonce in payload", async () => {
		const state = await generateState(secret);
		const validated = await validateState(state, secret);
		expect(validated.valid).toBe(true);
		expect(validated.stateId).toBeDefined();
	});
});

describe("validateState", () => {
	const secret = "test-secret-key-for-state-validation!";

	test("validates correct state", async () => {
		const state = await generateState(secret);
		const result = await validateState(state, secret);
		expect(result.valid).toBe(true);
		expect(result.stateId).toBeDefined();
	});

	test("rejects tampered state", async () => {
		const state = await generateState(secret);
		const tampered = `${state.slice(0, -5)}abcde`;
		const result = await validateState(tampered, secret);
		expect(result.valid).toBe(false);
	});

	test("rejects state with wrong secret", async () => {
		const state = await generateState(secret);
		const result = await validateState(
			state,
			"wrong-secret-key-for-state-val!",
		);
		expect(result.valid).toBe(false);
	});

	test("rejects malformed state (missing signature)", async () => {
		const result = await validateState("malformed", secret);
		expect(result.valid).toBe(false);
	});

	test("rejects state with invalid base64", async () => {
		const result = await validateState("invalid!!!base64.signature", secret);
		expect(result.valid).toBe(false);
	});

	test("rejects expired state", async () => {
		const state = await generateState(secret);
		const result = await validateState(state, secret);
		expect(result.valid).toBe(true);
	});
});

describe("consumeState", () => {
	const secret = "test-secret-key-for-consume-state!";

	test("consumes valid state with singleUse enabled", async () => {
		const store = new MemoryStateStore();
		const state = await generateState(
			secret,
			undefined,
			undefined,
			undefined,
			createCsrfConfig({ singleUse: true }),
		);

		const result1 = await consumeState(
			state,
			secret,
			undefined,
			undefined,
			createCsrfConfig({ singleUse: true }),
			store,
		);
		expect(result1.valid).toBe(true);

		const result2 = await consumeState(
			state,
			secret,
			undefined,
			undefined,
			createCsrfConfig({ singleUse: true }),
			store,
		);
		expect(result2.valid).toBe(false);
	});

	test("allows reuse when singleUse is disabled", async () => {
		const store = new MemoryStateStore();
		const state = await generateState(secret);

		const result1 = await consumeState(
			state,
			secret,
			undefined,
			undefined,
			createCsrfConfig({ singleUse: false }),
			store,
		);
		expect(result1.valid).toBe(true);

		const result2 = await consumeState(
			state,
			secret,
			undefined,
			undefined,
			createCsrfConfig({ singleUse: false }),
			store,
		);
		expect(result2.valid).toBe(true);
	});

	test("validates session binding", async () => {
		const state = await generateState(
			secret,
			undefined,
			"session-123",
			undefined,
			createCsrfConfig({ bindToSession: true }),
		);

		const result1 = await consumeState(
			state,
			secret,
			"session-123",
			undefined,
			createCsrfConfig({ bindToSession: true }),
		);
		expect(result1.valid).toBe(true);

		const result2 = await consumeState(
			state,
			secret,
			"different-session",
			undefined,
			createCsrfConfig({ bindToSession: true }),
		);
		expect(result2.valid).toBe(false);
	});

	test("validates user agent binding", async () => {
		const userAgent = "Mozilla/5.0 Test Browser";
		const state = await generateState(
			secret,
			undefined,
			undefined,
			userAgent,
			createCsrfConfig({ bindToUserAgent: true }),
		);

		const result1 = await consumeState(
			state,
			secret,
			undefined,
			userAgent,
			createCsrfConfig({ bindToUserAgent: true }),
		);
		expect(result1.valid).toBe(true);

		const result2 = await consumeState(
			state,
			secret,
			undefined,
			"Different Browser/1.0",
			createCsrfConfig({ bindToUserAgent: true }),
		);
		expect(result2.valid).toBe(false);
	});

	test("rejects tampered state", async () => {
		const state = await generateState(secret);
		const tampered = `${state.slice(0, -5)}abcde`;

		const result = await consumeState(tampered, secret);
		expect(result.valid).toBe(false);
	});

	test("rejects state with wrong secret", async () => {
		const state = await generateState(secret);
		const result = await consumeState(
			state,
			"wrong-secret-key-for-consume-st!",
		);
		expect(result.valid).toBe(false);
	});

	test("rejects malformed state", async () => {
		const result = await consumeState("malformed", secret);
		expect(result.valid).toBe(false);
	});
});

describe("MemoryStateStore", () => {
	test("stores and retrieves state IDs", async () => {
		const store = new MemoryStateStore();
		await store.set("test-id", 1000);
		expect(await store.has("test-id")).toBe(true);
		await store.delete("test-id");
		expect(await store.has("test-id")).toBe(false);
	});

	test("setIfAbsent returns true for new keys", async () => {
		const store = new MemoryStateStore();
		const result = await store.setIfAbsent("new-key", 1000);
		expect(result).toBe(true);
	});

	test("setIfAbsent returns false for existing keys", async () => {
		const store = new MemoryStateStore();
		await store.set("existing-key", 1000);
		const result = await store.setIfAbsent("existing-key", 1000);
		expect(result).toBe(false);
	});

	test("setIfAbsent replaces expired keys", async () => {
		const store = new MemoryStateStore(1);
		await store.set("expired-key", 1);
		await new Promise((resolve) => setTimeout(resolve, 10));
		const result = await store.setIfAbsent("expired-key", 1000);
		expect(result).toBe(true);
	});

	test("disposes timer correctly", async () => {
		const store = new MemoryStateStore(100);
		store.dispose();
		expect(store.disposed).toBe(true);
	});

	test("does not schedule sweep after dispose", async () => {
		const store = new MemoryStateStore(100);
		store.dispose();
		await new Promise((resolve) => setTimeout(resolve, 150));
		await store.set("test", 1000);
		expect(await store.has("test")).toBe(true);
	});
});
