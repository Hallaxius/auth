import { describe, expect, test } from "bun:test";
import { SignJWT, jwtVerify } from "jose";
import { rotateToken } from "../../../src/internal/jwt-rotation";
import { secretToKey } from "../../../src/internal/jwt";

const SECRET =
	"5K8qN2mR9pL3vX7wJ4tY6hF1dS0aG8bC2eU5iO9xM3nZ7kV4rW1qP6yT0uI8oA2";

async function sign(payload: Record<string, unknown>): Promise<string> {
	return new SignJWT(payload)
		.setProtectedHeader({ alg: "HS256" })
		.sign(secretToKey(SECRET));
}

async function tokenLifetime(token: string): Promise<number> {
	const { payload } = await jwtVerify(token, secretToKey(SECRET), {
		algorithms: ["HS256"],
	});
	return (payload.exp as number) - (payload.iat as number);
}

describe("rotateToken without iat claim", () => {
	test("produces a finite 15m lifetime when iat is missing", async () => {
		const now = Math.floor(Date.now() / 1000);
		const oldToken = await sign({ sub: "user-1", exp: now + 3600 });

		const rotated = await rotateToken(oldToken, SECRET);

		expect(rotated).not.toBeNull();
		const lifetime = await tokenLifetime(rotated!);
		expect(Number.isNaN(lifetime)).toBe(false);
		expect(lifetime).toBe(15 * 60);
	});

	test("preserves the original duration when iat exists", async () => {
		const now = Math.floor(Date.now() / 1000);
		const oldToken = await sign({
			sub: "user-1",
			iat: now - 3540,
			exp: now + 60,
		});

		const rotated = await rotateToken(oldToken, SECRET);

		expect(rotated).not.toBeNull();
		const lifetime = await tokenLifetime(rotated!);
		expect(lifetime).toBe(3600);
	});

	test("falls back to 15m when exp minus iat is non-positive", async () => {
		const now = Math.floor(Date.now() / 1000);
		const oldToken = await sign({
			sub: "user-1",
			iat: now + 60,
			exp: now + 30,
		});

		const rotated = await rotateToken(oldToken, SECRET);

		expect(rotated).not.toBeNull();
		const lifetime = await tokenLifetime(rotated!);
		expect(lifetime).toBe(15 * 60);
	});
});