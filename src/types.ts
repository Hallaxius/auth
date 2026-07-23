import type { PasswordHasher } from "./utils/password";

export type { PasswordHasher };

/**
 * Session storage type
 * - jwt: Stateless sessions encoded in JWT
 * - server: Server-side session storage
 */
export type SessionType = "jwt" | "server";

/**
 * Session configuration for JWT or server-side sessions
 */
export interface SessionConfig {
	/** Session storage type (default: "jwt") */
	type?: "jwt" | "server";
	/** Secret key for JWT signing (minimum 32 characters) */
	secret: string;
	/** Token expiration time in seconds or ISO 8601 duration (e.g., "1h", "7d") */
	expiresIn?: string | number;
	/** Cookie name for session token (default: "session") */
	cookieName?: string;
	/** Cookie path (default: "/") */
	cookiePath?: string;
	/** HttpOnly flag (default: true) */
	httpOnly?: boolean;
	/** Secure flag (default: true in production) */
	secure?: boolean;
	/** SameSite attribute (default: "strict" in production) */
	sameSite?: "lax" | "strict" | "none";
}
/**
 * Session data stored in JWT or server-side session
 */
export interface SessionData {
	/** Discord user ID */
	discordId: string;
	/** Discord username */
	username: string;
	/** Discord global display name */
	globalName: string | null;
	/** Discord avatar hash */
	avatar: string | null;
	/** Discord email address */
	email: string | null;
	/** Discord locale */
	locale: string;
	/** User roles */
	roles?: string[];
	/** Whether MFA is enabled */
	mfaEnabled?: boolean;
}
/**
 * Discord OAuth2 scope identifiers
 * @see https://discord.com/developers/docs/topics/oauth2#shared-resources-oauth2-scopes
 */
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

/**
 * Discord OAuth2 prompt parameter
 * - consent: Force consent screen
 * - none: Skip consent screen (fails if not pre-authorized)
 */
export type PromptType = "consent" | "none";
/**
 * OAuth2 authorization URL parameters
 */
export interface OAuth2UrlParams {
	/** Discord application client ID */
	clientId: string;
	/** Redirect URI after authorization */
	redirectUri: string;
	/** OAuth2 scopes to request */
	scopes: DiscordScope[];
	/** CSRF protection state parameter */
	state: string;
	/** OAuth2 prompt parameter */
	prompt?: PromptType;
	/** Response type (always "code" for authorization code flow) */
	responseType?: "code";
}
/**
 * Token exchange request parameters
 */
export interface TokenRequestParams {
	/** Discord application client ID */
	clientId: string;
	/** Discord application client secret */
	clientSecret: string;
	/** Authorization code from callback */
	code: string;
	/** Redirect URI (must match authorization request) */
	redirectUri: string;
	/** Grant type (always "authorization_code") */
	grantType?: "authorization_code";
	/** PKCE code verifier (if PKCE enabled) */
	codeVerifier?: string;
}
/**
 * PKCE (Proof Key for Code Exchange) parameters
 * @see https://datatracker.ietf.org/doc/html/rfc7636
 */
export interface PKCEParams {
	/** Random code verifier string */
	codeVerifier: string;
	/** SHA-256 hash of codeVerifier, base64url encoded */
	codeChallenge: string;
	/** Challenge method (always "S256") */
	codeChallengeMethod: "S256";
}
/**
 * Refresh token request parameters
 */
export interface RefreshTokenParams {
	/** Discord application client ID */
	clientId: string;
	/** Discord application client secret */
	clientSecret: string;
	/** Refresh token from previous token response */
	refreshToken: string;
	/** Optional scopes to limit (must be subset of original) */
	scopes?: DiscordScope[];
}
/**
 * Token revocation request parameters
 */
export interface RevokeTokenParams {
	/** Discord application client ID */
	clientId: string;
	/** Discord application client secret */
	clientSecret: string;
	/** Access token to revoke */
	accessToken: string;
}
/**
 * Authentication callback functions
 */
export interface Callbacks {
	/**
	 * Called on successful authentication
	 * @param user - Authenticated Discord user
	 * @param tokens - Discord token response
	 * @returns Optional redirect override
	 */
	onSuccess?: (
		user: DiscordUser,
		tokens: DiscordTokenResponse,
	) => Promise<{ redirect?: string } | undefined>;
	/**
	 * Called on authentication error
	 * @param error - Error that occurred
	 * @param phase - Phase where error occurred ("auth", "callback", "session")
	 * @returns Optional redirect override
	 */
	onError?: (
		error: Error,
		phase: "auth" | "callback" | "session",
	) => Promise<{ redirect?: string } | undefined>;
}
/**
 * Route configuration for Discord auth endpoints
 */
export interface RoutesConfig {
	/** Base path prefix (default: "/auth") */
	prefix?: string;
	/** Callback route path (default: "/callback") */
	callback?: string;
	/** Logout route path (default: "/logout") */
	logout?: string;
	/** Error route path (default: "/error") */
	error?: string;
}
/**
 * Stored user data in database
 */
