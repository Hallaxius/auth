export async function pbkdf2(
	password: string,
	salt: Uint8Array,
	iterations: number,
	keyLength: number,
	digest: "sha1" | "sha256" | "sha512" = "sha256",
): Promise<Uint8Array> {
	const encoder = new TextEncoder();
	const passwordData = encoder.encode(password);

	const key = await crypto.subtle.importKey(
		"raw",
		passwordData,
		{ name: "PBKDF2" },
		false,
		["deriveBits"],
	);

	const derivedBits = await crypto.subtle.deriveBits(
		{
			name: "PBKDF2",
			salt: salt.buffer as ArrayBuffer,
			iterations,
			hash: digest,
		},
		key,
		keyLength * 8,
	);

	return new Uint8Array(derivedBits);
}

export function randomBytes(length: number): Uint8Array {
	const bytes = new Uint8Array(length);
	crypto.getRandomValues(bytes);
	return bytes;
}

export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) {
		return false;
	}

	let result = 0;
	for (let i = 0; i < a.length; i++) {
		result |= a[i]! ^ b[i]!;
	}

	return result === 0;
}
