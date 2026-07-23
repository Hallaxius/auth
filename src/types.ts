import type { PasswordHasher } from "./utils/password";

export type { PasswordHasher };
export type SessionType = "jwt" | "server";
export interface SessionConfig {
	type?: "jwt" | "server";
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
	secret: string;
	callbackUrl: string;
	scopes?: DiscordScope[];
	prompt?: PromptType;
	storage?: UserStorage;
	routes?: RoutesConfig;
	cookies?: CookieOptions;
	pkce?: boolean;
	redirectUri?: string;
	disablePKCE?: boolean;
	autoRefresh?: Partial<AutoRefreshConfig>;
	bruteForce?: Partial<BruteForceConfig>;
	mfa?: Partial<DiscordMfaConfig>;
	guildRoleSync?: Partial<GuildRoleSyncConfig>;
	csrf?: Partial<CsrfConfig>;
	callbacks?: Callbacks;
	stateSecret?: string;
	session?: SessionConfig;
	meRoute?: string;
}
export interface CookieOptions {
	secure?: boolean;
	sameSite?: "lax" | "strict" | "none";
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
	mfa: DiscordMfaConfig;
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
export interface DiscordMfaConfig {
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
export interface EdgeAuthConfig {
	secret: string;
	cookies?: Array<{ name: string; secret: string }>;
	cookieName?: string;
	loginUrl?: string;
	publicPaths?: string[];
}
export interface EdgeRoleConfig {
	secret: string;
	cookieName?: string;
	loginUrl?: string;
	roles: Record<string, string[]>;
}
export interface MiddlewareAuthConfig {
	cookies: Array<{ name: string; secret: string }>;
	publicPaths: string[];
	loginUrl: string;
}
export interface MiddlewareRoleConfig {
	secret: string;
	cookieName: string;
	loginUrl: string;
	roles: Record<string, string[]>;
}
export interface SessionCookieOptions {
	maxAge?: number;
	path?: string;
	httpOnly?: boolean;
	secure?: boolean;
	sameSite?: "lax" | "strict" | "none";
}
export enum AuthStrategy {
	UsernameOnly = "username-only",
	EmailOnly = "email-only",
	UsernameEmail = "username-email",
}
export interface AuthUser {
	id: string;
	username: string | null;
	email: string | null;
	passwordHash: string;
	roles: string[];
	createdAt: Date;
	updatedAt: Date;
}
export interface CreateCredentialsUserData {
	username?: string;
	email?: string;
	passwordHash?: string;
	roles?: string[];
}
export interface AuthUserIdentifier {
	username?: string;
	email?: string;
}
export interface CredentialsAuthResult {
	user: AuthUser;
	token: string;
}
export interface CredentialsClientConfig {
	strategy: AuthStrategy;
	secret: string;
	expiresIn?: string | number;
	cookieName?: string;
	cookiePath?: string;
	httpOnly?: boolean;
	secure?: boolean;
	sameSite?: "lax" | "strict" | "none";
	defaultRoles?: string[];
	minPasswordLength?: number;
}
export interface InternalCredentialsConfig {
	strategy: AuthStrategy;
	secret: string;
	expiresIn: string | number;
	cookieName: string;
	cookiePath: string;
	httpOnly: boolean;
	secure: boolean;
	sameSite: "lax" | "strict" | "none";
	defaultRoles: string[];
	minPasswordLength: number;
}
export interface AuthUserStorage {
	findByUsername(username: string): Promise<AuthUser | null>;
	findByEmail(email: string): Promise<AuthUser | null>;
	findById(id: string): Promise<AuthUser | null>;
	create(
		data: Omit<AuthUser, "id" | "createdAt" | "updatedAt">,
	): Promise<AuthUser>;
	update(userId: string, data: Partial<AuthUser>): Promise<AuthUser>;
	delete(userId: string): Promise<void>;
}
export interface CredentialsConfig {
	strategy: AuthStrategy;
	session: {
		secret: string;
		expiresIn?: string | number;
		cookieName?: string;
	};
	storage: AuthUserStorage;
	hasher: PasswordHasher;
	bruteForce?: Partial<BruteForceConfig>;
	cookiePath?: string;
	httpOnly?: boolean;
	secure?: boolean;
	sameSite?: "lax" | "strict" | "none";
}
export interface CredentialsResult {
	handleRegister: (request: Request) => Promise<Response>;
	handleLogin: (request: Request) => Promise<Response>;
	handleLogout: (request: Request) => Promise<Response>;
	handleMe: (request: Request) => Promise<Response>;
	getSession: (request: Request) => Promise<AuthUser | null>;
	withAuth: <
		T extends (
			request: Request,
			ctx: { user: AuthUser },
		) => Promise<Response> | Response,
	>(
		handler: T,
	) => (request: Request) => Promise<Response>;
}
export interface ResetTokenStorage {
	create(data: {
		selector: string;
		validatorHash: string;
		expiry: number;
		userId: string;
		email: string;
		username: string;
	}): Promise<void>;
	findBySelector(selector: string): Promise<{
		validatorHash: string;
		expiry: number;
		userId: string;
		email: string;
		username: string;
		usedAt?: number;
	} | null>;
	consume(
		selector: string,
	): Promise<{ userId: string; email: string; username: string } | null>;
	delete(selector: string): Promise<void>;
}
export interface ResetNotifier {
	send(
		token: {
			selector: string;
			validator: string;
		},
		userId: string,
		email: string,
		username: string,
	): Promise<void>;
}
export interface PasswordResetConfig {
	storage: ResetTokenStorage;
	notifier: ResetNotifier;
	hasher: PasswordHasher;
	minPasswordLength?: number;
	tokenExpirationSeconds?: number;
	forgotPasswordRateLimit?: {
		maxAttempts: number;
		windowMs: number;
		storage?: BruteForceStorage;
	};
	resetPasswordRateLimit?: {
		maxAttempts: number;
		windowMs: number;
		storage?: BruteForceStorage;
	};
	onPasswordReset?: (userId: string, newPasswordHash: string) => Promise<void>;
	userLookup?: (emailOrUsername: string) => Promise<{
		userId: string;
		email: string;
		username: string;
	} | null>;
}
export interface RequestResetResult {
	processed: boolean;
}
export interface ConsumeResetTokenResult {
	userId: string;
	email: string;
	username: string;
}
export interface ResetPasswordResult {
	success: true;
}
export type MfaMethod = "totp" | "backup_codes";
export interface MfaFactoryConfig {
	storage: MfaStorage;
	secret: string;
	issuer?: string;
	allowedMethods?: MfaMethod[];
	verifyPassword?: (userId: string, password: string) => Promise<boolean>;
}
export interface MfaStorage {
	getSecret(userId: string): Promise<string | null>;
	setSecret(userId: string, encryptedSecret: string): Promise<void>;
	deleteSecret(userId: string): Promise<void>;
	getBackupCodes(userId: string): Promise<string[] | null>;
	setBackupCodes(userId: string, hashedCodes: string[]): Promise<void>;
	consumeBackupCode(userId: string, codeIndex: number): Promise<void>;
	getLastUsedCounter(userId: string): Promise<number | null>;
	setLastUsedCounter(userId: string, counter: number): Promise<void>;
}
export interface TotpSetupResult {
	secret: string;
	uri: string;
	backupCodes: string[];
	pendingToken: string;
}
export interface MfaVerifyResult {
	success: true;
	backupCodes?: string[];
}
export interface MfaChallengeResult {
	success: true;
	method: MfaMethod;
}
export interface RateLimitConfig {
	maxRequests: number;
	windowMs: number;
	keyBy?: (request: Request) => string;
	storage?: RateLimitStorage;
}
export interface RateLimitStorage {
	increment(
		key: string,
		windowMs: number,
	): Promise<{ count: number; resetAt: number }>;
	reset(key: string): Promise<void>;
}
export interface RateLimitResult {
	allowed: boolean;
	limit: number;
	remaining: number;
	resetAt: number;
	retryAfter?: number;
}

export interface TokenRevocationStorage {
	isRevoked(jti: string): Promise<boolean>;
	revoke(jti: string, ttlSeconds: number): Promise<void>;
}

export interface SecurityLogger {
	debug(message: string, context?: Record<string, unknown>): void;
	info(message: string, context?: Record<string, unknown>): void;
	warn(message: string, context?: Record<string, unknown>): void;
	error(message: string, context?: Record<string, unknown>): void;
}
