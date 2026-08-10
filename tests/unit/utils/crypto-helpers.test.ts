import { describe, expect, it } from "bun:test";
import { fromBase64URL, sha256, toBase64URL } from "../../../src/";

describe("sha256", () => {
	it("should hash empty string", async () => {
		const hash = await sha256("");
		expect(hash).toBe(
			"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
		);
		expect(hash.length).toBe(64);
	});

	it("should hash simple string", async () => {
		const hash = await sha256("hello");
		expect(hash).toBe(
			"2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
		);
	});

	it("should produce consistent hashes", async () => {
		const hash1 = await sha256("test");
		const hash2 = await sha256("test");
		expect(hash1).toBe(hash2);
	});

	it("should produce different hashes for different inputs", async () => {
		const hash1 = await sha256("test1");
		const hash2 = await sha256("test2");
		expect(hash1).not.toBe(hash2);
	});

	it("should handle unicode characters", async () => {
		const hash = await sha256("你好");
		expect(hash.length).toBe(64);
		expect(hash).toMatch(/^[0-9a-f]+$/);
	});

	it("should handle long strings", async () => {
		const longString = "a".repeat(10000);
		const hash = await sha256(longString);
		expect(hash.length).toBe(64);
	});
});

describe("toBase64URL / fromBase64URL", () => {
	it("should encode empty ArrayBuffer", () => {
		const encoded = toBase64URL(new ArrayBuffer(0));
		expect(encoded).toBe("");
	});

	it("should encode single byte", () => {
		const encoded = toBase64URL(new Uint8Array([65]).buffer as ArrayBuffer);
		expect(encoded).toBe("QQ");
	});

	it("should encode multiple bytes", () => {
		const data = new Uint8Array([72, 101, 108, 108, 111]);
		const encoded = toBase64URL(data.buffer as ArrayBuffer);
		expect(encoded).toBe("SGVsbG8");
	});

	it("should use URL-safe characters", () => {
		const data = new Uint8Array([255, 255, 255]);
		const encoded = toBase64URL(data.buffer as ArrayBuffer);
		expect(encoded).toBe("____");
		expect(encoded).not.toContain("+");
		expect(encoded).not.toContain("/");
	});

	it("should decode empty string", () => {
		const decoded = fromBase64URL("");
		expect(decoded).toEqual(new Uint8Array([]));
	});

	it("should decode single character", () => {
		const decoded = fromBase64URL("QQ");
		expect(decoded).toEqual(new Uint8Array([65]));
	});

	it("should decode multiple characters", () => {
		const decoded = fromBase64URL("SGVsbG8");
		expect(decoded).toEqual(new Uint8Array([72, 101, 108, 108, 111]));
	});

	it("should handle round-trip encode/decode", () => {
		const original = new Uint8Array([0, 64, 128, 192, 255]);
		const encoded = toBase64URL(original.buffer as ArrayBuffer);
		const decoded = fromBase64URL(encoded);
		expect(decoded).toEqual(original);
	});

	it("should handle URL-safe alphabet", () => {
		const data = new Uint8Array([0, 1, 2, 3, 252, 253, 254, 255]);
		const encoded = toBase64URL(data.buffer as ArrayBuffer);
		const decoded = fromBase64URL(encoded);
		expect(decoded).toEqual(data);
	});

	it("should handle padding-less encoding", () => {
		const data = new Uint8Array([1, 2, 3]);
		const encoded = toBase64URL(data.buffer as ArrayBuffer);
		expect(encoded).not.toContain("=");
		const decoded = fromBase64URL(encoded);
		expect(decoded).toEqual(data);
	});
});
