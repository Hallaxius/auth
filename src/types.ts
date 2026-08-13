import type { CaptchaConfig, ResolvedCaptchaConfig } from "./captcha";
import type { StateStore } from "./internal/state";
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
	tenantId?: string;
	/** Present when the session token carries a `userId` claim (credentials path). */
	userId?: string;
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
	redirectUri?: string;
	bruteForce?: Partial<BruteForceConfig>;
	mfa?: Partial<DiscordMfaConfig>;
	guildRoleSync?: Partial<GuildRoleSyncConfig>;
	csrf?: Partial<CsrfConfig>;
	callbacks?: Callbacks;
	stateSecret?: string;
	session?: SessionConfig;
	meRoute?: string;
	meRateLimitStorage?: RateLimitStorage;
	sessionRevocationStorage?: TokenRevocationStorage;
	captcha?: CaptchaConfig;
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
	bruteForce: BruteForceConfig;
	mfa: DiscordMfaConfig;
	guildRoleSync: GuildRoleSyncConfig;
	csrf: CsrfConfig;
	stateSecret: string;
	meRateLimitStorage?: RateLimitStorage;
	sessionRevocationStorage?: TokenRevocationStorage;
	captcha?: ResolvedCaptchaConfig | null;
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
	getRemainingBlockTime?(key: string): Promise<number | undefined>;
	dispose?(): void;
	ping?(): Promise<boolean>;
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
	storage?: StateStore;
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
	secret?: string;
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
	/**
	 * Per-tenant mode. When both `tenantIdFromRequest` and
	 * `tenantMembership` are provided, `middleware.role` resolves the tenant
	 * from the request (subdomain, D3 — never from body/query/header) and
	 * reads the user's roles for **that tenant** only, instead of the legacy
	 * session `roles` claim.
	 */
	tenantIdFromRequest?: (request: Request) => Promise<string | null>;
	tenantMembership?: TenantMembershipStorage;
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
export interface AuthUser {
	id: string;
	username: string | null;
	email: string | null;
	password: string;
	roles: string[];
	createdAt: Date;
	updatedAt: Date;
}
export type SafeAuthUser = Omit<AuthUser, "password">;
export interface CreateCredentialsUserData {
	username?: string;
	email?: string;
	password?: string;
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
	emailRequired?: boolean;
	usernameRequired?: boolean;
	secret: string;
	expiresIn?: string | number;
	cookieName?: string;
	cookiePath?: string;
	httpOnly?: boolean;
	secure?: boolean;
	sameSite?: "lax" | "strict" | "none";
	defaultRoles?: string[];
	minPasswordLength?: number;
	validatePassword?: boolean | PasswordValidationConfig;
	sessionRevocationStorage?: TokenRevocationStorage;
	captcha?: CaptchaConfig;
	trustProxy?: boolean;
	dummyVerifyPassword?: (password: string) => Promise<boolean>;
	genericRegistrationErrors?: boolean;
}
export interface InternalCredentialsConfig {
	emailRequired: boolean;
	usernameRequired: boolean;
	secret: string;
	expiresIn: string | number;
	cookieName: string;
	cookiePath: string;
	httpOnly: boolean;
	secure: boolean;
	sameSite: "lax" | "strict" | "none";
	defaultRoles: string[];
	minPasswordLength: number;
	validatePassword: boolean | PasswordValidationConfig;
	sessionRevocationStorage?: TokenRevocationStorage;
	captcha?: ResolvedCaptchaConfig;
	trustProxy: boolean;
	dummyVerifyPassword?: (password: string) => Promise<boolean>;
	genericRegistrationErrors: boolean;
}
export interface AuthUserStorage {
	findByUsername(username: string): Promise<AuthUser | null>;
	findByEmail(email: string): Promise<AuthUser | null>;
	findById(id: string): Promise<AuthUser | null>;
	/**
	 * Create a user. The `password` value MUST already be a KDF hash
	 * (Argon2id preferred; bcrypt/scrypt acceptable) with a per-user salt —
	 * the package never hashes passwords (ADR-002). Hash in your storage
	 * layer before persisting.
	 */
	create(
		data: Omit<AuthUser, "id" | "createdAt" | "updatedAt"> & {
			password: string;
		},
	): Promise<AuthUser>;
	update(userId: string, data: Partial<AuthUser>): Promise<AuthUser>;
	delete(userId: string): Promise<void>;
	/**
	 * Verify a raw password against the hash stored by `create`.
	 * MUST compare using the consumer's KDF (e.g. Argon2id `compare`) —
	 * the package never reads the stored `password` field for verification.
	 */
	verifyPassword(userId: string, password: string): Promise<boolean>;
	dispose?(): void;
}
export interface PasswordValidationConfig {
	minLength?: number;
	maxLength?: number;
	requireLowercase?: boolean;
	requireUppercase?: boolean;
	requireNumber?: boolean;
	requireSpecial?: boolean;
}
export interface EmailFilterConfig {
	whitelist?: string[];
	blocklist?: string[];
	blockDisposable?: boolean;
	customValidation?: (email: string) => boolean | Promise<boolean>;
}
export interface CredentialsConfig {
	emailRequired?: boolean;
	usernameRequired?: boolean;
	session: {
		secret: string;
		expiresIn?: string | number;
		cookieName?: string;
	};
	storage: AuthUserStorage;
	bruteForce?: Partial<BruteForceConfig>;
	captcha?: CaptchaConfig;
	cookiePath?: string;
	httpOnly?: boolean;
	secure?: boolean;
	sameSite?: "lax" | "strict" | "none";
	validatePassword?: boolean | PasswordValidationConfig;
	sessionRevocationStorage?: TokenRevocationStorage;
	meRateLimitStorage?: RateLimitStorage;
	loginRateLimitStorage?: RateLimitStorage;
	genericRegistrationErrors?: boolean;
	dummyVerifyPassword?: (password: string) => Promise<boolean>;
	/** Multi-tenancy. Inert until `tenancy.enabled === true`. */
	tenancy?: TenancyConfig;
}
export interface CreateSessionWithoutPasswordOptions {
	userId: string;
	/** Required when `tenancy.enabled`. MUST come from subdomain resolution (D3) — never parsed from body/query/header. */
	tenantId?: string;
	/** Roles for that tenant. Defaults to the user's global `roles`. */
	roles?: string[];
	/** Request context, used for the passwordless brute-force key. */
	ip: string;
	userAgent?: string;
}

