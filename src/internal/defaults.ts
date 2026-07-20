import type {
	AutoRefreshConfig,
	BruteForceConfig,
	Callbacks,
	CsrfConfig,
	DiscordMfaConfig,
	DiscordScope,
	GuildRoleSyncConfig,
	RoutesConfig,
} from "../types";

export const DEFAULT_SCOPES: readonly DiscordScope[] = ["identify"];

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

export const DEFAULT_AUTO_REFRESH: AutoRefreshConfig = {
	enabled: true,
	thresholdSeconds: 300,
	maxRetries: 1,
};

export const DEFAULT_BRUTE_FORCE: BruteForceConfig = {
	enabled: true,
	maxAttempts: 5,
	windowMs: 15 * 60 * 1000,
	blockDurationMs: 30 * 60 * 1000,
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
	ttlMs: 5 * 60 * 1000,
	singleUse: true,
	bindToSession: true,
	bindToUserAgent: true,
};
