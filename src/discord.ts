/**
 * v3 Discord OAuth2 factory — fully self-contained.
 *
 * Usage:
 *   import { discord } from "@hallaxius/auth"
 *   const auth = discord({ clientId, clientSecret, secret, callbackUrl })
 *   // → { handleLogin, handleCallback, handleLogout, handleMe, middleware, getSession, withAuth }
 */

import { jwtVerify, SignJWT } from "jose";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES (inlined from core/types.ts — only those needed by discord factory)
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
// ERRORS (inlined from core/errors.ts — only those used by discord flow)
// ═══════════════════════════════════════════════════════════════════════════════

export class DiscordAuthError extends Error {
	readonly code: string;
	readonly cause?: Error;
	readonly statusCode?: number;

	constructor(
		code: string,
		message: string,
		options?: { cause?: Error; statusCode?: number },
	) {
		super(message);
		this.code = code;
		this.cause = options?.cause;
		this.statusCode = options?.statusCode;
		this.name = this.constructor.name;
		if (typeof Error.captureStackTrace === "function") {
			Error.captureStackTrace(this, this.constructor);
		}
	}
}

export class StateReusedError extends DiscordAuthError {
	constructor(
		message = "State parameter has already been used",
		options?: { cause?: Error },
	) {
		super("STATE_REUSED", message, { statusCode: 403, cause: options?.cause });
	}
}

export class StateBindingError extends DiscordAuthError {
	constructor(
		message = "State parameter binding validation failed",
		options?: { cause?: Error },
	) {
		super("STATE_BINDING_FAILED", message, {
			statusCode: 403,
			cause: options?.cause,
		});
	}
}

export class ConfigurationError extends DiscordAuthError {
	constructor(message = "Invalid configuration", options?: { cause?: Error }) {
		super("CONFIGURATION_ERROR", message, {
			statusCode: 500,
			cause: options?.cause,
		});
	}
}

export class MfaRequiredError extends DiscordAuthError {
	constructor(
		message = "Multi-factor authentication is required",
		options?: { cause?: Error },
	) {
		super("MFA_REQUIRED", message, { statusCode: 403, cause: options?.cause });
	}
}

export class RateLimitError extends DiscordAuthError {
	readonly retryAfter?: number;

	constructor(
		message = "Rate limit exceeded",
		options?: { retryAfter?: number; cause?: Error },
	) {
		super("RATE_LIMITED", message, {
			statusCode: 429,
			cause:
				options?.cause ??
				(options?.retryAfter
					? new Error(`Retry after ${options.retryAfter} seconds`)
					: undefined),
		});
		this.retryAfter = options?.retryAfter;
	}
}

export class TokenExpiredError extends DiscordAuthError {
	constructor(message = "Token has expired", options?: { cause?: Error }) {
		super("TOKEN_EXPIRED", message, { statusCode: 401, cause: options?.cause });
	}
}

// ═══════════════════════════════════════════════════════════════════════════════
// CACHE ADAPTER (inlined from adapters/cache/memory.ts)
// ═══════════════════════════════════════════════════════════════════════════════

interface CacheEntry {
	value: unknown;
	expiresAt: number;
}

class MemoryCacheAdapter {
	private store = new Map<string, CacheEntry>();

	async get(key: string): Promise<CacheEntry | null> {
		const entry = this.store.get(key);
		if (!entry) return null;
		if (Date.now() > entry.expiresAt) {
			this.store.delete(key);
			return null;
		}
		return entry;
	}

	async set(key: string, value: unknown, ttlMs: number): Promise<void> {
		this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
	}

	async delete(key: string): Promise<void> {
		this.store.delete(key);
	}
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATE MANAGEMENT (inlined from core/state.ts)
// ═══════════════════════════════════════════════════════════════════════════════

interface StatePayload {
	id: string;
	iat: number;
	codeVerifier?: string;
	sessionId?: string;
	userAgentHash?: string;
}

export interface StateStore {
	has(id: string): Promise<boolean>;
	set(id: string, ttlMs: number): Promise<void>;
	delete(id: string): Promise<void>;
}

export class MemoryStateStore implements StateStore {
	private store = new Map<string, number>();

	async has(id: string): Promise<boolean> {
		const expiresAt = this.store.get(id);
		if (!expiresAt) return false;
		if (Date.now() > expiresAt) {
			this.store.delete(id);
			return false;
		}
		return true;
	}

	async set(id: string, ttlMs: number): Promise<void> {
		this.store.set(id, Date.now() + ttlMs);
	}