export interface TenantRecord {
	id: string;
	domain: string;
	status: "active" | "suspended";
	createdAt: number;
}

/**
 * Multi-tenancy D2: shared schema + consumer-owned RLS (Drizzle `pgPolicy` /
 * Prisma `current_setting`) — the package only scopes keys/claims on `tenantId`.
 * Impls map 1:1 to `ITenantStore` (src/storage/interfaces.ts).
 */
export interface TenantRepository {
	getById(tenantId: string): Promise<TenantRecord | null>;
	getByDomain(domain: string): Promise<TenantRecord | null>;
	set(record: TenantRecord): Promise<void>;
	delete(tenantId: string): Promise<void>;
	ping?(): Promise<boolean>;
	dispose?(): void;
}

/**
 * Global user (D4) + per-tenant membership/roles (Notion/Linear model).
 * Impls map 1:1 to `ITenantMembershipStore` (src/storage/interfaces.ts).
 */
export interface TenantMembershipStorage {
	getMemberships(
		userId: string,
	): Promise<Array<{ tenantId: string; roles: string[] }>>;
	getMembers(
		tenantId: string,
	): Promise<Array<{ userId: string; roles: string[] }>>;
	setMembership(
		tenantId: string,
		userId: string,
		roles: string[],
	): Promise<void>;
	deleteMembership(tenantId: string, userId: string): Promise<void>;
}

export interface TenancyConfig {
	/** Additivity gate — default `false`. All tenancy behavior is inert until `true`. */
	enabled?: boolean;
	/**
	 * Resolves `tenantId` from the request (D3 — subdomain). Defaults to the
	 * built-in `subdomainResolver`. A divergent `x-tenant-id` header → error.
	 * Must NEVER be derived from body/query/header values.
	 */
	resolver?: (request: Request) => Promise<string | null>;
	/** When `true`, unresolved tenant → 403 `TENANT_REQUIRED`. */
	required?: boolean;
	/** Used when the resolver returns `null` and `required` is `false`. */
	defaultTenantId?: string;
	/** For the built-in subdomain resolver: hosts like `acme.example.com` → `acme` (tenant = first label). */
	baseDomains?: string[];
	storage?: {
		tenant: TenantRepository;
		tenantMembership: TenantMembershipStorage;
	};
}

