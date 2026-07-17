/**
 * v3 Utils — Self-contained implementations
 *
 * State management, guild helpers, and config validation.
 */

import { jwtVerify, SignJWT } from "jose";
import { AuthError, ErrorCodes } from "../errors";

// ============================================================================
// Types (inlined from core/types.ts — only those needed by utils)
// ============================================================================

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

// ============================================================================
// DiscordClient (inlined from core/client.ts)
// ============================================================================

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
			throw new AuthError(
				ErrorCodes.RATE_LIMITED,
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
							throw new AuthError(
								ErrorCodes.TOKEN_EXPIRED,
								"Token has expired and could not be refreshed",
								{ cause: lastError },
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
			new AuthError(
				ErrorCodes.TOKEN_EXPIRED,
				"Token has expired and max retries exceeded",
			)
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

// ============================================================================
// State Management (inlined from core/state.ts)
// ============================================================================

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

export async function generateState(
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

export async function validateState(
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

export async function consumeState(
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

// ============================================================================
// JWT Helpers (inlined from standalone/jwt.ts)
// ============================================================================

function secretToKey(secret: string): Uint8Array {
	return new TextEncoder().encode(secret);
}

async function _signToken(
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

async function _verifyToken<T extends Record<string, unknown>>(
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

// ============================================================================
// Cookie Helpers (inlined from standalone/cookies.ts)
// ============================================================================

function _parseCookies(request: Request): Record<string, string> {
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

function _createSessionCookie(
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

function _clearSessionCookie(
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

// ============================================================================
// Config Validation (inlined from utils/helpers.ts)
// ============================================================================

export function validateConfig(config: DiscordAuthConfig): void {
	if (!config.clientId) {
		throw new AuthError(
			ErrorCodes.CONFIGURATION_ERROR,
			"Missing required configuration: 'clientId' is required. Get it from https://discord.com/developers/applications",
		);
	}

	if (!config.clientSecret) {
		throw new AuthError(
			ErrorCodes.CONFIGURATION_ERROR,
			"Missing required configuration: 'clientSecret' is required. Get it from https://discord.com/developers/applications",
		);
	}

	if (!config.session?.secret) {
		throw new AuthError(
			ErrorCodes.CONFIGURATION_ERROR,
			"Missing required configuration: 'session.secret' is required. Generate a strong secret (min 32 chars): crypto.randomUUID() + crypto.randomUUID()",
		);
	}

	if (config.session?.secret?.length < 32) {
		throw new AuthError(
			ErrorCodes.CONFIGURATION_ERROR,
			"session.secret must be at least 32 characters long for security",
		);
	}

	if (config.scopes && config.scopes.length === 0) {
		throw new AuthError(
			ErrorCodes.CONFIGURATION_ERROR,
			"scopes array must not be empty if provided",
		);
	}

	if (config.redirectUri && typeof config.redirectUri !== "string") {
		throw new AuthError(
			ErrorCodes.CONFIGURATION_ERROR,
			"redirectUri must be a string",
		);
	}

	if (config.meRoute && typeof config.meRoute !== "string") {
		throw new AuthError(
			ErrorCodes.CONFIGURATION_ERROR,
			"meRoute must be a string",
		);
	}

	if (config.prompt && !["consent", "none"].includes(config.prompt)) {
		throw new AuthError(
			ErrorCodes.CONFIGURATION_ERROR,
			"prompt must be either 'consent' or 'none'",
		);
	}

	if (
		config.session?.type &&
		!["jwt", "server"].includes(config.session.type)
	) {
		throw new AuthError(
			ErrorCodes.CONFIGURATION_ERROR,
			"session.type must be either 'jwt' or 'server'",
		);
	}

	if (
		config.session?.sameSite &&
		!["lax", "strict", "none"].includes(config.session.sameSite)
	) {
		throw new AuthError(
			ErrorCodes.CONFIGURATION_ERROR,
			"session.sameSite must be one of: 'lax', 'strict', 'none'",
		);
	}
}

// ============================================================================
// Guild Helpers (inlined from utils/helpers.ts)
// ============================================================================

export async function hasRoleInGuild(
	userId: string,
	guildId: string,
	roleId: string,
	botToken: string,
	clientId: string,
	clientSecret: string,
): Promise<boolean> {
	const client = new DiscordClient(clientId, clientSecret);

	try {
		const member = await client.getGuildMember(guildId, userId, botToken);
		return member.roles.includes(roleId);
	} catch {
		return false;
	}
}

export async function hasAnyRoleInGuild(
	userId: string,
	guildId: string,
	roleIds: string[],
	botToken: string,
	clientId: string,
	clientSecret: string,
): Promise<boolean> {
	const client = new DiscordClient(clientId, clientSecret);

	try {
		const member = await client.getGuildMember(guildId, userId, botToken);
		return roleIds.some((roleId) => member.roles.includes(roleId));
	} catch {
		return false;
	}
}

export async function revokeUserSession(
	discordId: string,
	storage: UserStorage,
	clientId: string,
	clientSecret: string,
): Promise<void> {
	const client = new DiscordClient(clientId, clientSecret);

	try {
		const user = await storage.findByDiscordId(discordId);

		if (user) {
			await storage.delete(discordId);

			try {
				await client.revokeToken({
					clientId,
					clientSecret,
					accessToken: user.accessToken,
				});
			} catch (revokeError) {
				console.warn(
					`Failed to revoke Discord token for user ${discordId}:`,
					revokeError,
				);
			}
		}
	} catch (error) {
		throw new AuthError(
			ErrorCodes.STORAGE_WRITE_ERROR,
			`Failed to revoke user session: ${error}`,
		);
	}
}

export async function syncUserRoles(
	discordId: string,
	guildId: string,
	botToken: string,
	storage: UserStorage,
	clientId: string,
	clientSecret: string,
): Promise<string[]> {
	const client = new DiscordClient(clientId, clientSecret);

	try {
		const user = await storage.findByDiscordId(discordId);

		if (!user) {
			throw new AuthError(
				ErrorCodes.STORAGE_READ_ERROR,
				`User with discordId ${discordId} not found`,
			);
		}

		const member = await client.getGuildMember(guildId, discordId, botToken);

		const updatedUser = await storage.update(discordId, {
			roles: member.roles,
		});

		return updatedUser.roles;
	} catch (error) {
		throw new AuthError(
			ErrorCodes.STORAGE_WRITE_ERROR,
			`Failed to sync user roles: ${error}`,
		);
	}
}

export async function autoJoinGuild(params: {
	guildId: string;
	userId: string;
	accessToken: string;
	botToken: string;
	nick?: string;
	roles?: string[];
	clientId: string;
	clientSecret: string;
}): Promise<void> {
	const client = new DiscordClient(params.clientId, params.clientSecret);

	try {
		await client.addMember({
			guildId: params.guildId,
			userId: params.userId,
			accessToken: params.accessToken,
			botToken: params.botToken,
			nick: params.nick,
			roles: params.roles,
		});
	} catch (error) {
		throw new AuthError(
			ErrorCodes.GUILD_JOIN_ERROR,
			`Failed to add user ${params.userId} to guild ${params.guildId}: ${error}`,
		);
	}
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

export async function isUserInGuild(
	userId: string,
	guildId: string,
	botToken: string,
	clientId: string,
	clientSecret: string,
): Promise<boolean> {
	const client = new DiscordClient(clientId, clientSecret);

	try {
		await client.getGuildMember(guildId, userId, botToken);
		return true;
	} catch {
		return false;
	}
}

export function generateSecureSecret(length: number = 32): string {
	const array = new Uint8Array(length);
	crypto.getRandomValues(array);
	return btoa(String.fromCharCode(...Array.from(array)))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}