export interface StoredUser {
	/** Internal user ID */
	id: string;
	/** Discord user ID */
	discordId: string;
	/** Discord username */
	username: string;
	/** Discord global display name */
	globalName: string | null;
	/** Discord avatar hash */
	avatar: string | null;
	/** Discord email */
	email: string | null;
	/** Discord locale */
	locale: string;
	/** User roles */
	roles: string[];
	/** Whether MFA is enabled */
	mfaEnabled: boolean;
	/** Discord access token (encrypted at rest) */
	accessToken: string;
	/** Discord refresh token (encrypted at rest) */
	refreshToken: string;
	/** Token expiration timestamp (ms) */
	tokenExpiresAt: number;
	/** User creation timestamp */
	createdAt: Date;
	/** Last update timestamp */
	updatedAt: Date;
}
/**
 * Stored user data with sensitive tokens omitted (safe for client)
 */
export type SafeStoredUser = Omit<StoredUser, "accessToken" | "refreshToken">;
/**
 * Parameters for adding a member to a Discord guild
 */
export interface AddMemberParams {
	/** Guild ID to add member to */
	guildId: string;
	/** Discord user ID to add */
	userId: string;
	/** Bot access token with guilds.join scope */
	accessToken: string;
	/** Bot token for API calls */
	botToken: string;
	/** Optional nickname */
	nick?: string;
	/** Optional roles to assign */
	roles?: string[];
}
/**
 * Parameters for getting a guild member
 */
export interface GetGuildMemberParams {
	/** Guild ID */
	guildId: string;
	/** Discord user ID */
	userId: string;
	/** Bot token with guilds.members.read scope */
	botToken: string;
}
/**
 * Discord guild member data from API
 */
export interface DiscordGuildMember {
	/** User object */
	user: DiscordUser;
	/** Nickname in guild */
	nick: string | null;
	/** Role IDs */
	roles: string[];
	/** Join timestamp (ISO 8601) */
	joined_at: string;
	/** Premium boost timestamp (ISO 8601) */
	premium_since: string | null;
	/** Whether user is deafened in voice channels */
	deaf: boolean;
	/** Whether user is muted in voice channels */
	mute: boolean;
	/** Whether user has passed guild membership screening */
	pending: boolean;
}
/**
 * Data for creating a new user
 */
export interface CreateUserData {
	/** Discord user ID */
	discordId: string;
	/** Discord username */
	username: string;
	/** Discord global display name */
	globalName: string | null;
	/** Discord avatar hash */
	avatar: string | null;
	/** Discord email */
	email: string | null;
	/** Discord locale */
	locale: string;
	/** Whether MFA is enabled */
	mfaEnabled?: boolean;
	/** User roles */
	roles: string[];
	/** Discord access token */
	accessToken: string;
	/** Discord refresh token */
	refreshToken: string;
	/** Token expiration timestamp (ms) */
	tokenExpiresAt: number;
}
/**
 * User storage interface for database operations
 */
export interface UserStorage {
	/**
	 * Find user by Discord ID
	 * @param discordId - Discord user ID
	 * @returns User or null if not found
	 */
	findByDiscordId(discordId: string): Promise<StoredUser | null>;
	/**
	 * Create a new user
	 * @param data - User data
	 * @returns Created user
	 */
	create(data: CreateUserData): Promise<StoredUser>;
	/**
	 * Update user data
	 * @param discordId - Discord user ID
	 * @param data - Partial user data to update
	 * @returns Updated user
	 */
	update(discordId: string, data: Partial<CreateUserData>): Promise<StoredUser>;
	/**
	 * Delete user
	 * @param discordId - Discord user ID
	 */
	delete(discordId: string): Promise<void>;
}
/**
 * Discord OAuth2 configuration
 */
export interface DiscordAuthConfig {
	/** Discord application client ID */
	clientId: string;
	/** Discord application client secret */
	clientSecret: string;
	/** Session secret for JWT signing (minimum 32 characters) */
	secret: string;
	/** OAuth2 callback URL */
	callbackUrl: string;
	/** OAuth2 scopes to request */
	scopes?: DiscordScope[];
	/** OAuth2 prompt parameter */
	prompt?: PromptType;
	/** User storage interface */
	storage?: UserStorage;
	/** Route configuration */
	routes?: RoutesConfig;
	/** Cookie options */
	cookies?: CookieOptions;
	/** Enable PKCE (recommended) */
	pkce?: boolean;
	/** Override redirect URI */
	redirectUri?: string;
	/** Disable PKCE (not recommended) */
	disablePKCE?: boolean;
	/** Auto-refresh token configuration */
	autoRefresh?: Partial<AutoRefreshConfig>;
	/** Brute force protection configuration */
	bruteForce?: Partial<BruteForceConfig>;
	/** MFA configuration */
	mfa?: Partial<DiscordMfaConfig>;
	/** Guild role sync configuration */
	guildRoleSync?: Partial<GuildRoleSyncConfig>;
	/** CSRF protection configuration */
	csrf?: Partial<CsrfConfig>;
	/** Authentication callbacks */
	callbacks?: Callbacks;
	/** State parameter secret */
	stateSecret?: string;
	/** Session configuration */
	session?: SessionConfig;
	/** /me route path */
	meRoute?: string;
}
/**
 * Cookie configuration options
 */
