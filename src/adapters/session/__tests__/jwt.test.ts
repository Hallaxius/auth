import { describe, expect, it } from "bun:test";
import type { DiscordUser } from "../../../core/types";
import { JwtSessionAdapter } from "../jwt";

const BASE_USER: DiscordUser = {
	id: "123456",
	username: "testuser",
	discriminator: "0",
	global_name: "Test User",
	avatar: "avatar_hash",
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

describe("JwtSessionAdapter", () => {
	describe("constructor defaults", () => {
		it("uses default cookie name when not provided", () => {
			const adapter = new JwtSessionAdapter({
				type: "jwt",
				secret: "test-secret",
			});
			expect(adapter.cookieName).toBe("discord-auth-session");
		});

		it("uses custom cookie name when provided", () => {
			const adapter = new JwtSessionAdapter({
				type: "jwt",
				secret: "test-secret",
				cookieName: "my-custom-session",
			});
			expect(adapter.cookieName).toBe("my-custom-session");
		});

		it("defaults to httpOnly true", () => {
			const adapter = new JwtSessionAdapter({
				type: "jwt",
				secret: "test-secret",
			});
			expect(adapter.cookieOptions.httpOnly).toBe(true);
		});

		it("defaults to sameSite lax", () => {
			const adapter = new JwtSessionAdapter({
				type: "jwt",
				secret: "test-secret",
			});
			expect(adapter.cookieOptions.sameSite).toBe("lax");
		});
	});

	describe("toPayload", () => {
		it("maps DiscordUser fields to JWT payload", () => {
			const adapter = new JwtSessionAdapter({
				type: "jwt",
				secret: "test-secret",
			});

			const payload = adapter.toPayload(BASE_USER);
			expect(payload.discordId).toBe("123456");
			expect(payload.username).toBe("testuser");
			expect(payload.globalName).toBe("Test User");
			expect(payload.avatar).toBe("avatar_hash");
			expect(payload.email).toBe("test@example.com");
			expect(payload.locale).toBe("en-US");
		});

		it("handles nullable global_name", () => {
			const adapter = new JwtSessionAdapter({
				type: "jwt",
				secret: "test-secret",
			});

			const userWithoutGlobalName: DiscordUser = {
				...BASE_USER,
				global_name: null,
			};

			const payload = adapter.toPayload(userWithoutGlobalName);
			expect(payload.globalName).toBeNull();
		});

		it("handles nullable avatar", () => {
			const adapter = new JwtSessionAdapter({
				type: "jwt",
				secret: "test-secret",
			});

			const userWithoutAvatar: DiscordUser = {
				...BASE_USER,
				avatar: null,
			};

			const payload = adapter.toPayload(userWithoutAvatar);
			expect(payload.avatar).toBeNull();
		});

		it("handles nullable email", () => {
			const adapter = new JwtSessionAdapter({
				type: "jwt",
				secret: "test-secret",
			});

			const userWithoutEmail: DiscordUser = {
				...BASE_USER,
				email: null,
			};

			const payload = adapter.toPayload(userWithoutEmail);
			expect(payload.email).toBeNull();
		});
	});

	describe("fromPayload", () => {
		it("reconstructs SessionData from JWT payload", () => {
			const adapter = new JwtSessionAdapter({
				type: "jwt",
				secret: "test-secret",
			});

			const payload = {
				discordId: "123456",
				username: "testuser",
				globalName: "Test User",
				avatar: "avatar_hash",
				email: "test@example.com",
				locale: "en-US",
			};

			const sessionData = adapter.fromPayload(payload);
			expect(sessionData.discordId).toBe("123456");
			expect(sessionData.username).toBe("testuser");
			expect(sessionData.globalName).toBe("Test User");
			expect(sessionData.avatar).toBe("avatar_hash");
			expect(sessionData.email).toBe("test@example.com");
			expect(sessionData.locale).toBe("en-US");
		});

		it("is the inverse of toPayload", () => {
			const adapter = new JwtSessionAdapter({
				type: "jwt",
				secret: "test-secret",
			});

			const payload = adapter.toPayload(BASE_USER);
			const sessionData = adapter.fromPayload(payload);

			expect(sessionData.discordId).toBe(BASE_USER.id);
			expect(sessionData.username).toBe(BASE_USER.username);
			expect(sessionData.globalName).toBe(BASE_USER.global_name);
			expect(sessionData.avatar).toBe(BASE_USER.avatar);
			expect(sessionData.email).toBe(BASE_USER.email);
			expect(sessionData.locale).toBe(BASE_USER.locale);
		});
	});

	describe("destroy", () => {
		it("resolves without error (JWT is stateless)", async () => {
			const adapter = new JwtSessionAdapter({
				type: "jwt",
				secret: "test-secret",
			});

			await expect(adapter.destroy("any-token")).resolves.toBeUndefined();
		});
	});
});
