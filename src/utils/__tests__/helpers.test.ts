import { beforeEach, describe, expect, it, vi } from "bun:test";
import { DiscordClient } from "../../core/client";
import {
	ConfigurationError,
	GuildJoinError,
	StorageError,
} from "../../core/errors";
import type {
	DiscordGuildMember,
	DiscordUser,
	StoredUser,
	UserStorage,
} from "../../core/types";
import {
	autoJoinGuild,
	generateSecureSecret,
	hasAnyRoleInGuild,
	hasRoleInGuild,
	isUserInGuild,
	revokeUserSession,
	syncUserRoles,
	validateConfig,
} from "../helpers";

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

const mockGuildMember: DiscordGuildMember = {
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
	it("should throw ConfigurationError when clientId is missing", () => {
		expect(() =>
			validateConfig({
				clientId: "",
				clientSecret: "test-secret",
				session: {
					type: "jwt",
					secret: "test-secret-123456789012345678901234567890",
				},
			} as Parameters<typeof validateConfig>[0]),
		).toThrow(ConfigurationError);
	});

	it("should throw ConfigurationError when clientSecret is missing", () => {
		expect(() =>
			validateConfig({
				clientId: "test-id",
				clientSecret: "",
				session: {
					type: "jwt",
					secret: "test-secret-123456789012345678901234567890",
				},
			} as Parameters<typeof validateConfig>[0]),
		).toThrow(ConfigurationError);
	});

	it("should throw ConfigurationError when session.secret is missing", () => {
		expect(() =>
			validateConfig({
				clientId: "test-id",
				clientSecret: "test-secret",
				session: { type: "jwt", secret: "" },
			} as Parameters<typeof validateConfig>[0]),
		).toThrow(ConfigurationError);
	});

	it("should throw ConfigurationError when session.secret is too short", () => {
		expect(() =>
			validateConfig({
				clientId: "test-id",
				clientSecret: "test-secret",
				session: { type: "jwt", secret: "short" },
			} as Parameters<typeof validateConfig>[0]),
		).toThrow(ConfigurationError);
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

	it("should throw ConfigurationError for empty scopes array", () => {
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
		).toThrow(ConfigurationError);
	});

	it("should throw ConfigurationError for invalid prompt value", () => {
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
		).toThrow(ConfigurationError);
	});

	it("should throw ConfigurationError for invalid session.type", () => {
		expect(() =>
			validateConfig({
				clientId: "test-id",
				clientSecret: "test-secret",
				session: {
					type: "invalid" as never,
					secret: "test-secret-123456789012345678901234567890",
				},
			}),
		).toThrow(ConfigurationError);
	});

	it("should throw ConfigurationError for invalid sameSite value", () => {
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
		).toThrow(ConfigurationError);
	});
});

describe("hasRoleInGuild", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("should return true when user has the role", async () => {
		vi.spyOn(DiscordClient.prototype, "getGuildMember").mockResolvedValueOnce(
			mockGuildMember,
		);

		const hasRole = await hasRoleInGuild(
			"user-id",
			"guild-id",
			"role-2",
			"bot-token",
			"test-id",
			"test-secret",
		);

		expect(hasRole).toBe(true);
	});

	it("should return false when user does not have the role", async () => {
		const mockMember: DiscordGuildMember = {
			...mockGuildMember,
			roles: ["role-1", "role-2"],
		};
		vi.spyOn(DiscordClient.prototype, "getGuildMember").mockResolvedValueOnce(
			mockMember,
		);

		const hasRole = await hasRoleInGuild(
			"user-id",
			"guild-id",
			"role-3",
			"bot-token",
			"test-id",
			"test-secret",
		);

		expect(hasRole).toBe(false);
	});

	it("should return false when API call fails", async () => {
		vi.spyOn(DiscordClient.prototype, "getGuildMember").mockRejectedValueOnce(
			new Error("API Error"),
		);

		const hasRole = await hasRoleInGuild(
			"user-id",
			"guild-id",
			"role-1",
			"bot-token",
			"test-id",
			"test-secret",
		);

		expect(hasRole).toBe(false);
	});
});

