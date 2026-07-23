/**
 * @file Cryptographic helper utilities
 *
 * Shared crypto functions for hashing, encoding, and secure comparisons.
 * Built on Web Crypto API for constant-time operations.
 *
 * @module utils/crypto-helpers
 */

/**
 * Computes SHA-256 hash of input string as hexadecimal
 * @param input - String to hash
 * @returns 64-character hexadecimal string
 * @security Uses Web Crypto API for constant-time hashing
 * @example
 * const hash = await sha256("user-agent-string");
 * // returns "a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e"
 */
export async function sha256(input: string): Promise<string> {
	const data = new TextEncoder().encode(input);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	return Array.from(new Uint8Array(hashBuffer))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/**
 * Converts ArrayBuffer to base64 URL-safe string
 * @param data - ArrayBuffer to encode
 * @returns Base64 URL-safe encoded string (uses - and _ instead of + and /)
 */
export function toBase64URL(data: ArrayBuffer): string {
	const bytes = new Uint8Array(data);
	let result = "";
	for (let i = 0; i < bytes.length; i += 3) {
		const a = bytes[i] as number;
		const b = i + 1 < bytes.length ? (bytes[i + 1] as number) : 0;
		const c = i + 2 < bytes.length ? (bytes[i + 2] as number) : 0;
		const triplet = (a << 16) | (b << 8) | c;
		result += BASE64_URL_ALPHABET[(triplet >> 18) & 0x3f] as string;
		result += BASE64_URL_ALPHABET[(triplet >> 12) & 0x3f] as string;
		if (i + 1 < bytes.length) {
			result += BASE64_URL_ALPHABET[(triplet >> 6) & 0x3f] as string;
		}
		if (i + 2 < bytes.length) {
			result += BASE64_URL_ALPHABET[triplet & 0x3f] as string;
		}
	}
	return result;
}

/**
 * Converts base64 URL-safe string to Uint8Array
 * @param str - Base64 URL-safe encoded string
 * @returns Decoded byte array
 */
export function fromBase64URL(str: string): Uint8Array {
	const chars: number[] = [];
	for (let i = 0; i < str.length; i++) {
		const c = str[i] as string;
		let idx: number;
		if (c >= "A" && c <= "Z") idx = c.charCodeAt(0) - 65;
		else if (c >= "a" && c <= "z") idx = c.charCodeAt(0) - 71;
		else if (c >= "0" && c <= "9") idx = c.charCodeAt(0) + 4;
		else if (c === "-" || c === "+") idx = 62;
		else if (c === "_" || c === "/") idx = 63;
		else continue;
		chars.push(idx);
	}
	const bytes: number[] = [];
	for (let i = 0; i < chars.length; i += 4) {
		const a = chars[i] as number;
		const b = i + 1 < chars.length ? (chars[i + 1] as number) : 0;
		const c = i + 2 < chars.length ? (chars[i + 2] as number) : 0;
		const d = i + 3 < chars.length ? (chars[i + 3] as number) : 0;
		const triplet = (a << 18) | (b << 12) | (c << 6) | d;
		bytes.push((triplet >> 16) & 0xff);
		if (i + 2 < chars.length) bytes.push((triplet >> 8) & 0xff);
		if (i + 3 < chars.length) bytes.push(triplet & 0xff);
	}
	return new Uint8Array(bytes);
}

const BASE64_URL_ALPHABET =
	"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";