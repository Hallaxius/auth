import type {
	BruteForceConfig,
	Callbacks,
	CsrfConfig,
	DiscordMfaConfig,
	DiscordScope,
	GuildRoleSyncConfig,
	RoutesConfig,
} from "../types";

export const DEFAULT_SCOPES: readonly DiscordScope[] = ["identify"];

export const CACHE_SIZES = {
	DEFAULT_RATE_LIMIT: 50_000,
	BRUTE_FORCE: 10_000,
	SESSION_TRACKER: 5_000,
	STATE_STORAGE: 10_000,
	TOKEN_REVOCATION: 10_000,
} as const;

export const TIME_CONSTANTS = {
	CSRF_TTL_MS: 5 * 60 * 1000,
	BRUTE_FORCE_WINDOW_MS: 15 * 60 * 1000,
	BRUTE_FORCE_BLOCK_MS: 30 * 60 * 1000,
	GUILD_ROLE_SYNC_CACHE_TTL_MS: 60 * 60 * 1000,
} as const;

export const LIMIT_CONSTANTS = {
	BRUTE_FORCE_MAX_ATTEMPTS: 5,
	RATE_LIMIT_MAX_REQUESTS: 100,
	RATE_LIMIT_WINDOW_MS: 60 * 1000,
} as const;

export const DEFAULT_SESSION_TTL_SECONDS = 604800;

export const DEFAULT_ROUTES: Required<RoutesConfig> = {
	prefix: "/auth/discord",
	callback: "/auth/discord/callback",
	logout: "/auth/discord/logout",
	error: "/auth/discord/error",
};

export const DEFAULT_CALLBACKS: Required<Callbacks> = {
	onSuccess: async () => undefined,
	onError: async () => undefined,
};

export const DEFAULT_BRUTE_FORCE: BruteForceConfig = {
	enabled: true,
	maxAttempts: LIMIT_CONSTANTS.BRUTE_FORCE_MAX_ATTEMPTS,
	windowMs: TIME_CONSTANTS.BRUTE_FORCE_WINDOW_MS,
	blockDurationMs: TIME_CONSTANTS.BRUTE_FORCE_BLOCK_MS,
};

export const DEFAULT_MFA: DiscordMfaConfig = {
	enabled: false,
	requireMfa: false,
	allowedMethods: ["totp", "sms", "backup_codes"],
};

export const DEFAULT_GUILD_ROLE_SYNC: GuildRoleSyncConfig = {
	enabled: false,
	guildId: "",
	roleMap: {},
	cacheTtlMs: 60 * 60 * 1000,
	syncOnLogin: false,
	botToken: "",
};

export const DEFAULT_CSRF: CsrfConfig = {
	enabled: true,
	ttlMs: TIME_CONSTANTS.CSRF_TTL_MS,
	singleUse: true,
	bindToSession: true,
	bindToUserAgent: true,
};

export const DEFAULT_GUILD_ROLE_SYNC_CACHE_TTL_MS =
	TIME_CONSTANTS.GUILD_ROLE_SYNC_CACHE_TTL_MS;
