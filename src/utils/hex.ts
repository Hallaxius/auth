/**
 * @file Hex encoding/decoding utilities
 *
 * Shared functions for converting between Uint8Array and hexadecimal strings.
 * Used by crypto operations, password hashing, and token generation.
 *
 * @module utils/hex
 */

/**
 * Converts Uint8Array to hexadecimal string
 * @param bytes - Byte array to encode
 * @returns Lowercase hexadecimal string
 * @example
 * const hex = hexEncode(new Uint8Array([255, 128, 0]));
 * // returns "ff8000"
 */
export function hexEncode(bytes: Uint8Array): string {
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/**
 * Converts hexadecimal string to Uint8Array
 * @param hex - Hexadecimal string (must have even length)
 * @returns Byte array or null if invalid hex
 * @example
 * const bytes = hexDecode("ff8000");
 * // returns Uint8Array(3) [255, 128, 0]
 */
export function hexDecode(hex: string): Uint8Array | null {
	if (hex.length % 2 !== 0) {
		return null;
	}

	const bytes = new Uint8Array(hex.length / 2);
	for (let i = 0; i < hex.length; i += 2) {
		const byte = Number.parseInt(hex.slice(i, i + 2), 16);
		if (Number.isNaN(byte)) {
			return null;
		}
		bytes[i / 2] = byte;
	}
	return bytes;
}

/**
 * Converts Uint8Array to hexadecimal string (alias for hexEncode)
 * @param buffer - Byte array to convert
 * @returns Lowercase hexadecimal string
 */
export function bufferToHex(buffer: Uint8Array): string {
	return hexEncode(buffer);
}

/**
 * Converts hexadecimal string to Uint8Array (alias for hexDecode)
 * @param hex - Hexadecimal string
 * @returns Byte array or null if invalid
 */
export function hexToBuffer(hex: string): Uint8Array | null {
	return hexDecode(hex);
}