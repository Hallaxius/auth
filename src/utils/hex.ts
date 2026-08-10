export function hexEncode(bytes: Uint8Array): string {
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

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

export function bufferToHex(buffer: Uint8Array): string {
	return hexEncode(buffer);
}

export function hexToBuffer(hex: string): Uint8Array | null {
	return hexDecode(hex);
}

export async function sha256(text: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(text);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
