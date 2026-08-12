import type { CaptchaConfig } from "./captcha";
import { resolveCaptchaConfig } from "./captcha";
import { validateSecretEntropy } from "./config/schema";
import { defaultSameSite } from "./internal/cookies";
import {
	DEFAULT_BRUTE_FORCE,
	DEFAULT_CALLBACKS,
	DEFAULT_CSRF,
	DEFAULT_GUILD_ROLE_SYNC,
	DEFAULT_MFA,
	DEFAULT_ROUTES,
	DEFAULT_SCOPES,
} from "./internal/defaults";
import type {
	Callbacks,
	DiscordAuthConfig,
	DiscordScope,
	InternalConfig,
	RoutesConfig,
} from "./types";
import { sha256, toBase64URL } from "./utils/crypto-helpers";
import { createSecurityLogger } from "./utils/logger";
import { isProduction } from "./utils/validation";

const logger = createSecurityLogger("config");

export async function processConfig(
	config: DiscordAuthConfig,
): Promise<InternalConfig> {
	if (!config.clientId || !config.clientSecret) {
		throw new Error("discord() requires clientId and clientSecret");
	}
	if (!config.secret) {
		throw new Error("secret is required");
	}
	validateSecretEntropy(config.secret);
	if (
		config.session?.type &&
		!["jwt", "server"].includes(config.session.type)
	) {
		throw new Error("session.type must be either 'jwt' or 'server'");
	}

	const redirectUri = config.redirectUri ?? process.env.DISCORD_REDIRECT_URI;

	if (!redirectUri) {
		throw new Error(
			"redirectUri is required - set DISCORD_REDIRECT_URI env var or provide redirectUri in config. " +
				"Example: https://your-domain.com/auth/discord/callback",
		);
	}

	const bruteForce = config.bruteForce ?? {};
	const mfa = config.mfa ?? {};
	const guildRoleSync = config.guildRoleSync ?? {};
	const csrf = config.csrf ?? {};

	if (guildRoleSync.enabled && !guildRoleSync.guildId) {
		throw new Error(
			"guildRoleSync.guildId is required when guildRoleSync.enabled is true",
		);
	}
	if (guildRoleSync.enabled && !guildRoleSync.botToken) {
		throw new Error(
			"guildRoleSync.botToken is required when guildRoleSync.enabled is true",
		);
	}

	const stateSecret =
		config.stateSecret ?? (await deriveStateSecret(config.secret));

	const mergedCsrf = { ...DEFAULT_CSRF, ...csrf };

	if (!mergedCsrf.enabled) {
		logger.warn(
			"CSRF protection is disabled. State parameter validation will still occur, " +
				"but single-use enforcement falls back to in-memory storage (not suitable for multi-process/serverless).",
		);
	}

	if (mergedCsrf.enabled && !mergedCsrf.singleUse) {
		logger.warn(
			"CSRF single-use enforcement is disabled. State parameters can be replayed " +
				"within their TTL window. Set `csrf.singleUse: true` (default) to prevent state replay attacks.",
		);
	}

	return {
		clientId: config.clientId,
		clientSecret: config.clientSecret,
		session: {
			type: "jwt",
			secret: config.secret,
			cookieName: config.session?.cookieName ?? "discord-auth-session",
			cookiePath: config.session?.cookiePath ?? "/",
			httpOnly: config.session?.httpOnly ?? true,
			secure: config.session?.secure ?? isProduction(),
			sameSite: config.session?.sameSite ?? defaultSameSite(),
			expiresIn: config.session?.expiresIn ?? "7d",
		},
		scopes: (config.scopes ?? [...DEFAULT_SCOPES]) as DiscordScope[],
		prompt: config.prompt ?? "consent",
		routes: { ...DEFAULT_ROUTES, ...config.routes } as Required<RoutesConfig>,
		callbacks: {
			...DEFAULT_CALLBACKS,
			...config.callbacks,
		} as Required<Callbacks>,
		redirectUri,
		storage: config.storage,
		meRoute: config.meRoute ?? "/auth/me",
		bruteForce: { ...DEFAULT_BRUTE_FORCE, ...bruteForce },
		mfa: { ...DEFAULT_MFA, ...mfa },
		guildRoleSync: { ...DEFAULT_GUILD_ROLE_SYNC, ...guildRoleSync },
		csrf: mergedCsrf,
		stateSecret,
		meRateLimitStorage: config.meRateLimitStorage,
		sessionRevocationStorage: config.sessionRevocationStorage,
		captcha: config.captcha
			? resolveCaptchaConfig(config.captcha as CaptchaConfig)
			: null,
	};
}

export async function deriveStateSecret(
	sessionSecret: string,
	salt?: string,
): Promise<string> {
	const encoder = new TextEncoder();

	const envSalt =
		typeof process !== "undefined" ? process.env.AUTH_SALT : undefined;

	if (envSalt && envSalt.length < 32) {
		throw new Error("AUTH_SALT must be at least 32 characters");
	}

	const configSalt =
		salt ?? envSalt ?? (await sha256(`auth-state-v1:${sessionSecret}`));

	const saltBytes = encoder.encode(configSalt);

	const keyMaterial = await crypto.subtle.importKey(
		"raw",
		encoder.encode(sessionSecret),
		{ name: "HKDF" },
		false,
		["deriveBits"],
	);

	const derivedBits = await crypto.subtle.deriveBits(
		{
			name: "HKDF",
			salt: saltBytes,
			info: encoder.encode("discord-auth:state-secret-v1"),
			hash: "SHA-256",
		},
		keyMaterial,
		256,
	);

	const hashArray = new Uint8Array(derivedBits);
	let result = "";
	for (const byte of hashArray) {
		result += byte.toString(16).padStart(2, "0");
	}
	return result;
}

export function verifier(): string {
	const array = new Uint8Array(32);
	crypto.getRandomValues(array);
	return toBase64URL(array.buffer as ArrayBuffer);
}

export function validateVerifier(verifier: string): void {
	if (typeof verifier !== "string") {
		throw new Error("code_verifier must be a string");
	}
	const length = verifier.length;
	if (length < 43 || length > 128) {
		throw new Error("code_verifier must be between 43 and 128 characters");
	}
	if (!/^[A-Za-z0-9\-._~]+$/.test(verifier)) {
		throw new Error("code_verifier contains invalid characters");
	}
}

export async function challenge(verifier: string): Promise<string> {
	validateVerifier(verifier);
	const encoder = new TextEncoder();
	const data = encoder.encode(verifier);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	const hashHex = hashArray
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
	const hashBytes = new Uint8Array(hashHex.length / 2);
	for (let i = 0; i < hashBytes.length; i++) {
		hashBytes[i] = Number.parseInt(hashHex.slice(i * 2, i * 2 + 2), 16);
	}
	return toBase64URL(hashBytes.buffer as ArrayBuffer);
}

export async function create(): Promise<{
	verifier: string;
	challenge: string;
	codeChallengeMethod: "S256";
}> {
	const codeVerifier = verifier();
	const codeChallenge = await challenge(codeVerifier);
	return {
		verifier: codeVerifier,
		challenge: codeChallenge,
		codeChallengeMethod: "S256",
	};
}

export const pkce = {
	verifier,
	challenge,
	create,
} as const;
