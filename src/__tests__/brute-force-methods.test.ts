import { describe, expect, test } from "vitest";
import { BruteForceProtection, MemoryBruteForceStorage } from "../credentials";

describe("BruteForceProtection - getRemainingAttempts coverage", () => {
	test("getRemainingAttempts calculates remaining when not blocked", async () => {
		const storage = new MemoryBruteForceStorage();
		const bf = new BruteForceProtection({
			enabled: true,
			maxAttempts: 5,
			windowMs: 60000,
			blockDurationMs: 60000,
			storage,
		});

		const key = "remaining-test";
		await storage.increment(key, 60000);
		await storage.increment(key, 60000);

		const remaining = await bf.getRemainingAttempts(key);
		expect(remaining).toBe(3);
	});

	test("getRemainingAttempts returns 0 when count exceeds maxAttempts", async () => {
		const storage = new MemoryBruteForceStorage();
		const bf = new BruteForceProtection({
			enabled: true,
			maxAttempts: 3,
			windowMs: 60000,
			blockDurationMs: 60000,
			storage,
		});

		const key = "exceeded-test";
		await storage.increment(key, 60000);
		await storage.increment(key, 60000);
		await storage.increment(key, 60000);
		await storage.increment(key, 60000);
		await storage.increment(key, 60000);

		const remaining = await bf.getRemainingAttempts(key);
		expect(remaining).toBe(0);
	});

	test("getRemainingAttempts returns maxAttempts when enabled is false", async () => {
		const bf = new BruteForceProtection({
			enabled: false,
			maxAttempts: 10,
			windowMs: 60000,
			blockDurationMs: 60000,
		});

		const remaining = await bf.getRemainingAttempts("any-key");
		expect(remaining).toBe(10);
	});
});

describe("BruteForceProtection - reset coverage", () => {
	test("reset calls storage.reset when enabled", async () => {
		const storage = new MemoryBruteForceStorage();
		const bf = new BruteForceProtection({
			enabled: true,
			maxAttempts: 5,
			windowMs: 60000,
			blockDurationMs: 60000,
			storage,
		});

		const key = "reset-test";
		await storage.increment(key, 60000);
		await storage.block(key, 60000);

		await bf.reset(key);

		const count = await storage.getCount(key);
		expect(count).toBe(0);

		const blocked = await storage.isBlocked(key);
		expect(blocked).toBe(false);
	});

	test("reset does nothing when disabled", async () => {
		const _storage = new MemoryBruteForceStorage();
		const bf = new BruteForceProtection({
			enabled: false,
			maxAttempts: 5,
			windowMs: 60000,
			blockDurationMs: 60000,
		});

		await expect(bf.reset("any-key")).resolves.toBeUndefined();
	});
});

describe("BruteForceProtection - getRetryAfter coverage", () => {
	test("getRetryAfter returns blockDurationMs when enabled", async () => {
		const bf = new BruteForceProtection({
			enabled: true,
			maxAttempts: 5,
			windowMs: 60000,
			blockDurationMs: 45678,
		});

		const retryAfter = await bf.getRetryAfter("test-key");
		expect(retryAfter).toBe(45678);
	});

	test("getRetryAfter returns undefined when disabled", async () => {
		const bf = new BruteForceProtection({
			enabled: false,
			maxAttempts: 5,
			windowMs: 60000,
			blockDurationMs: 60000,
		});

		const retryAfter = await bf.getRetryAfter("test-key");
		expect(retryAfter).toBeUndefined();
	});
});

describe("BruteForceProtection - recordAttempt coverage", () => {
	test("recordAttempt resets on success", async () => {
		const storage = new MemoryBruteForceStorage();
		const bf = new BruteForceProtection({
			enabled: true,
			maxAttempts: 5,
			windowMs: 60000,
			blockDurationMs: 60000,
			storage,
		});

		const key = "success-test";
		await storage.increment(key, 60000);
		await storage.increment(key, 60000);

		await bf.recordAttempt(key, true);

		const count = await storage.getCount(key);
		expect(count).toBe(0);
	});

	test("recordAttempt blocks after maxAttempts", async () => {
		const storage = new MemoryBruteForceStorage();
		const bf = new BruteForceProtection({
			enabled: true,
			maxAttempts: 2,
			windowMs: 60000,
			blockDurationMs: 60000,
			storage,
		});

		const key = "block-test";
		await bf.recordAttempt(key, false);
		await bf.recordAttempt(key, false);

		const blocked = await storage.isBlocked(key);
		expect(blocked).toBe(true);
	});

	test("recordAttempt does nothing when disabled", async () => {
		const _storage = new MemoryBruteForceStorage();
		const bf = new BruteForceProtection({
			enabled: false,
			maxAttempts: 5,
			windowMs: 60000,
			blockDurationMs: 60000,
		});

		await expect(bf.recordAttempt("key", false)).resolves.toBeUndefined();
	});
});

describe("BruteForceProtection - isBlocked coverage", () => {
	test("isBlocked returns false when disabled", async () => {
		const bf = new BruteForceProtection({
			enabled: false,
			maxAttempts: 5,
			windowMs: 60000,
			blockDurationMs: 60000,
		});

		const blocked = await bf.isBlocked("any-key");
		expect(blocked).toBe(false);
	});

	test("isBlocked returns true when blocked", async () => {
		const storage = new MemoryBruteForceStorage();
		const bf = new BruteForceProtection({
			enabled: true,
			maxAttempts: 5,
			windowMs: 60000,
			blockDurationMs: 60000,
			storage,
		});

		const key = "isblocked-test";
		await storage.block(key, 60000);

		const blocked = await bf.isBlocked(key);
		expect(blocked).toBe(true);
	});
});
