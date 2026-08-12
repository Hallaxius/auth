import { describe, expect, test } from "bun:test";
import type { GuildRoleSyncConfig } from "../../../src/types";
import { GuildRoleSync } from "../../../src/utils/guild";

interface MockClient {
	getGuildMemberRoles: (...args: unknown[]) => Promise<unknown>;
	getCurrentUserGuildMember: (...args: unknown[]) => Promise<unknown>;
	getGuildMember: (...args: unknown[]) => Promise<unknown>;
	addMember: (...args: unknown[]) => Promise<unknown>;
	removeMember: (...args: unknown[]) => Promise<unknown>;
}

function createMockClient(): MockClient {
	return {
		getGuildMemberRoles: async () => [],
		getCurrentUserGuildMember: async () => {
			throw new Error("Not implemented");
		},
		getGuildMember: async () => {
			throw new Error("Not implemented");
		},
		addMember: async () => undefined,
		removeMember: async () => undefined,
	};
}

function createConfig(
	overrides: Partial<GuildRoleSyncConfig> = {},
): GuildRoleSyncConfig {
	return {
		enabled: true,
		guildId: "test-guild-123",
		botToken: "test-bot-token",
		roleMap: {
			"role-1": ["perm-a"],
			"role-2": ["perm-b", "perm-c"],
			"role-3": ["perm-d"],
		},
		syncOnLogin: true,
		cacheTtlMs: 5000,
		...overrides,
	};
}

