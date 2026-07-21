import { describe, expect, it } from "vitest";
import {
	AuthStrategySchema,
	BruteForceConfigSchema,
	CredentialsClientConfigSchema,
	DiscordAuthConfigSchema,
	DiscordScopeSchema,
	RateLimitConfigSchema,
	SessionConfigSchema,
	validateCredentialsConfig,
	validateDiscordAuthConfig,
	validateRateLimitConfig,
} from "../schema";

describe("SessionConfigSchema", () => {
	it("validates minimal config", () => {
		const config = { secret: "my-secret-key" };
		const result = SessionConfigSchema.safeParse(config);
		expect(result.success).toBe(true);
	});

	it("validates full config", () => {
		const config = {
			type: "jwt" as const,
			secret: "my-secret-key",
			expiresIn: "1h",
			cookieName: "session",
			cookiePath: "/",
			httpOnly: true,
			secure: true,
			sameSite: "lax" as const,
		};
		const result = SessionConfigSchema.safeParse(config);
		expect(result.success).toBe(true);
	});

	it("rejects missing secret", () => {
		const config = { type: "jwt" };
		const result = SessionConfigSchema.safeParse(config);
		expect(result.success).toBe(false);
	});

	it("rejects empty secret", () => {
		const config = { secret: "" };
		const result = SessionConfigSchema.safeParse(config);
		expect(result.success).toBe(false);
	});

	it("accepts server session type", () => {
		const config = { type: "server" as const, secret: "my-secret" };
		const result = SessionConfigSchema.safeParse(config);
		expect(result.success).toBe(true);
	});

	it("rejects invalid session type", () => {
		const config = { type: "invalid" as any, secret: "my-secret" };
		const result = SessionConfigSchema.safeParse(config);
		expect(result.success).toBe(false);
	});

	it("accepts number expiresIn", () => {
		const config = { secret: "my-secret", expiresIn: 3600 };
		const result = SessionConfigSchema.safeParse(config);
		expect(result.success).toBe(true);
	});

	it("accepts string expiresIn", () => {
		const config = { secret: "my-secret", expiresIn: "1h" };
		const result = SessionConfigSchema.safeParse(config);
		expect(result.success).toBe(true);
	});

	it("accepts valid sameSite values", () => {
		(["lax", "strict", "none"] as const).forEach((sameSite) => {
			const config = { secret: "my-secret", sameSite };
			const result = SessionConfigSchema.safeParse(config);
			expect(result.success).toBe(true);
		});
	});

	it("rejects invalid sameSite value", () => {
		const config = { secret: "my-secret", sameSite: "invalid" as any };
		const result = SessionConfigSchema.safeParse(config);
		expect(result.success).toBe(false);
	});
});

describe("BruteForceConfigSchema", () => {
	it("validates empty config", () => {
		const config = {};
		const result = BruteForceConfigSchema.safeParse(config);
		expect(result.success).toBe(true);
	});

	it("validates full config", () => {
		const config = {
			enabled: true,
			maxAttempts: 5,
			windowMs: 60000,
			blockDurationMs: 300000,
		};
		const result = BruteForceConfigSchema.safeParse(config);
		expect(result.success).toBe(true);
	});

	it("rejects negative maxAttempts", () => {
		const config = { maxAttempts: -1 };
		const result = BruteForceConfigSchema.safeParse(config);
		expect(result.success).toBe(false);
	});

	it("rejects zero maxAttempts", () => {
		const config = { maxAttempts: 0 };
		const result = BruteForceConfigSchema.safeParse(config);
		expect(result.success).toBe(false);
	});

	it("rejects negative windowMs", () => {
		const config = { windowMs: -1000 };
		const result = BruteForceConfigSchema.safeParse(config);
		expect(result.success).toBe(false);
	});

	it("rejects negative blockDurationMs", () => {
		const config = { blockDurationMs: -1000 };
		const result = BruteForceConfigSchema.safeParse(config);
		expect(result.success).toBe(false);
	});

	it("accepts zero blockDurationMs", () => {
		const config = { blockDurationMs: 0 };
		const result = BruteForceConfigSchema.safeParse(config);
		expect(result.success).toBe(false);
	});
});

