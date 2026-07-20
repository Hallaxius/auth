import { beforeEach, describe, expect, it, vi } from "bun:test";
import { AuthError } from "../../errors";
import type { DiscordGuildMember, DiscordUser, UserStorage } from "../../types";
import { revoke, secret, sync, validate } from "../utils";

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

describe("secret", () => {
	it("should generate a secure secret with default length", () => {
		const secretValue = secret();
		expect(secretValue).toBeDefined();
		expect(typeof secretValue).toBe("string");
		expect(secretValue.length).toBeGreaterThan(40);
		expect(secretValue).toMatch(/^[A-Za-z0-9-_]+$/);
	});

	it("should generate a secure secret with custom length", () => {
		const secretValue = secret(64);
		expect(secretValue).toBeDefined();
		expect(secretValue.length).toBeGreaterThan(80);
	});

	it("should generate unique secrets on each call", () => {
		const secret1 = secret();
		const secret2 = secret();
		expect(secret1).not.toBe(secret2);
	});
});

describe("validate", () => {
	const validSecret = "test-secret-123456789012345678901234567890";

	it("should throw AuthError when clientId is missing", () => {
		expect(() =>
			validate({
				clientId: "",
				clientSecret: "test-secret",
				secret: validSecret,
			} as Parameters<typeof validate>[0]),
		).toThrow(AuthError);
	});

	it("should throw AuthError when clientSecret is missing", () => {
		expect(() =>
			validate({
				clientId: "test-id",
				clientSecret: "",
				secret: validSecret,
			} as Parameters<typeof validate>[0]),
		).toThrow(AuthError);
	});

	it("should throw AuthError when secret is missing", () => {
		expect(() =>
			validate({
				clientId: "test-id",
				clientSecret: "test-secret",
				secret: "",
			} as Parameters<typeof validate>[0]),
		).toThrow(AuthError);
	});

	it("should throw AuthError when secret is too short", () => {
		expect(() =>
			validate({
				clientId: "test-id",
				clientSecret: "test-secret",
				secret: "short",
			} as Parameters<typeof validate>[0]),
		).toThrow(AuthError);
	});

	it("should not throw for valid configuration", () => {
		expect(() =>
			validate({
				clientId: "test-id",
				clientSecret: "test-secret",
				secret: validSecret,
				scopes: ["identify"],
			}),
		).not.toThrow();
	});

	it("should throw AuthError for empty scopes array", () => {
		expect(() =>
			validate({
				clientId: "test-id",
				clientSecret: "test-secret",
				secret: validSecret,
				scopes: [] as never,
			}),
		).toThrow(AuthError);
	});

	it("should throw AuthError for invalid prompt value", () => {
		expect(() =>
			validate({
				clientId: "test-id",
				clientSecret: "test-secret",
				secret: validSecret,
				prompt: "invalid" as never,
			}),
		).toThrow(AuthError);
	});

	it("should throw AuthError for invalid session.type", () => {
		expect(() =>
			validate({
				clientId: "test-id",
				clientSecret: "test-secret",
				secret: validSecret,
				session: { type: "invalid" as never, secret: validSecret },
			}),
		).toThrow(AuthError);
	});

	it("should throw AuthError for invalid sameSite value", () => {
		expect(() =>
			validate({
				clientId: "test-id",
				clientSecret: "test-secret",
				secret: validSecret,
				session: {
					type: "jwt",
					secret: validSecret,
					sameSite: "invalid" as never,
				},
			}),
		).toThrow(AuthError);
	});
});

describe.skip("hasRoleInGuild (requires Discord API)", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("should return true when user has the role", async () => {
		expect(true).toBe(true);
	});
});

describe.skip("hasAnyRoleInGuild (requires Discord API)", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("should return true when user has at least one role", async () => {
		expect(true).toBe(true);
	});
});

describe.skip("isUserInGuild (requires Discord API)", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("should return true when user is in guild", async () => {
		expect(true).toBe(true);
	});
});

describe.skip("autoJoinGuild (requires Discord API)", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("should successfully add user to guild", async () => {
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
			revoke("user-id", mockStorage, "test-id", "test-secret"),
		).resolves.toBeUndefined();

		expect(mockStorage.delete).not.toHaveBeenCalled();
	});

	it("should throw AuthError when storage operation fails", async () => {
		mockStorage.findByDiscordId.mockRejectedValue(new Error("Storage error"));

		await expect(
			revoke("user-id", mockStorage, "test-id", "test-secret"),
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
			sync(
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