export interface CookieOptions {
	/** Secure flag (HTTPS only) */
	secure?: boolean;
	/** SameSite attribute */
	sameSite?: "lax" | "strict" | "none";
}
/**
 * Internal configuration (normalized defaults)
 */
export interface InternalConfig {
	/** Discord application client ID */
	clientId: string;
	/** Discord application client secret */
	clientSecret: string;
	/** Session configuration */
	session: SessionConfig;
	/** OAuth2 scopes */
	scopes: DiscordScope[];
	/** OAuth2 prompt */
	prompt: PromptType;
	/** Route configuration */
	routes: Required<RoutesConfig>;
	/** Authentication callbacks */
	callbacks: Required<Callbacks>;
	/** Redirect URI */
	redirectUri: string;
	/** User storage */
	storage?: UserStorage;
	/** /me route */
	meRoute: string;
	/** PKCE disabled flag */
	disablePKCE: boolean;
	/** Auto-refresh configuration */
	autoRefresh: AutoRefreshConfig;
	/** Brute force protection configuration */
	bruteForce: BruteForceConfig;
	/** MFA configuration */
	mfa: DiscordMfaConfig;
	/** Guild role sync configuration */
	guildRoleSync: GuildRoleSyncConfig;
	/** CSRF protection configuration */
	csrf: CsrfConfig;
	/** State secret */
	stateSecret: string;
}
/**
 * Auto-refresh token configuration
 */
export interface AutoRefreshConfig {
	/** Enable auto-refresh */
	enabled: boolean;
	/** Refresh threshold in seconds before expiration */
	thresholdSeconds: number;
	/** Maximum retry attempts */
	maxRetries: number;
}
/**
 * Brute force protection configuration
 */
export interface BruteForceConfig {
	/** Enable brute force protection */
	enabled: boolean;
	/** Maximum attempts before blocking */
	maxAttempts: number;
	/** Time window in milliseconds */
	windowMs: number;
	/** Block duration in milliseconds */
	blockDurationMs: number;
	/** Storage interface for rate limiting */
	storage?: BruteForceStorage;
}
/**
 * Brute force storage interface
 */
export interface BruteForceStorage {
	/**
	 * Increment attempt counter
	 * @param key - Identifier (e.g., IP, user ID)
	 * @param windowMs - Time window in milliseconds
	 * @returns Current attempt count
	 */
	increment(key: string, windowMs: number): Promise<number>;
	/**
	 * Check if key is blocked
	 * @param key - Identifier
	 * @returns true if blocked
	 */
	isBlocked(key: string): Promise<boolean>;
	/**
	 * Reset attempt counter
	 * @param key - Identifier
	 */
	reset(key: string): Promise<void>;
	/**
	 * Block key for duration
	 * @param key - Identifier
	 * @param durationMs - Block duration in milliseconds
	 */
	block(key: string, durationMs: number): Promise<void>;
	/**
	 * Get current attempt count
	 * @param key - Identifier
	 * @returns Attempt count
	 */
	getCount(key: string): Promise<number>;
}
/**
 * MFA configuration for Discord auth
 */
export interface DiscordMfaConfig {
	/** Enable MFA requirement */
	enabled: boolean;
	/** Require MFA for login */
	requireMfa: boolean;
	/** Allowed MFA methods */
	allowedMethods?: ("totp" | "sms" | "backup_codes")[];
}
/**
 * Guild role synchronization configuration
 */
export interface GuildRoleSyncConfig {
	/** Enable role sync */
	enabled: boolean;
	/** Guild ID to sync roles in */
	guildId: string;
	/** Mapping of Discord roles to application roles */
	roleMap: Record<string, string[]>;
	/** Cache TTL in milliseconds */
	cacheTtlMs: number;
	/** Sync roles on login */
	syncOnLogin: boolean;
	/** Bot token with guilds.members.read scope */
	botToken: string;
}
/**
 * CSRF protection configuration
 */
export interface CsrfConfig {
	/** Enable CSRF protection */
	enabled: boolean;
	/** Token TTL in milliseconds */
	ttlMs: number;
	/** Single-use tokens */
	singleUse: boolean;
	/** Bind token to session ID */
	bindToSession: boolean;
	/** Bind token to User-Agent header */
	bindToUserAgent: boolean;
}
/**
 * Callback query parameters
 */
export interface CallbackQuery {
	/** Authorization code */
	code?: string;
	/** State parameter */
	state?: string;
	/** Error code */
	error?: string;
	/** Error description */
	error_description?: string;
}
/**
 * Login query parameters
 */
