/**
 * v3 Config — Self-contained implementations
 *
 * PKCE helpers, config processing, and typed route handlers.
 */

// crypto is available globally in Bun/Node

// ============================================================================
// Types (inlined from core/types.ts — only those needed by config)
// ============================================================================

export type SessionType = "jwt" | "server";

export interface SessionConfig {
	type: SessionType;
	secret: string;
	expiresIn?: string | number;
	cookieName?: string;
	cookiePath?: string;
	httpOnly?: boolean;
	secure?: boolean;
	sameSite?: "lax" | "strict" | "none";
}

export interface SessionData {
	discordId: string;
	username: string;
	globalName: string | null;
	avatar: string | null;
	email: string | null;
	locale: string;
	roles?: string[];
	mfaEnabled?: boolean;
}

export type DiscordScope =
	| "identify"
	| "email"
	| "guilds"
	| "guilds.join"
	| "guilds.members.read"
	| "connections"
	| "role_connections.write"
	| "rpc"
	| "rpc.notifications.read"
	| "rpc.voice.read"
	| "rpc.voice.write"
	| "activities.read"
	| "activities.write"
	| "bot"
	| "webhook.incoming"
	| "messages.read"
	| "applications.builds.upload"
	| "applications.builds.read"
	| "applications.commands"
	| "applications.commands.permissions.update"
	| "applications.store.update"
	| "applications.entitlements"
	| "relationships.read"
	| "voice"
	| "dm_channels.read";

export type PromptType = "consent" | "none";

export interface OAuth2UrlParams {
	clientId: string;
	redirectUri: string;
	scopes: DiscordScope[];
	state: string;
	prompt?: PromptType;
	responseType?: "code";
}

export interface TokenRequestParams {
	clientId: string;
	clientSecret: string;
	code: string;
	redirectUri: string;
	grantType?: "authorization_code";
	codeVerifier?: string;
}

export interface PKCEParams {
	codeVerifier: string;
	codeChallenge: string;
	codeChallengeMethod: "S256";
}

export interface RefreshTokenParams {
	clientId: string;
	clientSecret: string;
	refreshToken: string;
	scopes?: DiscordScope[];
}

export interface RevokeTokenParams {
	clientId: string;
	clientSecret: string;
	accessToken: string;
}

export interface Callbacks {
	onSuccess?: (
		user: DiscordUser,
		tokens: DiscordTokenResponse,
	) => Promise<{ redirect?: string } | undefined>;
	onError?: (
		error: Error,
		phase: "auth" | "callback" | "session",
	) => Promise<{ redirect?: string } | undefined>;
}

export interface RoutesConfig {
	prefix?: string;
	callback?: string;
	logout?: string;
	error?: string;
}

export interface StoredUser {
	id: string;
	discordId: string;
	username: string;
	globalName: string | null;
	avatar: string | null;
	email: string | null;
	locale: string;
	roles: string[];
	mfaEnabled: boolean;
	accessToken: string;
	refreshToken: string;
	tokenExpiresAt: number;
	createdAt: Date;
	updatedAt: Date;
}

export type SafeStoredUser = Omit<StoredUser, "accessToken" | "refreshToken">;

export interface AddMemberParams {
	guildId: string;
	userId: string;
	accessToken: string;
	botToken: string;
	nick?: string;
	roles?: string[];
}

export interface GetGuildMemberParams {
	guildId: string;
	userId: string;
	botToken: string;
}

export interface DiscordGuildMember {
	user: DiscordUser;
	nick: string | null;
	roles: string[];
	joined_at: string;
	premium_since: string | null;
	deaf: boolean;
	mute: boolean;
	pending: boolean;
}

export interface CreateUserData {
	discordId: string;
	username: string;
	globalName: string | null;
	avatar: string | null;
	email: string | null;
	locale: string;
	mfaEnabled?: boolean;
	roles: string[];
	accessToken: string;
	refreshToken: string;
	tokenExpiresAt: number;
}

export interface UserStorage {
	findByDiscordId(discordId: string): Promise<StoredUser | null>;
	create(data: CreateUserData): Promise<StoredUser>;
	update(discordId: string, data: Partial<CreateUserData>): Promise<StoredUser>;
	delete(discordId: string): Promise<void>;
}

export interface DiscordAuthConfig {
	clientId: string;
	clientSecret: string;
	session: SessionConfig;
	scopes?: DiscordScope[];
	prompt?: PromptType;
	routes?: RoutesConfig;
	callbacks?: Callbacks;
	storage?: UserStorage;
	meRoute?: string;
	redirectUri?: string;
	disablePKCE?: boolean;
	autoRefresh?: Partial<AutoRefreshConfig>;
	bruteForce?: Partial<BruteForceConfig>;
	mfa?: Partial<MfaConfig>;
	guildRoleSync?: Partial<GuildRoleSyncConfig>;
	csrf?: Partial<CsrfConfig>;
}

