import type {
	AutoRefreshConfig,
	BruteForceConfig,
	Callbacks,
	CsrfConfig,
	DiscordAuthConfig,
	DiscordScope,
	GuildRoleSyncConfig,
	InternalConfig,
	MfaConfig,
	RoutesConfig,
} from "./types";

declare const process: { env: Record<string, string | undefined> };

const DEFAULT_SCOPES = ["identify"] as const;
const DEFAULT_ROUTES: Required<RoutesConfig> = {
	prefix: "/auth/discord",
	callback: "/auth/discord/callback",
	logout: "/auth/discord/logout",
	error: "/auth/discord/error",
};

const DEFAULT_CALLBACKS: Required<Callbacks> = {
	onSuccess: async () => undefined,
	onError: async () => undefined,
};

const DEFAULT_AUTO_REFRESH: AutoRefreshConfig = {
	enabled: true,
	thresholdSeconds: 300,
	maxRetries: 1,
};

const DEFAULT_BRUTE_FORCE: BruteForceConfig = {
	enabled: true,
	maxAttempts: 5,
	windowMs: 15 * 60 * 1000,
	blockDurationMs: 30 * 60 * 1000,
	storage: undefined,
};

const DEFAULT_MFA: MfaConfig = {
	enabled: false,
	requireMfa: false,
	allowedMethods: ["totp", "sms", "backup_codes"],
};

const DEFAULT_GUILD_ROLE_SYNC: GuildRoleSyncConfig = {
	enabled: false,
	guildId: "",
	roleMap: {},
	cacheTtlMs: 60 * 60 * 1000,
	syncOnLogin: false,
	botToken: "",
};

const DEFAULT_CSRF: CsrfConfig = {
	enabled: true,
	ttlMs: 5 * 60 * 1000,
	singleUse: true,
	bindToSession: true,
	bindToUserAgent: true,
};

/**
 * Processes input configuration and returns complete internal configuration.
 * Ensures all optional fields have default values.
 */
export function processConfig(config: DiscordAuthConfig): InternalConfig {
	const routerPrefix = config.routes?.prefix ?? DEFAULT_ROUTES.prefix;

	if (!config.clientId || !config.clientSecret) {
		throw new Error("clientId and clientSecret are required");
	}

	if (!config.session?.secret) {
		throw new Error("session.secret is required");
	}

	const redirectUri =
		config.redirectUri ??
		process.env.DISCORD_REDIRECT_URI ??
		`${routerPrefix}/callback`.replace(/^\/\//, "");

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
	};
}

/**
 * Generates code_verifier for PKCE (S256)
 * Implementation according to RFC 7636
 */
export function generateCodeVerifier(): string {
	const array = new Uint8Array(32);
	crypto.getRandomValues(array);
	return btoa(String.fromCharCode(...Array.from(array)))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

/**
 * Generates code_challenge from code_verifier using S256
 */
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
		hashBytes[i] = parseInt(hashHex.slice(i * 2, i * 2 + 2), 16);
	}

	return btoa(String.fromCharCode(...hashBytes))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

/**
 * Generates code_verifier and code_challenge for PKCE
 */
export async function generatePKCE(): Promise<{
	codeVerifier: string;
	codeChallenge: string;
	codeChallengeMethod: "S256";
}> {
	const codeVerifier = generateCodeVerifier();
	const codeChallenge = await generateCodeChallenge(codeVerifier);
	return {
		codeVerifier,
		codeChallenge,
		codeChallengeMethod: "S256",
	};
}

/**
 * Validates if a string is a valid code_verifier (PKCE)
 */
export function isValidCodeVerifier(verifier: string): boolean {
	return (
		verifier.length >= 43 &&
		verifier.length <= 128 &&
		/^[A-Za-z0-9-_]+$/.test(verifier)
	);
}

/**
 * Validates if a string is a valid code_challenge (PKCE)
 */
export function isValidCodeChallenge(challenge: string): boolean {
	return (
		challenge.length >= 43 &&
		challenge.length <= 128 &&
		/^[A-Za-z0-9-_]+$/.test(challenge)
	);
}
