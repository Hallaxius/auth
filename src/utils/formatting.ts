/**
 * @file Formatting utilities
 *
 * Shared formatting functions for dates, numbers, and strings.
 * Centralized formatting logic for consistent output across the application.
 *
 * @module utils/formatting
 */

/**
 * Formats a date as ISO 8601 duration string
 * @param seconds - Duration in seconds
 * @returns ISO 8601 duration string (e.g., "7d", "1h", "30m")
 * @example
 * formatDuration(604800); // returns "7d"
 * formatDuration(3600); // returns "1h"
 */
export function formatDuration(seconds: number): string {
	if (seconds % 604800 === 0) {
		return `${seconds / 604800}d`;
	}
	if (seconds % 3600 === 0) {
		return `${seconds / 3600}h`;
	}
	if (seconds % 60 === 0) {
		return `${seconds / 60}m`;
	}
	return `${seconds}s`;
}

/**
 * Parses ISO 8601 duration string to seconds
 * @param duration - Duration string (e.g., "7d", "1h", "30m", "300s")
 * @returns Duration in seconds
 * @throws {Error} If duration format is invalid
 * @example
 * parseDuration("7d"); // returns 604800
 * parseDuration("1h"); // returns 3600
 */
export function parseDuration(duration: string): number {
	const match = duration.match(/^(\d+)([smhd])$/);
	if (!match) {
		throw new Error(`Invalid duration format: ${duration}`);
	}

	const value = Number.parseInt(match[1] as string, 10);
	const unit = match[2] as string;

	switch (unit) {
		case "s":
			return value;
		case "m":
			return value * 60;
		case "h":
			return value * 3600;
		case "d":
			return value * 86400;
		default:
			throw new Error(`Unknown duration unit: ${unit}`);
	}
}

/**
 * Formats a number with thousands separators
 * @param num - Number to format
 * @param locale - Locale for formatting (default: "en-US")
 * @returns Formatted string with thousands separators
 * @example
 * formatNumber(1234567); // returns "1,234,567"
 * formatNumber(1234567, "pt-BR"); // returns "1.234.567"
 */
export function formatNumber(num: number, locale = "en-US"): string {
	return num.toLocaleString(locale);
}

/**
 * Formats bytes as human-readable string
 * @param bytes - Number of bytes
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted string (e.g., "1.5 MB", "2.3 KB")
 * @example
 * formatBytes(1548576); // returns "1.48 MB"
 * formatBytes(1024); // returns "1 KB"
 */
export function formatBytes(bytes: number, decimals = 2): string {
	if (bytes === 0) return "0 B";

	const k = 1024;
	const dm = decimals < 0 ? 0 : decimals;
	const sizes = ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];

	const i = Math.floor(Math.log(bytes) / Math.log(k));

	return `${Number.parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i] as string}`;
}

/**
 * Truncates a string to specified length with ellipsis
 * @param str - String to truncate
 * @param maxLength - Maximum length (including ellipsis)
 * @param ellipsis - Ellipsis string (default: "...")
 * @returns Truncated string
 * @example
 * truncate("Hello World", 8); // returns "Hello..."
 * truncate("Hello", 10); // returns "Hello"
 */
export function truncate(
	str: string,
	maxLength: number,
	ellipsis = "...",
): string {
	if (str.length <= maxLength) {
		return str;
	}
	return str.slice(0, maxLength - ellipsis.length) + ellipsis;
}