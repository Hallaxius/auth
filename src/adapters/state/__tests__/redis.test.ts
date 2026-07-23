import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { RedisStateStore, ResilientRedisStateStore } from "../redis";

let mockRedisClient: any;

beforeEach(() => {
	mockRedisClient = {
		connect: vi.fn().mockResolvedValue(undefined),
		quit: vi.fn().mockResolvedValue(undefined),
		exists: vi.fn().mockResolvedValue(1),
		set: vi.fn().mockResolvedValue("OK"),
		eval: vi.fn().mockResolvedValue("OK"),
		del: vi.fn().mockResolvedValue(1),
		on: vi.fn(),
	};

	vi.mock("redis", () => ({
		createClient: vi.fn(() => mockRedisClient),
	}));
});

describe("RedisStateStore", () => {
	let store: RedisStateStore;

	beforeEach(() => {
		vi.clearAllMocks();
		store = new RedisStateStore({ url: "redis://localhost:6379" });
	});

	afterEach(async () => {
		await store.disconnect();
	});

	test("should initialize with default options", () => {
		const defaultStore = new RedisStateStore();
		expect(defaultStore).toBeDefined();
	});

	test("should use custom key prefix", () => {
		const customStore = new RedisStateStore({ keyPrefix: "custom:prefix:" });
		expect(customStore).toBeDefined();
	});

	test("has() should check if key exists", async () => {
		mockRedisClient.exists.mockResolvedValue(1);
		const result = await store.has("test-id");
		expect(result).toBe(true);
		expect(mockRedisClient.exists).toHaveBeenCalledWith("auth:state:test-id");
	});

	test("has() should return false when key does not exist", async () => {
		mockRedisClient.exists.mockResolvedValue(0);
		const result = await store.has("non-existent");
		expect(result).toBe(false);
	});

	test("set() should store key with TTL", async () => {
		await store.set("test-id", 300000);
		expect(mockRedisClient.set).toHaveBeenCalledWith(
			"auth:state:test-id",
			"1",
			{ PX: 300000 },
		);
	});

	test("setIfAbsent() should use Lua script for atomicity", async () => {
		mockRedisClient.eval.mockResolvedValue("OK");
		const result = await store.setIfAbsent("test-id", 300000);
		expect(result).toBe(true);
		expect(mockRedisClient.eval).toHaveBeenCalledWith(
			expect.stringContaining("redis.call('EXISTS'"),
			{
				keys: ["auth:state:test-id"],
				values: ["1", "300000"],
			},
		);
	});

	test("setIfAbsent() should return false when key already exists", async () => {
		mockRedisClient.eval.mockResolvedValue(null);
		const result = await store.setIfAbsent("existing-id", 300000);
		expect(result).toBe(false);
	});

	test("delete() should remove key", async () => {
		await store.delete("test-id");
		expect(mockRedisClient.del).toHaveBeenCalledWith("auth:state:test-id");
	});

	test("should handle connection errors gracefully", async () => {
		const connectError = new Error("Connection refused");
		mockRedisClient.connect.mockRejectedValue(connectError);

		const failingStore = new RedisStateStore({ url: "redis://invalid:6379" });

		await expect(failingStore.has("test")).rejects.toThrow(
			"Connection refused",
		);
	});

	test("should reuse existing connection", async () => {
		await store.has("test-1");
		await store.has("test-2");
		expect(mockRedisClient.connect).toHaveBeenCalledTimes(1);
	});
});

describe("ResilientRedisStateStore", () => {
	let resilientStore: ResilientRedisStateStore;
	let mockFallback: any;

	beforeEach(() => {
		vi.clearAllMocks();
		mockFallback = {
			has: vi.fn().mockResolvedValue(false),
			set: vi.fn().mockResolvedValue(undefined),
			setIfAbsent: vi.fn().mockResolvedValue(true),
			delete: vi.fn().mockResolvedValue(undefined),
		};
		resilientStore = new ResilientRedisStateStore(
			{ url: "redis://localhost:6379" },
			mockFallback,
		);
	});

	afterEach(async () => {
		await resilientStore.disconnect();
	});

	test("should use fallback when Redis fails", async () => {
		const redisError = new Error("Redis down");
		mockRedisClient.has = vi.fn().mockRejectedValue(redisError);

		const result = await resilientStore.has("test-id");

		expect(result).toBe(false);
		expect(mockFallback.has).toHaveBeenCalledWith("test-id");
	});

	test("should open circuit breaker on failure", async () => {
		const redisError = new Error("Redis down");
		mockRedisClient.set = vi.fn().mockRejectedValue(redisError);

		await resilientStore.set("test-id", 300000);

		expect(mockFallback.set).toHaveBeenCalled();
		expect((resilientStore as any).circuitOpen).toBe(true);
	});

	test("should retry failed operations with exponential backoff", async () => {
		const tempError = new Error("Temporary error");
		mockRedisClient.set = vi
			.fn()
			.mockRejectedValueOnce(tempError)
			.mockRejectedValueOnce(tempError)
			.mockResolvedValueOnce("OK");

		await resilientStore.set("test-id", 300000);

		expect(mockRedisClient.set).toHaveBeenCalledTimes(3);
	});

	test("should close circuit breaker after timeout", async () => {
		vi.useFakeTimers();
		const redisError = new Error("Redis down");
		mockRedisClient.set = vi.fn().mockRejectedValue(redisError);

		await resilientStore.set("test-id", 300000);
		expect((resilientStore as any).circuitOpen).toBe(true);

		vi.advanceTimersByTime(30000);
		expect((resilientStore as any).circuitOpen).toBe(false);

		vi.useRealTimers();
	});

	test("should use fallback when circuit is open", async () => {
		(resilientStore as any).circuitOpen = true;

		await resilientStore.setIfAbsent("test-id", 300000);

		expect(mockFallback.setIfAbsent).toHaveBeenCalledWith("test-id", 300000);
		expect(mockRedisClient.eval).not.toHaveBeenCalled();
	});

	test("should attempt to reconnect after circuit timeout", async () => {
		vi.useFakeTimers();

		const redisError = new Error("Redis down");
		mockRedisClient.set = vi.fn().mockRejectedValueOnce(redisError);
		await resilientStore.set("test-id", 300000);

		vi.advanceTimersByTime(30000);

		mockRedisClient.set = vi.fn().mockResolvedValue("OK");
		await resilientStore.set("test-id-2", 300000);

		expect(mockRedisClient.set).toHaveBeenCalledTimes(2);

		vi.useRealTimers();
	});
});