describe("hasAnyRoleInGuild", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("should return true when user has at least one role", async () => {
		vi.spyOn(DiscordClient.prototype, "getGuildMember").mockResolvedValueOnce(
			mockGuildMember,
		);

		const hasAnyRole = await hasAnyRoleInGuild(
			"user-id",
			"guild-id",
			["role-3", "role-2", "role-4"],
			"bot-token",
			"test-id",
			"test-secret",
		);

		expect(hasAnyRole).toBe(true);
	});

	it("should return false when user has none of the roles", async () => {
		vi.spyOn(DiscordClient.prototype, "getGuildMember").mockResolvedValueOnce(
			mockGuildMember,
		);

		const hasAnyRole = await hasAnyRoleInGuild(
			"user-id",
			"guild-id",
			["role-3", "role-4"],
			"bot-token",
			"test-id",
			"test-secret",
		);

		expect(hasAnyRole).toBe(false);
	});

	it("should return false when API call fails", async () => {
		vi.spyOn(DiscordClient.prototype, "getGuildMember").mockRejectedValueOnce(
			new Error("API Error"),
		);

		const hasAnyRole = await hasAnyRoleInGuild(
			"user-id",
			"guild-id",
			["role-1"],
			"bot-token",
			"test-id",
			"test-secret",
		);

		expect(hasAnyRole).toBe(false);
	});
});

describe("isUserInGuild", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("should return true when user is in guild", async () => {
		vi.spyOn(DiscordClient.prototype, "getGuildMember").mockResolvedValueOnce(
			mockGuildMember,
		);

		const isInGuild = await isUserInGuild(
			"user-id",
			"guild-id",
			"bot-token",
			"test-id",
			"test-secret",
		);

		expect(isInGuild).toBe(true);
	});

	it("should return false when user is not in guild", async () => {
		vi.spyOn(DiscordClient.prototype, "getGuildMember").mockRejectedValueOnce(
			new Error("Not found"),
		);

		const isInGuild = await isUserInGuild(
			"user-id",
			"guild-id",
			"bot-token",
			"test-id",
			"test-secret",
		);

		expect(isInGuild).toBe(false);
	});
});

describe("autoJoinGuild", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("should successfully add user to guild", async () => {
		vi.spyOn(DiscordClient.prototype, "addMember").mockResolvedValueOnce(
			undefined,
		);

		await expect(
			autoJoinGuild({
				guildId: "guild-id",
				userId: "user-id",
				accessToken: "access-token",
				botToken: "bot-token",
				nick: "Test User",
				roles: ["role-1"],
				clientId: "test-id",
				clientSecret: "test-secret",
			}),
		).resolves.toBeUndefined();

		expect(DiscordClient.prototype.addMember).toHaveBeenCalledWith({
			guildId: "guild-id",
			userId: "user-id",
			accessToken: "access-token",
			botToken: "bot-token",
			nick: "Test User",
			roles: ["role-1"],
		});
	});

	it("should throw GuildJoinError when addMember fails", async () => {
		vi.spyOn(DiscordClient.prototype, "addMember").mockRejectedValueOnce(
			new Error("Add failed"),
		);

		await expect(
			autoJoinGuild({
				guildId: "guild-id",
				userId: "user-id",
				accessToken: "access-token",
				botToken: "bot-token",
				clientId: "test-id",
				clientSecret: "test-secret",
			}),
		).rejects.toThrow(GuildJoinError);
	});
});

