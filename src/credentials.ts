import {
	type CaptchaConfig,
	type ResolvedCaptchaConfig,
	resolveCaptchaConfig,
	verifyCaptcha,
} from "./captcha";
import {
	AuthError,
	ConfigurationError,
	ErrorCodes,
	PasswordTooShortError,
} from "./errors";
import {
	clearSessionCookie,
	createSessionCookie,
	defaultSameSite,
	defaultSecureCookie,
	parseCookies,
	type SessionCookieOptions,
} from "./internal/cookies";
import { LIMIT_CONSTANTS } from "./internal/defaults";
import {
	expiresInToSeconds,
	revokeToken,
	signToken,
	verifyToken,
} from "./internal/jwt";
import { rateLimit } from "./rate-limit";
import { MemoryBruteForceStore } from "./storage/factory";
import { tenancy } from "./tenancy";
import type {
	AuthUser,
	AuthUserIdentifier,
	AuthUserStorage,
	BruteForceConfig,
	BruteForceStorage,
	CreateCredentialsUserData,
	CreateSessionWithoutPasswordOptions,
	CredentialsAuthResult,
	CredentialsClientConfig,
	CredentialsConfig,
	CredentialsResult,
	InternalCredentialsConfig,
	SafeAuthUser,
	TenancyResult,
	TokenRevocationStorage,
} from "./types";
import { getRequestIP } from "./utils/ip";
import { createSecurityLogger } from "./utils/logger";
import { validatePasswordOrThrow } from "./utils/password-validation";

const logger = createSecurityLogger("credentials");

export const SUSPENDED_ROLE = "suspended";

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
		const resolvedStorage = storage ?? config.storage;
		if (!resolvedStorage) {
			logger.warn(
				"BruteForceProtection: no storage provided, falling back to in-memory store. " +
					"This is NOT suitable for production, serverless, or multi-process deployments. " +
					"Provide a `storage` implementing BruteForceStorage (e.g. Redis, Database, KV).",
			);
			this.storage = new MemoryBruteForceStore();
		} else {
			this.storage = resolvedStorage;
		}
	}

	get maxAttempts(): number {
		return this.config.maxAttempts;
	}

	async recordAttempt(
		identifier: string,
		success?: boolean,
	): Promise<{ allowed: boolean; retryAfter?: number } | undefined> {
		if (!this.config.enabled) {
			return undefined;
		}

		const key = this.getKey(identifier);

		if (success === true) {
			await this.storage.reset(key);
			return { allowed: true };
		}

		const count = await this.storage.increment(key, this.config.windowMs);

		if (count >= this.config.maxAttempts) {
			await this.storage.block(key, this.config.blockDurationMs);
			return {
				allowed: false,
				retryAfter: this.config.blockDurationMs,
			};
		}

		return { allowed: true };
	}

	private getKey(identifier: string): string {
		return `bruteforce:${identifier}`;
	}

	async isBlocked(key: string): Promise<boolean> {
		if (!this.config.enabled) return false;
		return this.storage.isBlocked(this.getKey(key));
	}

	async getRemainingAttempts(key: string): Promise<number> {
		if (!this.config.enabled) return this.config.maxAttempts;
		const prefixed = this.getKey(key);
		const blocked = await this.storage.isBlocked(prefixed);
		if (blocked) return 0;
		const count = await this.storage.getCount(prefixed);
		return Math.max(0, this.config.maxAttempts - count);
	}

	async getRetryAfter(key: string): Promise<number | undefined> {
		if (!this.config.enabled) return undefined;

		const prefixed = this.getKey(key);
		const remainingBlockTime =
			await this.storage.getRemainingBlockTime?.(prefixed);
		if (remainingBlockTime !== undefined) {
			return remainingBlockTime;
		}

		return this.config.blockDurationMs;
	}

	async reset(key: string): Promise<void> {
		if (!this.config.enabled) return;
		await this.storage.reset(key);
	}

	static async extractKey(request: Request): Promise<string> {
		const ip = await getRequestIP(request);
		const userAgent =
			request.headers.get("user-agent")?.slice(0, 50) ?? "unknown";
		return `${ip}:${userAgent}`;
	}
}