export interface TenancyResult {
	/** Resolve + enforce: returns the tenant record or `null` (not required). Throws on suspended/divergent. */
	resolveTenant(request: Request): Promise<TenantRecord | null>;
	/** `resolveTenant` → `record.id`; falls back to `defaultTenantId`; throws when `required` and unresolved. */
	resolveTenantId(request: Request): Promise<string | null>;
	/** `resolveTenantId` but throws 403 `TENANT_REQUIRED` when there is no tenant. */
	requireTenant(request: Request): Promise<string>;
	getTenant(tenantId: string): Promise<TenantRecord | null>;
	/** Roles of `userId` within `tenantId` (empty when no membership). */
	getRoles(tenantId: string, userId: string): Promise<string[]>;
	/** True when the user has any member record for the tenant. */
	isMember(tenantId: string, userId: string): Promise<boolean>;
	dispose?(): void;
}
export interface CredentialsResult {
	handleRegister: (request: Request) => Promise<Response>;
	handleLogin: (request: Request) => Promise<Response>;
	handleLogout: (request: Request) => Promise<Response>;
	handleMe: (request: Request) => Promise<Response>;
	getSession: (request: Request) => Promise<SafeAuthUser | null>;
	withAuth: <
		T extends (
			request: Request,
			ctx: { user: SafeAuthUser },
		) => Promise<Response> | Response,
	>(
		handler: T,
	) => (request: Request) => Promise<Response>;
	/**
	 * Internal-only session creation for the package's passwordless
	 * handlers. NEVER calls `verifyPassword`.
	 */
	createSessionWithoutPassword: (
		options: CreateSessionWithoutPasswordOptions,
	) => Promise<{ sessionToken: string; idToken: string }>;
	dispose?: () => void;
}
/**
 * Magic-link / email OTP pending token (selector + token hash). The raw
 * link/code is never stored (ADR-005): only `tokenHash = SHA-256(validator)`.
 * Precedent: password-reset selector.validator mechanic.
 */
export interface PendingMagicLink {
	tenantId: string;
	selector: string;
	tokenHash: string;
	recipient: string;
	userId: string | null;
	purpose: "login" | "verify-email";
	expiresAt: number;
	createdAt: number;
}

/**
 * Pending-token storage. Impls map 1:1 to `IMagicLinkTokenStore`
 * (src/storage/interfaces.ts) and `StorageAdapters.magicLink`.
 */
export interface MagicLinkTokenStorage {
	findBySelector(
		tenantId: string,
		selector: string,
	): Promise<PendingMagicLink | null>;
	create(token: PendingMagicLink): Promise<void>;
	/** Atomic single-use — returns the record when consumed, `null` when already used/absent. */
	consume(tenantId: string, selector: string): Promise<PendingMagicLink | null>;
	/** Resend invalidation — removes every pending token of the recipient within the tenant. */
	deleteByRecipient(tenantId: string, recipient: string): Promise<void>;
	ping?(): Promise<boolean>;
	dispose?(): void;
}

/**
 * D6: the consumer brings the provider (Resend, Nodemailer, SES…).
 * Blueprint: `ResetNotifier`. Called in-handler.
 */
export interface MagicLinkNotifier {
	sendEmail(input: {
		tenantId: string;
		to: string;
		link?: string;
		code?: string;
		ttlMinutes: number;
	}): Promise<void>;
}

export interface MagicLinkLookupResult {
	userId: string | null;
}

