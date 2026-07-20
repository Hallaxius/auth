import type { CsrfConfig } from "../types";
import { LruCache } from "../utils/lru";

const _BASE64_ALPHABET =
	"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const BASE64_URL_ALPHABET =
	"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export function base64URLEncode(bytes: Uint8Array): string {
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

export function base64URLDecode(str: string): Uint8Array {
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

function toBase64URL(data: ArrayBuffer): string {
	return base64URLEncode(new Uint8Array(data));
}

function fromBase64URL(str: string): Uint8Array {
	return base64URLDecode(str);
}

async function hashUserAgent(userAgent: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(userAgent);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	const hashArray = new Uint8Array(hashBuffer);
	let result = "";
	for (const byte of hashArray) {
		result += byte.toString(16).padStart(2, "0");
	}
	return result.slice(0, 16);
}

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
}

export class MemoryStateStore implements StateStore {
	private store = new LruCache<string, number>(10_000);
	private locks = new Map<string, Promise<void>>();
	private disposed = false;

	async has(id: string): Promise<boolean> {
		return this.store.has(id);
	}

	async set(id: string, ttlMs: number): Promise<void> {
		this.store.set(id, Date.now() + ttlMs, ttlMs);
	}

	async setIfAbsent(id: string, ttlMs: number): Promise<boolean> {
		return this.withLock(id, async () => {
			const expiresAt = this.store.get(id);
			if (expiresAt !== undefined) {
				if (Date.now() > expiresAt) {
					this.store.set(id, Date.now() + ttlMs, ttlMs);
					return true;
				}
				return false;
			}
			this.store.set(id, Date.now() + ttlMs, ttlMs);
			return true;
		});
	}

	async delete(id: string): Promise<void> {
		this.store.delete(id);
	}

	dispose(): void {
		this.disposed = true;
		this.store.dispose();
	}

	private async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
		const existingLock = this.locks.get(key);
		let resolveLock: () => void;
		const lockPromise = new Promise<void>((resolve) => {
			resolveLock = resolve;
		});

		this.locks.set(key, lockPromise);

		try {
			if (existingLock) {
				await existingLock;
			}
			return await fn();
		} finally {
			resolveLock!();
			this.locks.delete(key);
		}
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
): Promise<ValidatedState> {
	const ttlMs = 5 * 60 * 1000;
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
