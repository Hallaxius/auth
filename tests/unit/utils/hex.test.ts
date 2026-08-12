import { describe, expect, it } from "bun:test";
import { bufferToHex, hexDecode, hexEncode, hexToBuffer } from "../../../src/";

describe("hexEncode / hexDecode", () => {
	it("should encode empty Uint8Array", () => {
		expect(hexEncode(new Uint8Array([]))).toBe("");
	});

	it("should encode single byte", () => {
		expect(hexEncode(new Uint8Array([255]))).toBe("ff");
		expect(hexEncode(new Uint8Array([0]))).toBe("00");
		expect(hexEncode(new Uint8Array([128]))).toBe("80");
	});

	it("should encode multiple bytes", () => {
		const bytes = new Uint8Array([0, 128, 255, 16, 32]);
		expect(hexEncode(bytes)).toBe("0080ff1020");
	});

	it("should decode empty string", () => {
		expect(hexDecode("")).toEqual(new Uint8Array([]));
	});

	it("should decode single byte", () => {
		expect(hexDecode("ff")).toEqual(new Uint8Array([255]));
		expect(hexDecode("00")).toEqual(new Uint8Array([0]));
		expect(hexDecode("80")).toEqual(new Uint8Array([128]));
	});

	it("should decode multiple bytes", () => {
		expect(hexDecode("0080ff1020")).toEqual(
			new Uint8Array([0, 128, 255, 16, 32]),
		);
	});

	it("should return null for odd-length string", () => {
		expect(hexDecode("abc")).toBeNull();
		expect(hexDecode("f")).toBeNull();
	});

	it("should return null for invalid hex characters", () => {
		expect(hexDecode("gh")).toBeNull();
		expect(hexDecode("12xy")).toBeNull();
	});

	it("should handle round-trip encode/decode", () => {
		const original = new Uint8Array([0, 64, 128, 192, 255]);
		const encoded = hexEncode(original);
		const decoded = hexDecode(encoded);
		expect(decoded).toEqual(original);
	});

	it("should use lowercase hex", () => {
		const encoded = hexEncode(new Uint8Array([255, 128, 0]));
		expect(encoded).toBe("ff8000");
		expect(encoded).toMatch(/^[0-9a-f]+$/);
	});
});

describe("bufferToHex / hexToBuffer aliases", () => {
	it("bufferToHex should be same as hexEncode", () => {
		const bytes = new Uint8Array([1, 2, 3, 4, 5]);
		expect(bufferToHex(bytes)).toBe(hexEncode(bytes));
	});

	it("hexToBuffer should be same as hexDecode", () => {
		const hex = "0102030405";
		expect(hexToBuffer(hex)).toEqual(hexDecode(hex));
	});

	it("should handle round-trip with aliases", () => {
		const original = new Uint8Array([10, 20, 30, 40]);
		const encoded = bufferToHex(original);
		const decoded = hexToBuffer(encoded);
		expect(decoded).toEqual(original);
	});
});

