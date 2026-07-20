import {
	DEFAULT_AUTO_REFRESH,
	DEFAULT_BRUTE_FORCE,
	DEFAULT_CALLBACKS,
	DEFAULT_CSRF,
	DEFAULT_GUILD_ROLE_SYNC,
	DEFAULT_MFA,
	DEFAULT_ROUTES,
	DEFAULT_SCOPES,
} from "./internal/defaults";
import { base64URLEncode } from "./internal/state";
import type {
	CallbackQuery,
	Callbacks,
	DiscordAuthConfig,
	DiscordScope,
	ErrorQuery,
	InternalConfig,
	LoginQuery,
	RoutesConfig,
} from "./types";

export async function processConfig(
	config: DiscordAuthConfig,
): Promise<InternalConfig> {
	const routerPrefix = config.routes?.prefix ?? DEFAULT_ROUTES.prefix;
	if (!config.clientId || !config.clientSecret) {
		throw new Error("clientId and clientSecret are required");
	}
	if (!config.secret) {
		throw new Error("secret is required");
	}
	if (
		config.session?.type &&
		!["jwt", "server"].includes(config.session.type)
	) {
		throw new Error("session.type must be either 'jwt' or 'server'");
	}

	const redirectUri =
		config.redirectUri ??
		process.env.DISCORD_REDIRECT_URI ??
		`${routerPrefix}/callback`;

	const autoRefresh = config.autoRefresh ?? {};
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
	if (autoRefresh.enabled !== false) {
		const threshold = autoRefresh.thresholdSeconds ?? 300;
		const maxRetries = autoRefresh.maxRetries ?? 3;
		if (!Number.isInteger(threshold) || threshold <= 0) {
			throw new Error(
				"autoRefresh.thresholdSeconds must be a positive integer",
			);
		}
		if (!Number.isInteger(maxRetries) || maxRetries < 0) {
			throw new Error("autoRefresh.maxRetries must be a non-negative integer");
		}
	}

	const stateSecret =
		config.stateSecret ?? (await deriveStateSecret(config.secret));

	return {
		clientId: config.clientId,
		clientSecret: config.clientSecret,
		session: {
			type: "jwt",
			secret: config.secret,
			cookieName: config.session?.cookieName ?? "discord-auth-session",
			cookiePath: config.session?.cookiePath ?? "/",
			httpOnly: config.session?.httpOnly ?? true,
			secure: config.session?.secure ?? true,
			sameSite: config.session?.sameSite ?? "lax",
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
		disablePKCE: config.disablePKCE ?? false,
		autoRefresh: { ...DEFAULT_AUTO_REFRESH, ...autoRefresh },
		bruteForce: { ...DEFAULT_BRUTE_FORCE, ...bruteForce },
		mfa: { ...DEFAULT_MFA, ...mfa },
		guildRoleSync: { ...DEFAULT_GUILD_ROLE_SYNC, ...guildRoleSync },
		csrf: { ...DEFAULT_CSRF, ...csrf },
		stateSecret,
	};
}

export async function deriveStateSecret(
	sessionSecret: string,
): Promise<string> {
	const encoder = new TextEncoder();
	const envSalt =
		typeof process !== "undefined" ? process.env.AUTH_STATE_SALT : undefined;
	const salt = encoder.encode(envSalt ?? "hallaxius-auth-state-v4");
	const keyMaterial = await crypto.subtle.importKey(
		"raw",
		encoder.encode(sessionSecret),
		{ name: "PBKDF2" },
		false,
		["deriveBits"],
	);
	const derivedBits = await crypto.subtle.deriveBits(
		{
			name: "PBKDF2",
			salt,
			iterations: 100_000,
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
	return base64URLEncode(array);
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
	return base64URLEncode(hashBytes);
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

export interface TypedCallbackQuery extends CallbackQuery {
	error?: OAuth2ErrorCode;
}

export interface TypedErrorQuery extends ErrorQuery {
	error: OAuth2ErrorCode;
}

export type OAuth2ErrorCode =
	| "access_denied"
	| "invalid_request"
	| "unauthorized_client"
	| "unsupported_response_type"
	| "invalid_scope"
	| "server_error"
	| "temporarily_unavailable"
	| "invalid_grant"
	| "invalid_token";

export interface TypedRouteHandlers<_Config extends DiscordAuthConfig> {
	callback: (query: TypedCallbackQuery) => Promise<Response>;
	login: (query?: LoginQuery) => Promise<Response>;
	error: (query: TypedErrorQuery) => Promise<Response>;
}

export function createTypedRouteHandlers<
	Config extends DiscordAuthConfig,
>(): TypedRouteHandlers<Config> {
	return {
		callback: async (_query: TypedCallbackQuery) => {
			return new Response("Not implemented", { status: 501 });
		},
		login: async (_query?: LoginQuery) => {
			return new Response("Not implemented", { status: 501 });
		},
		error: async (_query: TypedErrorQuery) => {
			return new Response("Not implemented", { status: 501 });
		},
	};
}

export const routes = {
	create: createTypedRouteHandlers,
} as const;
