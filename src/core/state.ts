const STATE_TTL = 5 * 60 * 1000;

interface StatePayload {
	id: string;
	iat: number;
	codeVerifier?: string;
}

function toBase64URL(data: ArrayBuffer): string {
	const bytes = new Uint8Array(data);
	let binary = "";
	for (let i = 0; i < bytes.byteLength; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function fromBase64URL(str: string): Uint8Array {
	const base64 =
		str.replace(/-/g, "+").replace(/_/g, "/") +
		"=".repeat((4 - (str.length % 4)) % 4);
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

export async function generateState(
	secret: string,
	codeVerifier?: string,
): Promise<string> {
	const payload: StatePayload = {
		id: crypto.randomUUID(),
		iat: Date.now(),
	};

	if (codeVerifier) {
		payload.codeVerifier = codeVerifier;
	}

	const payloadString = JSON.stringify(payload);
	const encodedData = new TextEncoder().encode(payloadString);
	const encoded = toBase64URL(encodedData.buffer as ArrayBuffer);

	const secretData = new TextEncoder().encode(secret);
	const key = await crypto.subtle.importKey(
		"raw",
		secretData.buffer as ArrayBuffer,
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);

	const inputData = new TextEncoder().encode(encoded);
	const sig = await crypto.subtle.sign(
		"HMAC",
		key,
		inputData.buffer as ArrayBuffer,
	);
	const sigEncoded = toBase64URL(sig);
	return `${encoded}.${sigEncoded}`;
}

export interface ValidatedState {
	valid: boolean;
	codeVerifier?: string;
}

export async function validateState(
	state: string,
	secret: string,
): Promise<ValidatedState> {
	const parts = state.split(".");
	if (parts.length !== 2) return { valid: false };

	const [encoded, sig] = parts;

	try {
		const secretData = new TextEncoder().encode(secret);
		const key = await crypto.subtle.importKey(
			"raw",
			secretData.buffer as ArrayBuffer,
			{ name: "HMAC", hash: "SHA-256" },
			false,
			["verify"],
		);

		const sigBytes = fromBase64URL(sig);
		const inputData = new TextEncoder().encode(encoded);
		const valid = await crypto.subtle.verify(
			"HMAC",
			key,
			sigBytes.buffer as ArrayBuffer,
			inputData.buffer as ArrayBuffer,
		);

		if (!valid) return { valid: false };

		const decoded = fromBase64URL(encoded);
		const payload: StatePayload = JSON.parse(new TextDecoder().decode(decoded));

		if (Date.now() - payload.iat > STATE_TTL) return { valid: false };

		return { valid: true, codeVerifier: payload.codeVerifier };
	} catch {
		return { valid: false };
	}
}

/**
 * Extracts code_verifier from validated state
 * @deprecated Use validateState and access codeVerifier directly
 */
export async function getCodeVerifierFromState(
	state: string,
	secret: string,
): Promise<string | null> {
	const result = await validateState(state, secret);
	return result.valid ? (result.codeVerifier ?? null) : null;
}
