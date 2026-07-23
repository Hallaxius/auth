import { z } from "zod";

/**
 * Validates JWT secret entropy and character variety
 * @param secret - Secret string to validate
 * @throws {Error} If secret is too short, has low entropy, or lacks character variety
 * @security
 * - Minimum 32 characters (256 bits)
 * - Checks entropy ratio in production
 * - Requires 3+ character types: uppercase, lowercase, numbers, special chars
 */
export function validateSecretEntropy(secret: string): void {
	if (secret.length < 32) {
		throw new Error(
			`JWT secret must be at least 32 characters (got ${secret.length}). Use a cryptographically secure random string.`,
		);
	}

	const uniqueChars = new Set(secret.split(""));
	const entropy = uniqueChars.size / secret.length;

	if (entropy < 0.3 && process.env.NODE_ENV === "production") {
		throw new Error(
			"JWT secret has low entropy. Use a cryptographically secure random string with varied characters.",
		);
	}

	const hasUpper = /[A-Z]/.test(secret);
	const hasLower = /[a-z]/.test(secret);
	const hasNumber = /[0-9]/.test(secret);
	const hasSpecial = /[^A-Za-z0-9]/.test(secret);
	const varietyCount = [hasUpper, hasLower, hasNumber, hasSpecial].filter(
		Boolean,
	).length;

	if (varietyCount < 3 && process.env.NODE_ENV === "production") {
		throw new Error(
			"JWT secret lacks character variety. Use uppercase, lowercase, numbers, and special characters.",
		);
	}
}

/**
 * Session configuration schema with security validations
 */
export const SessionConfigSchema = z.object({
	/** Session type */
	type: z.enum(["jwt", "server"]).optional(),
	/** JWT secret with entropy validation */
	secret: z
		.string()
		.min(32)
		.refine(
			(secret) => {
				if (process.env.NODE_ENV !== "production") return true;

				const varietyCount = [
					/[a-z]/.test(secret),
					/[A-Z]/.test(secret),
					/[0-9]/.test(secret),
					/[^a-zA-Z0-9]/.test(secret),
				].filter(Boolean).length;

				if (varietyCount < 3) {
					throw new Error(
						"JWT secret lacks character variety (need 3+: uppercase, lowercase, numbers, special chars)",
					);
				}

				return true;
			},
			{
				message:
					"JWT secret must be at least 32 characters (256 bits) with high entropy (mix of uppercase, lowercase, numbers, and special characters)",
			},
		),
	/** Token expiration */
	expiresIn: z.union([z.string(), z.number()]).optional(),
	/** Cookie name */
	cookieName: z.string().optional(),
	/** Cookie path */
	cookiePath: z.string().optional(),
	/** HttpOnly flag */
	httpOnly: z.boolean().optional(),
	/** Secure flag */
	secure: z.boolean().optional(),
	/** SameSite attribute */
	sameSite: z.enum(["lax", "strict", "none"]).optional(),
});

/**
 * Brute force protection configuration schema
 */
export const BruteForceConfigSchema = z.object({
	/** Enable protection */
	enabled: z.boolean().optional(),
	/** Maximum attempts before blocking */
	maxAttempts: z.number().int().positive().optional(),
	/** Time window in milliseconds */
	windowMs: z.number().int().positive().optional(),
	/** Block duration in milliseconds */
	blockDurationMs: z.number().int().positive().optional(),
});

/**
 * Discord OAuth2 scope schema
 */
export const DiscordScopeSchema = z.enum([
	"identify",
	"email",
	"guilds",
	"guilds.join",
	"guilds.members.read",
	"connections",
	"role_connections.write",
	"rpc",
	"rpc.notifications.read",
	"rpc.voice.read",
	"rpc.voice.write",
	"activities.read",
	"activities.write",
	"bot",
	"webhook.incoming",
	"messages.read",
	"applications.builds.upload",
	"applications.builds.read",
	"applications.commands",
	"applications.commands.permissions.update",
	"applications.store.update",
	"applications.entitlements",
	"relationships.read",
	"voice",
	"dm_channels.read",
]);

/**
 * Discord OAuth2 configuration schema with comprehensive validations
 */
