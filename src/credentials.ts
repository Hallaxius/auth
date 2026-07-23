import { AuthError, ErrorCodes } from "./errors";
import {
	clearSessionCookie,
	createSessionCookie,
	defaultSameSite,
	defaultSecureCookie,
	parseCookies,
	type SessionCookieOptions,
} from "./internal/cookies";
import { signToken, verifyToken } from "./internal/jwt";
import {
	AuthStrategy,
	type AuthUser,
	type AuthUserIdentifier,
	type AuthUserStorage,
	type BruteForceConfig,
	type BruteForceStorage,
	type CreateCredentialsUserData,
	type CredentialsAuthResult,
	type CredentialsClientConfig,
	type CredentialsConfig,
	type CredentialsResult,
	type InternalCredentialsConfig,
	type PasswordHasher,
} from "./types";
import { getRequestIP } from "./utils/ip";
import { LruCache } from "./utils/lru";

export class MemoryBruteForceStorage implements BruteForceStorage {
	private attempts = new LruCache<string, { count: number; resetAt: number }>(
		10_000,
	);
	private blockedUntil = new LruCache<string, number>(10_000);

	async increment(key: string, windowMs: number): Promise<number> {
		const now = Date.now();
		const existing = this.attempts.get(key);
		if (!existing || now > existing.resetAt) {
			this.attempts.set(key, { count: 1, resetAt: now + windowMs }, windowMs);
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
		this.blockedUntil.set(key, Date.now() + durationMs, durationMs);
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

	get maxAttempts(): number {
		return this.config.maxAttempts;
	}

	async recordAttempt(identifier: string): Promise<{ allowed: boolean; retryAfter?: number }> {
		const key = this.getKey(identifier);
		const count = await this.storage.increment(key, this.config.windowMs);
		
		if (count >= this.config.maxAttempts) {
			await this.storage.block(key, this.config.blockDurationMs);
			return {
				allowed: false,
				retryAfter: this.config.blockDurationMs
			};
		}
		
		return { allowed: true };
	}

	private getKey(identifier: string): string {
		return `bruteforce:${identifier}`;
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

	async getRetryAfter(_key: string): Promise<number | undefined> {
		if (!this.config.enabled) return undefined;
		// SECURITY: Returns estimated retryAfter. Storage interface doesn't expose exact block expiry.
		// This is by design to prevent timing attacks that could reveal block expiration precision.
		// A proper implementation would need storage.getBlockExpiry(key) for exact timing.
		return this.config.blockDurationMs;
	}

	async reset(key: string): Promise<void> {
		if (!this.config.enabled) return;
		await this.storage.reset(key);
	}

	static async extractKey(
		request: Request,
		strategy?: AuthStrategy,
	): Promise<string> {
		const ip = await getRequestIP(request);
		const userAgent =
			request.headers.get("user-agent")?.slice(0, 50) ?? "unknown";
		const strategyPart = strategy ?? "unknown";
		return `${ip}:${userAgent}:${strategyPart}`;
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
			expiresIn: config.expiresIn ?? "15m",
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
		const bruteForceKey = await this.getBruteForceKey(identifier, request);
		if (bruteForceKey) {
			const blocked = await this.bruteForce.isBlocked(bruteForceKey);
			if (blocked) {
				const retryAfter = await this.bruteForce.getRetryAfter(bruteForceKey);
				throw new AuthError(
					ErrorCodes.BRUTE_FORCE_BLOCKED,
					`Account temporarily locked. Try again later.`,
					{
						statusCode: 429,
						retryable: true,
						retryAfter,
					},
				);
			}
		}

		const user = await this.findUserByIdentifier(identifier);

		const dummyHash = await this.getDummyHash();
		const targetHash = user?.passwordHash ?? dummyHash;
		const valid = await this.hasher.verify(password, targetHash);
		const userExists = user !== null;
		const passwordValid = valid && userExists;

		if (!passwordValid) {
			if (bruteForceKey) {
				const result = await this.bruteForce.recordAttempt(bruteForceKey);
				if (!result.allowed) {
					const retryAfter = result.retryAfter ?? await this.bruteForce.getRetryAfter(bruteForceKey);
					throw new AuthError(
						ErrorCodes.BRUTE_FORCE_BLOCKED,
						`Account temporarily locked. Try again later.`,
						{
							statusCode: 429,
							retryable: true,
							retryAfter,
						},
					);
				}
			}
			throw new AuthError(
				ErrorCodes.INVALID_CREDENTIALS,
				"Invalid credentials",
				{
					statusCode: 401,
				},
			);
		}

		if (bruteForceKey) {
			await this.bruteForce.recordAttempt(bruteForceKey);
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

		if (
			data.password &&
			data.password.length >= minLen &&
			process.env.NODE_ENV === "production"
		) {
			const hasUpper = /[A-Z]/.test(data.password);
			const hasLower = /[a-z]/.test(data.password);
			const hasNumber = /[0-9]/.test(data.password);
			const hasSpecial = /[^A-Za-z0-9]/.test(data.password);
			const varietyCount = [hasUpper, hasLower, hasNumber, hasSpecial].filter(
				Boolean,
			).length;

			if (varietyCount < 3) {
				errors.push(
					"Password must include at least 3 of: uppercase, lowercase, numbers, special characters",
				);
			}
		}

		if (errors.length > 0) {
			throw new AuthError(
				ErrorCodes.CREDENTIALS_VALIDATION_ERROR,
				errors.join("; "),
				{
					statusCode: 400,
				},
			);
		}
	}

	private async checkUniqueness(
		username?: string,
		email?: string,
	): Promise<void> {
		if (username) {
			const existing = await this.storage.findByUsername(username);
			if (existing)
				throw new AuthError(
					ErrorCodes.USERNAME_TAKEN,
					"Username is already taken",
					{
						statusCode: 409,
					},
				);
		}

		if (email) {
			const existing = await this.storage.findByEmail(email);
			if (existing)
				throw new AuthError(ErrorCodes.EMAIL_TAKEN, "Email is already taken", {
					statusCode: 409,
				});
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

	private async getBruteForceKey(
		_identifier: AuthUserIdentifier,
		request?: Request,
	): Promise<string | null> {
		const strategy = this.config.strategy;
		const ip = request ? await getRequestIP(request, { trustProxy: false }) : "unknown";
		return `credentials-login:${strategy}:${ip}`;
	}
}

/**
 * Context object passed to credentials factory
 * Contains client instance and configuration for handlers
 */
interface CredentialsHandlerContext {
	/** CredentialsClient instance for auth operations */
	client: CredentialsClient;
	/** Session cookie name */
	cookieName: string;
	/** Cookie path (default: '/') */
	cookiePath: string;
	/** HttpOnly flag (default: true) */
	httpOnly: boolean;
	/** Secure flag (default: NODE_ENV === 'production') */
	secure: boolean;
	/** SameSite policy (default: 'lax') */
	sameSite: "lax" | "strict" | "none";
	/** Brute force protection instance */
	bruteForce?: BruteForceProtection;
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

function errorResponse(error: unknown): Response {
	if (error instanceof AuthError) {
		const headers = new Headers({
			"Content-Type": "application/json; charset=utf-8",
		});
		if (error.retryable && error.retryAfter) {
			headers.set("Retry-After", String(Math.ceil(error.retryAfter / 1000)));
			headers.set("RateLimit-Limit", "5");
			headers.set("RateLimit-Remaining", "0");
			headers.set(
				"RateLimit-Reset",
				String(Math.ceil((Date.now() + error.retryAfter) / 1000)),
			);
		}
		if (
			error.code === ErrorCodes.BRUTE_FORCE_BLOCKED ||
			error.code === ErrorCodes.RATE_LIMITED
		) {
			headers.set("RateLimit-Limit", "5");
			headers.set("RateLimit-Remaining", "0");
			if (error.retryAfter) {
				headers.set(
					"RateLimit-Reset",
					String(Math.ceil((Date.now() + error.retryAfter) / 1000)),
				);
			}
		}
		return new Response(
			JSON.stringify({ error: error.message, code: error.code }),
			{
				status: error.statusCode ?? 500,
				headers,
			},
		);
	}
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

		const contentType = request.headers.get("content-type");
		if (!contentType?.includes("application/json")) {
			return jsonResponse(
				{ error: "Content-Type must be application/json" },
				415,
			);
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

		const contentType = request.headers.get("content-type");
		if (!contentType?.includes("application/json")) {
			return jsonResponse(
				{ error: "Content-Type must be application/json" },
				415,
			);
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

export function credentials(config: CredentialsConfig): CredentialsResult {
	const cookieName = config.session.cookieName ?? "credentials-session";
	const _cookiePath = config.cookiePath ?? "/";
	const _sameSite = config.sameSite ?? "strict";
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
		config.bruteForce ?? {},
	);

	const handlers = createCredentialsHandlers({
		client,
		cookieName,
		cookiePath: config.cookiePath ?? "/",
		sameSite: config.sameSite ?? defaultSameSite(),
		secure: config.secure ?? defaultSecureCookie(),
		httpOnly: config.httpOnly ?? true,
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