describe("revokeUserSession", () => {
	const mockStorage = createMockStorage();

	beforeEach(() => {
		vi.restoreAllMocks();
		vi.clearAllMocks();
	});

	it("should revoke session and Discord token", async () => {
		const mockUser: StoredUser = {
			id: "1",
			discordId: "user-id",
			username: "Test User",
			globalName: null,
			avatar: null,
			email: null,
			locale: "en",
			roles: [],
			accessToken: "access-token",
			refreshToken: "refresh-token",
			tokenExpiresAt: Date.now() + 3600,
			createdAt: new Date(),
			updatedAt: new Date(),
		};

		mockStorage.findByDiscordId.mockResolvedValue(mockUser);
		mockStorage.delete.mockResolvedValue(undefined);
		vi.spyOn(DiscordClient.prototype, "revokeToken").mockResolvedValueOnce(
			undefined,
		);

		await revokeUserSession("user-id", mockStorage, "test-id", "test-secret");

		expect(mockStorage.findByDiscordId).toHaveBeenCalledWith("user-id");
		expect(mockStorage.delete).toHaveBeenCalledWith("user-id");
		expect(DiscordClient.prototype.revokeToken).toHaveBeenCalledWith({
			clientId: "test-id",
			clientSecret: "test-secret",
			accessToken: "access-token",
		});
	});

	it("should handle missing user gracefully", async () => {
		mockStorage.findByDiscordId.mockResolvedValue(null);

		await expect(
			revokeUserSession("user-id", mockStorage, "test-id", "test-secret"),
		).resolves.toBeUndefined();

		expect(mockStorage.delete).not.toHaveBeenCalled();
	});

	it("should throw StorageError when storage operation fails", async () => {
		mockStorage.findByDiscordId.mockRejectedValue(new Error("Storage error"));

		await expect(
			revokeUserSession("user-id", mockStorage, "test-id", "test-secret"),
		).rejects.toThrow(StorageError);
	});
});

describe("syncUserRoles", () => {
	const mockStorage = createMockStorage();

	const mockMember: DiscordGuildMember = {
		user: mockDiscordUser,
		nick: null,
		roles: ["new-role-1", "new-role-2"],
		joined_at: "2024-01-01T00:00:00.000Z",
		premium_since: null,
		deaf: false,
		mute: false,
		pending: false,
	};

	beforeEach(() => {
		vi.restoreAllMocks();
		vi.clearAllMocks();
	});

	it("should sync user roles from Discord", async () => {
		const mockUser: StoredUser = {
			id: "1",
			discordId: "user-id",
			username: "Test User",
			globalName: null,
			avatar: null,
			email: null,
			locale: "en",
			roles: ["old-role"],
			accessToken: "access-token",
			refreshToken: "refresh-token",
			tokenExpiresAt: Date.now() + 3600,
			createdAt: new Date(),
			updatedAt: new Date(),
		};

		mockStorage.findByDiscordId.mockResolvedValue(mockUser);
		mockStorage.update.mockResolvedValue({
			...mockUser,
			roles: ["new-role-1", "new-role-2"],
		});
		vi.spyOn(DiscordClient.prototype, "getGuildMember").mockResolvedValueOnce(
			mockMember,
		);

		const roles = await syncUserRoles(
			"user-id",
			"guild-id",
			"bot-token",
			mockStorage,
			"test-id",
			"test-secret",
		);

		expect(roles).toEqual(["new-role-1", "new-role-2"]);
		expect(mockStorage.update).toHaveBeenCalledWith("user-id", {
			roles: ["new-role-1", "new-role-2"],
		});
	});

	it("should throw StorageError when user not found", async () => {
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
		).rejects.toThrow(StorageError);
	});

	it("should throw StorageError when storage update fails", async () => {
		const mockUser: StoredUser = {
			id: "1",
			discordId: "user-id",
			username: "Test User",
			globalName: null,
			avatar: null,
			email: null,
			locale: "en",
			roles: [],
			accessToken: "access-token",
			refreshToken: "refresh-token",
			tokenExpiresAt: Date.now() + 3600,
			createdAt: new Date(),
			updatedAt: new Date(),
		};

		mockStorage.findByDiscordId.mockResolvedValue(mockUser);
		mockStorage.update.mockRejectedValue(new Error("Update failed"));
		vi.spyOn(DiscordClient.prototype, "getGuildMember").mockRejectedValueOnce(
			new Error("API Error"),
		);

		await expect(
			syncUserRoles(
				"user-id",
				"guild-id",
				"bot-token",
				mockStorage,
				"test-id",
				"test-secret",
			),
		).rejects.toThrow(StorageError);
	});
});
