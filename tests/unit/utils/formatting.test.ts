import { describe, expect, it } from "bun:test";
import {
	formatBytes,
	formatDuration,
	formatNumber,
	parseDuration,
	truncate,
} from "../../../src/";

describe("formatDuration", () => {
	it("should format seconds", () => {
		expect(formatDuration(60)).toBe("1m");
		expect(formatDuration(30)).toBe("30s");
	});

	it("should format minutes", () => {
		expect(formatDuration(3600)).toBe("1h");
		expect(formatDuration(1800)).toBe("30m");
	});

	it("should format hours", () => {
		expect(formatDuration(3600)).toBe("1h");
		expect(formatDuration(86400)).toBe("24h");
		expect(formatDuration(172800)).toBe("48h");
	});

	it("should format weeks", () => {
		expect(formatDuration(604800)).toBe("1d");
		expect(formatDuration(1209600)).toBe("2d");
	});
});

describe("parseDuration", () => {
	it("should parse seconds", () => {
		expect(parseDuration("60s")).toBe(60);
		expect(parseDuration("1s")).toBe(1);
	});

	it("should parse minutes", () => {
		expect(parseDuration("1m")).toBe(60);
		expect(parseDuration("30m")).toBe(1800);
	});

	it("should parse hours", () => {
		expect(parseDuration("1h")).toBe(3600);
		expect(parseDuration("24h")).toBe(86400);
	});

	it("should parse days", () => {
		expect(parseDuration("1d")).toBe(86400);
		expect(parseDuration("7d")).toBe(604800);
	});

	it("should throw for invalid format", () => {
		expect(() => parseDuration("invalid")).toThrow("Invalid duration format");
		expect(() => parseDuration("1w")).toThrow("Invalid duration format");
		expect(() => parseDuration("")).toThrow("Invalid duration format");
	});

	it("should throw for missing unit", () => {
		expect(() => parseDuration("100")).toThrow("Invalid duration format");
	});
});

describe("formatNumber", () => {
	it("should format with default locale", () => {
		expect(formatNumber(1234567)).toBe("1,234,567");
	});

	it("should format with custom locale", () => {
		expect(formatNumber(1234567, "pt-BR")).toBe("1.234.567");
		expect(formatNumber(1234567, "de-DE")).toBe("1.234.567");
	});

	it("should format zero", () => {
		expect(formatNumber(0)).toBe("0");
	});

	it("should format negative numbers", () => {
		expect(formatNumber(-1234)).toBe("-1,234");
	});
});

describe("formatBytes", () => {
	it("should format zero bytes", () => {
		expect(formatBytes(0)).toBe("0 B");
	});

	it("should format bytes", () => {
		expect(formatBytes(1)).toBe("1 B");
		expect(formatBytes(1023)).toBe("1023 B");
	});

	it("should format kilobytes", () => {
		expect(formatBytes(1024)).toBe("1 KB");
		expect(formatBytes(1536)).toBe("1.5 KB");
	});

	it("should format megabytes", () => {
		expect(formatBytes(1048576)).toBe("1 MB");
		expect(formatBytes(1572864)).toBe("1.5 MB");
	});

	it("should format gigabytes", () => {
		expect(formatBytes(1073741824)).toBe("1 GB");
	});

	it("should handle custom decimals", () => {
		expect(formatBytes(1024, 0)).toBe("1 KB");
		expect(formatBytes(1536, 0)).toBe("2 KB");
		expect(formatBytes(1536, 1)).toBe("1.5 KB");
	});
});

describe("truncate", () => {
	it("should not truncate short strings", () => {
		expect(truncate("hello", 10)).toBe("hello");
		expect(truncate("hi", 100)).toBe("hi");
	});

	it("should truncate long strings", () => {
		expect(truncate("hello world", 8)).toBe("hello...");
		expect(truncate("abcdefghij", 5)).toBe("ab...");
	});

	it("should handle exact length", () => {
		expect(truncate("hello", 5)).toBe("hello");
		expect(truncate("hello", 6)).toBe("hello");
	});

	it("should handle custom ellipsis", () => {
		expect(truncate("hello world", 10, "..")).toBe("hello wo..");
		expect(truncate("hello world", 10)).toBe("hello w...");
	});

	it("should handle empty string", () => {
		expect(truncate("", 5)).toBe("");
	});

	it("should handle short maxLength", () => {
		expect(truncate("hello", 8)).toBe("hello");
		expect(truncate("hello", 10)).toBe("hello");
	});
});