	async delete(id: string): Promise<void> {
		this.store.delete(id);
	}
}

export interface ValidatedState {
	valid: boolean;
	codeVerifier?: string;
	stateId?: string;
}

function toBase64URL(data: ArrayBuffer): string {
	const bytes = new Uint8Array(data);
	let binary = "";
	for (let i = 0; i < bytes.byteLength; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function fromBase64URL(str: string): Uint8Array {
	const base64 =
		str.replace(/-/g, "+").replace(/_/g, "/") +
		"=".repeat((4 - (str.length % 4)) % 4);
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

async function hashUserAgent(userAgent: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(userAgent);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	return Array.from(new Uint8Array(hashBuffer))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("")
		.slice(0, 16);
}

async function generateState(
	secret: string,
	codeVerifier?: string,
	sessionId?: string,
	userAgent?: string,
	config?: CsrfConfig,
): Promise<string> {
	const payload: StatePayload = {
		id: crypto.randomUUID(),
		iat: Date.now(),
	};

	if (codeVerifier) {
		payload.codeVerifier = codeVerifier;
	}
	if (config?.bindToSession && sessionId) {
		payload.sessionId = sessionId;
	}
	if (config?.bindToUserAgent && userAgent) {
		payload.userAgentHash = await hashUserAgent(userAgent);
	}

	const payloadString = JSON.stringify(payload);
	const encodedData = new TextEncoder().encode(payloadString);
	const encoded = toBase64URL(encodedData.buffer as ArrayBuffer);

	const secretData = new TextEncoder().encode(secret);
	const key = await crypto.subtle.importKey(
		"raw",
		secretData.buffer as ArrayBuffer,
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);

	const inputData = new TextEncoder().encode(encoded);
	const sig = await crypto.subtle.sign(
		"HMAC",
		key,
		inputData.buffer as ArrayBuffer,
	);
	const sigEncoded = toBase64URL(sig);
	return `${encoded}.${sigEncoded}`;
}

async function validateState(
	state: string,
	secret: string,
): Promise<ValidatedState> {
	const ttlMs = 5 * 60 * 1000;
	const parts = state.split(".");
	if (parts.length !== 2) return { valid: false };

	const [encoded, sig] = parts;

	try {
		const secretData = new TextEncoder().encode(secret);
		const key = await crypto.subtle.importKey(
			"raw",
			secretData.buffer as ArrayBuffer,
			{ name: "HMAC", hash: "SHA-256" },
			false,
			["verify"],
		);

		const sigBytes = fromBase64URL(sig);
		const inputData = new TextEncoder().encode(encoded);
		const valid = await crypto.subtle.verify(
			"HMAC",
			key,
			sigBytes.buffer as ArrayBuffer,
			inputData.buffer as ArrayBuffer,
		);

		if (!valid) return { valid: false };

		const decoded = fromBase64URL(encoded);
		const payload: StatePayload = JSON.parse(new TextDecoder().decode(decoded));

		if (Date.now() - payload.iat > ttlMs) return { valid: false };

		return {
			valid: true,
			codeVerifier: payload.codeVerifier,
			stateId: payload.id,
		};
	} catch {
		return { valid: false };
	}
}

async function consumeState(
	state: string,
	secret: string,
	sessionId?: string,
	userAgent?: string,
	config?: CsrfConfig,
	store?: StateStore,
): Promise<ValidatedState> {
	const ttlMs = config?.ttlMs ?? 5 * 60 * 1000;
	const parts = state.split(".");
	if (parts.length !== 2) return { valid: false };

	const [encoded, sig] = parts;

	try {
		const secretData = new TextEncoder().encode(secret);
		const key = await crypto.subtle.importKey(
			"raw",
			secretData.buffer as ArrayBuffer,
			{ name: "HMAC", hash: "SHA-256" },
			false,
			["verify"],
		);

		const sigBytes = fromBase64URL(sig);
		const inputData = new TextEncoder().encode(encoded);
		const valid = await crypto.subtle.verify(
			"HMAC",
			key,
			sigBytes.buffer as ArrayBuffer,
			inputData.buffer as ArrayBuffer,
		);

		if (!valid) return { valid: false };

		const decoded = fromBase64URL(encoded);
		const payload: StatePayload = JSON.parse(new TextDecoder().decode(decoded));

		if (Date.now() - payload.iat > ttlMs) return { valid: false };

		if (config?.bindToSession && sessionId && payload.sessionId !== sessionId) {
			return { valid: false };
		}

		if (
			config?.bindToUserAgent &&
			userAgent &&
			payload.userAgentHash !== (await hashUserAgent(userAgent))
		) {
			return { valid: false };
		}

		if (config?.singleUse && store) {
			const stateId = payload.id;
			if (await store.has(stateId)) {
				return { valid: false };
			}
			await store.set(stateId, ttlMs);
		}

		return {
			valid: true,
			codeVerifier: payload.codeVerifier,
			stateId: payload.id,
		};
	} catch {
		return { valid: false };
	}
}

// ═══════════════════════════════════════════════════════════════════════════════
// JWT (inlined from standalone/jwt.ts)
// ═══════════════════════════════════════════════════════════════════════════════

function secretToKey(secret: string): Uint8Array {
	return new TextEncoder().encode(secret);
}

async function signToken(
	payload: Record<string, unknown>,
	secret: string,
	expiresIn: string | number = "7d",
): Promise<string> {
	const exp = typeof expiresIn === "number" ? `${expiresIn}s` : expiresIn;

	return new SignJWT(payload)
		.setProtectedHeader({ alg: "HS256" })
		.setIssuedAt()
		.setExpirationTime(exp)
		.sign(secretToKey(secret));
}

async function verifyToken<T extends Record<string, unknown>>(
	token: string,
	secret: string,
): Promise<T | null> {
	try {
		const { payload } = await jwtVerify(token, secretToKey(secret));
		return payload as T;
	} catch {
		return null;
	}
}

// ═══════════════════════════════════════════════════════════════════════════════
// COOKIES (inlined from standalone/cookies.ts — manual parse, no cookie pkg)
// ═══════════════════════════════════════════════════════════════════════════════

function parseCookies(request: Request): Record<string, string> {
	const header = request.headers.get("Cookie") ?? "";
	const cookies: Record<string, string> = {};
	for (const pair of header.split(";")) {
		const [key, ...rest] = pair.split("=");
		if (key) {
			cookies[key.trim()] = rest.join("=").trim();
		}
	}
	return cookies;
}

function createSessionCookie(
	name: string,
	value: string,
	options: {
		maxAge?: number;
		path?: string;
		httpOnly?: boolean;
		secure?: boolean;
		sameSite?: "lax" | "strict" | "none";
	} = {},
): string {
	const parts = [`${name}=${value}`];
	if (options.maxAge) parts.push(`Max-Age=${options.maxAge}`);
	if (options.path) parts.push(`Path=${options.path}`);
	if (options.httpOnly) parts.push("HttpOnly");
	if (options.secure) parts.push("Secure");
	if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
	return parts.join("; ");
}

function clearSessionCookie(
	name: string,
	options: {
		path?: string;
		httpOnly?: boolean;
		secure?: boolean;
		sameSite?: "lax" | "strict" | "none";
	} = {},
): string {
	const parts = [
		`${name}=`,
		"Max-Age=0",
		"Expires=Thu, 01 Jan 1970 00:00:00 GMT",
	];
	if (options.path) parts.push(`Path=${options.path}`);
	if (options.httpOnly) parts.push("HttpOnly");
	if (options.secure) parts.push("Secure");
	if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
	return parts.join("; ");
}

// ═══════════════════════════════════════════════════════════════════════════════
// PKCE (inlined from core/config.ts)
// ═══════════════════════════════════════════════════════════════════════════════

function generateCodeVerifier(): string {
	const array = new Uint8Array(32);
	crypto.getRandomValues(array);
	return btoa(String.fromCharCode(...Array.from(array)))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

async function generateCodeChallenge(verifier: string): Promise<string> {
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

async function generatePKCE(): Promise<{
	codeVerifier: string;
	codeChallenge: string;
	codeChallengeMethod: "S256";
}> {
	const codeVerifier = generateCodeVerifier();
	const codeChallenge = await generateCodeChallenge(codeVerifier);
	return { codeVerifier, codeChallenge, codeChallengeMethod: "S256" };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIG PROCESSING (inlined from core/config.ts)
// ═══════════════════════════════════════════════════════════════════════════════

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

function processConfig(config: DiscordAuthConfig): InternalConfig {
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

// ═══════════════════════════════════════════════════════════════════════════════
// DISCORD CLIENT (inlined from core/client.ts)
// ═══════════════════════════════════════════════════════════════════════════════

const DISCORD_API = "https://discord.com/api/v10";
const DISCORD_AUTH = "https://discord.com/oauth2/authorize";
const DEFAULT_TIMEOUT = 5000;

export class DiscordClient {
	private clientId: string;
	private clientSecret: string;

	constructor(clientId: string, clientSecret: string) {
		this.clientId = clientId;
		this.clientSecret = clientSecret;
	}

	generateAuthUrl(
		params: OAuth2UrlParams & {
			codeChallenge?: string;
			codeChallengeMethod?: string;
		},
	): string {
		const url = new URL(DISCORD_AUTH);
		url.searchParams.set("client_id", params.clientId);
		url.searchParams.set("redirect_uri", params.redirectUri);
		url.searchParams.set("response_type", params.responseType ?? "code");
		url.searchParams.set("scope", params.scopes.join(" "));
		url.searchParams.set("state", params.state);
		if (params.codeChallenge && params.codeChallengeMethod) {
			url.searchParams.set("code_challenge", params.codeChallenge);
			url.searchParams.set("code_challenge_method", params.codeChallengeMethod);
		}
		if (params.prompt) {
			url.searchParams.set("prompt", params.prompt);
		}
		return url.toString();
	}

	async exchangeCode(
		params: TokenRequestParams,
	): Promise<DiscordTokenResponse> {
		const body = new URLSearchParams({
			client_id: params.clientId,
			client_secret: params.clientSecret,
			grant_type: params.grantType ?? "authorization_code",
			code: params.code,
			redirect_uri: params.redirectUri,
		});
		if (params.codeVerifier) {
			body.set("code_verifier", params.codeVerifier);
		}

		const res = await this.fetchWithRateLimitHandling(
			`${DISCORD_API}/oauth2/token`,
			{
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body,
			},
		);
		if (!res.ok) {
			const err = await res.text();
			throw new Error(`Failed to exchange code: ${res.status} ${err}`);
		}
		return res.json() as Promise<DiscordTokenResponse>;
	}

	private async fetchWithRateLimitHandling(
		input: RequestInfo | URL,
		init?: RequestInit,
	): Promise<Response> {
		const res = await fetch(input, {
			...init,
			signal: AbortSignal.timeout(DEFAULT_TIMEOUT),
		});

		const retryAfterHeader = res.headers.get("Retry-After");
		const rateLimitRemaining = res.headers.get("X-RateLimit-Remaining");
		const rateLimitReset = res.headers.get("X-RateLimit-Reset");
		const isGlobalRateLimit = res.headers.get("X-RateLimit-Global") === "true";

		if (
			res.status === 429 ||
			(rateLimitRemaining !== null &&
				Number.parseInt(rateLimitRemaining, 10) === 0)
		) {
			const retryAfter = retryAfterHeader
				? Number.parseInt(retryAfterHeader, 10)
				: rateLimitReset
					? Number.parseInt(rateLimitReset, 10) * 1000
					: undefined;
			throw new RateLimitError(
				`Discord API rate limit exceeded${retryAfter ? `, retry after ${retryAfter}ms` : ""}`,
				{ retryAfter: retryAfter ? Math.ceil(retryAfter / 1000) : undefined },
			);
		}

		if (!res.ok && !isGlobalRateLimit) {
			const errorText = await res.text().catch(() => "Unknown error");
			throw new Error(`Discord API request failed: ${res.status} ${errorText}`);
		}

		return res;
	}

	async refreshToken(
		params: RefreshTokenParams,
	): Promise<DiscordTokenResponse> {
		const body = new URLSearchParams({
			client_id: params.clientId,
			client_secret: params.clientSecret,
			grant_type: "refresh_token",
			refresh_token: params.refreshToken,
		});
		if (params.scopes) {
			body.set("scope", params.scopes.join(" "));
		}

		const res = await this.fetchWithRateLimitHandling(
			`${DISCORD_API}/oauth2/token`,
			{
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body,
			},
		);
		if (!res.ok) {
			const err = await res.text();
			throw new Error(`Failed to refresh token: ${res.status} ${err}`);
		}
		return res.json() as Promise<DiscordTokenResponse>;
	}

	async fetchWithAutoRefresh<T>(
		accessToken: string,
		refreshToken: string,
		requestFn: (token: string) => Promise<T>,
		options?: { maxRetries?: number },
	): Promise<T> {
		const maxRetries = options?.maxRetries ?? 1;
		let lastError: Error | undefined;

		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			try {
				return await requestFn(accessToken);
			} catch (error) {
				lastError = error as Error;
				const status = this.getErrorStatus(error);
				const isExpired = this.isExpiredError(error);

				if ((status === 401 || status === 403) && isExpired) {
					try {
						const newTokens = await this.refreshToken({
							clientId: this.clientId,
							clientSecret: this.clientSecret,
							refreshToken,
						});
						accessToken = newTokens.access_token;
						continue;
					} catch {
						if (attempt >= maxRetries) {
							throw new TokenExpiredError(
								"Token has expired and could not be refreshed",
								{
									cause: lastError,
								},
							);
						}
						continue;
					}
				}
				throw error;
			}
		}
		throw (
			lastError ??
			new TokenExpiredError("Token has expired and max retries exceeded")
		);
	}

	private isExpiredError(error: unknown): boolean {
		if (!error || typeof error !== "object") return false;
		const obj = error as Record<string, unknown>;
		if (
			typeof obj.code === "string" &&
			obj.code.toLowerCase().includes("expired")
		)
			return true;
		if (
			typeof obj.message === "string" &&
			obj.message.toLowerCase().includes("expired")
		)
			return true;
		return false;
	}

	private getErrorStatus(error: unknown): number | undefined {
		if (error && typeof error === "object" && "status" in error) {
			const status = (error as { status: unknown }).status;
			return typeof status === "number" ? status : undefined;
		}
		return undefined;
	}

	async revokeToken(params: RevokeTokenParams): Promise<void> {
		const body = new URLSearchParams({
			client_id: params.clientId,
			client_secret: params.clientSecret,
			token: params.accessToken,
		});
		const res = await this.fetchWithRateLimitHandling(
			`${DISCORD_API}/oauth2/token/revoke`,
			{
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body,
			},
		);
		if (!res.ok) {
			const err = await res.text();
			throw new Error(`Failed to revoke token: ${res.status} ${err}`);
		}
	}

	async addMember(params: AddMemberParams): Promise<void> {
		const body: Record<string, unknown> = { access_token: params.accessToken };
		if (params.nick) body.nick = params.nick;
		if (params.roles) body.roles = params.roles;

		const res = await this.fetchWithRateLimitHandling(
			`${DISCORD_API}/guilds/${params.guildId}/members/${params.userId}`,
			{
				method: "PUT",
				headers: {
					Authorization: `Bot ${params.botToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(body),
			},
		);
		if (!res.ok && res.status !== 201 && res.status !== 204) {
			const err = await res.text();
			throw new Error(`Failed to add guild member: ${res.status} ${err}`);
		}
	}

	async getUser(accessToken: string): Promise<DiscordUser> {
		const res = await this.fetchWithRateLimitHandling(
			`${DISCORD_API}/users/@me`,
			{
				headers: { Authorization: `Bearer ${accessToken}` },
			},
		);
		if (!res.ok) {
			const err = await res.text();
			throw new Error(`Failed to get user: ${res.status} ${err}`);
		}
		return res.json() as Promise<DiscordUser>;
	}

	async getUserGuilds(accessToken: string): Promise<DiscordGuild[]> {
		const res = await this.fetchWithRateLimitHandling(
			`${DISCORD_API}/users/@me/guilds`,
			{
				headers: { Authorization: `Bearer ${accessToken}` },
			},
		);
		if (!res.ok) {
			const err = await res.text();
			throw new Error(`Failed to get guilds: ${res.status} ${err}`);
		}
		return res.json() as Promise<DiscordGuild[]>;
	}

	async getUserConnections(accessToken: string): Promise<DiscordConnection[]> {
		const res = await this.fetchWithRateLimitHandling(
			`${DISCORD_API}/users/@me/connections`,
			{
				headers: { Authorization: `Bearer ${accessToken}` },
			},
		);
		if (!res.ok) {
			const err = await res.text();
			throw new Error(`Failed to get connections: ${res.status} ${err}`);
		}
		return res.json() as Promise<DiscordConnection[]>;
	}

	async getGuildMember(
		guildId: string,
		userId: string,
		botToken: string,
	): Promise<DiscordGuildMember> {
		const res = await this.fetchWithRateLimitHandling(
			`${DISCORD_API}/guilds/${guildId}/members/${userId}`,
			{ headers: { Authorization: `Bot ${botToken}` } },
		);
		if (!res.ok) {
			const err = await res.text();
			throw new Error(`Failed to get guild member: ${res.status} ${err}`);
		}
		return res.json() as Promise<DiscordGuildMember>;
	}

	async getGuildMemberRoles(
		guildId: string,
		userId: string,
		botToken: string,
	): Promise<string[]> {
		const member = await this.getGuildMember(guildId, userId, botToken);
		return member.roles;
	}
}

// ═══════════════════════════════════════════════════════════════════════════════
// GUILD ROLE SYNC (inlined from core/guild-sync.ts)
// ═══════════════════════════════════════════════════════════════════════════════

interface CachedGuildData {
	roles: string[];
	permissions: string[];
	expiresAt: number;
}

class GuildRoleSync {
	private config: GuildRoleSyncConfig;
	private client: DiscordClient;
	private cache: MemoryCacheAdapter;

	constructor(
		config: GuildRoleSyncConfig,
		client: DiscordClient,
		cache: MemoryCacheAdapter,
	) {
		this.config = config;
		this.client = client;
		this.cache = cache;
	}

	private getCacheKey(userId: string): string {
		return `guild:${this.config.guildId}:user:${userId}`;
	}

	async syncUserRoles(userId: string, _accessToken: string): Promise<string[]> {
		const cacheKey = this.getCacheKey(userId);
		const cached = await this.cache.get(cacheKey);
		if (cached) {
			const cachedData = cached.value as CachedGuildData;
			if (cachedData.expiresAt > Date.now()) {
				return cachedData.permissions;
			}
		}

		const discordRoleIds = await this.client.getGuildMemberRoles(
			this.config.guildId,
			userId,
			this.config.botToken,
		);
		const permissions = this.getMappedPermissions(discordRoleIds);

		const cachedData: CachedGuildData = {
			roles: discordRoleIds,
			permissions,
			expiresAt: Date.now() + this.config.cacheTtlMs,
		};
		await this.cache.set(cacheKey, cachedData, this.config.cacheTtlMs);
		return permissions;
	}

	getMappedPermissions(discordRoleIds: string[]): string[] {
		const permissions = new Set<string>();
		for (const roleId of discordRoleIds) {
			const mapped = this.config.roleMap[roleId];
			if (mapped) {
				for (const perm of mapped) {
					permissions.add(perm);
				}
			}
		}
		return Array.from(permissions);
	}
}

// ═══════════════════════════════════════════════════════════════════════════════
// CALLBACK HANDLER (inlined from core/callback-handler.ts)
// ═══════════════════════════════════════════════════════════════════════════════

interface CallbackContext {
	config: InternalConfig;
	client: DiscordClient;
	storage?: UserStorage;
	code: string;
	codeVerifier?: string;
	sessionId?: string;
	userAgent?: string;
}

interface CallbackResult {
	user: DiscordUser;
	tokens: DiscordTokenResponse;
	syncedPermissions: string[];
	storedUser?: StoredUser;
}

async function handleOAuthCallback(
	ctx: CallbackContext,
): Promise<CallbackResult> {
	const { config, client, storage, code, codeVerifier } = ctx;

	if (!config.redirectUri) {
		throw new ConfigurationError(
			"redirectUri is required — set DISCORD_REDIRECT_URI env var or provide redirectUri in config",
		);
	}
	const redirectUri = config.redirectUri;

	// Token exchange
	const tokens = await client.exchangeCode({
		clientId: config.clientId,
		clientSecret: config.clientSecret,
		code,
		redirectUri,
		codeVerifier: !config.disablePKCE ? codeVerifier : undefined,
	});

	// User fetch
	const user = await client.getUser(tokens.access_token);

	// MFA check
	if (config.mfa.enabled && config.mfa.requireMfa && !user.mfa_enabled) {
		throw new MfaRequiredError();
	}

	// Storage upsert
	if (storage) {
		const expiresAt = Math.floor(Date.now() / 1000) + tokens.expires_in;
		const existing = await storage.findByDiscordId(user.id);
		if (!existing) {
			await storage.create({
				discordId: user.id,
				username: user.username,
				globalName: user.global_name,
				avatar: user.avatar,
				email: user.email,
				locale: user.locale,
				roles: ["user"],
				mfaEnabled: user.mfa_enabled,
				accessToken: tokens.access_token,
				refreshToken: tokens.refresh_token,
				tokenExpiresAt: expiresAt,
			});
		} else {
			await storage.update(user.id, {
				username: user.username,
				globalName: user.global_name,
				avatar: user.avatar,
				email: user.email,
				mfaEnabled: user.mfa_enabled,
				accessToken: tokens.access_token,
				refreshToken: tokens.refresh_token,
				tokenExpiresAt: expiresAt,
			});
		}
	}

	// Guild role sync
	let syncedPermissions: string[] = [];
	if (
		config.guildRoleSync.enabled &&
		config.guildRoleSync.syncOnLogin &&
		config.scopes.includes("guilds.members.read")
	) {
		const guildSync = new GuildRoleSync(
			config.guildRoleSync,
			client,
			new MemoryCacheAdapter(),
		);
		syncedPermissions = await guildSync.syncUserRoles(
			user.id,
			tokens.access_token,
		);
		if (storage && syncedPermissions.length > 0) {
			const storedUser = await storage.findByDiscordId(user.id);
			if (storedUser) {
				const mergedRoles = Array.from(
					new Set([...storedUser.roles, ...syncedPermissions]),
				);
				await storage.update(user.id, { roles: mergedRoles });
			}
		}
	}

	const found = storage ? await storage.findByDiscordId(user.id) : null;
	const storedUser: StoredUser | undefined = found ?? undefined;

	return { user, tokens, syncedPermissions, storedUser };
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOGOUT HANDLER (inlined from core/logout-handler.ts)
// ═══════════════════════════════════════════════════════════════════════════════

async function revokeAndCleanup(params: {
	storage: UserStorage;
	client: DiscordClient;
	clientId: string;
	clientSecret: string;
	sessionData: SessionData;
}): Promise<void> {
	const { storage, client, clientId, clientSecret, sessionData } = params;
	try {
		const stored = await storage.findByDiscordId(sessionData.discordId);
		if (stored?.accessToken) {
			await client.revokeToken({
				clientId,
				clientSecret,
				accessToken: stored.accessToken,
			});
			await storage.delete(stored.discordId);
		}
	} catch {
		// revocation failed, proceed with logout
	}
}

// ═══════════════════════════════════════════════════════════════════════════════
// EDGE UTILS (inlined from standalone/edge.ts)
// ═══════════════════════════════════════════════════════════════════════════════

async function getSessionFromRequest(
	request: Request,
	config: { secret: string; cookieName?: string },
): Promise<SessionData | null> {
	const cookieName = config.cookieName ?? "discord-auth-session";
	const cookies = parseCookies(request);
	const token = cookies[cookieName];
	if (!token) return null;

	const payload = await verifyToken<Record<string, unknown>>(
		token,
		config.secret,
	);
	if (!payload) return null;

	return {
		discordId: payload.discordId as string,
		username: payload.username as string,
		globalName: (payload.globalName as string) ?? null,
		avatar: (payload.avatar as string) ?? null,
		email: (payload.email as string) ?? null,
		locale: payload.locale as string,
		roles: (payload.roles as string[]) ?? undefined,
	};
}

function isPublicPath(path: string, patterns: string[]): boolean {
	for (const pattern of patterns) {
		if (pattern.endsWith("/*")) {
			const prefix = pattern.slice(0, -2);
			if (
				path === prefix ||
				path.startsWith(`${prefix}/`) ||
				path === `${prefix}/`
			) {
				return true;
			}
		} else if (path === pattern) {
			return true;
		}
	}
	return false;
}

function _requiredRole(
	path: string,
	roleMap: Record<string, string[]>,
): string[] | null {
	for (const [pattern, roles] of Object.entries(roleMap)) {
		if (pattern.endsWith("/*")) {
			const prefix = pattern.slice(0, -2);
			if (path === prefix || path.startsWith(`${prefix}/`)) {
				return roles;
			}
		} else if (path === pattern) {
			return roles;
		}
	}
	return null;
}

function redirect(url: string): Response {
	return new Response(null, { status: 302, headers: { Location: url } });
}

function _denied(message = "Forbidden"): Response {
	return new Response(JSON.stringify({ error: message }), {
		status: 403,
		headers: { "Content-Type": "application/json" },
	});
}

// ═══════════════════════════════════════════════════════════════════════════════
// HANDLER CREATION (inlined from standalone/handler.ts)
// ═══════════════════════════════════════════════════════════════════════════════

interface HandlerContext {
	config: InternalConfig;
	client: DiscordClient;
	storage?: UserStorage;
}

async function verifySession(
	token: string,
	secret: string,
	sessionType: SessionType,
): Promise<SessionData | null> {
	if (sessionType === "server") return null;

	const payload = await verifyToken<Record<string, unknown>>(token, secret);
	if (!payload) return null;

	return {
		discordId: payload.discordId as string,
		username: payload.username as string,
		globalName: (payload.globalName as string) ?? null,
		avatar: (payload.avatar as string) ?? null,
		email: (payload.email as string) ?? null,
		locale: payload.locale as string,
		roles: (payload.roles as string[]) ?? undefined,
	};
}

function redirectResponse(url: string, cookies?: string[]): Response {
	const headers = new Headers();
	headers.set("Location", url);
	if (cookies) {
		for (const c of cookies) headers.append("Set-Cookie", c);
	}
	return new Response(null, { status: 302, headers });
}

function htmlResponse(body: string, status = 200): Response {
	return new Response(body, {
		status,
		headers: { "Content-Type": "text/html; charset=utf-8" },
	});
}

function jsonResponse(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "Content-Type": "application/json; charset=utf-8" },
	});
}

function createHandlers(ctx: HandlerContext) {
	const { config, client, storage } = ctx;
	const stateStore = new MemoryStateStore();
	const cookieName = config.session.cookieName ?? "discord-auth-session";
	const cookiePath = config.session.cookiePath ?? "/";
	const sameSite = config.session.sameSite ?? "lax";
	const secure = config.session.secure ?? false;
	const httpOnly = config.session.httpOnly ?? true;
	const sessionCookieName = cookieName;

	const sessionConfig = {
		cookieName,
		cookiePath,
		sameSite,
		secure,
		httpOnly,
	};

	async function handleLogin(request: Request): Promise<Response> {
		const pkceEnabled = !config.disablePKCE;
		let codeChallenge: string | undefined;
		let codeVerifier: string | undefined;

		if (pkceEnabled) {
			const pkce = await generatePKCE();
			codeChallenge = pkce.codeChallenge;
			codeVerifier = pkce.codeVerifier;
		}

		const cookies = parseCookies(request);
		const sessionId = cookies[sessionCookieName];
		const userAgent = request.headers.get("user-agent") ?? undefined;

		const state = await generateState(
			config.session.secret,
			codeVerifier,
			sessionId,
			userAgent,
			config.csrf,
		);

		const responseCookies: string[] = [];
		if (pkceEnabled && codeVerifier) {
			const pkceCookie = createSessionCookie(
				"discord-auth-pkce-verifier",
				codeVerifier,
				{
					maxAge: 600,
					path: cookiePath,
					httpOnly,
					secure,
					sameSite: sameSite as "lax" | "strict" | "none",
				},
			);
			responseCookies.push(pkceCookie);
		}

		const url = client.generateAuthUrl({
			clientId: config.clientId,
			redirectUri: config.redirectUri,
			scopes: config.scopes,
			state,
			prompt: config.prompt,
			codeChallenge,
			codeChallengeMethod: pkceEnabled ? "S256" : undefined,
		});

		return redirectResponse(
			url,
			responseCookies.length > 0 ? responseCookies : undefined,
		);
	}

	async function handleCallback(request: Request): Promise<Response> {
		const url = new URL(request.url);
		const code = url.searchParams.get("code");
		const state = url.searchParams.get("state");

		if (!code) return htmlResponse("Missing authorization code", 400);
		if (!state) return htmlResponse("Missing state parameter", 400);

		const cookies = parseCookies(request);
		const sessionId = cookies[sessionCookieName];
		const userAgent = request.headers.get("user-agent") ?? undefined;

		let stateValidation: ValidatedState;
		let csrfError: Error | null = null;

		if (config.csrf.enabled) {
			stateValidation = await consumeState(
				state,
				config.session.secret,
				sessionId,
				userAgent,
				config.csrf,
				stateStore,
			);

			if (!stateValidation.valid) {
				const parts = state.split(".");
				if (parts.length === 2) {
					try {
						const [encoded] = parts;
						const decoded = new TextDecoder().decode(
							new Uint8Array(
								atob(encoded.replace(/-/g, "+").replace(/_/g, "/"))
									.split("")
									.map((c) => c.charCodeAt(0)),
							),
						);
						const payload = JSON.parse(decoded);
						if (payload.id && (await stateStore.has(payload.id))) {
							csrfError = new StateReusedError();
						} else {
							csrfError = new StateBindingError();
						}
					} catch {
						csrfError = new StateBindingError();
					}
				} else {
					csrfError = new StateBindingError();
				}
			}
		} else {
			stateValidation = await validateState(state, config.session.secret);
			if (!stateValidation.valid) {
				csrfError = new Error("Invalid state parameter - possible CSRF attack");
			}
		}

		if (csrfError) {
			await config.callbacks.onError(csrfError, "callback");
			const statusCode =
				csrfError instanceof DiscordAuthError
					? (csrfError.statusCode ?? 403)
					: 403;
			return htmlResponse(csrfError.message, statusCode);
		}

		let codeVerifier = stateValidation.codeVerifier;
		if (!codeVerifier && !config.disablePKCE) {
			codeVerifier = cookies["discord-auth-pkce-verifier"];
		}

		let callbackResult: CallbackResult;
		try {
			callbackResult = await handleOAuthCallback({
				config,
				client,
				storage,
				code,
				codeVerifier,
				sessionId,
				userAgent,
			});
		} catch (err) {
			await config.callbacks.onError(err as Error, "callback");
			const statusCode =
				err instanceof DiscordAuthError ? (err.statusCode ?? 500) : 500;
			return htmlResponse(
				err instanceof DiscordAuthError ? err.message : "Authentication failed",
				statusCode,
			);
		}

		const { user, tokens, syncedPermissions, storedUser } = callbackResult;

		const sessionPayload: Record<string, unknown> = {
			discordId: user.id,
			username: user.username,
			globalName: user.global_name,
			avatar: user.avatar,
			email: user.email,
			locale: user.locale,
			mfaEnabled: user.mfa_enabled,
		};

		if (storedUser?.roles) {
			sessionPayload.roles = storedUser.roles;
		}
		if (syncedPermissions.length > 0) {
			sessionPayload.permissions = syncedPermissions;
		}

		const sessionToken = await signToken(
			sessionPayload,
			config.session.secret,
			config.session.expiresIn ?? "7d",
		);

		const cookie = createSessionCookie(
			sessionCookieName,
			sessionToken,
			sessionConfig,
		);
		const pkceClearCookie = clearSessionCookie(
			"discord-auth-pkce-verifier",
			sessionConfig,
		);

		if (config.callbacks.onSuccess) {
			const result = await config.callbacks.onSuccess(user, tokens);
			if (result?.redirect) {
				return redirectResponse(result.redirect, [cookie, pkceClearCookie]);
			}
		}

		return redirectResponse("/", [cookie, pkceClearCookie]);
	}

	async function handleLogout(request: Request): Promise<Response> {
		const cookies = parseCookies(request);
		const sessionToken = cookies[sessionCookieName];

		if (storage && sessionToken) {
			const userData = await verifySession(
				sessionToken,
				config.session.secret,
				config.session.type,
			);
			if (userData) {
				await revokeAndCleanup({
					storage,
					client,
					clientId: config.clientId,
					clientSecret: config.clientSecret,
					sessionData: userData,
				});
			}
		}

		const clearCookies: string[] = [
			clearSessionCookie(sessionCookieName, sessionConfig),
			clearSessionCookie("discord-auth-pkce-verifier", sessionConfig),
		];
		return redirectResponse("/", clearCookies);
	}

	async function handleMe(request: Request): Promise<Response> {
		const cookies = parseCookies(request);
		const sessionToken = cookies[sessionCookieName];

		if (!sessionToken) return jsonResponse({ error: "Unauthorized" }, 401);

		const userData = await verifySession(
			sessionToken,
			config.session.secret,
			config.session.type,
		);
		if (!userData) return jsonResponse({ error: "Session expired" }, 401);

		if (!storage) return jsonResponse(userData);

		const stored = await storage.findByDiscordId(userData.discordId);
		if (!stored) return jsonResponse({ error: "User not found" }, 404);

		const { accessToken, refreshToken, ...safe } = stored;
		return jsonResponse(safe);
	}

	return { handleLogin, handleCallback, handleLogout, handleMe };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MIDDLEWARE (inlined from standalone/middleware-factory.ts)
// ═══════════════════════════════════════════════════════════════════════════════

interface EdgeAuthConfig {
	secret: string;
	cookieName?: string;
	loginUrl?: string;
	publicPaths?: string[];
}

function middlewareAuth(config: EdgeAuthConfig) {
	const loginUrl = config.loginUrl ?? "/auth/discord";
	const publicPaths = config.publicPaths ?? [];
	const cookieConfigs = [
		{
			name: config.cookieName ?? "discord-auth-session",
			secret: config.secret,
		},
	];

	return async function authMiddleware(
		request: Request,
	): Promise<Response | undefined> {
		const url = new URL(request.url);
		const path = url.pathname;

		if (isPublicPath(path, publicPaths)) {
			return undefined;
		}

		for (const cookie of cookieConfigs) {
			const user = await getSessionFromRequest(request, {
				secret: cookie.secret,
				cookieName: cookie.name,
			});
			if (user) {
				return undefined;
			}
		}

		return redirect(`${loginUrl}?redirect=${encodeURIComponent(path)}`);
	};
}

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES USED BY THE DISCORD FACTORY
// ═══════════════════════════════════════════════════════════════════════════════

/** Configuration for the discord() factory. */
export interface DiscordFactoryConfig {
	/** Discord OAuth2 Client ID */
	clientId: string;
	/** Discord OAuth2 Client Secret */
	clientSecret: string;
	/** JWT signing secret (32+ chars) */
	secret: string;
	/** Callback URL path (e.g. "/auth/discord/callback") — used as routes.callback */
	callbackUrl: string;
	/** OAuth2 scopes (default: ["identify"]) */
	scopes?: DiscordScope[];
	/** OAuth2 prompt: "consent" | "none" (default: "consent") */
	prompt?: "consent" | "none";
	/** Optional user storage for persistence & roles */
	storage?: UserStorage;
	/** Me route path (default: "/auth/me") */
	meRoute?: string;
	/** Full redirect URI override (default: auto-computed from callbackUrl) */
	redirectUri?: string;
	/** Disable PKCE (default: false) */
	disablePKCE?: boolean;
	/** Paths that bypass auth middleware (supports * wildcard) */
	publicPaths?: string[];
	/** Redirect URL for unauthenticated users (default: "/auth/discord") */
	loginUrl?: string;
}

/** Route handler with auth context */
export type AuthHandler = (
	request: Request,
	ctx: { user: SessionData; storedUser: SafeStoredUser | null },
) => Response | Promise<Response>;

/** Return type of the discord() factory. */
export interface DiscordAuthResult {
	handleLogin: (request: Request) => Promise<Response>;
	handleCallback: (request: Request) => Promise<Response>;
	handleLogout: (request: Request) => Promise<Response>;
	handleMe: (request: Request) => Promise<Response>;
	/** Edge/Next.js middleware — returns Response to redirect, or undefined to allow */
	middleware: (request: Request) => Promise<Response | undefined>;
	/** Extract session from a Request (returns null if not authenticated) */
	getSession: (request: Request) => Promise<SessionData | null>;
	/** Wrap a route handler — injects user or returns 401 */
	withAuth: (handler: AuthHandler) => (request: Request) => Promise<Response>;
	/** Wrap a route handler — injects user (null if not authenticated) */
	withOptionalAuth: (
		handler: (
			request: Request,
			ctx: { user: SessionData | null; storedUser: SafeStoredUser | null },
		) => Response | Promise<Response>,
	) => (request: Request) => Promise<Response>;
	/** Wrap a route handler — requires specific roles (needs storage) */
	withRole: (
		...roles: string[]
	) => (handler: AuthHandler) => (request: Request) => Promise<Response>;
}

const COOKIE_NAME = "discord-auth-session";

/**
 * Create a Discord OAuth2 auth instance.
 *
 * @example
 * ```ts
 * import { discord } from "@hallaxius/auth"
 *
 * const auth = discord({
 *   clientId: process.env.DISCORD_CLIENT_ID!,
 *   clientSecret: process.env.DISCORD_CLIENT_SECRET!,
 *   secret: process.env.AUTH_SECRET!,
 *   callbackUrl: "/auth/discord/callback",
 * })
 *
 * // app/auth/discord/route.ts
 * export const GET = auth.handleLogin
 * // app/auth/discord/callback/route.ts
 * export const GET = auth.handleCallback
 * ```
 */
export function discord(config: DiscordFactoryConfig): DiscordAuthResult {
	const {
		clientId,
		clientSecret,
		secret,
		callbackUrl,
		scopes,
		prompt,
		storage,
		meRoute = "/auth/me",
		redirectUri,
		disablePKCE = false,
		publicPaths = ["/", "/auth/*", "/api/auth/*"],
		loginUrl = "/auth/discord",
	} = config;

	if (!clientId || !clientSecret) {
		throw new Error("discord() requires clientId and clientSecret");
	}
	if (!secret) {
		throw new Error("discord() requires a secret");
	}

	const client = new DiscordClient(clientId, clientSecret);

	const internalConfig = processConfig({
		clientId,
		clientSecret,
		session: { type: "jwt", secret, cookieName: COOKIE_NAME },
		scopes: scopes as DiscordScope[] | undefined,
		prompt,
		routes: { callback: callbackUrl },
		storage,
		meRoute,
		redirectUri,
		disablePKCE,
	});

	const { handleLogin, handleCallback, handleLogout, handleMe } =
		createHandlers({ config: internalConfig, client, storage });

	const middleware = middlewareAuth({
		secret,
		cookieName: COOKIE_NAME,
		loginUrl,
		publicPaths,
	});

	const getSessionHelper = (request: Request) =>
		getSessionFromRequest(request, { secret, cookieName: COOKIE_NAME });

	return {
		handleLogin,
		handleCallback,
		handleLogout,
		handleMe,
		middleware,
		getSession: getSessionHelper,
		withAuth:
			(handler: AuthHandler) =>
			async (request: Request): Promise<Response> => {
				const session = await getSessionHelper(request);
				if (!session) {
					throw new Response(JSON.stringify({ error: "Unauthorized" }), {
						status: 401,
						headers: { "Content-Type": "application/json" },
					});
				}
				let storedUser: SafeStoredUser | null = null;
				if (storage) {
					const stored = await storage.findByDiscordId(session.discordId);
					if (stored) {
						const {
							accessToken: _accessToken,
							refreshToken: _refreshToken,
							...safe
						} = stored;
						storedUser = safe;
					}
				}
				return handler(request, { user: session, storedUser });
			},
		withOptionalAuth:
			(
				handler: (
					request: Request,
					ctx: { user: SessionData | null; storedUser: SafeStoredUser | null },
				) => Response | Promise<Response>,
			) =>
			async (request: Request): Promise<Response> => {
				const session = await getSessionHelper(request);
				let storedUser: SafeStoredUser | null = null;
				if (storage && session) {
					const stored = await storage.findByDiscordId(session.discordId);
					if (stored) {
						const {
							accessToken: _accessToken,
							refreshToken: _refreshToken,
							...safe
						} = stored;
						storedUser = safe;
					}
				}
				return handler(request, { user: session, storedUser });
			},
		withRole:
			(...roles: string[]) =>
			(handler: AuthHandler) =>
			async (request: Request): Promise<Response> => {
				const session = await getSessionHelper(request);
				if (!session) {
					throw new Response(JSON.stringify({ error: "Unauthorized" }), {
						status: 401,
						headers: { "Content-Type": "application/json" },
					});
				}
				if (!storage) {
					throw new Response(
						JSON.stringify({ error: "Storage not configured for role checks" }),
						{
							status: 500,
							headers: { "Content-Type": "application/json" },
						},
					);
				}
				const stored = await storage.findByDiscordId(session.discordId);
				if (!stored) {
					throw new Response(JSON.stringify({ error: "User not found" }), {
						status: 404,
						headers: { "Content-Type": "application/json" },
					});
				}
				const hasRole = roles.some((r) => stored.roles.includes(r));
				if (!hasRole) {
					throw new Response(JSON.stringify({ error: "Forbidden" }), {
						status: 403,
						headers: { "Content-Type": "application/json" },
					});
				}
				const {
					accessToken: _accessToken,
					refreshToken: _refreshToken,
					...safe
				} = stored;
				return handler(request, { user: session, storedUser: safe });
			},
	};
}