export interface LoginQuery {
	/** Redirect after login */
	redirect?: string;
	/** OAuth2 prompt */
	prompt?: "consent" | "none";
}
/**
 * Error query parameters
 */
export interface ErrorQuery {
	/** Error code */
	error: string;
	/** Error description */
	error_description?: string;
}
/**
 * Discord user object from API
 */
export interface DiscordUser {
	/** Discord user ID */
	id: string;
	/** Discord username */
	username: string;
	/** Discord discriminator (legacy) */
	discriminator: string;
	/** Discord global display name */
	global_name: string | null;
	/** Discord avatar hash */
	avatar: string | null;
	/** Discord avatar decoration hash */
	avatar_decoration: string | null;
	/** Discord email */
	email: string | null;
	/** Whether email is verified */
	verified: boolean;
	/** Discord locale */
	locale: string;
	/** Whether MFA is enabled */
	mfa_enabled: boolean;
	/** Discord banner hash */
	banner: string | null;
	/** Discord banner color */
	banner_color: string | null;
	/** Discord accent color */
	accent_color: number | null;
	/** Discord premium type */
	premium_type: number;
	/** Discord public flags */
	public_flags: number;
	/** Discord flags */
	flags?: number;
}
/**
 * Discord OAuth2 token response
 */
export interface DiscordTokenResponse {
	/** Access token */
	access_token: string;
	/** Token type (always "Bearer") */
	token_type: string;
	/** Token expiration in seconds */
	expires_in: number;
	/** Refresh token */
	refresh_token: string;
	/** Granted scopes */
	scope: string;
	/** Incoming webhook (if bot scope) */
	webhook?: {
		/** Webhook ID */
		id: string;
		/** Webhook type */
		type: number;
		/** Webhook token */
		token: string;
		/** Guild ID */
		guild_id: string;
		/** Channel ID */
		channel_id: string;
		/** Webhook name */
		name: string;
	};
	/** Guild information (if guilds scope) */
	guild?: {
		/** Guild ID */
		id: string;
		/** Guild name */
		name: string;
		/** Guild icon hash */
		icon: string | null;
		/** Guild features */
		features: string[];
		/** Whether user is owner */
		owner: boolean;
		/** User permissions */
		permissions: string;
	};
}
/**
 * Discord guild object
 */
export interface DiscordGuild {
	/** Guild ID */
	id: string;
	/** Guild name */
	name: string;
	/** Guild icon hash */
	icon: string | null;
	/** Whether user is owner */
	owner: boolean;
	/** User permissions */
	permissions: string;
	/** Guild features */
	features: string[];
	/** Approximate member count */
	approximate_member_count?: number;
	/** Approximate online presence count */
	approximate_presence_count?: number;
}
/**
 * Discord OAuth2 connection object
 */
export interface DiscordConnection {
	/** Connection ID */
	id: string;
	/** Connection name */
	name: string;
	/** Connection type (e.g., "twitch", "youtube") */
	type: string;
	/** Whether connection is verified */
	verified: boolean;
	/** Whether to sync friends */
	friend_sync: boolean;
	/** Whether to show activity */
	show_activity: boolean;
	/** Visibility level */
	visibility: number;
}
/**
 * Discord client interface for OAuth2 operations
 */
export interface DiscordClientInterface {
	/**
	 * Generate OAuth2 authorization URL
	 * @param params - OAuth2 parameters
	 * @returns Authorization URL
	 */
	generateAuthUrl(
		params: OAuth2UrlParams & {
			codeChallenge?: string;
			codeChallengeMethod?: string;
		},
	): string;
	/**
	 * Exchange authorization code for tokens
	 * @param params - Token request parameters
	 * @returns Token response
	 */
	exchangeCode(params: TokenRequestParams): Promise<DiscordTokenResponse>;
	/**
	 * Refresh access token
	 * @param params - Refresh token parameters
	 * @returns New token response
	 */
	refreshToken(params: RefreshTokenParams): Promise<DiscordTokenResponse>;
	/**
	 * Revoke access token
	 * @param params - Revoke token parameters
	 */
	revokeToken(params: RevokeTokenParams): Promise<void>;
	/**
	 * Add member to guild
	 * @param params - Add member parameters
	 */
	addMember(params: AddMemberParams): Promise<void>;
	/**
	 * Get current user from Discord API
	 * @param accessToken - Discord access token
	 * @returns Discord user object
	 */
	getUser(accessToken: string): Promise<DiscordUser>;
	/**
	 * Get user's guilds from Discord API
	 * @param accessToken - Discord access token
	 * @returns Array of guilds
	 */
	getUserGuilds(accessToken: string): Promise<DiscordGuild[]>;
	/**
	 * Get user's connections from Discord API
	 * @param accessToken - Discord access token
	 * @returns Array of connections
	 */
	getUserConnections(accessToken: string): Promise<DiscordConnection[]>;
	/**
	 * Get guild member from Discord API
	 * @param guildId - Guild ID
	 * @param userId - User ID
	 * @param botToken - Bot token
	 * @returns Guild member object
	 */
	getGuildMember(
		guildId: string,
		userId: string,
		botToken: string,
	): Promise<DiscordGuildMember>;
	/**
	 * Get guild member roles
	 * @param guildId - Guild ID
	 * @param userId - User ID
	 * @param botToken - Bot token
	 * @returns Array of role IDs
	 */
	getGuildMemberRoles(
		guildId: string,
		userId: string,
		botToken: string,
	): Promise<string[]>;
}
/**
 * Guild member object (normalized)
 */
