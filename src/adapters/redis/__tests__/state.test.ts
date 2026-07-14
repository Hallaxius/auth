import { describe, test, expect, mock } from "bun:test";
import { RedisStateStore } from "../state";

// Mock Redis client
const createMockRedis = () => {
	const store = new Map<string, string>();
	return {
		exists: mock(async (key: string) => (store.has(key) ? 1 : 0)),
		set: mock(async (key: string, value: string, mode: string, ttl: number) => {
			store.set(key, value);
		}),
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

describe("RedisStateStore", () => {
	test("has() returns false for non-existent key", async () => {
		const mockRedis = createMockRedis() as any;
		const store = new RedisStateStore({ client: mockRedis, prefix: "test" });

		const result = await store.has("nonexistent");
		expect(result).toBe(false);
	});

	test("has() returns true for existing key", async () => {
		const mockRedis = createMockRedis() as any;
		const store = new RedisStateStore({ client: mockRedis, prefix: "test" });

		await store.set("test-id", 300000);
		const result = await store.has("test-id");
		expect(result).toBe(true);
	});

	test("set() creates key with TTL", async () => {
		const mockRedis = createMockRedis() as any;
		const store = new RedisStateStore({ client: mockRedis, prefix: "test" });

		await store.set("test-id", 300000); // 5 minutes

		expect(mockRedis.set).toHaveBeenCalledWith("test:test-id", "1", "EX", 300);
	});

	test("delete() removes key", async () => {
		const mockRedis = createMockRedis() as any;
		const store = new RedisStateStore({ client: mockRedis, prefix: "test" });

		await store.set("test-id", 300000);
		await store.delete("test-id");

		expect(mockRedis.del).toHaveBeenCalledWith("test:test-id");
		const exists = await store.has("test-id");
		expect(exists).toBe(false);
	});

	test("uses custom prefix when provided", async () => {
		const mockRedis = createMockRedis() as any;
		const store = new RedisStateStore({ client: mockRedis, prefix: "custom:prefix" });

		await store.set("id123", 60000);

		expect(mockRedis.set).toHaveBeenCalledWith("custom:prefix:id123", "1", "EX", 60);
	});

	test("uses default prefix when not provided", async () => {
		const mockRedis = createMockRedis() as any;
		const store = new RedisStateStore({ client: mockRedis });

		await store.set("id123", 60000);

		expect(mockRedis.set).toHaveBeenCalledWith("auth:state:id123", "1", "EX", 60);
	});
});