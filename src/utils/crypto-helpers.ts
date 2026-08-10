export async function sha256(input: string): Promise<string> {
	const data = new TextEncoder().encode(input);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	return Array.from(new Uint8Array(hashBuffer))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

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
