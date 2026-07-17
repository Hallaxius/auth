import { beforeEach, describe, expect, it, vi } from "bun:test";
import type {
	DiscordGuildMember,
	DiscordUser,
	UserStorage,
} from "../../discord";
import { AuthError } from "../../errors";
import {
	generateSecureSecret,
	revokeUserSession,
	syncUserRoles,
	validateConfig,
} from "../utils";

const mockDiscordUser: DiscordUser = {
	id: "user-id",
	username: "Test User",
	discriminator: "0",
	global_name: null,
	avatar: null,
	avatar_decoration: null,
	email: null,
	verified: false,
	locale: "en",
	mfa_enabled: false,
	banner: null,
	banner_color: null,
	accent_color: null,
	premium_type: 0,
	public_flags: 0,
};

const _mockGuildMember: DiscordGuildMember = {
	user: mockDiscordUser,
	nick: null,
	roles: ["role-1", "role-2"],
	joined_at: "2024-01-01T00:00:00.000Z",
	premium_since: null,
	deaf: false,
	mute: false,
	pending: false,
};

// Mock storage helper
function createMockStorage(): UserStorage & {
	findByDiscordId: ReturnType<typeof vi.fn>;
	create: ReturnType<typeof vi.fn>;
	update: ReturnType<typeof vi.fn>;
	delete: ReturnType<typeof vi.fn>;
} {
	return {
		findByDiscordId: vi.fn(),
		create: vi.fn(),
		update: vi.fn(),
		delete: vi.fn(),
	};
}

describe("generateSecureSecret", () => {
	it("should generate a secure secret with default length", () => {
		const secret = generateSecureSecret();
		expect(secret).toBeDefined();
		expect(typeof secret).toBe("string");
		expect(secret.length).toBeGreaterThan(40);
		expect(secret).toMatch(/^[A-Za-z0-9-_]+$/);
	});

	it("should generate a secure secret with custom length", () => {
		const secret = generateSecureSecret(64);
		expect(secret).toBeDefined();
		expect(secret.length).toBeGreaterThan(80);
	});

	it("should generate unique secrets on each call", () => {
		const secret1 = generateSecureSecret();
		const secret2 = generateSecureSecret();
		expect(secret1).not.toBe(secret2);
	});
});

describe("validateConfig", () => {
	it("should throw AuthError when clientId is missing", () => {
		expect(() =>
			validateConfig({
				clientId: "",
				clientSecret: "test-secret",
				session: {
					type: "jwt",
					secret: "test-secret-123456789012345678901234567890",
				},
			} as Parameters<typeof validateConfig>[0]),
		).toThrow(AuthError);
	});

	it("should throw AuthError when clientSecret is missing", () => {
		expect(() =>
			validateConfig({
				clientId: "test-id",
				clientSecret: "",
				session: {
					type: "jwt",
					secret: "test-secret-123456789012345678901234567890",
				},
			} as Parameters<typeof validateConfig>[0]),
		).toThrow(AuthError);
	});

	it("should throw AuthError when session.secret is missing", () => {
		expect(() =>
			validateConfig({
				clientId: "test-id",
				clientSecret: "test-secret",
				session: { type: "jwt", secret: "" },
			} as Parameters<typeof validateConfig>[0]),
		).toThrow(AuthError);
	});

	it("should throw AuthError when session.secret is too short", () => {
		expect(() =>
			validateConfig({
				clientId: "test-id",
				clientSecret: "test-secret",
				session: { type: "jwt", secret: "short" },
			} as Parameters<typeof validateConfig>[0]),
		).toThrow(AuthError);
	});

	it("should not throw for valid configuration", () => {
		expect(() =>
			validateConfig({
				clientId: "test-id",
				clientSecret: "test-secret",
				session: {
					type: "jwt",
					secret: "test-secret-123456789012345678901234567890",
				},
				scopes: ["identify"],
			}),
		).not.toThrow();
	});

	it("should throw AuthError for empty scopes array", () => {
		expect(() =>
			validateConfig({
				clientId: "test-id",
				clientSecret: "test-secret",
				session: {
					type: "jwt",
					secret: "test-secret-123456789012345678901234567890",
				},
				scopes: [] as never,
			}),
		).toThrow(AuthError);
	});

	it("should throw AuthError for invalid prompt value", () => {
		expect(() =>
			validateConfig({
				clientId: "test-id",
				clientSecret: "test-secret",
				session: {
					type: "jwt",
					secret: "test-secret-123456789012345678901234567890",
				},
				prompt: "invalid" as never,
			}),
		).toThrow(AuthError);
	});

	it("should throw AuthError for invalid session.type", () => {
		expect(() =>
			validateConfig({
				clientId: "test-id",
				clientSecret: "test-secret",
				session: {
					type: "invalid" as never,
					secret: "test-secret-123456789012345678901234567890",
				},
			}),
		).toThrow(AuthError);
	});

	it("should throw AuthError for invalid sameSite value", () => {
		expect(() =>
			validateConfig({
				clientId: "test-id",
				clientSecret: "test-secret",
				session: {
					type: "jwt",
					secret: "test-secret-123456789012345678901234567890",
					sameSite: "invalid" as never,
				},
			}),
		).toThrow(AuthError);
	});
});

// Note: The following tests require actual Discord API calls and are skipped
// in unit tests. They would need a proper mock server or integration test setup.

describe.skip("hasRoleInGuild (requires Discord API)", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("should return true when user has the role", async () => {
		// This test requires a real Discord API connection
		expect(true).toBe(true);
	});
});

describe.skip("hasAnyRoleInGuild (requires Discord API)", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("should return true when user has at least one role", async () => {
		// This test requires a real Discord API connection
		expect(true).toBe(true);
	});
});

describe.skip("isUserInGuild (requires Discord API)", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("should return true when user is in guild", async () => {
		// This test requires a real Discord API connection
		expect(true).toBe(true);
	});
});

describe.skip("autoJoinGuild (requires Discord API)", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("should successfully add user to guild", async () => {
		// This test requires a real Discord API connection
		expect(true).toBe(true);
	});
});

describe("revokeUserSession", () => {
	const mockStorage = createMockStorage();

	beforeEach(() => {
		vi.restoreAllMocks();
		vi.clearAllMocks();
	});

	it("should handle missing user gracefully", async () => {
		mockStorage.findByDiscordId.mockResolvedValue(null);

		await expect(
			revokeUserSession("user-id", mockStorage, "test-id", "test-secret"),
		).resolves.toBeUndefined();

		expect(mockStorage.delete).not.toHaveBeenCalled();
	});

	it("should throw AuthError when storage operation fails", async () => {
		mockStorage.findByDiscordId.mockRejectedValue(new Error("Storage error"));

		await expect(
			revokeUserSession("user-id", mockStorage, "test-id", "test-secret"),
		).rejects.toThrow(AuthError);
	});
});

describe("syncUserRoles", () => {
	const mockStorage = createMockStorage();

	beforeEach(() => {
		vi.restoreAllMocks();
		vi.clearAllMocks();
	});

	it("should throw AuthError when user not found", async () => {
		mockStorage.findByDiscordId.mockResolvedValue(null);

		await expect(
			syncUserRoles(
				"user-id",
				"guild-id",
				"bot-token",
				mockStorage,
				"test-id",
				"test-secret",
			),
		).rejects.toThrow(AuthError);
	});
});
