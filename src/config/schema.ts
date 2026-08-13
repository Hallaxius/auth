import { z } from "zod";
import { ConfigurationError } from "../errors";
import { isProduction } from "../utils/validation";

export function calculateShannonEntropy(secret: string): number {
	if (secret.length === 0) return 0;
	const freq = new Map<string, number>();
	for (const ch of secret) {
		freq.set(ch, (freq.get(ch) ?? 0) + 1);
	}
	let entropy = 0;
	for (const count of freq.values()) {
		const p = count / secret.length;
		entropy -= p * Math.log2(p);
	}
	return entropy;
}

export function isKnownWeakSecret(secret: string): boolean {
	if (secret.length === 0) return true;
	const uniqueChars = new Set(secret.split(""));
	if (uniqueChars.size === 1) return true;
	const period = Math.min(8, Math.floor(secret.length / 2));
	for (let p = 1; p <= period; p++) {
		if (secret.length % p !== 0) continue;
		const pattern = secret.slice(0, p);
		let isRepetitive = true;
		for (let i = p; i < secret.length; i += p) {
			if (secret.slice(i, i + p) !== pattern) {
				isRepetitive = false;
				break;
			}
		}
		if (isRepetitive) return true;
	}
	return false;
}

export function validateSecretEntropy(secret: string): void {
	if (!secret || typeof secret !== "string") {
		throw new ConfigurationError(
			"JWT secret is required. Generate a strong secret (min 32 chars) using crypto.randomUUID() + crypto.randomUUID().",
		);
	}
	if (secret.length < 32) {
		throw new ConfigurationError(
			`JWT secret too short (minimum 32 characters required). Generate a cryptographically secure random string.`,
		);
	}

	if (isKnownWeakSecret(secret)) {
		throw new ConfigurationError(
			"JWT secret is too weak (repetitive or single-character pattern). Use a cryptographically secure random string with varied characters.",
		);
	}

	const uniqueChars = new Set(secret.split(""));
	const charVariety = uniqueChars.size / secret.length;

	if (charVariety < 0.3) {
		throw new ConfigurationError(
			"JWT secret has low entropy. Use a cryptographically secure random string with varied characters.",
		);
	}

	const shannonEntropy = calculateShannonEntropy(secret);
	if (shannonEntropy < 4.0) {
		throw new ConfigurationError(
			`JWT secret entropy is too low (${shannonEntropy.toFixed(2)} bits/char, minimum 4.0 required). Use a cryptographically secure random string.`,
		);
	}

	const hasUpper = /[A-Z]/.test(secret);
	const hasLower = /[a-z]/.test(secret);
	const hasNumber = /[0-9]/.test(secret);
	const hasSpecial = /[^A-Za-z0-9]/.test(secret);
	const varietyCount = [hasUpper, hasLower, hasNumber, hasSpecial].filter(
		Boolean,
	).length;

	if (varietyCount < 3) {
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
				const varietyCount = [
					/[a-z]/.test(secret),
					/[A-Z]/.test(secret),
					/[0-9]/.test(secret),
					/[^a-zA-Z0-9]/.test(secret),
				].filter(Boolean).length;

				return varietyCount >= 3;
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

export const TenancyConfigSchema = z.object({
	enabled: z.boolean().optional(),

	resolver: z.function().optional(),

	required: z.boolean().optional(),

	defaultTenantId: z.string().min(1).optional(),

	baseDomains: z.array(z.string().min(1)).optional(),

	storage: z
		.object({
			tenant: z
				.object({
					getById: z.function(),
					getByDomain: z.function(),
					set: z.function(),
					delete: z.function(),
					ping: z.function().optional(),
					dispose: z.function().optional(),
				})
				.optional(),
			tenantMembership: z
				.object({
					getMemberships: z.function(),
					getMembers: z.function(),
					setMembership: z.function(),
					deleteMembership: z.function(),
				})
				.optional(),
		})
		.optional(),
});

export function validateTenancyConfig(
	config: unknown,
): z.infer<typeof TenancyConfigSchema> {
	const result = TenancyConfigSchema.safeParse(config);
	if (!result.success) {
		throw new Error(
			`Invalid TenancyConfig: ${result.error.issues.map((i) => i.message).join(", ")}`,
		);
	}
	return result.data;
}

export const MagicLinkConfigSchema = z.object({
	storage: z
		.object({
			findBySelector: z.function(),
			create: z.function(),
			consume: z.function(),
			deleteByRecipient: z.function(),
			ping: z.function().optional(),
			dispose: z.function().optional(),
		})
		.optional(),
	notifier: z
		.object({
			sendEmail: z.function(),
		})
		.optional(),
	mode: z.enum(["link", "code"]).optional(),
	ttlMinutes: z.number().int().positive().max(15).optional(),
	codeLength: z.number().int().min(6).max(8).optional(),
	userLookup: z.function().optional(),
	linkPath: z.string().min(1).optional(),
	tenantIdFromRequest: z.function().optional(),
	requestLimit: z.unknown().optional(),
	recipientLimit: z.unknown().optional(),
	verifyLimit: z.unknown().optional(),
	onVerified: z.function().optional(),
	trustProxy: z.boolean().optional(),
});

export function validateMagicLinkConfig(
	config: unknown,
): z.infer<typeof MagicLinkConfigSchema> {
	const result = MagicLinkConfigSchema.safeParse(config);
	if (!result.success) {
		throw new Error(
			`Invalid MagicLinkConfig: ${result.error.issues.map((i) => i.message).join(", ")}`,
		);
	}
	return result.data;
}

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

	validatePassword: z
		.union([
			z.boolean(),
			z.object({
				minLength: z.number().int().positive().optional(),
				maxLength: z.number().int().positive().optional(),
				requireLowercase: z.boolean().optional(),
				requireUppercase: z.boolean().optional(),
				requireNumber: z.boolean().optional(),
				requireSpecial: z.boolean().optional(),
			}),
		])
		.optional(),

	captcha: CaptchaConfigSchema.optional(),

	dummyVerifyPassword: z
		.function()
		.input([z.string()])
		.output(z.promise(z.boolean()))
		.optional(),

	loginRateLimitStorage: z.unknown().optional(),

	genericRegistrationErrors: z.boolean().optional(),

	tenancy: TenancyConfigSchema.optional(),
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

export const SmsConfigSchema = z.object({
	notifier: z
		.object({
			send: z.function(),
		})
		.optional(),
	smsPasswordless: z.boolean().optional(),
	codeLength: z.number().int().min(4).max(10).optional(),
	ttlSeconds: z.number().int().positive().max(600).optional(),
	maxAttempts: z.number().int().positive().optional(),
	lockoutSeconds: z.number().int().positive().optional(),
	cooldownMs: z.number().int().positive().optional(),
	dailyPerPhoneLimit: z.number().int().positive().optional(),
	allowedCountryPrefixes: z.array(z.string().min(2)).optional(),
	storage: z
		.object({
			set: z.function(),
			getAndConsume: z.function(),
			delete: z.function(),
			ping: z.function().optional(),
			dispose: z.function().optional(),
		})
		.optional(),
	phoneLookup: z.function().optional(),
	createSessionWithoutPassword: z.function().optional(),
	tenantIdFromRequest: z.function().optional(),
	bruteForceStorage: z.unknown().optional(),
	getBinding: z.function().optional(),
	onEnrolled: z.function().optional(),
	verifyPassword: z.function().optional(),
	mfaStorage: z.unknown().optional(),
	sessionCookieName: z.string().min(1).optional(),
	secret: z.string().min(1).optional(),
	trustProxy: z.boolean().optional(),
	dispose: z.function().optional(),
});

export function validateSmsConfig(
	config: unknown,
): z.infer<typeof SmsConfigSchema> {
	const result = SmsConfigSchema.safeParse(config);
	if (!result.success) {
		throw new Error(
			`Invalid SmsConfig: ${result.error.issues.map((i) => i.message).join(", ")}`,
		);
	}
	return result.data;
}

export const WebAuthnConfigSchema = z.object({
	rp: z.object({
		id: z.string().min(1),
		name: z.string().min(1),
		origins: z.array(z.string().url()),
	}),
	requireUserVerification: z.boolean().optional(),
	attestationType: z.enum(["none", "direct", "enterprise"]).optional(),
	timeoutMs: z.number().int().positive().optional(),
	storage: z
		.object({
			credentials: z
				.object({
					findById: z.function(),
					listByUser: z.function(),
					create: z.function(),
					updateSignCount: z.function(),
					delete: z.function(),
					deleteByUser: z.function(),
					ping: z.function().optional(),
					dispose: z.function().optional(),
				})
				.optional(),
			challenges: z
				.object({
					set: z.function(),
					getAndConsume: z.function(),
					ping: z.function().optional(),
					dispose: z.function().optional(),
				})
				.optional(),
		})
		.optional(),
	getUser: z.function().optional(),
	createSessionWithoutPassword: z.function().optional(),
	tenantIdFromRequest: z.function().optional(),
	sessionCookieName: z.string().min(1).optional(),
	secret: z.string().min(1).optional(),
	trustProxy: z.boolean().optional(),
	dispose: z.function().optional(),
});

export function validateWebAuthnConfig(
	config: unknown,
): z.infer<typeof WebAuthnConfigSchema> {
	const result = WebAuthnConfigSchema.safeParse(config);
	if (!result.success) {
		throw new Error(
			`Invalid WebAuthnConfig: ${result.error.issues.map((i) => i.message).join(", ")}`,
		);
	}
	return result.data;
}

export const OidcConfigSchema = z.object({
	discoveryUrl: z.string().url().optional(),
	serverMetadata: z.record(z.string(), z.unknown()).optional(),
	clientId: z.string().min(1),
	clientSecret: z.string().optional(),
	redirectUris: z.array(z.string().url()).min(1),
	scope: z.string().min(1).optional(),
	usePkce: z.boolean().optional(),
	storage: z
		.object({
			state: z
				.object({
					set: z.function(),
					getAndConsume: z.function(),
					ping: z.function().optional(),
					dispose: z.function().optional(),
				})
				.optional(),
			jwks: z.unknown().optional(),
		})
		.optional(),
	createSessionWithoutPassword: z.function().optional(),
	mapUser: z.function().optional(),
	tenantIdFromRequest: z.function().optional(),
	logout: z
		.object({
			tokenRevocationStorage: z.unknown().optional(),
			jtiTtlSeconds: z.number().int().positive().optional(),
		})
		.optional(),
	stateTtlSeconds: z.number().int().positive().optional(),
	allowInsecureRequests: z.boolean().optional(),
	trustProxy: z.boolean().optional(),
	dispose: z.function().optional(),
});

export function validateOidcConfig(
	config: unknown,
): z.infer<typeof OidcConfigSchema> {
	const result = OidcConfigSchema.safeParse(config);
	if (!result.success) {
		throw new Error(
			`Invalid OidcConfig: ${result.error.issues.map((i) => i.message).join(", ")}`,
		);
	}
	return result.data;
}
