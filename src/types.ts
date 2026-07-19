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
	stateSecret?: string;
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
	stateSecret: string;
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

export interface DiscordConnection {
	id: string;
	name: string;
	type: string;
	verified: boolean;
	friend_sync: boolean;
	show_activity: boolean;
	visibility: number;
}

export interface DiscordClientInterface {
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

export interface GuildMember {
	user: DiscordUser;
	nick: string | null;
	roles: string[];
	joinedAt: string;
	premiumSince: string | null;
	deaf: boolean;
	mute: boolean;
	pending: boolean;
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

export interface TypedCallbackQuery extends CallbackQuery {
	error?: OAuth2ErrorCode;
}

export interface TypedErrorQuery extends ErrorQuery {
	error: OAuth2ErrorCode;
}

export interface CallbackContext {
	config: InternalConfig;
	client: DiscordClientInterface;
	storage?: UserStorage;
	code: string;
	codeVerifier?: string;
	sessionId?: string;
	userAgent?: string;
}

export interface LoginContext {
	config: InternalConfig;
	client: DiscordClientInterface;
	storage?: UserStorage;
}

export interface RouteHelpers<_Config extends DiscordAuthConfig> {
	callback: (query: CallbackQuery) => Promise<Response>;
	login: (query?: LoginQuery) => Promise<Response>;
	error: (query: ErrorQuery) => Promise<Response>;
}

export interface TypedRouteHandlers<_Config extends DiscordAuthConfig> {
	callback: (query: TypedCallbackQuery) => Promise<Response>;
	login: (query?: LoginQuery) => Promise<Response>;
	error: (query: TypedErrorQuery) => Promise<Response>;
}
