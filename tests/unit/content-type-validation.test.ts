import { describe, expect, it } from "bun:test";

describe("Content-Type Validation", () => {
	function validateContentType(contentType: string | null): {
		valid: boolean;
		status?: number;
	} {
		if (!contentType?.includes("application/json")) {
			return { valid: false, status: 415 };
		}
		return { valid: true };
	}

	it("should accept application/json content type", () => {
		expect(validateContentType("application/json")).toEqual({
			valid: true,
		});
		expect(validateContentType("application/json; charset=utf-8")).toEqual({
			valid: true,
		});
	});

	it("should reject non-JSON content types", () => {
		expect(validateContentType("text/html")).toEqual({
			valid: false,
			status: 415,
		});
		expect(validateContentType("text/plain")).toEqual({
			valid: false,
			status: 415,
		});
		expect(validateContentType("application/xml")).toEqual({
			valid: false,
			status: 415,
		});
	});

	it("should reject missing content type", () => {
		expect(validateContentType(null)).toEqual({
			valid: false,
			status: 415,
		});
		expect(validateContentType("")).toEqual({
			valid: false,
			status: 415,
		});
	});
});
