export function randomBytes(length: number): Uint8Array {
	const bytes = new Uint8Array(length);
	crypto.getRandomValues(bytes);
	return bytes;
}

export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
	const aLen = a.length;
	const bLen = b.length;
	const maxLen = aLen > bLen ? aLen : bLen;

	let result = aLen ^ bLen;
	for (let i = 0; i < maxLen; i++) {
		const aByte = i < aLen ? a[i]! : 0;
		const bByte = i < bLen ? b[i]! : 0;
		result |= aByte ^ bByte;
	}

	return result === 0;
}