export interface InternalConfig {
	clientId: string;
	clientSecret: string;
	session: SessionConfig;
	scopes: DiscordScope[];
	prompt: PromptType;
	routes: Required<RoutesConfig>;
	callbacks: Required<Callbacks>;
	redirectUri: string;
	storage?: UserStorage;
	meRoute: string;
	disablePKCE: boolean;
	autoRefresh: AutoRefreshConfig;
	bruteForce: BruteForceConfig;
	mfa: MfaConfig;
	guildRoleSync: GuildRoleSyncConfig;
	csrf: CsrfConfig;
}

export interface AutoRefreshConfig {
	enabled: boolean;
	thresholdSeconds: number;
	maxRetries: number;
}

export interface BruteForceConfig {
	enabled: boolean;
	maxAttempts: number;
	windowMs: number;
	blockDurationMs: number;
	storage?: BruteForceStorage;
}

export interface BruteForceStorage {
	increment(key: string, windowMs: number): Promise<number>;
	isBlocked(key: string): Promise<boolean>;
	reset(key: string): Promise<void>;
	block(key: string, durationMs: number): Promise<void>;
	getCount(key: string): Promise<number>;
}

export interface MfaConfig {
	enabled: boolean;
	requireMfa: boolean;
	allowedMethods?: ("totp" | "sms" | "backup_codes")[];
}

export interface GuildRoleSyncConfig {
	enabled: boolean;
	guildId: string;
	roleMap: Record<string, string[]>;
	cacheTtlMs: number;
	syncOnLogin: boolean;
	botToken: string;
}

export interface CsrfConfig {
	enabled: boolean;
	ttlMs: number;
	singleUse: boolean;
	bindToSession: boolean;
	bindToUserAgent: boolean;
}

export interface CallbackQuery {
	code?: string;
	state?: string;
	error?: string;
	error_description?: string;
}

export interface LoginQuery {
	redirect?: string;
	prompt?: "consent" | "none";
}

export interface ErrorQuery {
	error: string;
	error_description?: string;
}

export interface RouteHelpers<_Config extends DiscordAuthConfig> {
	callback: (query: CallbackQuery) => Promise<Response>;
	login: (query?: LoginQuery) => Promise<Response>;
	error: (query: ErrorQuery) => Promise<Response>;
}

// Types needed for processConfig
export interface DiscordUser {
	id: string;
	username: string;
	discriminator: string;
	global_name: string | null;
	avatar: string | null;
	avatar_decoration: string | null;
	email: string | null;
	verified: boolean;
	locale: string;
	mfa_enabled: boolean;
	banner: string | null;
	banner_color: string | null;
	accent_color: number | null;
	premium_type: number;
	public_flags: number;
	flags?: number;
}

export interface DiscordTokenResponse {
	access_token: string;
	token_type: string;
	expires_in: number;
	refresh_token: string;
	scope: string;
	webhook?: {
		id: string;
		type: number;
		token: string;
		guild_id: string;
		channel_id: string;
		name: string;
	};
	guild?: {
		id: string;
		name: string;
		icon: string | null;
		features: string[];
		owner: boolean;
		permissions: string;
	};
}

declare const process: { env: Record<string, string | undefined> };

const DEFAULT_SCOPES: readonly DiscordScope[] = ["identify"];
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

// ============================================================================
// PKCE Helpers (inlined from core/config.ts)
// ============================================================================

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

// ============================================================================
// Config Processing (inlined from core/config.ts)
// ============================================================================

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

// ============================================================================
// Typed Route Handlers (inlined from core/route-helpers.ts)
// ============================================================================

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

export interface CallbackContext {
	config: InternalConfig;
	client: DiscordClient;
	storage?: UserStorage;
	code: string;
	codeVerifier?: string;
	sessionId?: string;
	userAgent?: string;
}

export interface LoginContext {
	config: InternalConfig;
	client: DiscordClient;
	storage?: UserStorage;
}

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

// Forward declarations for types used in processConfig
export interface DiscordClient {
	generateAuthUrl(
		params: OAuth2UrlParams & {
			codeChallenge?: string;
			codeChallengeMethod?: string;
		},
	): string;
	exchangeCode(params: TokenRequestParams): Promise<DiscordTokenResponse>;
	refreshToken(params: RefreshTokenParams): Promise<DiscordTokenResponse>;
	revokeToken(params: RevokeTokenParams): Promise<void>;
	addMember(params: AddMemberParams): Promise<void>;
	getUser(accessToken: string): Promise<DiscordUser>;
	getUserGuilds(accessToken: string): Promise<DiscordGuild[]>;
	getUserConnections(accessToken: string): Promise<DiscordConnection[]>;
	getGuildMember(
		guildId: string,
		userId: string,
		botToken: string,
	): Promise<DiscordGuildMember>;
	getGuildMemberRoles(
		guildId: string,
		userId: string,
		botToken: string,
	): Promise<string[]>;
}

export interface DiscordConnection {
	id: string;
	name: string;
	type: string;
	verified: boolean;
	friend_sync: boolean;
	show_activity: boolean;
	visibility: number;
}

export interface DiscordGuild {
	id: string;
	name: string;
	icon: string | null;
	owner: boolean;
	permissions: string;
	features: string[];
	approximate_member_count?: number;
	approximate_presence_count?: number;
}
