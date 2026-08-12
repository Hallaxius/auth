import { serialize } from "cookie";
import type { SessionCookieOptions } from "../types";
import { decrypt, encrypt } from "./crypto-aes";
import { DEFAULT_SESSION_TTL_SECONDS } from "./defaults";

export async function encryptCookieValue(
	value: string,
	secret: string,
): Promise<string> {
	const encrypted = await encrypt(value, secret);
	return `e:${encrypted}`;
}

export async function decryptCookieValue(
	encryptedValue: string,
	secret: string,
): Promise<string | null> {
	if (!encryptedValue.startsWith("e:")) {
		return encryptedValue;
	}

	const encrypted = encryptedValue.slice(2);
	try {
		return await decrypt(encrypted, secret);
	} catch {
		return null;
	}
}

export async function parseEncryptedCookies(
	request: Request,
	secret: string,
): Promise<Record<string, string>> {
	const header = request.headers.get("Cookie") ?? "";
	if (!header) return {};

	const cookies: Record<string, string> = {};
	const entries: Array<{ key: string; value: string }> = [];

	for (const pair of header.split(";")) {
		const trimmed = pair.trim();
		if (!trimmed) continue;

		const idx = trimmed.indexOf("=");
		if (idx === -1) {
			cookies[trimmed] = "";
		} else {
			const key = trimmed.slice(0, idx).trim();
			let value = trimmed.slice(idx + 1).trim();
			try {
				value = decodeURIComponent(value);
			} catch {}
			entries.push({ key, value });
		}
	}

	for (const { key, value } of entries) {
		const decrypted = await decryptCookieValue(value, secret);
		if (decrypted !== null) {
			cookies[key] = decrypted;
		}
	}

	return cookies;
}

export async function createEncryptedSessionCookie(
	name: string,
	value: string,
	secret: string,
	options: SessionCookieOptions = {},
): Promise<string> {
	const encryptedValue = await encryptCookieValue(value, secret);
	return serialize(name, encryptedValue, {
		maxAge: options.maxAge ?? DEFAULT_SESSION_TTL_SECONDS,
		path: options.path ?? "/",
		httpOnly: options.httpOnly ?? true,
		secure: options.secure ?? true,
		sameSite: options.sameSite ?? "strict",
	});
}