export interface MagicLinkConfig {
	/** Required — pending-token storage (both layers). */
	storage: MagicLinkTokenStorage;
	/** Required (D6) — the consumer's email provider; called in-handler. */
	notifier: MagicLinkNotifier;
	/** `"link"` (default; `?t=<selector>.<validator>`) or `"code"` (digits, constant-time). */
	mode?: "link" | "code";
	/** TTL, clamped to 5–15 min (default 10). */
	ttlMinutes?: number;
	/** Code length for `mode: "code"` (6–8, default 6). */
	codeLength?: number;
	/** Resolves the recipient → user. Unknown recipients get an identical response + dummy work. */
	userLookup?: (recipient: string) => Promise<MagicLinkLookupResult | null>;
	/** Base path for mode `"link"` (default `/auth/magic-link`); final link = `${this}?t=<token>`. */
	linkPath?: string;
	/** Tenant resolution (D3) — default `null` → `"global"` tenant (additive, non-tenant consumers). */
	tenantIdFromRequest?: (request: Request) => Promise<string | null>;
	/** Per-IP request limits (BruteForceProtection). No storage → in-memory fallback + warning. */
	requestLimit?: {
		maxAttempts?: number;
		windowMs?: number;
		blockDurationMs?: number;
		storage?: BruteForceStorage;
	};
	/** Per-recipient cooldown (default 30 s windowed 3/10 min). */
	recipientLimit?: {
		maxAttempts?: number;
		windowMs?: number;
		blockDurationMs?: number;
		storage?: BruteForceStorage;
	};
	/** Per-IP verify-attempt limits (default 10/15 min). */
	verifyLimit?: {
		maxAttempts?: number;
		windowMs?: number;
		blockDurationMs?: number;
		storage?: BruteForceStorage;
	};
	/** Hook after a successful single-use verification — returns the consumer response (e.g. mints the session). */
	onVerified?: (result: {
		userId: string | null;
		recipient: string;
		tenantId: string;
		purpose: "login" | "verify-email";
	}) => Promise<Response> | Response;
	trustProxy?: boolean;
	dispose?(): void;
}

/**
 * SMS OTP / phone MFA single-use code record (ADR-005: only the hash is
 * stored). `phoneHash = sha256Hex(E.164 phone)` — the raw number never reaches
 * storage.
 */
export interface OtpCode {
	phoneHash: string;
	tenantId: string | null;
	userId: string | null;
	purpose: "sms-login" | "mfa" | "recovery";
	codeHash: string;
	attempts: number;
	expiresAt: number;
	createdAt: number;
}

/**
 * Single-use OTP storage. `getAndConsume` is atomic (last consumer
 * wins) so a code can never be replayed. `attempts` is re-seeded by the
 * caller when the presented code does not match.
 */
export interface OtpStorage {
	set(
		phoneHash: string,
		purpose: OtpCode["purpose"],
		code: OtpCode,
	): Promise<void>;
	/** Atomic single-use — returns the record and deletes it. */
	getAndConsume(
		phoneHash: string,
		purpose: OtpCode["purpose"],
	): Promise<OtpCode | null>;
	delete(phoneHash: string, purpose: OtpCode["purpose"]): Promise<void>;
	ping?(): Promise<boolean>;
	dispose?(): void;
}

/**
 * D6: the consumer brings the provider (Twilio, Vonage, SNS…).
 * Called in-handler; never called on the dummy (unknown-number) path.
 */
export interface SmsNotifier {
	send(input: {
		to: string;
		code: string;
		ttlMinutes: number;
		purpose: OtpCode["purpose"];
		tenantId?: string;
	}): Promise<void>;
}

