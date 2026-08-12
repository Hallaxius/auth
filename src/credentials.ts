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
import type {
	AuthUser,
	AuthUserIdentifier,
	AuthUserStorage,
	BruteForceConfig,
	BruteForceStorage,
	CreateCredentialsUserData,
	CredentialsAuthResult,
	CredentialsClientConfig,
	CredentialsConfig,
	CredentialsResult,
	InternalCredentialsConfig,
	SafeAuthUser,
	TokenRevocationStorage,
} from "./types";
import { constantTimeCompareStrings } from "./utils/constant-time";
import { getRequestIP } from "./utils/ip";
import { createSecurityLogger } from "./utils/logger";
import { validatePasswordOrThrow } from "./utils/password-validation";

const logger = createSecurityLogger("credentials");

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
		data: CreateCredentialsUserData & { password: string },
		_request?: Request,
	): Promise<CredentialsAuthResult> {
		this.validateRegistrationFields(data);

		if (this.config.validatePassword) {
			const validationOptions =
				typeof this.config.validatePassword === "boolean"
					? undefined
					: this.config.validatePassword;
			validatePasswordOrThrow(data.password, {
				minLength: this.config.minPasswordLength,
				...validationOptions,
			});
		}

		await this.checkUniqueness(data.username, data.email);

		const user = await this.storage.create({
			username: data.username ?? null,
			email: data.email ?? null,
			password: data.password,
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

		if (!user) {
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

		const passwordMatches = this.storage.verifyPassword
			? await this.storage.verifyPassword(user.id, password)
			: constantTimeCompareStrings(user.password, password);
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

		const token = await this.createSessionToken(user);

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
		identifier: AuthUserIdentifier,
		request?: Request,
	): Promise<string | null> {
		const ip = request
			? await getRequestIP(request, { trustProxy: this.config.trustProxy })
			: "unknown";
		const identifierValue =
			identifier.username ?? identifier.email ?? "unknown";
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
	captcha?: ResolvedCaptchaConfig;
	bruteForceMaxAttempts?: number;
	sessionRevocationStorage?: TokenRevocationStorage;
	sessionSecret?: string;
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

		try {
			await verifyCaptchaIfEnabled(request);
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
					return `me:${ip}`;
				},
			})
		: undefined;

	const handlers = createCredentialsHandlers({
		client,
		cookieName,
		cookiePath: config.cookiePath ?? "/",
		sameSite: config.sameSite ?? defaultSameSite(),
		secure: config.secure ?? defaultSecureCookie(),
		httpOnly: config.httpOnly ?? true,
		maxAge: sessionMaxAge,
		rateLimiter: meRateLimiter,
		bruteForceMaxAttempts:
			config.bruteForce?.maxAttempts ??
			LIMIT_CONSTANTS.BRUTE_FORCE_MAX_ATTEMPTS,
		captcha: resolvedCaptcha ?? undefined,
		sessionRevocationStorage: config.sessionRevocationStorage,
		sessionSecret: config.session.secret,
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

	return {
		handleRegister: handlers.handleRegister,
		handleLogin: handlers.handleLogin,
		handleLogout: handlers.handleLogout,
		handleMe: handlers.handleMe,
		getSession,
		withAuth,
		dispose: () => {
			config.storage.dispose?.();
		},
	};
}
