import { describe, expect, test } from "bun:test";
import { combine } from "../middleware-combine";

describe("combine", () => {
	test("returns undefined when all pass", async () => {
		const mw = combine(
			async () => undefined,
			async () => undefined,
		);
		const result = await mw(new Request("http://localhost"));
		expect(result).toBeUndefined();
	});

	test("stops at first middleware that returns a Response", async () => {
		const mw = combine(
			async () => new Response("blocked", { status: 403 }),
			async () => {
				throw new Error("should not reach here");
			},
		);
		const result = await mw(new Request("http://localhost"));
		expect(result).not.toBeUndefined();
		expect(result?.status).toBe(403);
	});

	test("handles synchronous middlewares", () => {
		const mw = combine(
			() => undefined,
			() => new Response("ok"),
		);
		const result = mw(new Request("http://localhost"));
		expect(result).not.toBeUndefined();
	});

	test("empty middleware list returns undefined", async () => {
		const mw = combine();
		const result = await mw(new Request("http://localhost"));
		expect(result).toBeUndefined();
	});
});