export interface SmsConfig {
	/** Required (D6) — the consumer's SMS provider; called in-handler. */
	notifier?: SmsNotifier;
	/** Enables ante-auth phone passwordless (request+verify mint a session via `createSessionWithoutPassword`). Default `false`. */
	smsPasswordless?: boolean;
	/** Code length 4–10 (default 6). */
	codeLength?: number;
	/** TTL, clamped to ≤10 min (default 600 s). */
	ttlSeconds?: number;
	/** Wrong-code attempts before a phone+IP lockout (default 5). */
	maxAttempts?: number;
	/** Lockout duration after `maxAttempts` failures (default 900 s). */
	lockoutSeconds?: number;
	/** Resend cooldown (default 30 s). */
	cooldownMs?: number;
	/** Daily cost control per phone (default 5). */
	dailyPerPhoneLimit?: number;
	/** Only serve these country prefixes (e.g. `["+55", "+1"]`); others get the dummy path. */
	allowedCountryPrefixes?: string[];
	/** Single-use code storage (in-memory fallback + warning when absent). */
	storage?: OtpStorage;
	/** Phone hash → user for ante-auth flows; `null` → dummy path (anti-enumeration). */
	phoneLookup?: (phoneHash: string) => Promise<{ userId: string } | null>;
	/** Mints the session after a successful passwordless verify (ADR-002 — never `verifyPassword`). */
	createSessionWithoutPassword?: (
		options: CreateSessionWithoutPasswordOptions,
	) => Promise<{ sessionToken: string; idToken: string }>;
	/** Tenant resolution (D3) — default `null` → `"global"` (additive, non-tenant consumers). */
	tenantIdFromRequest?: (request: Request) => Promise<string | null>;
	/** Shared anti-bombing / verify-failure store (3-layer per-IP/per-phone/per-tenant + lockout). */
	bruteForceStorage?: BruteForceStorage;
	/** Registered phone binding (post-auth MFA) — `null` = not bound. */
	getBinding?: (userId: string) => Promise<{ phoneHash: string } | null>;
	/** Persist the binding after step-up verification succeeds (consumer keeps phone PII). */
	onEnrolled?: (input: {
		userId: string;
		phoneHash: string;
		tenantId: string | null;
	}) => Promise<void>;
	/** Re-authentication for re-binding a different phone (consumer-provided check, ADR-002 — the package never verifies plaintext passwords). */
	verifyPassword?: (userId: string, password: string) => Promise<boolean>;
	/** MFA pending-token storage (reused from F1.3 for the post-auth step-up flow). */
	mfaStorage?: MfaStorage;
	/** Session cookie name for authenticated ops (default `"session"`). */
	sessionCookieName?: string;
	/** Required for authenticated ops (enroll / step-up / resend-recovery) — the same JWT secret used by `credentials()`/`discord()`. */
	secret?: string;
	trustProxy?: boolean;
	dispose?(): void;
}

/**
 * FIDO2/WebAuthn passkey credential. Public-key-only records don't exist
 * yet in the graph — this is the first one; documented in the README ADR section
 * (ADR-007). `publicKey` is stored base64url (never raw key material).
 */
export interface WebAuthnCredential {
	tenantId: string;
	userId: string;
	credentialId: string;
	publicKey: string;
	signCount: number;
	transports?: string[];
	aaguid: string;
	createdAt: number;
	lastUsedAt: number;
}

/**
 * Credential storage, tenant-scoped (D3). `updateSignCount` feeds the
 * anti-replay counter check on every authentication.
 */
export interface WebAuthnCredentialStorage {
	findById(
		tenantId: string,
		credentialId: string,
	): Promise<WebAuthnCredential | null>;
	listByUser(tenantId: string, userId: string): Promise<WebAuthnCredential[]>;
	create(credential: WebAuthnCredential): Promise<void>;
	updateSignCount(
		tenantId: string,
		credentialId: string,
		signCount: number,
	): Promise<void>;
	delete(tenantId: string, credentialId: string): Promise<void>;
	deleteByUser(tenantId: string, userId: string): Promise<void>;
	ping?(): Promise<boolean>;
	dispose?(): void;
}

export interface WebAuthnChallenge {
	userId: string | null;
	type: "registration" | "authentication";
	challenge: string;
	rpId: string;
	allowCredentials?: string[];
	expiresAt: number;
	createdAt: number;
}

/**
 * Challenge storage. Opaque random `challengeId` returned to the client;
 * `getAndConsume` is atomic single-use (replay → invalid challenge).
 */
export interface WebAuthnChallengeStorage {
	set(
		tenantId: string,
		challengeId: string,
		challenge: WebAuthnChallenge,
	): Promise<void>;
	getAndConsume(
		tenantId: string,
		challengeId: string,
	): Promise<WebAuthnChallenge | null>;
	ping?(): Promise<boolean>;
	dispose?(): void;
}