describe("DiscordScopeSchema", () => {
	it("validates common scopes", () => {
		const scopes = ["identify", "email", "guilds"];
		scopes.forEach((scope) => {
			const result = DiscordScopeSchema.safeParse(scope);
			expect(result.success).toBe(true);
		});
	});

	it("validates all scopes", () => {
		const allScopes = [
			"identify",
			"email",
			"guilds",
			"guilds.join",
			"guilds.members.read",
			"connections",
			"guilds.members.read",
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
		];

		allScopes.forEach((scope) => {
			const result = DiscordScopeSchema.safeParse(scope);
			expect(result.success).toBe(true);
		});
	});

	it("rejects invalid scope", () => {
		const result = DiscordScopeSchema.safeParse("invalid_scope");
		expect(result.success).toBe(false);
	});

	it("rejects empty string", () => {
		const result = DiscordScopeSchema.safeParse("");
		expect(result.success).toBe(false);
	});
});

describe("DiscordAuthConfigSchema", () => {
	it("validates minimal config", () => {
		const config = {
			clientId: "123456789",
			clientSecret: "secret",
			secret: "state-secret",
			callbackUrl: "https://example.com/callback",
		};
		const result = DiscordAuthConfigSchema.safeParse(config);
		expect(result.success).toBe(true);
	});

	it("validates full config", () => {
		const config = {
			clientId: "123456789",
			clientSecret: "secret",
			secret: "state-secret",
			callbackUrl: "https://example.com/callback",
			scopes: ["identify", "email"],
			prompt: "consent" as const,
			routes: {
				prefix: "/auth",
				callback: "/callback",
				logout: "/logout",
				error: "/error",
			},
			cookies: {
				secure: true,
				sameSite: "lax" as const,
			},
			pkce: true,
			redirectUri: "https://example.com/callback",
			disablePKCE: false,
			autoRefresh: {
				enabled: true,
				thresholdSeconds: 300,
				maxRetries: 3,
			},
			bruteForce: {
				enabled: true,
				maxAttempts: 5,
				windowMs: 60000,
				blockDurationMs: 300000,
			},
			mfa: {
				enabled: true,
				requireMfa: true,
				allowedMethods: ["totp", "sms", "backup_codes"],
			},
			guildRoleSync: {
				enabled: true,
				guildId: "987654321",
				roleMap: { role1: ["perm1", "perm2"] },
				cacheTtlMs: 300000,
				syncOnLogin: true,
				botToken: "bot-token",
			},
			csrf: {
				enabled: true,
				ttlMs: 3600000,
				singleUse: true,
				bindToSession: true,
				bindToUserAgent: true,
			},
			callbacks: {
				onSuccess: () => {},
				onError: () => {},
			},
			stateSecret: "state-secret-2",
			session: {
				secret: "session-secret",
			},
			meRoute: "/me",
		};
		const result = DiscordAuthConfigSchema.safeParse(config);
		expect(result.success).toBe(true);
	});

	it("rejects missing clientId", () => {
		const config = {
			clientSecret: "secret",
			secret: "state-secret",
			callbackUrl: "https://example.com/callback",
		};
		const result = DiscordAuthConfigSchema.safeParse(config);
		expect(result.success).toBe(false);
	});

	it("rejects empty clientId", () => {
		const config = {
			clientId: "",
			clientSecret: "secret",
			secret: "state-secret",
			callbackUrl: "https://example.com/callback",
		};
		const result = DiscordAuthConfigSchema.safeParse(config);
		expect(result.success).toBe(false);
	});

	it("rejects invalid callbackUrl", () => {
		const config = {
			clientId: "123",
			clientSecret: "secret",
			secret: "state-secret",
			callbackUrl: "not-a-url",
		};
		const result = DiscordAuthConfigSchema.safeParse(config);
		expect(result.success).toBe(false);
	});

	it("rejects invalid redirectUri", () => {
		const config = {
			clientId: "123",
			clientSecret: "secret",
			secret: "state-secret",
			callbackUrl: "https://example.com/callback",
			redirectUri: "not-a-url",
		};
		const result = DiscordAuthConfigSchema.safeParse(config);
		expect(result.success).toBe(false);
	});

	it("accepts prompt none", () => {
		const config = {
			clientId: "123",
			clientSecret: "secret",
			secret: "state-secret",
			callbackUrl: "https://example.com/callback",
			prompt: "none" as const,
		};
		const result = DiscordAuthConfigSchema.safeParse(config);
		expect(result.success).toBe(true);
	});

	it("rejects invalid prompt", () => {
		const config = {
			clientId: "123",
			clientSecret: "secret",
			secret: "state-secret",
			callbackUrl: "https://example.com/callback",
			prompt: "invalid" as any,
		};
		const result = DiscordAuthConfigSchema.safeParse(config);
		expect(result.success).toBe(false);
	});
});

