import type { CsrfConfig } from "../types";
import { fromBase64URL, sha256, toBase64URL } from "../utils/crypto-helpers";

export { fromBase64URL as base64URLDecode, toBase64URL as base64URLEncode };

interface StatePayload {
	id: string;
	iat: number;
	codeVerifier?: string;
	sessionId?: string;
	userAgentHash?: string;
	nonce: string;
}

export interface StateStore {
	has(id: string): Promise<boolean>;
	set(id: string, ttlMs: number): Promise<void>;
	setIfAbsent(id: string, ttlMs: number): Promise<boolean>;
	delete(id: string): Promise<void>;
	dispose?(): void;
}

async function hashUserAgent(userAgent: string): Promise<string> {
	return sha256(userAgent);
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
	const payload: StatePayload = {
		id: crypto.randomUUID(),
		iat: Date.now(),
		nonce: crypto.randomUUID(),
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
	config?: CsrfConfig,
): Promise<ValidatedState> {
	const ttlMs = config?.ttlMs ?? 5 * 60 * 1000;
	const parts = state.split(".");
	if (parts.length !== 2) return { valid: false };

	const encoded = parts[0] as string;
	const sig = parts[1] as string;

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
	const ttlMs = config?.ttlMs ?? 5 * 60 * 1000;
	const parts = state.split(".");
	if (parts.length !== 2) return { valid: false };

	const encoded = parts[0] as string;
	const sig = parts[1] as string;

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

		if (
			config?.bindToSession &&
			payload.sessionId &&
			sessionId &&
			payload.sessionId !== sessionId
		) {
			return { valid: false };
		}

		if (
			config?.bindToUserAgent &&
			payload.userAgentHash &&
			userAgent &&
			payload.userAgentHash !== (await hashUserAgent(userAgent))
		) {
			return { valid: false };
		}

		if (config?.singleUse && store) {
			const stateId = payload.id;
			const acquired = await store.setIfAbsent(stateId, ttlMs);
			if (!acquired) {
				return { valid: false };
			}
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