export interface WebAuthnConfig {
	/** RP identifier — the site's domain (e.g. `login.example.com`), plus its display name. */
	rp: {
		id: string;
		name: string;
		/** Exact-match origins the verification accepts (e.g. `["https://login.example.com"]`). */
		origins: string[];
	};
	/** Enforce user verification (PIN/biometric) — default `true`. */
	requireUserVerification?: boolean;
	/** Default `"none"` (privacy-preserving; no attestation statements fetched). */
	attestationType?: "none" | "direct" | "enterprise";
	/** Browser operation timeout (default 60000 ms). */
	timeoutMs?: number;
	/** Required — credential + challenge stores (D6 pattern). */
	storage?: {
		credentials: WebAuthnCredentialStorage;
		challenges: WebAuthnChallengeStorage;
	};
	/** Display info for registration options — absent → `username = userId`. */
	getUser?: (
		userId: string,
	) => Promise<{ username: string; displayName?: string } | null>;
	/** Mints the session after a successful authentication (ADR-002 — never `verifyPassword`). */
	createSessionWithoutPassword?: (
		options: CreateSessionWithoutPasswordOptions,
	) => Promise<{ sessionToken: string; idToken: string }>;
	/** Tenant resolution (D3) — default `null` → `"global"`. */
	tenantIdFromRequest?: (request: Request) => Promise<string | null>;
	/** Session cookie name for authenticated ops (default `"session"`). */
	sessionCookieName?: string;
	/** Required for authenticated ops (register / remove) — the same JWT secret used by `credentials()`. */
	secret?: string;
	trustProxy?: boolean;
	dispose?(): void;
}

export interface OidcStateRecord {
	nonce: string;
	codeVerifier: string;
	redirectUri: string;
	tenantId: string | null;
	userId: string | null;
	expiresAt: number;
	createdAt: number;
}

/**
 * OIDC single-use state/PKCE record storage. `getAndConsume` is atomic
 * (replay → invalid state, CSRF-safe).
 */
export interface OidcStateStorage {
	set(stateId: string, record: OidcStateRecord): Promise<void>;
	/** Atomic single-use — returns the record when consumed, `null` on replay/absence. */
	getAndConsume(stateId: string): Promise<OidcStateRecord | null>;
	ping?(): Promise<boolean>;
	dispose?(): void;
}

/** F4 — optional cross-instance JWKS cache (seeds openid-client's in-process cache). */
export interface OidcJwksCache {
	get(issuer: string): Promise<{ keys: unknown; expiresAt: number } | null>;
	set(issuer: string, keys: unknown, ttlSeconds: number): Promise<void>;
	ping?(): Promise<boolean>;
	dispose?(): void;
}

export interface OidcUserClaims {
	sub?: string;
	email?: string;
	email_verified?: boolean;
	name?: string;
	preferred_username?: string;
	phone_number?: string;
	[key: string]: unknown;
}

export interface OidcMappedUser {
	userId: string;
	email?: string;
	username?: string;
}

export interface OidcConfig {
	/** OIDC discovery URL — `${issuer}/.well-known/openid-configuration`. */
	discoveryUrl?: string;
	/** Static server metadata (test doubles / private OPs) — skips the discovery fetch. */
	serverMetadata?: Record<string, unknown>;
	clientId: string;
	/** Omit for public clients (PKCE-only, RFC 9700). */
	clientSecret?: string;
	/** Exact-match redirect URI whitelist (RFC 9700); the used one is frozen in the state record. */
	redirectUris: string[];
	/** Default scopes — must include `openid` (default `"openid profile email"`). */
	scope?: string;
	/** PKCE S256, always on (default `true`). */
	usePkce?: boolean;
	/** Single-use (state, PKCE) records; optional cross-instance JWKS cache. */
	storage?: {
		state: OidcStateStorage;
		jwks?: OidcJwksCache;
	};
	/** Mints the session after callback validation (ADR-002 — never `verifyPassword`). */
	createSessionWithoutPassword?: (
		options: CreateSessionWithoutPasswordOptions,
	) => Promise<{ sessionToken: string; idToken: string }>;
	/** Claims → local user adapter. Absent → `userId = claims.sub`. `null` → 401. */
	mapUser?: (claims: OidcUserClaims) => OidcMappedUser | null;
	/** Tenant resolution (D3) — default `null` → `"global"`. */
	tenantIdFromRequest?: (request: Request) => Promise<string | null>;
	/** Back-channel logout hardening (jti replay + token revocation). */
	logout?: {
		tokenRevocationStorage?: TokenRevocationStorage;
		jtiTtlSeconds?: number;
	};
	/** State TTL (default 600 s). */
	stateTtlSeconds?: number;
	/** Allow http:// endpoints (local dev / test doubles only — never in production). */
	allowInsecureRequests?: boolean;
	trustProxy?: boolean;
	dispose?(): void;
}