describe("CredentialsClientConfigSchema", () => {
	it("validates minimal config", () => {
		const config = {
			strategy: "username-only" as const,
			secret: "my-secret",
		};
		const result = CredentialsClientConfigSchema.safeParse(config);
		expect(result.success).toBe(true);
	});

	it("validates all strategy types", () => {
		const strategies = [
			"username-only",
			"email-only",
			"username-email",
		] as const;
		strategies.forEach((strategy) => {
			const config = { strategy, secret: "my-secret" };
			const result = CredentialsClientConfigSchema.safeParse(config);
			expect(result.success).toBe(true);
		});
	});

	it("rejects invalid strategy", () => {
		const config = { strategy: "invalid" as any, secret: "my-secret" };
		const result = CredentialsClientConfigSchema.safeParse(config);
		expect(result.success).toBe(false);
	});

	it("accepts defaultRoles", () => {
		const config = {
			strategy: "username-only" as const,
			secret: "my-secret",
			defaultRoles: ["user", "admin"],
		};
		const result = CredentialsClientConfigSchema.safeParse(config);
		expect(result.success).toBe(true);
	});

	it("accepts minPasswordLength", () => {
		const config = {
			strategy: "username-only" as const,
			secret: "my-secret",
			minPasswordLength: 12,
		};
		const result = CredentialsClientConfigSchema.safeParse(config);
		expect(result.success).toBe(true);
	});

	it("rejects zero minPasswordLength", () => {
		const config = {
			strategy: "username-only" as const,
			secret: "my-secret",
			minPasswordLength: 0,
		};
		const result = CredentialsClientConfigSchema.safeParse(config);
		expect(result.success).toBe(false);
	});

	it("rejects negative minPasswordLength", () => {
		const config = {
			strategy: "username-only" as const,
			secret: "my-secret",
			minPasswordLength: -1,
		};
		const result = CredentialsClientConfigSchema.safeParse(config);
		expect(result.success).toBe(false);
	});
});

