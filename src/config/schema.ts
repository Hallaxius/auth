import { z } from "zod";

export const SessionConfigSchema = z.object({
	type: z.enum(["jwt", "server"]).optional(),
	secret: z.string().min(1),
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
	callbackUrl: z.string().url(),
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
	pkce: z.boolean().optional(),
	redirectUri: z.string().url().optional(),
	disablePKCE: z.boolean().optional(),
	autoRefresh: z
		.object({
			enabled: z.boolean().optional(),
			thresholdSeconds: z.number().int().positive().optional(),
			maxRetries: z.number().int().nonnegative().optional(),
		})
		.optional(),
	bruteForce: BruteForceConfigSchema.optional(),
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

export const AuthStrategySchema = z.enum([
	"username-only",
	"email-only",
	"username-email",
]);

export const CredentialsClientConfigSchema = z.object({
	strategy: AuthStrategySchema,
	secret: z.string().min(1),
	expiresIn: z.union([z.string(), z.number()]).optional(),
	cookieName: z.string().optional(),
	cookiePath: z.string().optional(),
	httpOnly: z.boolean().optional(),
	secure: z.boolean().optional(),
	sameSite: z.enum(["lax", "strict", "none"]).optional(),
	defaultRoles: z.array(z.string()).optional(),
	minPasswordLength: z.number().int().positive().optional(),
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
