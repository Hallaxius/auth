import { bench, run } from "mitata";
import { mfa } from "../src/mfa";
import type { MfaStorage, PendingTokenEntry } from "../src/types";
import { sha256Hex } from "../src/utils/ip";

function base32Decode(encoded: string): Uint8Array {
	const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
	const clean = encoded.replace(/=+$/, "").toUpperCase();
	const bytes: number[] = [];
	let bits = 0;
	let value = 0;
	for (const char of clean) {
		const idx = alphabet.indexOf(char);
		if (idx === -1) continue;
		value = (value << 5) | idx;
		bits += 5;
		if (bits >= 8) {
			bits -= 8;
			bytes.push((value >> bits) & 0xff);
		}
	}
	return new Uint8Array(bytes);
}

class TestMfaStorage implements MfaStorage {
	private secrets = new Map<string, string>();
	private backupCodes = new Map<string, string[]>();
	private lastUsedCounter = new Map<string, number>();
	private pendingTokens = new Map<string, PendingTokenEntry>();

	async getSecret(userId: string) {
		return this.secrets.get(userId) || null;
	}

	async setSecret(userId: string, secret: string) {
		this.secrets.set(userId, secret);
	}

	async setSecretIfAbsent(userId: string, secret: string) {
		if (this.secrets.has(userId)) return false;
		this.secrets.set(userId, secret);
		return true;
	}

	async deleteSecret(userId: string) {
		this.secrets.delete(userId);
	}

	async setBackupCodes(userId: string, codes: string[]) {
		this.backupCodes.set(userId, codes);
	}

	async getBackupCodes(userId: string) {
		return this.backupCodes.get(userId) || null;
	}

	async consumeBackupCode(userId: string, index: number) {
		const codes = this.backupCodes.get(userId);
		if (codes) {
			codes.splice(index, 1);
		}
	}

	async getLastUsedCounter(userId: string) {
		return this.lastUsedCounter.get(userId) ?? null;
	}

	async setLastUsedCounter(userId: string, counter: number) {
		this.lastUsedCounter.set(userId, counter);
	}

	async getPendingToken(userId: string) {
		return this.pendingTokens.get(userId) ?? null;
	}

	async setPendingToken(userId: string, entry: PendingTokenEntry) {
		this.pendingTokens.set(userId, entry);
	}

	async deletePendingToken(userId: string) {
		this.pendingTokens.delete(userId);
	}
}

const encryptionKey = "32-char-min-length-secret-key!!";
const storage = new TestMfaStorage();

const mfaInstance = mfa({
	storage,
	secret: encryptionKey,
	issuer: "TestApp",
	allowedMethods: ["totp", "backup_codes"],
});

let setupCounter = 0;
bench("MFA setup - generate TOTP secret", async () => {
	const uid = `user_mfa_${Date.now()}_${setupCounter++}`;
	await mfaInstance.setup(uid);
});

bench("MFA verify - valid TOTP", async () => {
	const uid = `user_verify_${Date.now()}_${Math.random().toString(36).slice(2)}`;
	const { secret } = await mfaInstance.setup(uid);
	try {
		const key = base32Decode(secret);
		const now = Math.floor(Date.now() / 1000);
		const counter = Math.floor(now / 30);
		const counterBuf = new Uint8Array(8);
		const view = new DataView(counterBuf.buffer);
		view.setBigUint64(0, BigInt(counter), false);
		const cryptoKey = await crypto.subtle.importKey(
			"raw",
			key.buffer as ArrayBuffer,
			{ name: "HMAC", hash: "SHA-1" },
			false,
			["sign"],
		);
		const hmac = new Uint8Array(
			await crypto.subtle.sign("HMAC", cryptoKey, counterBuf),
		);
		const offset = (hmac[hmac.length - 1] as number) & 0xf;
		const code =
			(((hmac[offset] as number) & 0x7f) << 24) |
			((hmac[offset + 1] as number) << 16) |
			((hmac[offset + 2] as number) << 8) |
			(hmac[offset + 3] as number);
		const totp = (code % 10 ** 6).toString().padStart(6, "0");
		await mfaInstance.verify(uid, totp);
	} catch (_e) {}
});

bench("MFA verify - invalid TOTP", async () => {
	const uid = `user_invalid_${Date.now()}`;
	try {
		await mfaInstance.verify(uid, "000000");
	} catch (_e) {}
});

bench("MFA backup codes generation (internal)", async () => {
	const uid = `user_backup_${Date.now()}`;
	await storage.setBackupCodes(
		uid,
		await Promise.all(
			Array(10)
				.fill(0)
				.map(async () => sha256Hex(crypto.randomUUID())),
		),
	);
});

await run();