describe("RateLimitConfigSchema", () => {
	it("validates minimal config", () => {
		const config = {
			maxRequests: 100,
			windowMs: 60000,
		};
		const result = RateLimitConfigSchema.safeParse(config);
		expect(result.success).toBe(true);
	});

	it("rejects zero maxRequests", () => {
		const config = { maxRequests: 0, windowMs: 60000 };
		const result = RateLimitConfigSchema.safeParse(config);
		expect(result.success).toBe(false);
	});

	it("rejects negative maxRequests", () => {
		const config = { maxRequests: -1, windowMs: 60000 };
		const result = RateLimitConfigSchema.safeParse(config);
		expect(result.success).toBe(false);
	});

	it("rejects zero windowMs", () => {
		const config = { maxRequests: 100, windowMs: 0 };
		const result = RateLimitConfigSchema.safeParse(config);
		expect(result.success).toBe(false);
	});

	it("rejects negative windowMs", () => {
		const config = { maxRequests: 100, windowMs: -1000 };
		const result = RateLimitConfigSchema.safeParse(config);
		expect(result.success).toBe(false);
	});

	it("accepts keyBy function", () => {
		const config = {
			maxRequests: 100,
			windowMs: 60000,
			keyBy: (req: Request) => req.headers.get("x-forwarded-for") || "unknown",
		};
		const result = RateLimitConfigSchema.safeParse(config);
		expect(result.success).toBe(true);
	});

	it("accepts storage object", () => {
		const config = {
			maxRequests: 100,
			windowMs: 60000,
			storage: {
				increment: async () => ({ count: 1, resetAt: Date.now() }),
				reset: async () => {},
			},
		};
		const result = RateLimitConfigSchema.safeParse(config);
		expect(result.success).toBe(true);
	});
});

describe("validateDiscordAuthConfig", () => {
	it("returns parsed config for valid input", () => {
		const config = {
			clientId: "123",
			clientSecret: "secret",
			secret: "state-secret",
			callbackUrl: "https://example.com/callback",
		};
		const result = validateDiscordAuthConfig(config);
		expect(result).toEqual(config);
	});

	it("throws error for invalid config", () => {
		const config = { clientId: "" };
		expect(() => validateDiscordAuthConfig(config)).toThrow(
			/Invalid DiscordAuthConfig/,
		);
	});

	it("includes error messages in thrown error", () => {
		const config = { clientId: "" };
		try {
			validateDiscordAuthConfig(config);
		} catch (error) {
			expect((error as Error).message).toContain("Too small");
		}
	});
});

describe("validateCredentialsConfig", () => {
	it("returns parsed config for valid input", () => {
		const config = {
			strategy: "username-only" as const,
			secret: "my-secret",
		};
		const result = validateCredentialsConfig(config);
		expect(result).toEqual(config);
	});

	it("throws error for invalid config", () => {
		const config = { strategy: "invalid" as any };
		expect(() => validateCredentialsConfig(config)).toThrow(
			/Invalid CredentialsConfig/,
		);
	});

	it("includes error messages in thrown error", () => {
		const config = { strategy: "invalid" as any };
		try {
			validateCredentialsConfig(config);
		} catch (error) {
			expect((error as Error).message).toContain("Invalid option");
		}
	});
});

describe("validateRateLimitConfig", () => {
	it("returns parsed config for valid input", () => {
		const config = {
			maxRequests: 100,
			windowMs: 60000,
		};
		const result = validateRateLimitConfig(config);
		expect(result).toEqual(config);
	});

	it("throws error for invalid config", () => {
		const config = { maxRequests: -1 };
		expect(() => validateRateLimitConfig(config)).toThrow(
			/Invalid RateLimitConfig/,
		);
	});

	it("includes error messages in thrown error", () => {
		const config = { maxRequests: -1 };
		try {
			validateRateLimitConfig(config);
		} catch (error) {
			expect((error as Error).message).toContain("Too small");
		}
	});
});

describe("AuthStrategySchema", () => {
	it("validates username-only strategy", () => {
		const result = AuthStrategySchema.safeParse("username-only");
		expect(result.success).toBe(true);
	});

	it("validates email-only strategy", () => {
		const result = AuthStrategySchema.safeParse("email-only");
		expect(result.success).toBe(true);
	});

	it("validates username-email strategy", () => {
		const result = AuthStrategySchema.safeParse("username-email");
		expect(result.success).toBe(true);
	});

	it("rejects invalid strategy", () => {
		const result = AuthStrategySchema.safeParse("oauth");
		expect(result.success).toBe(false);
	});
});
