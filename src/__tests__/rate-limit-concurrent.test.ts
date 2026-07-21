import { describe, expect, test } from "vitest";
import { DefaultRateLimitStorage } from "../rate-limit";

describe("DefaultRateLimitStorage - concurrent access", () => {
	test("withLock handles concurrent access safely", async () => {
		const storage = new DefaultRateLimitStorage();
		const key = "concurrent-test";

		const results = await Promise.all(
			[1, 2, 3, 4, 5].map(() => storage.increment(key, 60000)),
		);

		const finalCount = results[results.length - 1].count;
		expect(finalCount).toBe(5);

		storage.dispose();
	});

	test("withLock handles multiple concurrent increments correctly", async () => {
		const storage = new DefaultRateLimitStorage();
		const key = "stress-test";

		const operations = Array.from({ length: 10 }, (_, i) => i);
		const results = await Promise.all(
			operations.map((id) =>
				storage.increment(key, 60000).then((r) => ({ id, count: r.count })),
			),
		);

		const counts = results.map((r) => r.count).sort((a, b) => a - b);
		expect(counts.length).toBe(10);
		expect(counts[9]).toBe(10);

		storage.dispose();
	});
});
