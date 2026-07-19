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

export function generateCodeVerifier(): string {
	const array = new Uint8Array(32);
	crypto.getRandomValues(array);
	return btoa(String.fromCharCode(...Array.from(array)))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
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
	return btoa(String.fromCharCode(...hashBytes))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

export async function generatePKCE(): Promise<{
	codeVerifier: string;
	codeChallenge: string;
	codeChallengeMethod: "S256";
}> {
	const codeVerifier = generateCodeVerifier();
	const codeChallenge = await generateCodeChallenge(codeVerifier);
	return { codeVerifier, codeChallenge, codeChallengeMethod: "S256" };
}

export async function deriveStateSecret(
	sessionSecret: string,
): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(sessionSecret);
	const key = await crypto.subtle.importKey(
		"raw",
		data,
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const info = encoder.encode("hallaxius-auth-state-v3");
	const sig = await crypto.subtle.sign("HMAC", key, info);
	return btoa(String.fromCharCode(...new Uint8Array(sig)))
		.replace(/=/g, "")
		.replace(/\+/g, "-")
		.replace(/\//g, "_");
}

export async function processConfig(
	config: DiscordAuthConfig,
): Promise<InternalConfig> {
	const routerPrefix = config.routes?.prefix ?? DEFAULT_ROUTES.prefix;
	if (!config.clientId || !config.clientSecret) {
		throw new Error("clientId and clientSecret are required");
	}
	if (!config.session?.secret) {
		throw new Error("session.secret is required");
	}
	if (config.session.type && !["jwt", "server"].includes(config.session.type)) {
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

	const stateSecret =
		config.stateSecret ?? (await deriveStateSecret(config.session.secret));

	return {
		clientId: config.clientId,
		clientSecret: config.clientSecret,
		session: {
			...config.session,
			cookieName: config.session.cookieName ?? "discord-auth-session",
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
