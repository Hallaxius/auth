import { describe, test, expect, mock } from "bun:test";
import { RedisBruteForceStore } from "../brute-force";

// Mock Redis client
const createMockRedis = () => {
	const store = new Map<string, string>();
	return {
		incr: mock(async (key: string) => {
			const current = store.get(key);
			const newValue = current ? parseInt(current) + 1 : 1;
			store.set(key, newValue.toString());
			return newValue;
		}),
		expire: mock(async (key: string, ttl: number) => {
			// Mock TTL behavior
		}),
		exists: mock(async (key: string) => (store.has(key) ? 1 : 0)),
		set: mock(async (key: string, value: string, mode: string, ttl: number) => {
			store.set(key, value);
		}),
		get: mock(async (key: string) => store.get(key) ?? null),
		del: mock(async (keys: string | string[]) => {
			if (Array.isArray(keys)) {
				keys.forEach((k) => store.delete(k));
			} else {
				store.delete(keys);
			}
		}),
		// For inspection
		_store: store,
	};
};

describe("RedisBruteForceStore", () => {
	test("increment() returns 1 for first attempt", async () => {
		const mockRedis = createMockRedis() as any;
		const store = new RedisBruteForceStore({ client: mockRedis, prefix: "test" });

		const count = await store.increment("user123", 900000); // 15 minutes
		expect(count).toBe(1);
	});

	test("increment() increases count on subsequent calls", async () => {
		const mockRedis = createMockRedis() as any;
		const store = new RedisBruteForceStore({ client: mockRedis, prefix: "test" });

		const count1 = await store.increment("user123", 900000);
		const count2 = await store.increment("user123", 900000);
		const count3 = await store.increment("user123", 900000);

		expect(count1).toBe(1);
		expect(count2).toBe(2);
		expect(count3).toBe(3);
	});

	test("isBlocked() returns false when not blocked", async () => {
		const mockRedis = createMockRedis() as any;
		const store = new RedisBruteForceStore({ client: mockRedis, prefix: "test" });

		const blocked = await store.isBlocked("user123");
		expect(blocked).toBe(false);
	});

	test("isBlocked() returns true after block()", async () => {
		const mockRedis = createMockRedis() as any;
		const store = new RedisBruteForceStore({ client: mockRedis, prefix: "test" });

		await store.block("user123", 1800000); // 30 minutes
		const blocked = await store.isBlocked("user123");
		expect(blocked).toBe(true);
	});

	test("reset() clears count and block", async () => {
		const mockRedis = createMockRedis() as any;
		const store = new RedisBruteForceStore({ client: mockRedis, prefix: "test" });

		await store.increment("user123", 900000);
		await store.block("user123", 1800000);
		await store.reset("user123");

		const count = await store.getCount("user123");
		const blocked = await store.isBlocked("user123");
		expect(count).toBe(0);
		expect(blocked).toBe(false);
	});

	test("getCount() returns current attempt count", async () => {
		const mockRedis = createMockRedis() as any;
		const store = new RedisBruteForceStore({ client: mockRedis, prefix: "test" });

		await store.increment("user123", 900000);
		await store.increment("user123", 900000);
		const count = await store.getCount("user123");
		expect(count).toBe(2);
	});

	test("getCount() returns 0 for non-existent key", async () => {
		const mockRedis = createMockRedis() as any;
		const store = new RedisBruteForceStore({ client: mockRedis, prefix: "test" });

		const count = await store.getCount("nonexistent");
		expect(count).toBe(0);
	});

	test("uses custom prefix when provided", async () => {
		const mockRedis = createMockRedis() as any;
		const store = new RedisBruteForceStore({ client: mockRedis, prefix: "custom" });

		await store.block("user123", 1800000);

		expect(mockRedis.set).toHaveBeenCalledWith("custom:block:user123", "1", "EX", 1800);
	});

	test("uses default prefix when not provided", async () => {
		const mockRedis = createMockRedis() as any;
		const store = new RedisBruteForceStore({ client: mockRedis });

		await store.block("user123", 1800000);

		expect(mockRedis.set).toHaveBeenCalledWith("auth:bf:block:user123", "1", "EX", 1800);
	});
});