import type { SessionCookieOptions } from "./internal/cookies";
import {
	clearSessionCookie,
	createSessionCookie,
	defaultSecureCookie,
	parseCookies,
} from "./internal/cookies";
import { signToken, verifyToken } from "./internal/jwt";

function sanitizeIP(raw: string | null | undefined): string {
	const ip = raw?.split(",")[0]?.trim() ?? "unknown";
	const ipv4Regex = /^(?:\d{1,3}\.){3}\d{1,3}$/;
	const ipv6Regex = /^[0-9a-fA-F:]+$/;
	const cleaned = ip.replace(/^::ffff:/, "");
	if (ipv4Regex.test(cleaned) || ipv6Regex.test(cleaned)) {
		return cleaned;
	}
	return "127.0.0.1";
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

export interface PasswordHasher {
	hash(password: string): Promise<string>;
	verify(password: string, hash: string): Promise<boolean>;
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

export class CredentialsAuthError extends DiscordAuthError {}

export class UsernameTakenError extends CredentialsAuthError {
	constructor(
		message = "Username is already taken",
		options?: { cause?: Error },
	) {
		super("USERNAME_TAKEN", message, {
			statusCode: 409,
			cause: options?.cause,
		});
	}
}

export class EmailTakenError extends CredentialsAuthError {
	constructor(message = "Email is already taken", options?: { cause?: Error }) {
		super("EMAIL_TAKEN", message, { statusCode: 409, cause: options?.cause });
	}
}

export class InvalidCredentialsError extends CredentialsAuthError {
	constructor(message = "Invalid credentials", options?: { cause?: Error }) {
		super("INVALID_CREDENTIALS", message, {
			statusCode: 401,
			cause: options?.cause,
		});
	}
}

export class UserNotFoundError extends CredentialsAuthError {
	constructor(message = "User not found", options?: { cause?: Error }) {
		super("USER_NOT_FOUND", message, {
			statusCode: 404,
			cause: options?.cause,
		});
	}
}

export class CredentialsValidationError extends CredentialsAuthError {
	constructor(message = "Validation failed", options?: { cause?: Error }) {
		super("CREDENTIALS_VALIDATION_ERROR", message, {
			statusCode: 400,
			cause: options?.cause,
		});
	}
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

export class MemoryBruteForceStorage implements BruteForceStorage {
	private attempts = new Map<string, { count: number; resetAt: number }>();
	private blockedUntil = new Map<string, number>();

	async increment(key: string, windowMs: number): Promise<number> {
		const now = Date.now();
		const existing = this.attempts.get(key);
		if (!existing || now > existing.resetAt) {
			this.attempts.set(key, { count: 1, resetAt: now + windowMs });
			return 1;
		}
		existing.count++;
		return existing.count;
	}

	async isBlocked(key: string): Promise<boolean> {
		const until = this.blockedUntil.get(key);
		if (!until) return false;
		if (Date.now() > until) {
			this.blockedUntil.delete(key);
			return false;
		}
		return true;
	}

	async reset(key: string): Promise<void> {
		this.attempts.delete(key);
		this.blockedUntil.delete(key);
	}

	async block(key: string, durationMs: number): Promise<void> {
		this.blockedUntil.set(key, Date.now() + durationMs);
	}

	async getCount(key: string): Promise<number> {
		const existing = this.attempts.get(key);
		if (!existing || Date.now() > existing.resetAt) return 0;
		return existing.count;
	}
}

export class BruteForceProtection {
	private config: Required<Omit<BruteForceConfig, "storage">>;
	private storage: BruteForceStorage;

	constructor(config: BruteForceConfig, storage?: BruteForceStorage) {
		this.config = {
			enabled: config.enabled ?? true,
			maxAttempts: config.maxAttempts ?? 5,
			windowMs: config.windowMs ?? 15 * 60 * 1000,
			blockDurationMs: config.blockDurationMs ?? 30 * 60 * 1000,
		};
		this.storage = storage ?? config.storage ?? new MemoryBruteForceStorage();
	}

	async recordAttempt(key: string, success: boolean): Promise<void> {
		if (!this.config.enabled) return;

		if (success) {
			await this.storage.reset(key);
			return;
		}

		const count = await this.storage.increment(key, this.config.windowMs);
		if (count > this.config.maxAttempts) {
			await this.storage.block(key, this.config.blockDurationMs);
		}
	}

	async isBlocked(key: string): Promise<boolean> {
		if (!this.config.enabled) return false;
		return this.storage.isBlocked(key);
	}

	async getRemainingAttempts(key: string): Promise<number> {
		if (!this.config.enabled) return this.config.maxAttempts;
		const blocked = await this.storage.isBlocked(key);
		if (blocked) return 0;
		const count = await this.storage.getCount(key);
		return Math.max(0, this.config.maxAttempts - count);
	}

	async reset(key: string): Promise<void> {
		if (!this.config.enabled) return;
		await this.storage.reset(key);
	}

	static extractKey(request: Request): string {
		const forwarded = request.headers.get("x-forwarded-for");
		const ip = forwarded
			? sanitizeIP(forwarded)
			: (request.headers.get("x-real-ip") ?? "unknown");
		const userAgent =
			request.headers.get("user-agent")?.slice(0, 50) ?? "unknown";
		return `${ip}:${userAgent}`;
	}
}

export class CredentialsClient {
	private config: InternalCredentialsConfig;
	private storage: AuthUserStorage;
	private hasher: PasswordHasher;
	private bruteForce: BruteForceProtection;
	private dummyHashPromise: Promise<string> | null = null;

	constructor(
		config: CredentialsClientConfig,
		storage: AuthUserStorage,
		hasher: PasswordHasher,
		bruteForceConfig?: Partial<BruteForceConfig>,
	) {
		this.config = {
			strategy: config.strategy,
			secret: config.secret,
			expiresIn: config.expiresIn ?? "7d",
			cookieName: config.cookieName ?? "credentials-session",
			cookiePath: config.cookiePath ?? "/",
			httpOnly: config.httpOnly ?? true,
			secure: config.secure ?? defaultSecureCookie(),
			sameSite: config.sameSite ?? "lax",
			defaultRoles: config.defaultRoles ?? ["user"],
			minPasswordLength: config.minPasswordLength ?? 8,
		};
		this.storage = storage;
		this.hasher = hasher;
		this.bruteForce = new BruteForceProtection({
			enabled: true,
			maxAttempts: 5,
			windowMs: 15 * 60 * 1000,
			blockDurationMs: 30 * 60 * 1000,
			...bruteForceConfig,
		});
	}

	private getDummyHash(): Promise<string> {
		if (!this.dummyHashPromise) {
			this.dummyHashPromise = this.hasher.hash(
				`dummy-never-matches-${crypto.randomUUID()}`,
			);
		}
		return this.dummyHashPromise;
	}

	async register(
		data: CreateCredentialsUserData & { password: string },
		_request?: Request,
	): Promise<CredentialsAuthResult> {
		this.validateRegistrationFields(data);

		await this.checkUniqueness(data.username, data.email);

		const passwordHash = await this.hasher.hash(data.password);

		const user = await this.storage.create({
			username: data.username ?? null,
			email: data.email ?? null,
			passwordHash,
			roles: data.roles ?? this.config.defaultRoles,
		});

		const token = await this.createSessionToken(user);

		return { user, token };
	}

	async login(
		identifier: AuthUserIdentifier,
		password: string,
		request?: Request,
	): Promise<CredentialsAuthResult> {
		const bruteForceKey = this.getBruteForceKey(identifier, request);
		if (bruteForceKey) {
			const blocked = await this.bruteForce.isBlocked(bruteForceKey);
			if (blocked) {
				const _remaining =
					await this.bruteForce.getRemainingAttempts(bruteForceKey);
				throw new InvalidCredentialsError(
					`Account temporarily locked. Try again later.`,
				);
			}
		}

		const user = await this.findUserByIdentifier(identifier);

		const dummyHash = user?.passwordHash ?? (await this.getDummyHash());
		const valid = user
			? await this.hasher.verify(password, user.passwordHash)
			: await this.hasher.verify(password, dummyHash);

		if (!user || !valid) {
			if (bruteForceKey) {
				await this.bruteForce.recordAttempt(bruteForceKey, false);
			}
			throw new InvalidCredentialsError();
		}

		if (bruteForceKey) {
			await this.bruteForce.recordAttempt(bruteForceKey, true);
		}

		const token = await this.createSessionToken(user);

		return { user, token };
	}

	async verifySession(token: string): Promise<AuthUser | null> {
		const payload = await verifyToken<Record<string, unknown>>(
			token,
			this.config.secret,
		);
		if (!payload) return null;

		const userId = payload.userId as string;
		if (!userId) return null;

		return this.storage.findById(userId);
	}

	private validateRegistrationFields(
		data: CreateCredentialsUserData & { password: string },
	): void {
		const errors: string[] = [];

		switch (this.config.strategy) {
			case AuthStrategy.UsernameOnly:
				if (!data.username) errors.push("Username is required");
				break;
			case AuthStrategy.EmailOnly:
				if (!data.email) errors.push("Email is required");
				break;
			case AuthStrategy.UsernameEmail:
				if (!data.username) errors.push("Username is required");
				if (!data.email) errors.push("Email is required");
				break;
		}

		if (data.email) {
			const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
			if (!emailRegex.test(data.email)) {
				errors.push("Email format is invalid");
			}
		}

		const minLen = this.config.minPasswordLength ?? 8;
		if (!data.password || data.password.length < minLen) {
			errors.push(`Password must be at least ${minLen} characters`);
		}

		if (errors.length > 0) {
			throw new CredentialsValidationError(errors.join("; "));
		}
	}

	private async checkUniqueness(
		username?: string,
		email?: string,
	): Promise<void> {
		if (username) {
			const existing = await this.storage.findByUsername(username);
			if (existing) throw new UsernameTakenError();
		}

		if (email) {
			const existing = await this.storage.findByEmail(email);
			if (existing) throw new EmailTakenError();
		}
	}

	private async findUserByIdentifier(
		identifier: AuthUserIdentifier,
	): Promise<AuthUser | null> {
		switch (this.config.strategy) {
			case AuthStrategy.UsernameOnly:
				if (!identifier.username) return null;
				return this.storage.findByUsername(identifier.username);

			case AuthStrategy.EmailOnly:
				if (!identifier.email) return null;
				return this.storage.findByEmail(identifier.email);

			case AuthStrategy.UsernameEmail:
				if (identifier.username) {
					const user = await this.storage.findByUsername(identifier.username);
					if (user) return user;
				}
				if (identifier.email) {
					return this.storage.findByEmail(identifier.email);
				}
				return null;

			default:
				return null;
		}
	}

	private async createSessionToken(user: AuthUser): Promise<string> {
		const payload: Record<string, unknown> = {
			userId: user.id,
			roles: user.roles,
		};
		if (user.username) payload.username = user.username;
		if (user.email) payload.email = user.email;

		return signToken(payload, this.config.secret, this.config.expiresIn);
	}

	private getBruteForceKey(
		identifier: AuthUserIdentifier,
		request?: Request,
	): string | null {
		const id = identifier.username ?? identifier.email ?? "unknown";
		let ip = "unknown";
		if (request) {
			const forwarded = request.headers.get("x-forwarded-for");
			ip = forwarded
				? sanitizeIP(forwarded)
				: (request.headers.get("x-real-ip") ?? "unknown");
		}
		return `credentials-login:${ip}:${id}`;
	}
}

interface CredentialsHandlerContext {
	client: CredentialsClient;
	cookieName: string;
	cookiePath: string;
	sameSite: "lax" | "strict" | "none";
	secure: boolean;
	httpOnly: boolean;
	expiresIn: string | number;
}

function jsonResponse(
	data: unknown,
	status = 200,
	cookies?: string[],
): Response {
	const headers = new Headers({
		"Content-Type": "application/json; charset=utf-8",
	});
	if (cookies) {
		for (const c of cookies) headers.append("Set-Cookie", c);
	}
	return new Response(JSON.stringify(data), { status, headers });
}

function _redirectResponse(url: string, cookies?: string[]): Response {
	const headers = new Headers();
	headers.set("Location", url);
	if (cookies) {
		for (const c of cookies) headers.append("Set-Cookie", c);
	}
	return new Response(null, { status: 302, headers });
}

function errorResponse(error: unknown): Response {
	if (error instanceof CredentialsAuthError) {
		return jsonResponse(
			{ error: error.message, code: error.code },
			error.statusCode ?? 500,
		);
	}
	console.error("[auth:credentials] Unhandled error:", error);
	const message =
		error instanceof Error ? error.message : "Internal server error";
	return jsonResponse({ error: message }, 500);
}

function getSafeUser(user: AuthUser): Record<string, unknown> {
	const { passwordHash: _, ...safe } = user;
	return safe;
}

function createCredentialsHandlers(ctx: CredentialsHandlerContext) {
	const { client, cookieName, cookiePath, sameSite, secure, httpOnly } = ctx;

	function cookieOptions(): SessionCookieOptions {
		return { path: cookiePath, httpOnly, secure, sameSite };
	}

	async function handleRegister(request: Request): Promise<Response> {
		if (request.method !== "POST") {
			return jsonResponse({ error: "Method not allowed" }, 405);
		}

		let body: Record<string, unknown>;
		try {
			body = await request.json();
		} catch {
			return jsonResponse({ error: "Invalid JSON body" }, 400);
		}

		try {
			const password =
				typeof body.password === "string"
					? body.password
					: String(body.password ?? "");
			const result = await client.register(
				{
					username:
						typeof body.username === "string" ? body.username : undefined,
					email: typeof body.email === "string" ? body.email : undefined,
					password,
				},
				request,
			);

			const cookie = createSessionCookie(
				cookieName,
				result.token,
				cookieOptions(),
			);

			return jsonResponse(
				{ user: getSafeUser(result.user), token: result.token },
				201,
				[cookie],
			);
		} catch (error) {
			return errorResponse(error);
		}
	}

	async function handleLogin(request: Request): Promise<Response> {
		if (request.method !== "POST") {
			return jsonResponse({ error: "Method not allowed" }, 405);
		}

		let body: Record<string, unknown>;
		try {
			body = await request.json();
		} catch {
			return jsonResponse({ error: "Invalid JSON body" }, 400);
		}

		try {
			const password =
				typeof body.password === "string"
					? body.password
					: String(body.password ?? "");
			const result = await client.login(
				{
					username:
						typeof body.username === "string" ? body.username : undefined,
					email: typeof body.email === "string" ? body.email : undefined,
				},
				password,
				request,
			);

			const cookie = createSessionCookie(
				cookieName,
				result.token,
				cookieOptions(),
			);

			return jsonResponse(
				{ user: getSafeUser(result.user), token: result.token },
				200,
				[cookie],
			);
		} catch (error) {
			return errorResponse(error);
		}
	}

	async function handleLogout(request: Request): Promise<Response> {
		if (request.method !== "POST") {
			return jsonResponse({ error: "Method not allowed" }, 405);
		}
		const clearCookie = clearSessionCookie(cookieName, cookieOptions());
		return jsonResponse({ ok: true }, 200, [clearCookie]);
	}

	async function handleMe(request: Request): Promise<Response> {
		const cookies = parseCookies(request);
		const sessionToken = cookies[cookieName];

		if (!sessionToken) {
			return jsonResponse({ error: "Unauthorized" }, 401);
		}

		try {
			const user = await client.verifySession(sessionToken);
			if (!user) {
				return jsonResponse({ error: "Invalid session" }, 401);
			}
			return jsonResponse(getSafeUser(user));
		} catch {
			return jsonResponse({ error: "Invalid session" }, 401);
		}
	}

	return {
		handleRegister,
		handleLogin,
		handleLogout,
		handleMe,
	};
}

export interface CredentialsConfig {
	strategy: CredentialsClientConfig["strategy"];
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

export function credentials(config: CredentialsConfig): CredentialsResult {
	const cookieName = config.session.cookieName ?? "credentials-session";
	const _cookiePath = config.cookiePath ?? "/";
	const _sameSite = config.sameSite ?? "lax";
	const _secure = config.secure ?? defaultSecureCookie();
	const _httpOnly = config.httpOnly ?? true;

	const client = new CredentialsClient(
		{
			strategy: config.strategy,
			secret: config.session.secret,
			expiresIn: config.session.expiresIn,
			cookieName,
		},
		config.storage,
		config.hasher,
		config.bruteForce,
	);

	const handlers = createCredentialsHandlers({
		client,
		cookieName,
		cookiePath: config.cookiePath ?? "/",
		sameSite: config.sameSite ?? "lax",
		secure: config.secure ?? defaultSecureCookie(),
		httpOnly: config.httpOnly ?? true,
		expiresIn: config.session.expiresIn ?? "7d",
	});

	async function getSession(request: Request): Promise<AuthUser | null> {
		const cookies = parseCookies(request);
		const token = cookies[cookieName];
		if (!token) return null;

		const payload = await verifyToken<Record<string, unknown>>(
			token,
			config.session.secret,
		);
		if (!payload) return null;

		const userId = payload.userId as string;
		if (!userId) return null;

		const user = await config.storage.findById(userId);
		return user ?? null;
	}

	function withAuth<
		T extends (
			request: Request,
			ctx: { user: AuthUser },
		) => Promise<Response> | Response,
	>(handler: T): (request: Request) => Promise<Response> {
		return async (request: Request): Promise<Response> => {
			const user = await getSession(request);
			if (!user) {
				return new Response(JSON.stringify({ error: "Unauthorized" }), {
					status: 401,
					headers: { "Content-Type": "application/json" },
				});
			}
			return handler(request, { user });
		};
	}

	return {
		handleRegister: handlers.handleRegister,
		handleLogin: handlers.handleLogin,
		handleLogout: handlers.handleLogout,
		handleMe: handlers.handleMe,
		getSession,
		withAuth,
	};
}