export class CredentialsClient {
	private config: InternalCredentialsConfig;
	private storage: AuthUserStorage;
	private bruteForce: BruteForceProtection;

	constructor(
		config: CredentialsClientConfig,
		storage: AuthUserStorage,
		bruteForceConfig?: Partial<BruteForceConfig>,
	) {
		const emailRequired = config.emailRequired ?? false;
		const usernameRequired = config.usernameRequired ?? false;
		if (!emailRequired && !usernameRequired) {
			throw new ConfigurationError(
				"At least one of emailRequired or usernameRequired must be true",
			);
		}
		if (typeof storage.verifyPassword !== "function") {
			throw new ConfigurationError(
				"AuthUserStorage.verifyPassword is required: password hashing and verification are the consumer's responsibility, the package never hashes or compares plaintext passwords",
			);
		}

		this.config = {
			emailRequired,
			usernameRequired,
			secret: config.secret,
			expiresIn: config.expiresIn ?? "15m",
			cookieName: config.cookieName ?? "credentials-session",
			cookiePath: config.cookiePath ?? "/",
			httpOnly: config.httpOnly ?? true,
			secure: config.secure ?? defaultSecureCookie(),
			sameSite: config.sameSite ?? defaultSameSite(),
			defaultRoles: config.defaultRoles ?? ["user"],
			minPasswordLength: config.minPasswordLength ?? 8,
			validatePassword: config.validatePassword ?? true,
			sessionRevocationStorage: config.sessionRevocationStorage,
			captcha: config.captcha
				? (resolveCaptchaConfig(config.captcha as CaptchaConfig) ?? undefined)
				: undefined,
			trustProxy: config.trustProxy ?? false,
			dummyVerifyPassword: config.dummyVerifyPassword,
			genericRegistrationErrors: config.genericRegistrationErrors ?? false,
		};
		this.storage = storage;
		this.bruteForce = new BruteForceProtection({
			enabled: true,
			maxAttempts: 5,
			windowMs: 15 * 60 * 1000,
			blockDurationMs: 30 * 60 * 1000,
			...bruteForceConfig,
		});
	}

	async register(
		data: CreateCredentialsUserData & {
			password?: string;
			passwordHash?: string;
		},
		_request?: Request,
		tenantId?: string,
	): Promise<CredentialsAuthResult> {
		const resolvedPassword = data.password ?? data.passwordHash;
		if (!resolvedPassword) {
			throw new AuthError(
				ErrorCodes.CREDENTIALS_VALIDATION_ERROR,
				"Password is required",
				{ statusCode: 400 },
			);
		}
		const registrationData = { ...data, password: resolvedPassword };
		this.validateRegistrationFields(registrationData);

		if (this.config.validatePassword) {
			const validationOptions =
				typeof this.config.validatePassword === "boolean"
					? undefined
					: this.config.validatePassword;
			validatePasswordOrThrow(resolvedPassword, {
				minLength: this.config.minPasswordLength,
				...validationOptions,
			});
		}

		await this.checkUniqueness(data.username, data.email);

		const user = await this.storage.create({
			username: data.username ?? null,
			email: data.email ?? null,
			password: resolvedPassword,
			roles: data.roles ?? this.config.defaultRoles,
		});

		const token = await this.createSessionToken(user, tenantId);

		return { user, token };
	}

