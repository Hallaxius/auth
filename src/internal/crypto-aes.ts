const ALGORITHM = "AES-GCM";
const IV_LENGTH = 16;
const SALT_LENGTH = 16;
const PBKDF2_ITERATIONS = 100_000;
const KEY_LENGTH = 256;

function hexEncode(bytes: Uint8Array): string {
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

function hexDecode(hex: string): Uint8Array {
	const bytes = new Uint8Array(hex.length / 2);
	for (let i = 0; i < hex.length; i += 2) {
		bytes[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16);
	}
	return bytes;
}

async function deriveKey(secret: string, salt: Uint8Array): Promise<CryptoKey> {
	const encoder = new TextEncoder();
	const keyMaterial = await crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ name: "PBKDF2" },
		false,
		["deriveKey"],
	);
	return crypto.subtle.deriveKey(
		{
			name: "PBKDF2",
			salt: salt.buffer as ArrayBuffer,
			iterations: PBKDF2_ITERATIONS,
			hash: "SHA-256",
		},
		keyMaterial,
		{ name: ALGORITHM, length: KEY_LENGTH },
		false,
		["encrypt", "decrypt"],
	);
}

export async function encrypt(
	plaintext: string,
	secret: string,
): Promise<string> {
	const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
	const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
	const key = await deriveKey(secret, salt);

	const encoder = new TextEncoder();
	const data = encoder.encode(plaintext);
	const encrypted = await crypto.subtle.encrypt(
		{ name: ALGORITHM, iv: iv.buffer as ArrayBuffer },
		key,
		data,
	);

	const encryptedBytes = new Uint8Array(encrypted);
	const tag = encryptedBytes.slice(-16);
	const ciphertext = encryptedBytes.slice(0, -16);

	return `${hexEncode(salt)}:${hexEncode(iv)}:${hexEncode(tag)}:${hexEncode(ciphertext)}`;
}

export async function decrypt(
	ciphertext: string,
	secret: string,
): Promise<string> {
	const parts = ciphertext.split(":");
	if (parts.length !== 4) {
		throw new Error("Invalid encrypted format");
	}

	const salt = hexDecode(parts[0] as string);
	const iv = hexDecode(parts[1] as string);
	const tag = hexDecode(parts[2] as string);
	const encrypted = hexDecode(parts[3] as string);

	const key = await deriveKey(secret, salt);

	const combined = new Uint8Array(encrypted.length + tag.length);
	combined.set(encrypted, 0);
	combined.set(tag, encrypted.length);

	const decrypted = await crypto.subtle.decrypt(
		{ name: ALGORITHM, iv: iv.buffer as ArrayBuffer },
		key,
		combined,
	);

	return new TextDecoder().decode(decrypted);
}