export interface MagicLinkVerifyResult {
	userId: string | null;
	recipient: string;
	tenantId: string;
	purpose: "login" | "verify-email";
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
	deleteAllUserTokens?(userId: string): Promise<void>;
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
	minPasswordLength?: number;
	tokenExpirationSeconds?: number;
	trustProxy?: boolean;
	rateLimitProgrammatic?: boolean;
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
	onPasswordReset?: (userId: string) => Promise<void>;
	userLookup: (emailOrUsername: string) => Promise<{
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
export interface PendingTokenEntry {
	token: string;
	createdAt: number;
	expiresAt: number;
}
export interface MfaFactoryConfig {
	storage: MfaStorage;
	secret: string;
	issuer?: string;
	allowedMethods?: MfaMethod[];
	verifyPassword?: (userId: string, password: string) => Promise<boolean>;
	requirePasswordOnDisable?: boolean;
	totpHash?: "SHA-1" | "SHA-256" | "SHA-512";
	rateLimitStorage?: RateLimitStorage;
	trustProxy?: boolean;
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
	getPendingToken(userId: string): Promise<PendingTokenEntry | null>;
	setPendingToken(userId: string, entry: PendingTokenEntry): Promise<void>;
	deletePendingToken(userId: string): Promise<void>;
	setSecretIfAbsent?(userId: string, encryptedSecret: string): Promise<boolean>;
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
	keyBy?: (request: Request) => string | Promise<string>;
	storage?: RateLimitStorage;
	trustProxy?: boolean;
}
export interface RateLimitCheckResult {
	allowed: boolean;
	remaining: number;
	resetAt: number;
	retryAfter?: number;
	limit: number;
}
export interface RateLimitStorage {
	increment(
		key: string,
		windowMs: number,
	): Promise<{ count: number; resetAt: number }>;
	check?(key: string): Promise<RateLimitCheckResult>;
	reset(key: string): Promise<void>;
	dispose?(): void;
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
	revokeIfPresent?(jti: string, ttlSeconds: number): Promise<boolean>;
	revokeFamily?(familyId: string, ttlSeconds: number): Promise<void>;
	isFamilyRevoked?(familyId: string): Promise<boolean>;
	registerFamilyMember?(
		familyId: string,
		jti: string,
		userId: string,
		ttlSeconds: number,
	): Promise<void>;
	revokeAllForUser?(userId: string, ttlSeconds: number): Promise<void>;
	dispose?(): void;
	ping?(): Promise<boolean>;
}
export interface SecurityLogger {
	debug(message: string, context?: Record<string, unknown>): void;
	info(message: string, context?: Record<string, unknown>): void;
	warn(message: string, context?: Record<string, unknown>): void;
	error(message: string, context?: Record<string, unknown>): void;
}
export type AnomalySeverity = "low" | "medium" | "high" | "critical";
export type AnomalyType =
	| "new_location"
	| "new_device"
	| "unusual_hour"
	| "multiple_countries"
	| "impossible_travel"
	| "credential_stuffing"
	| "tor_usage";
export interface AnomalyEvent {
	type: AnomalyType;
	severity: AnomalySeverity;
	userId: string;
	ip: string;
	timestamp: number;
	userAgent: string;
	details: Record<string, unknown>;
}
export interface LoginRecord {
	userId: string;
	ip: string;
	userAgent: string;
	timestamp: number;
	success: boolean;
	hour: number;
}
export interface LoginHistoryStore {
	addRecord(record: LoginRecord): Promise<void>;
	getRecentIPs(userId: string): Promise<string[]>;
	getRecentUserAgents(userId: string): Promise<string[]>;
	getDistinctCountriesInWindow(
		userId: string,
		windowMs: number,
	): Promise<string[]>;
	getRecentRecords(userId: string, limit?: number): Promise<LoginRecord[]>;
	getRecordsInTimeRange(
		userId: string,
		startMs: number,
		endMs: number,
	): Promise<LoginRecord[]>;
}
