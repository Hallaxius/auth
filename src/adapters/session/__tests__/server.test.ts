import { describe, expect, test } from "bun:test";
import type { DiscordTokenResponse, DiscordUser } from "../../../core/types";
import { ServerSessionAdapter } from "../server";

const mockUser: DiscordUser = {
	id: "123",
	username: "testuser",
	discriminator: "0",
	global_name: "Test User",
	avatar: "abc123",
	avatar_decoration: null,
	email: "test@example.com",
	verified: true,
	locale: "en",
	mfa_enabled: false,
	banner: null,
	banner_color: null,
	accent_color: null,
	premium_type: 0,
	public_flags: 0,
};

const mockTokens: DiscordTokenResponse = {
	access_token: "at",
	token_type: "Bearer",
	expires_in: 604800,
	refresh_token: "rt",
	scope: "identify",
};

describe("ServerSessionAdapter", () => {
	test("create returns a session string", async () => {
		const adapter = new ServerSessionAdapter({ type: "server", secret: "s" });
		const sessionId = await adapter.create(mockUser, mockTokens);
		expect(sessionId).toBeString();
		expect(sessionId.length).toBeGreaterThan(0);
	});

	test("verify returns session data for valid id", async () => {
		const adapter = new ServerSessionAdapter({ type: "server", secret: "s" });
		const sessionId = await adapter.create(mockUser, mockTokens);
		const data = await adapter.verify(sessionId);
		expect(data).not.toBeNull();
		expect(data?.discordId).toBe("123");
		expect(data?.username).toBe("testuser");
	});

	test("verify returns null for invalid id", async () => {
		const adapter = new ServerSessionAdapter({ type: "server", secret: "s" });
		const data = await adapter.verify("nonexistent");
		expect(data).toBeNull();
	});

	test("destroy removes session", async () => {
		const adapter = new ServerSessionAdapter({ type: "server", secret: "s" });
		const sessionId = await adapter.create(mockUser, mockTokens);
		await adapter.destroy(sessionId);
		const data = await adapter.verify(sessionId);
		expect(data).toBeNull();
	});
});