export const DiscordAuthConfigSchema = z.object({
	/** Discord application client ID */
	clientId: z.string().min(1),
	/** Discord application client secret */
	clientSecret: z.string().min(1),
	/** Session secret */
	secret: z.string().min(1),
	/** OAuth2 callback URL (must be HTTPS in production) */
	callbackUrl: z
		.string()
		.url()
		.refine(
			(url) => {
				if (process.env.NODE_ENV === "production") {
					return url.startsWith("https://");
				}
				return true;
			},
			{
				message:
					"callbackUrl must use HTTPS in production (NODE_ENV=production)",
			},
		),
	/** OAuth2 scopes */
	scopes: z.array(DiscordScopeSchema).optional(),
	/** OAuth2 prompt */
	prompt: z.enum(["consent", "none"]).optional(),
	/** Route configuration */
	routes: z
		.object({
			prefix: z.string().optional(),
			callback: z.string().optional(),
			logout: z.string().optional(),
			error: z.string().optional(),
		})
		.optional(),
	/** Cookie configuration */
	cookies: z
		.object({
			secure: z.boolean().optional(),
			sameSite: z.enum(["lax", "strict", "none"]).optional(),
		})
		.optional(),
	/** Enable PKCE */
	pkce: z.boolean().optional(),
	/** Override redirect URI */
	redirectUri: z.string().url().optional(),
	/** Disable PKCE */
	disablePKCE: z.boolean().optional(),
	/** Auto-refresh configuration */
	autoRefresh: z
		.object({
			enabled: z.boolean().optional(),
			thresholdSeconds: z.number().int().positive().optional(),
			maxRetries: z.number().int().nonnegative().optional(),
		})
		.optional(),
	/** Brute force protection */
	bruteForce: BruteForceConfigSchema.optional(),
	/** MFA configuration */
	mfa: z
		.object({
			enabled: z.boolean().optional(),
			requireMfa: z.boolean().optional(),
			allowedMethods: z
				.array(z.enum(["totp", "sms", "backup_codes"]))
				.optional(),
		})
		.optional(),
	/** Guild role sync */
	guildRoleSync: z
		.object({
			enabled: z.boolean().optional(),
			guildId: z.string().optional(),
			roleMap: z.record(z.string(), z.array(z.string())).optional(),
			cacheTtlMs: z.number().int().positive().optional(),
			syncOnLogin: z.boolean().optional(),
			botToken: z.string().optional(),
		})
		.optional(),
	/** CSRF protection */
	csrf: z
		.object({
			enabled: z.boolean().optional(),
			ttlMs: z.number().int().positive().optional(),
			singleUse: z.boolean().optional(),
			bindToSession: z.boolean().optional(),
			bindToUserAgent: z.boolean().optional(),
		})
		.optional(),
	/** Authentication callbacks */
	callbacks: z
		.object({
			onSuccess: z.function().optional(),
			onError: z.function().optional(),
		})
		.optional(),
	/** State secret */
	stateSecret: z.string().optional(),
	/** Session configuration */
	session: SessionConfigSchema.optional(),
	/** /me route */
	meRoute: z.string().optional(),
});

/**
 * Authentication strategy schema
 */
export const AuthStrategySchema = z.enum([
	"username-only",
	"email-only",
	"username-email",
]);

/**
 * Credentials client configuration schema
 */
export const CredentialsClientConfigSchema = z.object({
	/** Authentication strategy */
	strategy: AuthStrategySchema,
	/** JWT secret */
	secret: z.string().min(1),
	/** Token expiration */
	expiresIn: z.union([z.string(), z.number()]).optional(),
	/** Cookie name */
	cookieName: z.string().optional(),
	/** Cookie path */
	cookiePath: z.string().optional(),
	/** HttpOnly flag */
	httpOnly: z.boolean().optional(),
	/** Secure flag */
	secure: z.boolean().optional(),
	/** SameSite attribute */
	sameSite: z.enum(["lax", "strict", "none"]).optional(),
	/** Default roles */
	defaultRoles: z.array(z.string()).optional(),
	/** Minimum password length */
	minPasswordLength: z.number().int().positive().optional(),
});

/**
 * Rate limit configuration schema
 */
export const RateLimitConfigSchema = z.object({
	/** Maximum requests per window */
	maxRequests: z.number().int().positive(),
	/** Window duration in milliseconds */
	windowMs: z.number().int().positive(),
	/** Custom key function */
	keyBy: z.function().optional(),
	/** Custom storage */
	storage: z
		.object({
			increment: z.function(),
			reset: z.function(),
		})
		.optional(),
});

/**
 * Validates Discord auth configuration
 * @param config - Configuration object to validate
 * @returns Validated configuration
 * @throws {Error} If configuration is invalid
 */
export function validateDiscordAuthConfig(
	config: unknown,
): z.infer<typeof DiscordAuthConfigSchema> {
	const result = DiscordAuthConfigSchema.safeParse(config);
	if (!result.success) {
		throw new Error(
			`Invalid DiscordAuthConfig: ${result.error.issues.map((i) => i.message).join(", ")}`,
		);
	}
	return result.data;
}

/**
 * Validates credentials configuration
 * @param config - Configuration object to validate
 * @returns Validated configuration
 * @throws {Error} If configuration is invalid
 */
export function validateCredentialsConfig(
	config: unknown,
): z.infer<typeof CredentialsClientConfigSchema> {
	const result = CredentialsClientConfigSchema.safeParse(config);
	if (!result.success) {
		throw new Error(
			`Invalid CredentialsConfig: ${result.error.issues.map((i) => i.message).join(", ")}`,
		);
	}
	return result.data;
}

/**
 * Validates rate limit configuration
 * @param config - Configuration object to validate
 * @returns Validated configuration
 * @throws {Error} If configuration is invalid
 */
export function validateRateLimitConfig(
	config: unknown,
): z.infer<typeof RateLimitConfigSchema> {
	const result = RateLimitConfigSchema.safeParse(config);
	if (!result.success) {
		throw new Error(
			`Invalid RateLimitConfig: ${result.error.issues.map((i) => i.message).join(", ")}`,
		);
	}
	return result.data;
}
