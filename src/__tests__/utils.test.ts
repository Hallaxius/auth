import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "bun:test";
import { AuthError } from "../errors";
import { DiscordClient } from "../internal/client";
import type { DiscordGuildMember, DiscordUser, UserStorage } from "../types";
import {
	hasAnyRole,
	hasMember,
	hasRole,
	join,
	revoke,
	secret,
	sync,
	validate,
} from "../utils/utils";

const mockDiscordUser: DiscordUser = {
	id: "user-id-123",
	username: "testuser",
	discriminator: "0",
	global_name: "Test User",
	avatar: null,
	avatar_decoration: null,
	email: "test@example.com",
	verified: true,
	locale: "en-US",
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
	roles: ["admin-role", "mod-role", "member-role"],
	joined_at: "2024-01-01T00:00:00.000Z",
	premium_since: null,
	deaf: false,
	mute: false,
	pending: false,
};

function createMockStorage(): UserStorage {
	return {
		findByDiscordId: vi.fn(),
		create: vi.fn(),
		update: vi.fn(),
		delete: vi.fn(),
	};
}

describe("secret", () => {
	it("generates a secure secret with default length", () => {
		const secretValue = secret();
		expect(secretValue).toBeDefined();
		expect(typeof secretValue).toBe("string");
		expect(secretValue.length).toBeGreaterThan(40);
		expect(secretValue).toMatch(/^[A-Za-z0-9-_]+$/);
	});

	it("generates a secure secret with custom length", () => {
		const secretValue = secret(64);
		expect(secretValue).toBeDefined();
		expect(secretValue.length).toBeGreaterThan(80);
	});

	it("generates unique secrets on each call", () => {
		const secret1 = secret();
		const secret2 = secret();
		expect(secret1).not.toBe(secret2);
	});
});

describe("validate", () => {
	const validSecret = "this-is-a-32-char-secret-key-12345678";

	it("throws AuthError when clientId is missing", () => {
		expect(() =>
			validate({
				clientId: "",
				clientSecret: "s",
				secret: validSecret,
			} as never),
		).toThrow(AuthError);
	});

	it("throws AuthError when clientSecret is missing", () => {
		expect(() =>
			validate({
				clientId: "id",
				clientSecret: "",
				secret: validSecret,
			} as never),
		).toThrow(AuthError);
	});

	it("throws AuthError when secret is missing", () => {
		expect(() =>
			validate({ clientId: "id", clientSecret: "s", secret: "" } as never),
		).toThrow(AuthError);
	});

	it("throws AuthError when secret is too short", () => {
		expect(() =>
			validate({ clientId: "id", clientSecret: "s", secret: "short" }),
		).toThrow(AuthError);
	});

	it("throws AuthError for empty scopes array", () => {
		expect(() =>
			validate({
				clientId: "id",
				clientSecret: "s",
				secret: validSecret,
				scopes: [] as never,
			}),
		).toThrow(AuthError);
	});

	it("throws AuthError for non-string redirectUri", () => {
		expect(() =>
			validate({
				clientId: "id",
				clientSecret: "s",
				secret: validSecret,
				redirectUri: 123 as never,
			}),
		).toThrow(AuthError);
	});

	it("throws AuthError for non-string meRoute", () => {
		expect(() =>
			validate({
				clientId: "id",
				clientSecret: "s",
				secret: validSecret,
				meRoute: 456 as never,
			}),
		).toThrow(AuthError);
	});

	it("throws AuthError for invalid prompt value", () => {
		expect(() =>
			validate({
				clientId: "id",
				clientSecret: "s",
				secret: validSecret,
				prompt: "invalid" as never,
			}),
		).toThrow(AuthError);
	});

	it("throws AuthError for invalid session.type", () => {
		expect(() =>
			validate({
				clientId: "id",
				clientSecret: "s",
				secret: validSecret,
				session: { type: "invalid" as never, secret: validSecret },
			}),
		).toThrow(AuthError);
	});

	it("throws AuthError for invalid session.sameSite", () => {
		expect(() =>
			validate({
				clientId: "id",
				clientSecret: "s",
				secret: validSecret,
				session: {
					type: "jwt",
					secret: validSecret,
					sameSite: "invalid" as never,
				},
			}),
		).toThrow(AuthError);
	});

	it("does not throw for valid configuration", () => {
		expect(() =>
			validate({
				clientId: "test-id",
				clientSecret: "test-secret",
				secret: validSecret,
				scopes: ["identify"],
			}),
		).not.toThrow();
	});

	it("accepts valid prompt values", () => {
		expect(() =>
			validate({
				clientId: "id",
				clientSecret: "s",
				secret: validSecret,
				prompt: "consent",
			}),
		).not.toThrow();
		expect(() =>
			validate({
				clientId: "id",
				clientSecret: "s",
				secret: validSecret,
				prompt: "none",
			}),
		).not.toThrow();
	});

	it("accepts valid session types", () => {
		expect(() =>
			validate({
				clientId: "id",
				clientSecret: "s",
				secret: validSecret,
				session: { type: "jwt", secret: validSecret },
			}),
		).not.toThrow();
		expect(() =>
			validate({
				clientId: "id",
				clientSecret: "s",
				secret: validSecret,
				session: { type: "server", secret: validSecret },
			}),
		).not.toThrow();
	});

	it("accepts valid sameSite values", () => {
		for (const v of ["lax", "strict", "none"] as const) {
			expect(() =>
				validate({
					clientId: "id",
					clientSecret: "s",
					secret: validSecret,
					session: { type: "jwt", secret: validSecret, sameSite: v },
				}),
			).not.toThrow();
		}
	});

	it("does not throw when optional fields are omitted", () => {
		expect(() =>
			validate({ clientId: "id", clientSecret: "s", secret: validSecret }),
		).not.toThrow();
	});
});