describe("GuildRoleSync", () => {
	const config = createConfig();

	describe("syncUserRoles", () => {
		test("uses the user endpoint when accessToken is provided", async () => {
			let calledWith: unknown = null;
			const client = createMockClient();
			client.getCurrentUserGuildMember = async (...args) => {
				calledWith = args;
				return { roles: ["role-1", "role-2"] };
			};
			const sync = new GuildRoleSync(config, client as never);
			const result = await sync.syncUserRoles("user-1", "access-token");
			expect(calledWith).toEqual(["test-guild-123", "access-token"]);
			expect(result).toEqual(["perm-a", "perm-b", "perm-c"]);
		});

		test("falls back to the bot endpoint without accessToken", async () => {
			let calledWith: unknown = null;
			const client = createMockClient();
			client.getGuildMemberRoles = async (...args) => {
				calledWith = args;
				return ["role-1", "role-2"];
			};
			const sync = new GuildRoleSync(config, client as never);
			const result = await sync.syncUserRoles("user-1");
			expect(calledWith).toEqual([
				"test-guild-123",
				"user-1",
				"test-bot-token",
			]);
			expect(result).toEqual(["perm-a", "perm-b", "perm-c"]);
		});

		test("returns empty array when no roles match the map", async () => {
			const client = createMockClient();
			client.getCurrentUserGuildMember = async () => ({
				roles: ["unknown-role"],
			});
			const sync = new GuildRoleSync(config, client as never);
			const result = await sync.syncUserRoles("user-1", "token");
			expect(result).toEqual([]);
		});

		test("returns empty array for a member with no roles", async () => {
			const client = createMockClient();
			client.getCurrentUserGuildMember = async () => ({ roles: [] });
			const sync = new GuildRoleSync(config, client as never);
			const result = await sync.syncUserRoles("user-1", "token");
			expect(result).toEqual([]);
		});

		test("handles API error", async () => {
			const client = createMockClient();
			client.getCurrentUserGuildMember = async () => {
				throw new Error("API error");
			};
			const sync = new GuildRoleSync(config, client as never);
			await expect(sync.syncUserRoles("user-1", "token")).rejects.toThrow(
				"API error",
			);
		});
	});

	describe("getMappedPermissions", () => {
		test("maps single role to permissions", () => {
			const sync = new GuildRoleSync(config, {} as never);
			const result = sync.getMappedPermissions(["role-1"]);
			expect(result).toEqual(["perm-a"]);
		});

		test("deduplicates permissions from multiple roles", () => {
			const configWithOverlap = createConfig({
				roleMap: {
					"role-1": ["perm-a", "perm-b"],
					"role-2": ["perm-b", "perm-c"],
				},
			});
			const sync = new GuildRoleSync(configWithOverlap, {} as never);
			const result = sync.getMappedPermissions(["role-1", "role-2"]);
			expect(result).toEqual(["perm-a", "perm-b", "perm-c"]);
		});

		test("returns empty array for unknown roles", () => {
			const sync = new GuildRoleSync(config, {} as never);
			const result = sync.getMappedPermissions(["non-existent"]);
			expect(result).toEqual([]);
		});
	});

	describe("hasRole", () => {
		test("returns true when member has the real role ID", async () => {
			const client = createMockClient();
			client.getGuildMemberRoles = async () => ["role-1"];
			const sync = new GuildRoleSync(config, client as never);
			expect(await sync.hasRole("user-1", "role-1")).toBe(true);
		});

		test("returns false when member does not have the role", async () => {
			const client = createMockClient();
			client.getGuildMemberRoles = async () => ["role-2"];
			const sync = new GuildRoleSync(config, client as never);
			expect(await sync.hasRole("user-1", "role-1")).toBe(false);
		});

		test("returns false for a mapped permission, not a real role", async () => {
			const client = createMockClient();
			client.getGuildMemberRoles = async () => ["role-1"];
			const sync = new GuildRoleSync(config, client as never);
			expect(await sync.hasRole("user-1", "perm-a")).toBe(false);
		});

		test("returns false when the member fetch fails", async () => {
			const client = createMockClient();
			client.getGuildMemberRoles = async () => {
				throw new Error("Forbidden");
			};
			const sync = new GuildRoleSync(config, client as never);
			expect(await sync.hasRole("user-1", "role-1")).toBe(false);
		});
	});

	describe("hasAnyRole", () => {
		test("returns true when member has one of the real role IDs", async () => {
			const client = createMockClient();
			client.getGuildMemberRoles = async () => ["role-1"];
			const sync = new GuildRoleSync(config, client as never);
			expect(await sync.hasAnyRole("user-1", ["role-2", "role-1"])).toBe(true);
		});

		test("returns false when member has none of the roles", async () => {
			const client = createMockClient();
			client.getGuildMemberRoles = async () => ["role-3"];
			const sync = new GuildRoleSync(config, client as never);
			expect(await sync.hasAnyRole("user-1", ["role-1", "role-2"])).toBe(false);
		});

		test("returns false for an empty role list", async () => {
			const client = createMockClient();
			client.getGuildMemberRoles = async () => ["role-1"];
			const sync = new GuildRoleSync(config, client as never);
			expect(await sync.hasAnyRole("user-1", [])).toBe(false);
		});

		test("returns false when the member fetch fails", async () => {
			const client = createMockClient();
			client.getGuildMemberRoles = async () => {
				throw new Error("Forbidden");
			};
			const sync = new GuildRoleSync(config, client as never);
			expect(await sync.hasAnyRole("user-1", ["role-1"])).toBe(false);
		});
	});

	describe("hasPermission", () => {
		test("returns true when roles map to the permission", async () => {
			const client = createMockClient();
			client.getGuildMemberRoles = async () => ["role-1"];
			const sync = new GuildRoleSync(config, client as never);
			expect(await sync.hasPermission("user-1", "perm-a")).toBe(true);
		});

		test("returns false when roles do not map to the permission", async () => {
			const client = createMockClient();
			client.getGuildMemberRoles = async () => ["role-3"];
			const sync = new GuildRoleSync(config, client as never);
			expect(await sync.hasPermission("user-1", "perm-a")).toBe(false);
		});

		test("returns false for a raw role ID, not a mapped permission", async () => {
			const client = createMockClient();
			client.getGuildMemberRoles = async () => ["role-1"];
			const sync = new GuildRoleSync(config, client as never);
			expect(await sync.hasPermission("user-1", "role-1")).toBe(false);
		});
	});

	describe("hasMember", () => {
		test("returns true when member exists", async () => {
			const client = createMockClient();
			client.getGuildMember = async () => ({
				user: { id: "user-1" },
				roles: [],
				mute: false,
				deaf: false,
				joined_at: "2024-01-01T00:00:00Z",
			});
			const sync = new GuildRoleSync(config, client as never);
			expect(await sync.hasMember("user-1")).toBe(true);
		});

		test("returns false when member does not exist", async () => {
			const client = createMockClient();
			client.getGuildMember = async () => {
				throw new Error("Not found");
			};
			const sync = new GuildRoleSync(config, client as never);
			expect(await sync.hasMember("user-1")).toBe(false);
		});
	});

	describe("join", () => {
		test("adds member to guild", async () => {
			let calledWith: unknown = null;
			const client = createMockClient();
			client.addMember = async (args) => {
				calledWith = args;
			};
			const sync = new GuildRoleSync(config, client as never);
			await sync.join("user-1", "access-token");
			expect(calledWith).toEqual({
				guildId: "test-guild-123",
				userId: "user-1",
				accessToken: "access-token",
				botToken: "test-bot-token",
				nick: undefined,
				roles: undefined,
			});
		});

		test("adds member with options", async () => {
			let calledWith: unknown = null;
			const client = createMockClient();
			client.addMember = async (args) => {
				calledWith = args;
			};
			const sync = new GuildRoleSync(config, client as never);
			await sync.join("user-1", "access-token", {
				nick: "TestUser",
				roles: ["role-1"],
			});
			expect(calledWith).toEqual({
				guildId: "test-guild-123",
				userId: "user-1",
				accessToken: "access-token",
				botToken: "test-bot-token",
				nick: "TestUser",
				roles: ["role-1"],
			});
		});

		test("throws on API error", async () => {
			const client = createMockClient();
			client.addMember = async () => {
				throw new Error("Permission denied");
			};
			const sync = new GuildRoleSync(config, client as never);
			await expect(sync.join("user-1", "token")).rejects.toThrow(
				"Permission denied",
			);
		});
	});

	describe("revoke", () => {
		test("removes member from guild", async () => {
			let calledWith: unknown = null;
			const client = createMockClient();
			client.removeMember = async (args) => {
				calledWith = args;
			};
			const sync = new GuildRoleSync(config, client as never);
			await sync.revoke("user-1");
			expect(calledWith).toEqual({
				guildId: "test-guild-123",
				userId: "user-1",
				botToken: "test-bot-token",
			});
		});

		test("throws on permission error", async () => {
			const client = createMockClient();
			client.removeMember = async () => {
				throw new Error("Forbidden");
			};
			const sync = new GuildRoleSync(config, client as never);
			await expect(sync.revoke("user-1")).rejects.toThrow("Forbidden");
		});
	});
});
