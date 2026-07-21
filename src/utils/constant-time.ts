import { timingSafeEqual } from "node:crypto";

export function constantTimeCompare(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) {
		return false;
	}
	return timingSafeEqual(a, b);
}

export function constantTimeCompareStrings(a: string, b: string): boolean {
	const encoder = new TextEncoder();
	const aBytes = encoder.encode(a);
	const bBytes = encoder.encode(b);
	return constantTimeCompare(aBytes, bBytes);
}

export function constantTimeCompareHex(a: string, b: string): boolean {
	if (a.length !== b.length) {
		return false;
	}

	const aBytes = hexToBytes(a);
	const bBytes = hexToBytes(b);

	if (!aBytes || !bBytes) {
		return false;
	}

	return constantTimeCompare(aBytes, bBytes);
}

function hexToBytes(hex: string): Uint8Array | null {
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