export interface GuildMember {
	/** User object */
	user: DiscordUser;
	/** Nickname */
	nick: string | null;
	/** Role IDs */
	roles: string[];
	/** Join timestamp */
	joinedAt: string;
	/** Premium boost timestamp */
	premiumSince: string | null;
	/** Whether deafened */
	deaf: boolean;
	/** Whether muted */
	mute: boolean;
	/** Whether pending screening */
	pending: boolean;
}
/**
 * OAuth2 error codes
 * @see https://datatracker.ietf.org/doc/html/rfc6749#section-4.1.2.1
 */
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
/**
 * Typed callback query with OAuth2 error codes
 */
export interface TypedCallbackQuery extends CallbackQuery {
	/** OAuth2 error code */
	error?: OAuth2ErrorCode;
}
/**
 * Typed error query with OAuth2 error codes
 */
export interface TypedErrorQuery extends ErrorQuery {
	/** OAuth2 error code */
	error: OAuth2ErrorCode;
}
/**
 * Callback context for authentication flow
 */
export interface CallbackContext {
	/** Internal configuration */
	config: InternalConfig;
	/** Discord client interface */
	client: DiscordClientInterface;
	/** User storage */
	storage?: UserStorage;
	/** Authorization code */
	code: string;
	/** PKCE code verifier */
	codeVerifier?: string;
	/** Session ID */
	sessionId?: string;
	/** User-Agent header */
	userAgent?: string;
}
/**
 * Login context for authentication flow
 */
export interface LoginContext {
	/** Internal configuration */
	config: InternalConfig;
	/** Discord client interface */
	client: DiscordClientInterface;
	/** User storage */
	storage?: UserStorage;
}
/**
 * Route helper functions
 */
export interface RouteHelpers<_Config extends DiscordAuthConfig> {
	/** Handle OAuth2 callback */
	callback: (query: CallbackQuery) => Promise<Response>;
	/** Handle login redirect */
	login: (query?: LoginQuery) => Promise<Response>;
	/** Handle error display */
	error: (query: ErrorQuery) => Promise<Response>;
}
/**
 * Typed route handlers with OAuth2 error codes
 */
export interface TypedRouteHandlers<_Config extends DiscordAuthConfig> {
	/** Handle OAuth2 callback */
	callback: (query: TypedCallbackQuery) => Promise<Response>;
	/** Handle login redirect */
	login: (query?: LoginQuery) => Promise<Response>;
	/** Handle error display */
	error: (query: TypedErrorQuery) => Promise<Response>;
}
/**
 * Edge authentication configuration
 */
export interface EdgeAuthConfig {
	/** Session secret */
	secret: string;
	/** Cookie configurations */
	cookies?: Array<{ name: string; secret: string }>;
	/** Cookie name */
	cookieName?: string;
	/** Login URL */
	loginUrl?: string;
	/** Public paths (no auth required) */
	publicPaths?: string[];
}
/**
 * Edge role-based authentication configuration
 */
export interface EdgeRoleConfig {
	/** Session secret */
	secret: string;
	/** Cookie name */
	cookieName?: string;
	/** Login URL */
	loginUrl?: string;
	/** Role mapping */
	roles: Record<string, string[]>;
}
/**
 * Middleware authentication configuration
 */
export interface MiddlewareAuthConfig {
	/** Cookie configurations */
	cookies: Array<{ name: string; secret: string }>;
	/** Public paths (no auth required) */
	publicPaths: string[];
	/** Login URL */
	loginUrl: string;
}
/**
 * Middleware role-based configuration
 */
export interface MiddlewareRoleConfig {
	/** Session secret */
	secret: string;
	/** Cookie name */
	cookieName: string;
	/** Login URL */
	loginUrl: string;
	/** Role mapping */
	roles: Record<string, string[]>;
}
/**
 * Session cookie configuration options
 */
export interface SessionCookieOptions {
	/** Max-Age in seconds */
	maxAge?: number;
	/** Cookie path */
	path?: string;
	/** HttpOnly flag */
	httpOnly?: boolean;
	/** Secure flag */
	secure?: boolean;
	/** SameSite attribute */
	sameSite?: "lax" | "strict" | "none";
}
/**
 * Authentication strategy for credentials-based auth
 * - username-only: Authenticate with username only
 * - email-only: Authenticate with email only
 * - username-email: Authenticate with either username or email
 */
export enum AuthStrategy {
	UsernameOnly = "username-only",
	EmailOnly = "email-only",
	UsernameEmail = "username-email",
}
/**
 * Auth user stored in database
 */
