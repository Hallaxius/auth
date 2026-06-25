import type { CsrfConfig } from "./types";

const DEFAULT_STATE_TTL = 5 * 60 * 1000;

interface StatePayload {
	id: string;
	iat: number;
	codeVerifier?: string;
	sessionId?: string;
	userAgentHash?: string;
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

async function hashUserAgent(userAgent: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(userAgent);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	return Array.from(new Uint8Array(hashBuffer))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("")
		.slice(0, 16);
}

export interface StateStore {
	has(id: string): Promise<boolean>;
	set(id: string, ttlMs: number): Promise<void>;
	delete(id: string): Promise<void>;
}

export class MemoryStateStore implements StateStore {
	private store = new Map<string, number>();

	async has(id: string): Promise<boolean> {
		const expiresAt = this.store.get(id);
		if (!expiresAt) return false;
		if (Date.now() > expiresAt) {
			this.store.delete(id);
			return false;
		}
		return true;
	}

	async set(id: string, ttlMs: number): Promise<void> {
		this.store.set(id, Date.now() + ttlMs);
	}

	async delete(id: string): Promise<void> {
		this.store.delete(id);
	}
}

export interface ValidatedState {
	valid: boolean;
	codeVerifier?: string;
	stateId?: string;
}

export async function generateState(
	secret: string,
	codeVerifier?: string,
	sessionId?: string,
	userAgent?: string,
	config?: CsrfConfig,
): Promise<string> {
	const _ttlMs = config?.ttlMs ?? DEFAULT_STATE_TTL;
	const payload: StatePayload = {
		id: crypto.randomUUID(),
		iat: Date.now(),
	};

	if (codeVerifier) {
		payload.codeVerifier = codeVerifier;
	}
	if (config?.bindToSession && sessionId) {
		payload.sessionId = sessionId;
	}
	if (config?.bindToUserAgent && userAgent) {
		payload.userAgentHash = await hashUserAgent(userAgent);
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

export async function validateState(
	state: string,
	secret: string,
	sessionId?: string,
	userAgent?: string,
	config?: CsrfConfig,
	store?: StateStore,
): Promise<ValidatedState> {
	const ttlMs = config?.ttlMs ?? DEFAULT_STATE_TTL;
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

		if (Date.now() - payload.iat > ttlMs) return { valid: false };

		if (config?.bindToSession && sessionId && payload.sessionId !== sessionId) {
			return { valid: false };
		}

		if (
			config?.bindToUserAgent &&
			userAgent &&
			payload.userAgentHash !== (await hashUserAgent(userAgent))
		) {
			return { valid: false };
		}

		if (config?.singleUse && store) {
			const stateId = payload.id;
			if (await store.has(stateId)) {
				return { valid: false };
			}
			await store.set(stateId, ttlMs);
		}

		return {
			valid: true,
			codeVerifier: payload.codeVerifier,
			stateId: payload.id,
		};
	} catch {
		return { valid: false };
	}
}

export async function consumeState(
	state: string,
	secret: string,
	sessionId?: string,
	userAgent?: string,
	config?: CsrfConfig,
	store?: StateStore,
): Promise<ValidatedState> {
	const result = await validateState(
		state,
		secret,
		sessionId,
		userAgent,
		config,
		store,
	);
	if (result.valid && result.stateId && config?.singleUse && store) {
		await store.delete(result.stateId);
	}
	return result;
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
