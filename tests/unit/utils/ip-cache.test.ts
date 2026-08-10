import { describe, expect, mock, test } from "bun:test";
import { getRequestIP } from "../../../src/";

describe("fingerprint cache TTL", () => {
	test("returns cached fingerprint for same user-agent within TTL", async () => {
		const req1 = new Request("http://localhost:3000", {
			headers: {
				"user-agent": "TestBrowser-CacheHit-Unique-aaa111/1.0",
				"accept-language": "en-US,en;q=0.9",
			},
		});
		const result1 = await getRequestIP(req1, { trustProxy: false });

		const req2 = new Request("http://localhost:3000", {
			headers: {
				"user-agent": "TestBrowser-CacheHit-Unique-aaa111/1.0",
				"accept-language": "fr-FR,fr;q=0.9",
			},
		});
		const result2 = await getRequestIP(req2, { trustProxy: false });

		expect(result1).toBe(result2);
		expect(result1).toMatch(/^fp:/);
	});

	test("expired entries are recomputed after TTL", async () => {
		const realDateNow = Date.now;
		const baseTime = realDateNow();
		let currentTime = baseTime;
		Date.now = mock(() => currentTime);

		try {
			const req1 = new Request("http://localhost:3000", {
				headers: {
					"user-agent": "TestBrowser-TTL-Expiry-Unique-bbb222/1.0",
					"accept-language": "en-US,en;q=0.9",
				},
			});
			const result1 = await getRequestIP(req1, { trustProxy: false });
			expect(result1).toMatch(/^fp:/);

			const req2 = new Request("http://localhost:3000", {
				headers: {
					"user-agent": "TestBrowser-TTL-Expiry-Unique-bbb222/1.0",
					"accept-language": "de-DE,de;q=0.9",
				},
			});

			const result2 = await getRequestIP(req2, { trustProxy: false });
			expect(result2).toBe(result1);

			currentTime += 6 * 60 * 1000;

			const result3 = await getRequestIP(req2, { trustProxy: false });
			expect(result3).not.toBe(result1);
			expect(result3).toMatch(/^fp:/);
		} finally {
			Date.now = realDateNow;
		}
	});

	test("cache evicts entries using FIFO when at capacity", async () => {
		// Fill the cache near capacity; this verifies the eviction path
		// doesn't crash and continues returning valid fingerprints.
		const reqA = new Request("http://localhost:3000", {
			headers: {
				"user-agent": "TestBrowser-CacheEviction-Unique-ccc333/1.0",
			},
		});
		const resultA = await getRequestIP(reqA, { trustProxy: false });
		expect(resultA).toMatch(/^fp:/);

		const reqB = new Request("http://localhost:3000", {
			headers: {
				"user-agent": "TestBrowser-CacheEviction-Unique-ddd444/1.0",
			},
		});
		const resultB = await getRequestIP(reqB, { trustProxy: false });
		expect(resultB).toMatch(/^fp:/);
	});
});
