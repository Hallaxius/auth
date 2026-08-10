import { z } from "zod";
import { ConfigurationError } from "../errors";
import { isProduction } from "../utils/validation";

export function validateSecretEntropy(secret: string): void {
	if (secret.length < 32) {
		throw new ConfigurationError(
			`JWT secret must be at least 32 characters (got ${secret.length}). Use a cryptographically secure random string.`,
		);
	}

	const uniqueChars = new Set(secret.split(""));
	const entropy = uniqueChars.size / secret.length;

	if (entropy < 0.3 && isProduction()) {
		throw new ConfigurationError(
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

	if (varietyCount < 3 && isProduction()) {
		throw new ConfigurationError(
			"JWT secret lacks character variety. Use uppercase, lowercase, numbers, and special characters.",
		);
	}
}

export const SessionConfigSchema = z.object({
	type: z.enum(["jwt", "server"]).optional(),

	secret: z
		.string()
		.min(32)
		.refine(
			(secret) => {
				if (!isProduction()) return true;

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

	expiresIn: z.union([z.string(), z.number()]).optional(),

	cookieName: z.string().optional(),

	cookiePath: z.string().optional(),

	httpOnly: z.boolean().optional(),

	secure: z.boolean().optional(),

	sameSite: z.enum(["lax", "strict", "none"]).optional(),
});

export const BruteForceConfigSchema = z.object({
	enabled: z.boolean().optional(),

	maxAttempts: z.number().int().positive().optional(),

	windowMs: z.number().int().positive().optional(),

	blockDurationMs: z.number().int().positive().optional(),
});

export const CaptchaConfigSchema = z.object({
	provider: z.enum(["hcaptcha", "recaptcha", "turnstile"]),

	enabled: z.boolean().optional(),

	secretKey: z.string().optional(),

	siteKey: z.string().optional(),

	minScore: z.number().min(0).max(1).optional(),

	expectedAction: z.string().optional(),

	allowedHostnames: z.array(z.string()).optional(),
});

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

export const DiscordAuthConfigSchema = z.object({
	clientId: z.string().min(1),

	clientSecret: z.string().min(1),

	secret: z.string().min(1),

	callbackUrl: z
		.string()
		.url()
		.refine(
			(url) => {
				if (isProduction()) {
					return url.startsWith("https://");
				}
				return true;
			},
			{
				message:
					"callbackUrl must use HTTPS in production (NODE_ENV=production)",
			},
		),

	scopes: z.array(DiscordScopeSchema).optional(),

	prompt: z.enum(["consent", "none"]).optional(),

	routes: z
		.object({
			prefix: z.string().optional(),
			callback: z.string().optional(),
			logout: z.string().optional(),
			error: z.string().optional(),
		})
		.optional(),

	cookies: z
		.object({
			secure: z.boolean().optional(),
			sameSite: z.enum(["lax", "strict", "none"]).optional(),
		})
		.optional(),

	redirectUri: z.string().url().optional(),

	bruteForce: BruteForceConfigSchema.optional(),

	captcha: CaptchaConfigSchema.optional(),

	mfa: z
		.object({
			enabled: z.boolean().optional(),
			requireMfa: z.boolean().optional(),
			allowedMethods: z
				.array(z.enum(["totp", "sms", "backup_codes"]))
				.optional(),
		})
		.optional(),

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

	csrf: z
		.object({
			enabled: z.boolean().optional(),
			ttlMs: z.number().int().positive().optional(),
			singleUse: z.boolean().optional(),
			bindToSession: z.boolean().optional(),
			bindToUserAgent: z.boolean().optional(),
		})
		.optional(),

	callbacks: z
		.object({
			onSuccess: z.function().optional(),
			onError: z.function().optional(),
		})
		.optional(),

	stateSecret: z.string().optional(),

	session: SessionConfigSchema.optional(),

	meRoute: z.string().optional(),
});

export const CredentialsClientConfigSchema = z.object({
	emailRequired: z.boolean().optional(),

	usernameRequired: z.boolean().optional(),

	secret: z.string().min(1),

	expiresIn: z.union([z.string(), z.number()]).optional(),

	cookieName: z.string().optional(),

	cookiePath: z.string().optional(),

	httpOnly: z.boolean().optional(),

	secure: z.boolean().optional(),

	sameSite: z.enum(["lax", "strict", "none"]).optional(),

	defaultRoles: z.array(z.string()).optional(),

	minPasswordLength: z.number().int().positive().optional(),

	captcha: CaptchaConfigSchema.optional(),
});

export const RateLimitConfigSchema = z.object({
	maxRequests: z.number().int().positive(),

	windowMs: z.number().int().positive(),

	keyBy: z.function().optional(),

	storage: z
		.object({
			increment: z.function(),
			reset: z.function(),
		})
		.optional(),
});

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
