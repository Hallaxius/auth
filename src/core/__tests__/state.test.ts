import { describe, expect, it } from "bun:test";
import { generateState, validateState } from "../state";

const SECRET = "super-secret-key-12345";

describe("generateState", () => {
	it("produces a string with two parts separated by a dot", async () => {
		const state = await generateState(SECRET);
		const parts = state.split(".");
		expect(parts).toHaveLength(2);
		expect(parts[0]).toBeTruthy();
		expect(parts[1]).toBeTruthy();
	});

	it("produces different states on each call", async () => {
		const [a, b] = await Promise.all([
			generateState(SECRET),
			generateState(SECRET),
		]);
		expect(a).not.toBe(b);
	});

	it("produces a URL-safe base64 string", async () => {
		const state = await generateState(SECRET);
		// Should not contain + / or =
		expect(state).not.toContain("+");
		expect(state).not.toContain("/");
		expect(state).not.toContain("=");
	});

	it("does not contain the original secret", async () => {
		const state = await generateState(SECRET);
		expect(state).not.toContain(SECRET);
	});
});

describe("validateState", () => {
	it("returns true for a valid state", async () => {
		const state = await generateState(SECRET);
		const result = await validateState(state, SECRET);
		expect(result.valid).toBe(true);
	});

	it("returns false if the signature was tampered with", async () => {
		const state = await generateState(SECRET);
		const parts = state.split(".");
		const tampered = `${parts[0]}.tampered-signature`;
		const result = await validateState(tampered, SECRET);
		expect(result.valid).toBe(false);
	});

	it("returns false if the encoded payload was tampered with", async () => {
		const state = await generateState(SECRET);
		const parts = state.split(".");
		const tampered = `dGFtcGVyZWQ.${parts[1]}`;
		const result = await validateState(tampered, SECRET);
		expect(result.valid).toBe(false);
	});

	it("returns false for a malformed input (no dot)", async () => {
		const result = await validateState("no-dot-here", SECRET);
		expect(result.valid).toBe(false);
	});

	it("returns false for an empty string", async () => {
		const result = await validateState("", SECRET);
		expect(result.valid).toBe(false);
	});

	it("returns false when using a different secret", async () => {
		const state = await generateState(SECRET);
		const result = await validateState(state, "different-secret");
		expect(result.valid).toBe(false);
	});

	it("returns false for an expired state", async () => {
		// Create a state with an expired timestamp
		const expiredPayload = JSON.stringify({
			id: crypto.randomUUID(),
			iat: Date.now() - 10 * 60 * 1000,
		});
		const encoded = btoa(expiredPayload)
			.replace(/=/g, "")
			.replace(/\+/g, "-")
			.replace(/\//g, "_");

		const key = await crypto.subtle.importKey(
			"raw",
			new TextEncoder().encode(SECRET),
			{ name: "HMAC", hash: "SHA-256" },
			false,
			["sign"],
		);
		const sig = await crypto.subtle.sign(
			"HMAC",
			key,
			new TextEncoder().encode(encoded),
		);
		const sigStr = btoa(String.fromCharCode(...new Uint8Array(sig)))
			.replace(/=/g, "")
			.replace(/\+/g, "-")
			.replace(/\//g, "_");

		const expiredState = `${encoded}.${sigStr}`;
		const result = await validateState(expiredState, SECRET);
		expect(result.valid).toBe(false);
	});
});
