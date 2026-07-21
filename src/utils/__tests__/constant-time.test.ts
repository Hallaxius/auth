import { describe, expect, it } from "vitest";
import {
	constantTimeCompare,
	constantTimeCompareHex,
	constantTimeCompareStrings,
} from "../constant-time";

describe("constantTimeCompare", () => {
	it("returns true for identical Uint8Arrays", () => {
		const a = new Uint8Array([1, 2, 3, 4, 5]);
		const b = new Uint8Array([1, 2, 3, 4, 5]);
		expect(constantTimeCompare(a, b)).toBe(true);
	});

	it("returns false for different Uint8Arrays of same length", () => {
		const a = new Uint8Array([1, 2, 3, 4, 5]);
		const b = new Uint8Array([1, 2, 3, 4, 6]);
		expect(constantTimeCompare(a, b)).toBe(false);
	});

	it("returns false for Uint8Arrays of different lengths", () => {
		const a = new Uint8Array([1, 2, 3, 4, 5]);
		const b = new Uint8Array([1, 2, 3, 4]);
		expect(constantTimeCompare(a, b)).toBe(false);
	});

	it("returns true for empty Uint8Arrays", () => {
		const a = new Uint8Array([]);
		const b = new Uint8Array([]);
		expect(constantTimeCompare(a, b)).toBe(true);
	});

	it("handles single byte arrays correctly", () => {
		const a = new Uint8Array([42]);
		const b = new Uint8Array([42]);
		expect(constantTimeCompare(a, b)).toBe(true);

		const c = new Uint8Array([42]);
		const d = new Uint8Array([43]);
		expect(constantTimeCompare(c, d)).toBe(false);
	});
});

describe("constantTimeCompareStrings", () => {
	it("returns true for identical strings", () => {
		expect(constantTimeCompareStrings("hello", "hello")).toBe(true);
	});

	it("returns false for different strings", () => {
		expect(constantTimeCompareStrings("hello", "world")).toBe(false);
	});

	it("returns false for strings of different lengths", () => {
		expect(constantTimeCompareStrings("hello", "hell")).toBe(false);
	});

	it("returns true for empty strings", () => {
		expect(constantTimeCompareStrings("", "")).toBe(true);
	});

	it("handles unicode characters correctly", () => {
		expect(constantTimeCompareStrings("héllo", "héllo")).toBe(true);
		expect(constantTimeCompareStrings("héllo", "hello")).toBe(false);
	});

	it("handles special characters", () => {
		const special = "!@#$%^&*()_+-=[]{}|;:,.<>?";
		expect(constantTimeCompareStrings(special, special)).toBe(true);
		expect(constantTimeCompareStrings(special, "different")).toBe(false);
	});
});

describe("constantTimeCompareHex", () => {
	it("returns true for identical hex strings", () => {
		expect(constantTimeCompareHex("a1b2c3", "a1b2c3")).toBe(true);
	});

	it("returns false for different hex strings", () => {
		expect(constantTimeCompareHex("a1b2c3", "a1b2c4")).toBe(false);
	});

	it("returns false for hex strings of different lengths", () => {
		expect(constantTimeCompareHex("a1b2c3", "a1b2")).toBe(false);
	});

	it("returns false for invalid hex strings (odd length)", () => {
		expect(constantTimeCompareHex("abc", "abc")).toBe(false);
		expect(constantTimeCompareHex("a1b2c", "a1b2c")).toBe(false);
	});

	it("returns false for invalid hex characters", () => {
		expect(constantTimeCompareHex("xyz", "xyz")).toBe(false);
		expect(constantTimeCompareHex("a1b2g", "a1b2g")).toBe(false);
	});

	it("returns true for empty hex strings", () => {
		expect(constantTimeCompareHex("", "")).toBe(true);
	});

	it("handles uppercase and lowercase hex correctly", () => {
		// Hex values are converted to bytes, so case doesn't matter for the actual value
		// "a1" and "A1" both become byte 0xA1
		expect(constantTimeCompareHex("a1b2c3", "a1b2c3")).toBe(true);
		expect(constantTimeCompareHex("A1B2C3", "A1B2C3")).toBe(true);
		expect(constantTimeCompareHex("a1b2c3", "A1B2C3")).toBe(true); // Same bytes
		expect(constantTimeCompareHex("AABBCC", "aabbcc")).toBe(true); // Same bytes
	});

	it("returns false for different hex values regardless of case", () => {
		expect(constantTimeCompareHex("a1b2c3", "a1b2c4")).toBe(false);
		expect(constantTimeCompareHex("A1B2C3", "A1B2C4")).toBe(false);
		expect(constantTimeCompareHex("A1b2C3", "a1B2c3")).toBe(true); // Same bytes
	});

	it("returns false when one is valid and other is invalid", () => {
		expect(constantTimeCompareHex("a1b2c3", "xyz")).toBe(false);
		expect(constantTimeCompareHex("abc", "a1b2c3")).toBe(false);
	});
});
