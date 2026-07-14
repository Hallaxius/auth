import { describe, test, expect, beforeEach } from "bun:test";
import { handleOAuthCallback } from "../callback-handler";
import type { DiscordClient } from "../client";
import type { UserStorage, StoredUser, DiscordUser, DiscordTokenResponse } from "../types";

function createMockClient(): DiscordClient {
	return {
		exchangeCode: async () =>
			({
				access_token: "mock_access_token",
				refresh_token: "mock_refresh_token",
				expires_in: 3600,
				token_type: "Bearer",
				scope: "identify",
			}) as DiscordTokenResponse,
		getUser: async () =>
			({
				id: "123456789",
				username: "testuser",
				discriminator: "0001",
				global_name: "Test User",
				avatar: "avatar_hash",
				avatar_decoration: null,
				email: "test@example.com",
				verified: true,
				locale: "en-US",
				mfa_enabled: true,
				banner: null,
				banner_color: null,
				accent_color: null,
				premium_type: 0,
				public_flags: 0,
				flags: 0,
			}) as DiscordUser,
	} as unknown as DiscordClient;
}

function createMockStorage(): UserStorage {
	let callCount = 0;
	return {
		findByDiscordId: async () => {
			callCount++;
			if (callCount === 1) return null; // First call: doesn't exist
			// Second call (after create): return the created user
			return {
				id: "test-user-id",
				discordId: "123456789",
				username: "testuser",
				globalName: "Test User",
				avatar: "avatar_hash",
				email: "test@example.com",
				locale: "en-US",
				roles: ["user"],
				mfaEnabled: true,
				accessToken: "mock_access_token",
				refreshToken: "mock_refresh_token",
				tokenExpiresAt: Date.now() / 1000 + 3600,
				createdAt: new Date(),
				updatedAt: new Date(),
			} as StoredUser;
		},
		create: async (data) =>
			({
				...data,
				id: "test-user-id",
				createdAt: new Date(),
				updatedAt: new Date(),
			}) as StoredUser,
		update: async (_, data) =>
			({
				discordId: "123456789",
				id: "test-user-id",
				username: data.username ?? "testuser",
				globalName: data.globalName ?? null,
				avatar: data.avatar ?? null,
				email: data.email ?? null,
				locale: data.locale ?? "en-US",
				roles: data.roles ?? ["user"],
				mfaEnabled: data.mfaEnabled ?? false,
				accessToken: data.accessToken ?? "",
				refreshToken: data.refreshToken ?? "",
				tokenExpiresAt: data.tokenExpiresAt ?? 0,
				createdAt: new Date(),
				updatedAt: new Date(),
			}) as StoredUser,
		delete: async () => {},
	};
}

const mockConfig = {
	clientId: "mock_client_id",
	clientSecret: "mock_client_secret",
	redirectUri: "http://localhost:3000/auth/callback",
	disablePKCE: false,
	mfa: { enabled: false, requireMfa: false },
	guildRoleSync: { enabled: false, syncOnLogin: false, guildId: "", roleMap: {}, botToken: "" },
	scopes: ["identify"],
} as any;