export interface AuthUser {
	/** User ID */
	id: string;
	/** Username (nullable for email-only strategy) */
	username: string | null;
	/** Email (nullable for username-only strategy) */
	email: string | null;
	/** Password hash */
	passwordHash: string;
	/** User roles */
	roles: string[];
	/** Creation timestamp */
	createdAt: Date;
	/** Last update timestamp */
	updatedAt: Date;
}
/**
 * Data for creating credentials-based user
 */
export interface CreateCredentialsUserData {
	/** Username (optional for email-only strategy) */
	username?: string;
	/** Email (optional for username-only strategy) */
	email?: string;
	/** Password hash */
	passwordHash?: string;
	/** User roles */
	roles?: string[];
}
/**
 * User identifier for authentication lookup
 */
export interface AuthUserIdentifier {
	/** Username */
	username?: string;
	/** Email */
	email?: string;
}
/**
 * Credentials authentication result
 */
export interface CredentialsAuthResult {
	/** Authenticated user */
	user: AuthUser;
	/** JWT token */
	token: string;
}
/**
 * Credentials client configuration
 */
export interface CredentialsClientConfig {
	/** Authentication strategy */
	strategy: AuthStrategy;
	/** JWT secret (minimum 32 characters) */
	secret: string;
	/** Token expiration */
	expiresIn?: string | number;
	/** Cookie name */
	cookieName?: string;
	/** Cookie path */
	cookiePath?: string;
	/** HttpOnly flag */
	httpOnly?: boolean;
	/** Secure flag */
	secure?: boolean;
	/** SameSite attribute */
	sameSite?: "lax" | "strict" | "none";
	/** Default roles for new users */
	defaultRoles?: string[];
	/** Minimum password length */
	minPasswordLength?: number;
}
/**
 * Internal credentials configuration (normalized defaults)
 */
export interface InternalCredentialsConfig {
	/** Authentication strategy */
	strategy: AuthStrategy;
	/** JWT secret */
	secret: string;
	/** Token expiration */
	expiresIn: string | number;
	/** Cookie name */
	cookieName: string;
	/** Cookie path */
	cookiePath: string;
	/** HttpOnly flag */
	httpOnly: boolean;
	/** Secure flag */
	secure: boolean;
	/** SameSite attribute */
	sameSite: "lax" | "strict" | "none";
	/** Default roles */
	defaultRoles: string[];
	/** Minimum password length */
	minPasswordLength: number;
}
/**
 * Auth user storage interface
 */
export interface AuthUserStorage {
	/**
	 * Find user by username
	 * @param username - Username to search
	 * @returns User or null
	 */
	findByUsername(username: string): Promise<AuthUser | null>;
	/**
	 * Find user by email
	 * @param email - Email to search
	 * @returns User or null
	 */
	findByEmail(email: string): Promise<AuthUser | null>;
	/**
	 * Find user by ID
	 * @param id - User ID
	 * @returns User or null
	 */
	findById(id: string): Promise<AuthUser | null>;
	/**
	 * Create new user
	 * @param data - User data (without id, timestamps)
	 * @returns Created user
	 */
	create(
		data: Omit<AuthUser, "id" | "createdAt" | "updatedAt">,
	): Promise<AuthUser>;
	/**
	 * Update user
	 * @param userId - User ID
	 * @param data - Partial user data
	 * @returns Updated user
	 */
	update(userId: string, data: Partial<AuthUser>): Promise<AuthUser>;
	/**
	 * Delete user
	 * @param userId - User ID
	 */
	delete(userId: string): Promise<void>;
}
/**
 * Credentials configuration
 */
export interface CredentialsConfig {
	/** Authentication strategy */
	strategy: AuthStrategy;
	/** Session configuration */
	session: {
		/** JWT secret */
		secret: string;
		/** Token expiration */
		expiresIn?: string | number;
		/** Cookie name */
		cookieName?: string;
	};
	/** User storage */
	storage: AuthUserStorage;
	/** Password hasher */
	hasher: PasswordHasher;
	/** Brute force protection */
	bruteForce?: Partial<BruteForceConfig>;
	/** Cookie path */
	cookiePath?: string;
	/** HttpOnly flag */
	httpOnly?: boolean;
	/** Secure flag */
	secure?: boolean;
	/** SameSite attribute */
	sameSite?: "lax" | "strict" | "none";
}
/**
 * Credentials authentication result with handlers
 */
export interface CredentialsResult {
	/** Handle user registration */
	handleRegister: (request: Request) => Promise<Response>;
	/** Handle user login */
	handleLogin: (request: Request) => Promise<Response>;
	/** Handle user logout */
	handleLogout: (request: Request) => Promise<Response>;
	/** Get current user info */
	handleMe: (request: Request) => Promise<Response>;
	/** Get session user */
	getSession: (request: Request) => Promise<AuthUser | null>;
	/** Wrap handler with auth requirement */
	withAuth: <
		T extends (
			request: Request,
			ctx: { user: AuthUser },
		) => Promise<Response> | Response,
	>(
		handler: T,
	) => (request: Request) => Promise<Response>;
}
/**
 * Password reset token storage interface
 */