	async login(
		identifier: AuthUserIdentifier,
		password: string,
		request?: Request,
		tenantId?: string,
	): Promise<CredentialsAuthResult> {
		if (!identifier.email && !identifier.username) {
			throw new AuthError(
				ErrorCodes.CREDENTIALS_VALIDATION_ERROR,
				"Email or username is required",
				{
					statusCode: 400,
				},
			);
		}
		const bruteForceKey = await this.getBruteForceKey(
			identifier,
			request,
			tenantId,
		);
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

		if (!user) {
			if (this.config.dummyVerifyPassword) {
				await this.config.dummyVerifyPassword(password);
			}
			if (bruteForceKey) {
				const result = await this.bruteForce.recordAttempt(bruteForceKey);
				if (result && !result.allowed) {
					const retryAfter =
						result.retryAfter ??
						(await this.bruteForce.getRetryAfter(bruteForceKey));
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

		const passwordMatches = await this.storage.verifyPassword(
			user.id,
			password,
		);
		if (!passwordMatches) {
			if (bruteForceKey) {
				const result = await this.bruteForce.recordAttempt(bruteForceKey);
				if (result && !result.allowed) {
					const retryAfter =
						result.retryAfter ??
						(await this.bruteForce.getRetryAfter(bruteForceKey));
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
			await this.bruteForce.recordAttempt(bruteForceKey, true);
		}

		const token = await this.createSessionToken(user, tenantId);

		return { user, token };
	}

	async verifySession(token: string): Promise<AuthUser | null> {
		const payload = await verifyToken<Record<string, unknown>>(
			token,
			this.config.secret,
			this.config.sessionRevocationStorage,
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

		if (this.config.usernameRequired && !data.username) {
			errors.push("Username is required");
		}
		if (this.config.emailRequired && !data.email) {
			errors.push("Email is required");
		}

		if (data.email) {
			const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
			if (!emailRegex.test(data.email)) {
				errors.push("Email format is invalid");
			}
		}

		if (!data.password || data.password.length === 0) {
			throw new PasswordTooShortError(`Password is required`);
		}

		if (errors.length > 0) {
			throw new AuthError(
				ErrorCodes.CREDENTIALS_VALIDATION_ERROR,
				errors.join(", "),
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
			if (existing) {
				if (this.config.genericRegistrationErrors) {
					throw new AuthError(
						ErrorCodes.CREDENTIALS_VALIDATION_ERROR,
						"Registration failed",
						{
							statusCode: 400,
						},
					);
				}
				throw new AuthError(
					ErrorCodes.USERNAME_TAKEN,
					"Username is already taken",
					{
						statusCode: 409,
					},
				);
			}
		}

		if (email) {
			const existing = await this.storage.findByEmail(email);
			if (existing) {
				if (this.config.genericRegistrationErrors) {
					throw new AuthError(
						ErrorCodes.CREDENTIALS_VALIDATION_ERROR,
						"Registration failed",
						{
							statusCode: 400,
						},
					);
				}
				throw new AuthError(ErrorCodes.EMAIL_TAKEN, "Email is already taken", {
					statusCode: 409,
				});
			}
		}
	}

	private async findUserByIdentifier(
		identifier: AuthUserIdentifier,
	): Promise<AuthUser | null> {
		if (this.config.usernameRequired && identifier.username) {
			const user = await this.storage.findByUsername(identifier.username);
			if (user) return user;
		}
		if (this.config.emailRequired && identifier.email) {
			const user = await this.storage.findByEmail(identifier.email);
			if (user) return user;
		}
		return null;
	}

	private async createSessionToken(
		user: AuthUser,
		tenantId?: string,
	): Promise<string> {
		const payload: Record<string, unknown> = {
			userId: user.id,
			roles: user.roles,
		};
		if (user.username) payload.username = user.username;
		if (user.email) payload.email = user.email;
		if (tenantId) payload.tenantId = tenantId;

		return signToken(payload, this.config.secret, this.config.expiresIn);
	}

	/**
	 * Additively creates a session WITHOUT verifying a password.
	 * Internal-only: the package's passwordless handlers (magic-link/OTP,
	 * SMS, WebAuthn) mint sessions through here (via the factory
	 * wrapper, which enforces Guard 4 at src/credentials.ts factory level).
	 *
	 * Guards (mandatory):
	 * 1. Never calls `verifyPassword`.
	 * 2. User exists and is not suspended (role `"suspended"`).
	 * 3. `BruteForceProtection.isBlocked("passwordless:<tenantId>:<userId>")`
	 *    checked BEFORE the session is created.
	 * 4. `tenantId` MUST come from subdomain resolution (D3) — never parsed
	 *    from body/query/header (enforced by the factory wrapper when tenancy
	 *    is enabled).
	 * 5. Minimal claims `{ userId, tenantId?, roles?, type: "passwordless" }` —
	 *    same `signToken` path as `createSessionToken`.
	 */
	async createSessionWithoutPassword(
		options: CreateSessionWithoutPasswordOptions,
	): Promise<{ sessionToken: string; idToken: string }> {
		const bruteForceKey = `passwordless:${options.tenantId ? `${options.tenantId}:` : ""}${options.userId}`;
		const blocked = await this.bruteForce.isBlocked(bruteForceKey);
		if (blocked) {
			const retryAfter = await this.bruteForce.getRetryAfter(bruteForceKey);
			throw new AuthError(
				ErrorCodes.BRUTE_FORCE_BLOCKED,
				"Too many attempts, please try again later",
				{
					statusCode: 429,
					retryable: true,
					retryAfter,
				},
			);
		}

		const user = await this.storage.findById(options.userId);
		if (!user) {
			throw new AuthError(ErrorCodes.USER_NOT_FOUND, "User not found", {
				statusCode: 404,
			});
		}
		if (user.roles.includes(SUSPENDED_ROLE)) {
			throw new AuthError(ErrorCodes.TENANT_FORBIDDEN, "User is suspended", {
				statusCode: 403,
			});
		}

		const payload: Record<string, unknown> = {
			userId: user.id,
			roles: options.roles ?? user.roles,
			type: "passwordless",
		};
		if (options.tenantId) payload.tenantId = options.tenantId;

		const sessionToken = await signToken(
			payload,
			this.config.secret,
			this.config.expiresIn,
		);
		return { sessionToken, idToken: sessionToken };
	}

	private async getBruteForceKey(
		identifier: AuthUserIdentifier,
		request?: Request,
		tenantId?: string,
	): Promise<string | null> {
		const ip = request
			? await getRequestIP(request, { trustProxy: this.config.trustProxy })
			: "unknown";
		const identifierValue =
			identifier.username ?? identifier.email ?? "unknown";
		// Legacy (global) key format is preserved without a tenantId so that
		// existing blocked keys keep working (additivity, ADR-002). With a
		// tenantId the composite key isolates per-tenant counters.
		if (tenantId) {
			return `credentials-login:${ip}:${tenantId}:${identifierValue}`;
		}
		return `credentials-login:${ip}:${identifierValue}`;
	}
}

interface CredentialsHandlerContext {
	client: CredentialsClient;
	cookieName: string;
	cookiePath: string;
	httpOnly: boolean;
	secure: boolean;
	sameSite: "lax" | "strict" | "none";
	maxAge?: number;
	bruteForce?: BruteForceProtection;
	rateLimiter?: ReturnType<typeof rateLimit>;
	loginRateLimiter?: ReturnType<typeof rateLimit>;
	captcha?: ResolvedCaptchaConfig;
	bruteForceMaxAttempts?: number;
	sessionRevocationStorage?: TokenRevocationStorage;
	sessionSecret?: string;
	tenancy?: TenancyResult;
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

function errorResponse(
	error: unknown,
	maxAttempts: number = LIMIT_CONSTANTS.BRUTE_FORCE_MAX_ATTEMPTS,
): Response {
	if (error instanceof AuthError) {
		const headers = new Headers({
			"Content-Type": "application/json; charset=utf-8",
		});
		if (error.retryable && error.retryAfter) {
			headers.set("Retry-After", String(Math.ceil(error.retryAfter / 1000)));
			headers.set("RateLimit-Limit", String(maxAttempts));
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
			headers.set("RateLimit-Limit", String(maxAttempts));
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
	logger.error("credentials handler error", {
		error: error instanceof Error ? error.message : String(error),
	});
	return jsonResponse({ error: "Internal server error" }, 500);
}

function getSafeUser(user: AuthUser): Record<string, unknown> {
	const { password: _, ...safe } = user;
	return safe;
}

function createCredentialsHandlers(ctx: CredentialsHandlerContext) {
	const {
		client,
		cookieName,
		cookiePath,
		sameSite,
		secure,
		httpOnly,
		maxAge,
		captcha,
		bruteForceMaxAttempts,
	} = ctx;

	async function verifyCaptchaIfEnabled(request: Request): Promise<void> {
		if (!captcha?.enabled) return;

		const token = request.headers.get("x-captcha-response");
		if (!token) {
			throw new AuthError(
				ErrorCodes.CAPTCHA_FAILED,
				"Captcha token is required but was not provided",
				{ statusCode: 403 },
			);
		}

		const ip = await getRequestIP(request);
		const result = await verifyCaptcha({ ...captcha, enabled: true }, token, {
			remoteip: ip,
		});

		if (!result.success) {
			throw new AuthError(
				ErrorCodes.CAPTCHA_FAILED,
				result.message ?? "Captcha verification failed",
				{ statusCode: 403 },
			);
		}
	}

	function cookieOptions(): SessionCookieOptions {
		const options: SessionCookieOptions = {
			path: cookiePath,
			httpOnly,
			secure,
			sameSite,
		};
		if (maxAge !== undefined) options.maxAge = maxAge;
		return options;
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
			await verifyCaptchaIfEnabled(request);
			const tenantId = ctx.tenancy
				? await ctx.tenancy.resolveTenantId(request)
				: null;
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
				tenantId ?? undefined,
			);

			const cookie = createSessionCookie(
				cookieName,
				result.token,
				cookieOptions(),
			);

			return jsonResponse({ user: getSafeUser(result.user) }, 201, [cookie]);
		} catch (error) {
			return errorResponse(error, bruteForceMaxAttempts);
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

		if (ctx.loginRateLimiter) {
			const result = await ctx.loginRateLimiter.check(request);
			if (!result.allowed) {
				const headers = new Headers({
					"Content-Type": "application/json; charset=utf-8",
					"Retry-After": String(Math.ceil(result.retryAfter! / 1000)),
					"RateLimit-Limit": String(result.limit),
					"RateLimit-Remaining": String(result.remaining),
					"RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
				});
				return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
					status: 429,
					headers,
				});
			}
		}

		try {
			await verifyCaptchaIfEnabled(request);
			const tenantId = ctx.tenancy
				? await ctx.tenancy.resolveTenantId(request)
				: null;
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
				tenantId ?? undefined,
			);

			const cookie = createSessionCookie(
				cookieName,
				result.token,
				cookieOptions(),
			);

			return jsonResponse({ user: getSafeUser(result.user) }, 200, [cookie]);
		} catch (error) {
			return errorResponse(error, bruteForceMaxAttempts);
		}
	}

	async function handleLogout(request: Request): Promise<Response> {
		if (request.method !== "POST") {
			return jsonResponse({ error: "Method not allowed" }, 405);
		}
		const cookies = parseCookies(request);
		const sessionToken = cookies[cookieName];
		if (sessionToken && ctx.sessionRevocationStorage && ctx.sessionSecret) {
			await revokeToken(
				sessionToken,
				ctx.sessionSecret,
				ctx.sessionRevocationStorage,
			);
		}
		const clearCookie = clearSessionCookie(cookieName, cookieOptions());
		return jsonResponse({ ok: true }, 200, [clearCookie]);
	}

	async function handleMe(request: Request): Promise<Response> {
		if (ctx.rateLimiter) {
			const result = await ctx.rateLimiter.check(request);

			if (!result.allowed) {
				const headers = new Headers({
					"Content-Type": "application/json; charset=utf-8",
					"Retry-After": String(Math.ceil(result.retryAfter! / 1000)),
					"RateLimit-Limit": String(result.limit),
					"RateLimit-Remaining": String(result.remaining),
					"RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
				});
				return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
					status: 429,
					headers,
				});
			}
		}

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
		} catch (error) {
			logger.error("handleMe error", {
				error: error instanceof Error ? error.message : String(error),
			});
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
	const sessionMaxAge = expiresInToSeconds(config.session.expiresIn ?? "15m");

	const tenancyInstance = config.tenancy?.enabled
		? tenancy(config.tenancy)
		: undefined;

	async function tenantRateLimitNamespace(request: Request): Promise<string> {
		if (!tenancyInstance) return "global";
		try {
			return (await tenancyInstance.resolveTenantId(request)) ?? "global";
		} catch {
			return "global";
		}
	}

	const client = new CredentialsClient(
		{
			emailRequired: config.emailRequired,
			usernameRequired: config.usernameRequired,
			secret: config.session.secret,
			expiresIn: config.session.expiresIn,
			cookieName,
			validatePassword: config.validatePassword,
			sessionRevocationStorage: config.sessionRevocationStorage,
			captcha: config.captcha,
			dummyVerifyPassword: config.dummyVerifyPassword,
			genericRegistrationErrors: config.genericRegistrationErrors,
		},
		config.storage,
		config.bruteForce ?? {},
	);

	const resolvedCaptcha = config.captcha
		? resolveCaptchaConfig(config.captcha as CaptchaConfig)
		: null;

	const meRateLimiter = config.meRateLimitStorage
		? rateLimit({
				maxRequests: 10,
				windowMs: 60 * 1000,
				storage: config.meRateLimitStorage,
				keyBy: async (request) => {
					const ip = await getRequestIP(request);
					if (!tenancyInstance) return `me:${ip}`;
					return `me:${await tenantRateLimitNamespace(request)}:${ip}`;
				},
			})
		: undefined;

	const loginRateLimiter = config.loginRateLimitStorage
		? rateLimit({
				maxRequests: 10,
				windowMs: 60 * 1000,
				storage: config.loginRateLimitStorage,
				keyBy: async (request) => {
					const ip = await getRequestIP(request);
					if (!tenancyInstance) return `login:${ip}`;
					return `login:${await tenantRateLimitNamespace(request)}:${ip}`;
				},
			})
		: undefined;

	const handlers = createCredentialsHandlers({
		client,
		cookieName,
		cookiePath: config.cookiePath ?? config.session.cookiePath ?? "/",
		sameSite: config.sameSite ?? config.session.sameSite ?? defaultSameSite(),
		secure: config.secure ?? config.session.secure ?? defaultSecureCookie(),
		httpOnly: config.httpOnly ?? config.session.httpOnly ?? true,
		maxAge: sessionMaxAge,
		rateLimiter: meRateLimiter,
		loginRateLimiter,
		bruteForceMaxAttempts:
			config.bruteForce?.maxAttempts ??
			LIMIT_CONSTANTS.BRUTE_FORCE_MAX_ATTEMPTS,
		captcha: resolvedCaptcha ?? undefined,
		sessionRevocationStorage: config.sessionRevocationStorage,
		sessionSecret: config.session.secret,
		tenancy: tenancyInstance,
	});

	async function getSession(request: Request): Promise<SafeAuthUser | null> {
		const cookies = parseCookies(request);
		const token = cookies[cookieName];
		if (!token) return null;

		const payload = await verifyToken<Record<string, unknown>>(
			token,
			config.session.secret,
			config.sessionRevocationStorage,
		);
		if (!payload) return null;

		const userId = payload.userId as string;
		if (!userId) return null;

		const user = await config.storage.findById(userId);
		if (!user) return null;

		const { password: _password, ...safeUser } = user;
		return safeUser;
	}

	function withAuth<
		T extends (
			request: Request,
			ctx: { user: SafeAuthUser },
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

	/**
	 * Factory-level wrapper enforcing Guard 4 (`tenantId` resolved from
	 * the subdomain only, never body/query/header). Delegates the remaining
	 * guards (1, 2, 3, 5) to `CredentialsClient.createSessionWithoutPassword`.
	 * Internal-only: consumed by the package's passwordless handlers.
	 */
	async function createSessionWithoutPassword(
		options: CreateSessionWithoutPasswordOptions,
	): Promise<{ sessionToken: string; idToken: string }> {
		if (tenancyInstance) {
			if (!options.tenantId) {
				throw new AuthError(ErrorCodes.TENANT_REQUIRED, "Tenant is required", {
					statusCode: 403,
				});
			}
			const kind = await tenancyInstance.getTenant(options.tenantId);
			if (!kind) {
				throw new AuthError(ErrorCodes.TENANT_NOT_FOUND, "Tenant not found", {
					statusCode: 404,
				});
			}
			if (kind.status === "suspended") {
				throw new AuthError(
					ErrorCodes.TENANT_SUSPENDED,
					"Tenant is suspended",
					{ statusCode: 403 },
				);
			}
		}
		return client.createSessionWithoutPassword(options);
	}

	return {
		handleRegister: handlers.handleRegister,
		handleLogin: handlers.handleLogin,
		handleLogout: handlers.handleLogout,
		handleMe: handlers.handleMe,
		getSession,
		withAuth,
		createSessionWithoutPassword,
		dispose: () => {
			config.storage.dispose?.();
			tenancyInstance?.dispose?.();
		},
	};
}