describe("handleOAuthCallback", () => {
	let client: ReturnType<typeof createMockClient>;
	let storage: ReturnType<typeof createMockStorage>;

	beforeEach(() => {
		client = createMockClient();
		storage = createMockStorage();
	});

	test("happy path: returns user, tokens, and storedUser", async () => {
		const result = await handleOAuthCallback({
			config: mockConfig,
			client,
			storage,
			code: "mock_code",
			codeVerifier: "mock_verifier",
		});

		expect(result.user.id).toBe("123456789");
		expect(result.tokens.access_token).toBe("mock_access_token");
		expect(result.storedUser?.discordId).toBe("123456789");
		expect(result.syncedPermissions).toHaveLength(0);
	});

	test("throws ConfigurationError when redirectUri is missing", async () => {
		const configWithoutRedirect = { ...mockConfig, redirectUri: undefined };

		try {
			await handleOAuthCallback({
				config: configWithoutRedirect as any,
				client,
				code: "mock_code",
			});
			throw new Error("Should have thrown");
		} catch (err) {
			expect((err as Error).message).toContain("redirectUri is required");
		}
	});

	test("throws MfaRequiredError when MFA is required but user lacks it", async () => {
		client.getUser = async () =>
			({
				id: "123456789",
				username: "testuser",
				discriminator: "0001",
				global_name: "Test User",
				avatar: null,
				email: null,
				verified: true,
				locale: "en-US",
				mfa_enabled: false,
			}) as DiscordUser;

		const configWithMfa = { ...mockConfig, mfa: { enabled: true, requireMfa: true } };

		try {
			await handleOAuthCallback({
				config: configWithMfa,
				client,
				storage,
				code: "mock_code",
			});
			throw new Error("Should have thrown");
		} catch (err) {
			expect((err as Error).message).toContain("Multi-factor authentication is required");
		}
	});

	test("updates existing user instead of creating", async () => {
		let callCount = 0;
		let createCalled = false;
		let updateCalled = false;

		storage.findByDiscordId = async () => {
			callCount++;
			if (callCount === 1) {
				return {
					id: "test-user-id",
					discordId: "123456789",
					username: "oldusername",
					globalName: null,
					avatar: null,
					email: null,
					locale: "en-US",
					roles: ["user"],
					mfaEnabled: false,
					accessToken: "old_token",
					refreshToken: "old_refresh",
					tokenExpiresAt: 12345,
					createdAt: new Date(),
					updatedAt: new Date(),
				} as StoredUser;
			}
			return null;
		};
		storage.create = async (data) => {
			createCalled = true;
			return { ...data, id: "test-user-id", createdAt: new Date(), updatedAt: new Date() } as StoredUser;
		};
		storage.update = async (_, data) => {
			updateCalled = true;
			return { discordId: "123456789", id: "test-user-id", ...data, createdAt: new Date(), updatedAt: new Date() } as StoredUser;
		};

		await handleOAuthCallback({
			config: mockConfig,
			client,
			storage,
			code: "mock_code",
		});

		expect(createCalled).toBe(false);
		expect(updateCalled).toBe(true);
	});

	test("works without storage (returns undefined storedUser)", async () => {
		const result = await handleOAuthCallback({
			config: mockConfig,
			client,
			code: "mock_code",
		});

		expect(result.user.id).toBe("123456789");
		expect(result.storedUser).toBeUndefined();
	});

	test("passes codeVerifier when PKCE is enabled", async () => {
		let capturedCodeVerifier: string | undefined;
		client.exchangeCode = async (params) => {
			capturedCodeVerifier = params.codeVerifier;
			return {
				access_token: "mock_access_token",
				refresh_token: "mock_refresh_token",
				expires_in: 3600,
				token_type: "Bearer",
				scope: "identify",
			} as DiscordTokenResponse;
		};

		await handleOAuthCallback({
			config: mockConfig,
			client,
			code: "mock_code",
			codeVerifier: "test_verifier",
		});

		expect(capturedCodeVerifier).toBe("test_verifier");
	});

	test("omits codeVerifier when PKCE is disabled", async () => {
		const configWithoutPKCE = { ...mockConfig, disablePKCE: true };
		let capturedCodeVerifier: string | undefined;
		client.exchangeCode = async (params) => {
			capturedCodeVerifier = params.codeVerifier;
			return {
				access_token: "mock_access_token",
				refresh_token: "mock_refresh_token",
				expires_in: 3600,
				token_type: "Bearer",
				scope: "identify",
			} as DiscordTokenResponse;
		};

		await handleOAuthCallback({
			config: configWithoutPKCE,
			client,
			code: "mock_code",
			codeVerifier: "test_verifier",
		});

		expect(capturedCodeVerifier).toBeUndefined();
	});
});