export interface ResetTokenStorage {
	/**
	 * Create reset token
	 * @param data - Token data
	 */
	create(data: {
		selector: string;
		validatorHash: string;
		expiry: number;
		userId: string;
		email: string;
		username: string;
	}): Promise<void>;
	/**
	 * Find token by selector
	 * @param selector - Token selector
	 * @returns Token data or null
	 */
	findBySelector(selector: string): Promise<{
		validatorHash: string;
		expiry: number;
		userId: string;
		email: string;
		username: string;
		usedAt?: number;
	} | null>;
	/**
	 * Consume (use and delete) token
	 * @param selector - Token selector
	 * @returns User data or null if invalid/expired
	 */
	consume(
		selector: string,
	): Promise<{ userId: string; email: string; username: string } | null>;
	/**
	 * Delete token
	 * @param selector - Token selector
	 */
	delete(selector: string): Promise<void>;
	/**
	 * Delete all tokens for a user (used to prevent accumulation)
	 * @param userId - User ID
	 */
	deleteAllUserTokens?(userId: string): Promise<void>;
}
/**
 * Password reset notification interface
 */
export interface ResetNotifier {
	/**
	 * Send password reset email
	 * @param token - Token selector and validator
	 * @param userId - User ID
	 * @param email - User email
	 * @param username - Username
	 */
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
/**
 * Password reset configuration
 */
export interface PasswordResetConfig {
	/** Token storage */
	storage: ResetTokenStorage;
	/** Email notifier */
	notifier: ResetNotifier;
	/** Password hasher */
	hasher: PasswordHasher;
	/** Minimum password length */
	minPasswordLength?: number;
	/** Token expiration in seconds */
	tokenExpirationSeconds?: number;
	/** Forgot password rate limiting */
	forgotPasswordRateLimit?: {
		maxAttempts: number;
		windowMs: number;
		storage?: BruteForceStorage;
	};
	/** Reset password rate limiting */
	resetPasswordRateLimit?: {
		maxAttempts: number;
		windowMs: number;
		storage?: BruteForceStorage;
	};
	/** Callback after successful password reset */
	onPasswordReset?: (userId: string, newPasswordHash: string) => Promise<void>;
	/** User lookup by email or username */
	userLookup: (emailOrUsername: string) => Promise<{
		userId: string;
		email: string;
		username: string;
	} | null>;
}
/**
 * Password reset request result
 */
export interface RequestResetResult {
	/** Whether request was processed (always true to prevent enumeration) */
	processed: boolean;
}
/**
 * Password reset token consumption result
 */
export interface ConsumeResetTokenResult {
	/** User ID */
	userId: string;
	/** User email */
	email: string;
	/** Username */
	username: string;
}
/**
 * Password reset result
 */
export interface ResetPasswordResult {
	/** Success flag */
	success: true;
}
/**
 * MFA method types
 */
export type MfaMethod = "totp" | "backup_codes";

/**
 * Pending token entry for MFA setup verification
 */
export interface PendingTokenEntry {
	/** Signed token string */
	token: string;
	/** Token creation timestamp (ms) */
	createdAt: number;
	/** Token expiration timestamp (ms) */
	expiresAt: number;
}

/**
 * MFA factory configuration
 */
export interface MfaFactoryConfig {
	/** MFA storage interface */
	storage: MfaStorage;
	/** Encryption key for secrets (AES-GCM-256, minimum 32 characters) */
	secret: string;
	/** TOTP issuer name (shown in authenticator apps) */
	issuer?: string;
	/** Allowed MFA methods */
	allowedMethods?: MfaMethod[];
	/**
	 * Password verification function required when requirePasswordOnDisable is true
	 * @param userId - User ID to verify
	 * @param password - Password to verify
	 * @returns true if password is valid
	 */
	verifyPassword?: (userId: string, password: string) => Promise<boolean>;
	/**
	 * If true, requirePasswordOnDisable requires verifyPassword to be configured
	 * @default false
	 */
	requirePasswordOnDisable?: boolean;
}
/**
 * MFA storage interface for secrets and backup codes
 */
export interface MfaStorage {
	/**
	 * Get encrypted TOTP secret
	 * @param userId - User ID
	 * @returns Encrypted secret or null
	 */
	getSecret(userId: string): Promise<string | null>;
	/**
	 * Set encrypted TOTP secret
	 * @param userId - User ID
	 * @param encryptedSecret - Encrypted secret
	 */
	setSecret(userId: string, encryptedSecret: string): Promise<void>;
	/**
	 * Delete TOTP secret
	 * @param userId - User ID
	 */
	deleteSecret(userId: string): Promise<void>;
	/**
	 * Get hashed backup codes
	 * @param userId - User ID
	 * @returns Array of hashed backup codes or null
	 */
	getBackupCodes(userId: string): Promise<string[] | null>;
	/**
	 * Set hashed backup codes
	 * @param userId - User ID
	 * @param hashedCodes - Array of hashed backup codes
	 */
	setBackupCodes(userId: string, hashedCodes: string[]): Promise<void>;
	/**
	 * Consume (use) a backup code by index
	 * @param userId - User ID
	 * @param codeIndex - Index of used backup code
	 */
	consumeBackupCode(userId: string, codeIndex: number): Promise<void>;
	/**
	 * Get last used TOTP counter (for replay protection)
	 * @param userId - User ID
	 * @returns Counter value or null
	 */
	getLastUsedCounter(userId: string): Promise<number | null>;
	/**
	 * Set last used TOTP counter
	 * @param userId - User ID
	 * @param counter - Counter value
	 */
	setLastUsedCounter(userId: string, counter: number): Promise<void>;
	/**
	 * Get pending token entry for MFA setup verification
	 * @param userId - User ID
	 * @returns Pending token entry or null
	 */
	getPendingToken(userId: string): Promise<PendingTokenEntry | null>;
	/**
	 * Set pending token entry for MFA setup verification
	 * @param userId - User ID
	 * @param entry - Pending token entry with token, createdAt, expiresAt
	 */
	setPendingToken(userId: string, entry: PendingTokenEntry): Promise<void>;
	/**
	 * Delete pending token entry
	 * @param userId - User ID
	 */
	deletePendingToken(userId: string): Promise<void>;
	/**
	 * Set encrypted TOTP secret only if not already set (atomic operation)
	 * @param userId - User ID
	 * @param encryptedSecret - Encrypted secret
	 * @returns true if secret was set, false if already exists
	 */
	setSecretIfAbsent?(userId: string, encryptedSecret: string): Promise<boolean>;
}
/**
 * TOTP setup result
 */
export interface TotpSetupResult {
	/** Base32-encoded TOTP secret */
	secret: string;
	/** otpauth:// URI for QR code generation */
	uri: string;
	/** One-time backup codes (show to user only once) */
	backupCodes: string[];
	/** Pending token for setup verification */
	pendingToken: string;
}
/**
 * MFA verification result
 */
export interface MfaVerifyResult {
	/** Success flag */
	success: true;
	/** Remaining backup codes (if used backup code) */
	backupCodes?: string[];
}
/**
 * MFA challenge result
 */
export interface MfaChallengeResult {
	/** Success flag */
	success: true;
	/** Method used for verification */
	method: MfaMethod;
}
/**
 * Rate limiting configuration
 */
export interface RateLimitConfig {
	/** Maximum requests per window */
	maxRequests: number;
	/** Window duration in milliseconds */
	windowMs: number;
	/** Custom key function (default: by IP) */
	keyBy?: (request: Request) => string | Promise<string>;
	/** Custom storage interface */
	storage?: RateLimitStorage;
	/** Trust X-Forwarded-For headers from proxies (default: false) */
	trustProxy?: boolean;
}
/**
 * Rate limit storage interface
 */
export interface RateLimitStorage {
	/**
	 * Increment request counter
	 * @param key - Identifier (e.g., IP address)
	 * @param windowMs - Window duration in milliseconds
	 * @returns Current count and reset timestamp
	 */
	increment(
		key: string,
		windowMs: number,
	): Promise<{ count: number; resetAt: number }>;
	/**
	 * Reset counter
	 * @param key - Identifier
	 */
	reset(key: string): Promise<void>;
}
/**
 * Rate limit result with headers
 */
export interface RateLimitResult {
	/** Whether request is allowed */
	allowed: boolean;
	/** Maximum requests per window */
	limit: number;
	/** Remaining requests in current window */
	remaining: number;
	/** Reset timestamp (ms) */
	resetAt: number;
	/** Retry-after seconds (if rate limited) */
	retryAfter?: number;
}

/**
 * Token revocation storage interface
 */
export interface TokenRevocationStorage {
	/**
	 * Check if token is revoked
	 * @param jti - Token ID
	 * @returns true if revoked
	 */
	isRevoked(jti: string): Promise<boolean>;
	/**
	 * Revoke token
	 * @param jti - Token ID
	 * @param ttlSeconds - Time to live in seconds
	 */
	revoke(jti: string, ttlSeconds: number): Promise<void>;
}

/**
 * Security event logger interface
 */
export interface SecurityLogger {
	/**
	 * Log debug message
	 * @param message - Log message
	 * @param context - Optional context data
	 */
	debug(message: string, context?: Record<string, unknown>): void;
	/**
	 * Log info message
	 * @param message - Log message
	 * @param context - Optional context data
	 */
	info(message: string, context?: Record<string, unknown>): void;
	/**
	 * Log warning message
	 * @param message - Log message
	 * @param context - Optional context data
	 */
	warn(message: string, context?: Record<string, unknown>): void;
	/**
	 * Log error message
	 * @param message - Log message
	 * @param context - Optional context data
	 */
	error(message: string, context?: Record<string, unknown>): void;
}