describe("hasRole", () => {
	beforeEach(() => {
		vi.spyOn(DiscordClient.prototype, "getGuildMember").mockResolvedValue(
			mockGuildMember as never,
		);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("returns true when user has the role", async () => {
		const result = await hasRole(
			"user-id",
			"guild-id",
			"admin-role",
			"bot-token",
			"client-id",
			"client-secret",
		);
		expect(result).toBe(true);
	});

	it("returns false when user does not have the role", async () => {
		vi.spyOn(DiscordClient.prototype, "getGuildMember").mockResolvedValue(
			mockGuildMember as never,
		);
		const result = await hasRole(
			"user-id",
			"guild-id",
			"nonexistent-role",
			"bot-token",
			"client-id",
			"client-secret",
		);
		expect(result).toBe(false);
	});

	it("returns false on API error", async () => {
		vi.spyOn(DiscordClient.prototype, "getGuildMember").mockRejectedValue(
			new Error("API error"),
		);
		const result = await hasRole(
			"user-id",
			"guild-id",
			"admin-role",
			"bot-token",
			"client-id",
			"client-secret",
		);
		expect(result).toBe(false);
	});
});

describe("hasAnyRole", () => {
	it("returns true when user has at least one role", async () => {
		vi.spyOn(DiscordClient.prototype, "getGuildMember").mockResolvedValue(
			mockGuildMember as never,
		);
		const result = await hasAnyRole(
			"user-id",
			"guild-id",
			["nonexistent", "admin-role"],
			"bot-token",
			"client-id",
			"client-secret",
		);
		expect(result).toBe(true);
	});

	it("returns false when user has none of the roles", async () => {
		vi.spyOn(DiscordClient.prototype, "getGuildMember").mockResolvedValue(
			mockGuildMember as never,
		);
		const result = await hasAnyRole(
			"user-id",
			"guild-id",
			["role-a", "role-b"],
			"bot-token",
			"client-id",
			"client-secret",
		);
		expect(result).toBe(false);
	});

	it("returns false on API error", async () => {
		vi.spyOn(DiscordClient.prototype, "getGuildMember").mockRejectedValue(
			new Error("API error"),
		);
		const result = await hasAnyRole(
			"user-id",
			"guild-id",
			["admin-role"],
			"bot-token",
			"client-id",
			"client-secret",
		);
		expect(result).toBe(false);
	});
});

describe("hasMember", () => {
	it("returns true when member exists", async () => {
		vi.spyOn(DiscordClient.prototype, "getGuildMember").mockResolvedValue(
			mockGuildMember as never,
		);
		const result = await hasMember(
			"user-id",
			"guild-id",
			"bot-token",
			"client-id",
			"client-secret",
		);
		expect(result).toBe(true);
	});

	it("returns false on API error", async () => {
		vi.spyOn(DiscordClient.prototype, "getGuildMember").mockRejectedValue(
			new Error("Not found"),
		);
		const result = await hasMember(
			"user-id",
			"guild-id",
			"bot-token",
			"client-id",
			"client-secret",
		);
		expect(result).toBe(false);
	});
});

describe("sync", () => {
	const mockStorage = createMockStorage();

	beforeEach(() => {
		mockStorage.findByDiscordId = vi.fn();
		mockStorage.update = vi.fn();
	});

	it("throws AuthError when user not found", async () => {
		mockStorage.findByDiscordId.mockResolvedValue(null);
		await expect(
			sync(
				"user-id",
				"guild-id",
				"bot-token",
				mockStorage,
				"client-id",
				"client-secret",
			),
		).rejects.toThrow(AuthError);
	});

	it("updates and returns roles on success", async () => {
		const existingUser = {
			discordId: "user-id",
			username: "testuser",
			roles: ["old-role"],
		};
		mockStorage.findByDiscordId.mockResolvedValue(existingUser);
		vi.spyOn(DiscordClient.prototype, "getGuildMember").mockResolvedValue(
			mockGuildMember as never,
		);
		mockStorage.update.mockResolvedValue({
			...existingUser,
			roles: ["admin-role", "mod-role", "member-role"],
		});

		const result = await sync(
			"user-id",
			"guild-id",
			"bot-token",
			mockStorage,
			"client-id",
			"client-secret",
		);
		expect(result).toEqual(["admin-role", "mod-role", "member-role"]);
	});

	it("throws AuthError on storage update failure", async () => {
		mockStorage.findByDiscordId.mockResolvedValue({
			discordId: "user-id",
			username: "testuser",
			roles: [],
		});
		vi.spyOn(DiscordClient.prototype, "getGuildMember").mockResolvedValue(
			mockGuildMember as never,
		);
		mockStorage.update.mockRejectedValue(new Error("DB error"));

		await expect(
			sync(
				"user-id",
				"guild-id",
				"bot-token",
				mockStorage,
				"client-id",
				"client-secret",
			),
		).rejects.toThrow(AuthError);
	});
});

describe("join", () => {
	it("adds member successfully without optional params", async () => {
		vi.spyOn(DiscordClient.prototype, "addMember").mockResolvedValue(
			undefined as never,
		);
		await expect(
			join({
				guildId: "guild-id",
				userId: "user-id",
				accessToken: "access-token",
				botToken: "bot-token",
				clientId: "client-id",
				clientSecret: "client-secret",
			}),
		).resolves.toBeUndefined();
	});

	it("adds member with optional nick and roles", async () => {
		vi.spyOn(DiscordClient.prototype, "addMember").mockResolvedValue(
			undefined as never,
		);
		await expect(
			join({
				guildId: "guild-id",
				userId: "user-id",
				accessToken: "access-token",
				botToken: "bot-token",
				nick: "New Member",
				roles: ["role-1", "role-2"],
				clientId: "client-id",
				clientSecret: "client-secret",
			}),
		).resolves.toBeUndefined();
	});

	it("throws GuildJoinError on API failure", async () => {
		vi.spyOn(DiscordClient.prototype, "addMember").mockRejectedValue(
			new Error("API error"),
		);
		await expect(
			join({
				guildId: "guild-id",
				userId: "user-id",
				accessToken: "access-token",
				botToken: "bot-token",
				clientId: "client-id",
				clientSecret: "client-secret",
			}),
		).rejects.toThrow(AuthError);
	});
});

afterAll(() => {
	vi.restoreAllMocks();
});

describe("revoke", () => {
	const mockStorage = createMockStorage();

	beforeEach(() => {
		mockStorage.findByDiscordId = vi.fn();
		mockStorage.delete = vi.fn();
	});

	it("handles missing user gracefully", async () => {
		mockStorage.findByDiscordId.mockResolvedValue(null);
		await expect(
			revoke("user-id", mockStorage, "client-id", "client-secret"),
		).resolves.toBeUndefined();
		expect(mockStorage.delete).not.toHaveBeenCalled();
	});

	it("revokes token and deletes user on success", async () => {
		mockStorage.findByDiscordId.mockResolvedValue({
			discordId: "user-id",
			username: "testuser",
			roles: [],
			accessToken: "access-token",
		});
		mockStorage.delete.mockResolvedValue(undefined);
		vi.spyOn(DiscordClient.prototype, "revokeToken").mockResolvedValue(
			undefined as never,
		);

		await expect(
			revoke("user-id", mockStorage, "client-id", "client-secret"),
		).resolves.toBeUndefined();
		expect(mockStorage.delete).toHaveBeenCalledWith("user-id");
	});

	it("handles token revocation failure gracefully", async () => {
		mockStorage.findByDiscordId.mockResolvedValue({
			discordId: "user-id",
			username: "testuser",
			roles: [],
			accessToken: "access-token",
		});
		mockStorage.delete.mockResolvedValue(undefined);
		vi.spyOn(DiscordClient.prototype, "revokeToken").mockRejectedValue(
			new Error("Revoke failed"),
		);

		await expect(
			revoke("user-id", mockStorage, "client-id", "client-secret"),
		).resolves.toBeUndefined();
		expect(mockStorage.delete).toHaveBeenCalledWith("user-id");
	});

	it("throws AuthError on storage read failure", async () => {
		mockStorage.findByDiscordId.mockRejectedValue(new Error("Storage error"));
		await expect(
			revoke("user-id", mockStorage, "client-id", "client-secret"),
		).rejects.toThrow(AuthError);
	});
});
