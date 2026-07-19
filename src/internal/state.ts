import type { CsrfConfig } from "../types";

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

interface StatePayload {
	id: string;
	iat: number;
	codeVerifier?: string;
	sessionId?: string;
	userAgentHash?: string;
}

export interface StateStore {
	has(id: string): Promise<boolean>;
	set(id: string, ttlMs: number): Promise<void>;
	setIfAbsent(id: string, ttlMs: number): Promise<boolean>;
	delete(id: string): Promise<void>;
}

export class MemoryStateStore implements StateStore {
	private store = new Map<string, number>();
	private sweepTimer: ReturnType<typeof setInterval> | null = null;

	constructor(private sweepIntervalMs = 60_000) {
		if (typeof setInterval === "function") {
			this.sweepTimer = setInterval(
				() => this.sweepExpired(),
				this.sweepIntervalMs,
			);
			if (this.sweepTimer && typeof this.sweepTimer.unref === "function") {
				this.sweepTimer.unref();
			}
		}
	}

	private sweepExpired(): void {
		const now = Date.now();
		for (const [id, expiresAt] of this.store) {
			if (expiresAt <= now) this.store.delete(id);
		}
	}

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

	async setIfAbsent(id: string, ttlMs: number): Promise<boolean> {
		const expiresAt = this.store.get(id);
		if (expiresAt !== undefined) {
			if (Date.now() > expiresAt) {
				this.store.set(id, Date.now() + ttlMs);
				return true;
			}
			return false;
		}
		this.store.set(id, Date.now() + ttlMs);
		return true;
	}

	async delete(id: string): Promise<void> {
		this.store.delete(id);
	}

	dispose(): void {
		if (this.sweepTimer && typeof clearInterval === "function") {
			clearInterval(this.sweepTimer);
			this.sweepTimer = null;
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
