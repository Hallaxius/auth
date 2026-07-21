import { describe, expect, test } from "vitest";
import { MemoryCacheAdapter } from "../../adapters/cache/memory";
import type { GuildRoleSyncConfig } from "../../types";
import { GuildRoleSync } from "../guild";

interface MockClient {
	getGuildMemberRoles: (...args: unknown[]) => Promise<unknown>;
	getGuildMember: (...args: unknown[]) => Promise<unknown>;
	addMember: (...args: unknown[]) => Promise<unknown>;
	removeMember: (...args: unknown[]) => Promise<unknown>;
}

function createMockClient(): MockClient {
	return {
		getGuildMemberRoles: async () => [],
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
		test("returns permissions from API", async () => {
			const client = createMockClient();
			client.getGuildMemberRoles = async () => ["role-1", "role-2"];
			const sync = new GuildRoleSync(
				config,
				client as never,
				new MemoryCacheAdapter(),
			);
			const result = await sync.syncUserRoles("user-1", "token");
			expect(result).toEqual(["perm-a", "perm-b", "perm-c"]);
		});

		test("caches permissions", async () => {
			let callCount = 0;
			const client = createMockClient();
			client.getGuildMemberRoles = async () => {
				callCount++;
				return ["role-1"];
			};
			const sync = new GuildRoleSync(
				config,
				client as never,
				new MemoryCacheAdapter(),
			);
			await sync.syncUserRoles("user-1", "token");
			await sync.syncUserRoles("user-1", "token");
			expect(callCount).toBe(1);
		});

		test("returns empty array for no matching roles", async () => {
			const client = createMockClient();
			client.getGuildMemberRoles = async () => ["unknown-role"];
			const sync = new GuildRoleSync(
				config,
				client as never,
				new MemoryCacheAdapter(),
			);
			const result = await sync.syncUserRoles("user-1", "token");
			expect(result).toEqual([]);
		});

		test("handles API error", async () => {
			const client = createMockClient();
			client.getGuildMemberRoles = async () => {
				throw new Error("API error");
			};
			const sync = new GuildRoleSync(
				config,
				client as never,
				new MemoryCacheAdapter(),
			);
			await expect(sync.syncUserRoles("user-1", "token")).rejects.toThrow(
				"API error",
			);
		});
	});

	describe("getMappedPermissions", () => {
		test("maps single role to permissions", () => {
			const sync = new GuildRoleSync(
				config,
				{} as never,
				new MemoryCacheAdapter(),
			);
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
			const sync = new GuildRoleSync(
				configWithOverlap,
				{} as never,
				new MemoryCacheAdapter(),
			);
			const result = sync.getMappedPermissions(["role-1", "role-2"]);
			expect(result).toEqual(["perm-a", "perm-b", "perm-c"]);
		});

		test("returns empty array for unknown roles", () => {
			const sync = new GuildRoleSync(
				config,
				{} as never,
				new MemoryCacheAdapter(),
			);
			const result = sync.getMappedPermissions(["non-existent"]);
			expect(result).toEqual([]);
		});
	});

	describe("hasRole", () => {
		test("returns true when user has the role", async () => {
			const client = createMockClient();
			client.getGuildMemberRoles = async () => ["role-1"];
			const sync = new GuildRoleSync(
				config,
				client as never,
				new MemoryCacheAdapter(),
			);
			expect(await sync.hasRole("user-1", "perm-a")).toBe(true);
		});

		test("returns false when user does not have the role", async () => {
			const client = createMockClient();
			client.getGuildMemberRoles = async () => ["role-2"];
			const sync = new GuildRoleSync(
				config,
				client as never,
				new MemoryCacheAdapter(),
			);
			expect(await sync.hasRole("user-1", "perm-a")).toBe(false);
		});
	});

	describe("hasAnyRole", () => {
		test("returns true when user has one of the roles", async () => {
			const client = createMockClient();
			client.getGuildMemberRoles = async () => ["role-1"];
			const sync = new GuildRoleSync(
				config,
				client as never,
				new MemoryCacheAdapter(),
			);
			expect(await sync.hasAnyRole("user-1", ["perm-a", "perm-x"])).toBe(true);
		});

		test("returns false when user has none of the roles", async () => {
			const client = createMockClient();
			client.getGuildMemberRoles = async () => ["role-3"];
			const sync = new GuildRoleSync(
				config,
				client as never,
				new MemoryCacheAdapter(),
			);
			expect(await sync.hasAnyRole("user-1", ["perm-a", "perm-b"])).toBe(false);
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
			const sync = new GuildRoleSync(
				config,
				client as never,
				new MemoryCacheAdapter(),
			);
			expect(await sync.hasMember("user-1")).toBe(true);
		});

		test("returns false when member does not exist", async () => {
			const client = createMockClient();
			client.getGuildMember = async () => {
				throw new Error("Not found");
			};
			const sync = new GuildRoleSync(
				config,
				client as never,
				new MemoryCacheAdapter(),
			);
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
			const sync = new GuildRoleSync(
				config,
				client as never,
				new MemoryCacheAdapter(),
			);
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
			const sync = new GuildRoleSync(
				config,
				client as never,
				new MemoryCacheAdapter(),
			);
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
			const sync = new GuildRoleSync(
				config,
				client as never,
				new MemoryCacheAdapter(),
			);
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
			const sync = new GuildRoleSync(
				config,
				client as never,
				new MemoryCacheAdapter(),
			);
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
			const sync = new GuildRoleSync(
				config,
				client as never,
				new MemoryCacheAdapter(),
			);
			await expect(sync.revoke("user-1")).rejects.toThrow("Forbidden");
		});
	});
});
