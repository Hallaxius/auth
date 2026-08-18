import { timingSafeEqual as nodeTimingSafeEqual } from "node:crypto";

export function randomBytes(length: number): Uint8Array {
	const bytes = new Uint8Array(length);
	crypto.getRandomValues(bytes);
	return bytes;
}

export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) {
		return false;
	}
	if (typeof nodeTimingSafeEqual === "function") {
		return nodeTimingSafeEqual(Buffer.from(a), Buffer.from(b));
	}
	let result = 0;
	for (let i = 0; i < a.length; i++) {
		result |= a[i]! ^ b[i]!;
	}
	return result === 0;
}
