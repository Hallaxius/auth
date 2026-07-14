import { describe, test, expect, mock } from "bun:test";
import { revokeAndCleanup } from "../logout-handler";
import type { DiscordClient } from "../client";
import type { UserStorage, StoredUser, SessionData } from "../types";

function createMockClient(): DiscordClient {
	return {
		revokeToken: mock(async () => {}),
	} as unknown as DiscordClient;
}

function createMockStorage(): UserStorage {
	return {
		findByDiscordId: async () => null,
		create: async () => {
			throw new Error("Not implemented");
		},
		update: async () => {
			throw new Error("Not implemented");
		},
		delete: async () => {},
	};
}

const mockSessionData: SessionData = {
	discordId: "123456789",
	username: "testuser",
	globalName: "Test User",
	avatar: null,
	email: "test@example.com",
	locale: "en-US",
};

describe("revokeAndCleanup", () => {
	test("revokes token and deletes user when storage has access token", async () => {
		const client = createMockClient();
		let deletedId: string | undefined;
		const storage = {
			findByDiscordId: mock(async () =>
				({
					id: "test-id",
					discordId: "123456789",
					username: "testuser",
					globalName: null,
					avatar: null,
					email: null,
					locale: "en-US",
					roles: ["user"],
					mfaEnabled: false,
					accessToken: "test_access_token",
					refreshToken: "test_refresh_token",
					tokenExpiresAt: Date.now() / 1000 + 3600,
					createdAt: new Date(),
					updatedAt: new Date(),
				}) as StoredUser,
			),
			delete: mock(async (id: string) => {
				deletedId = id;
			}),
		} as unknown as UserStorage;

		await revokeAndCleanup({
			storage,
			client,
			clientId: "test_client_id",
			clientSecret: "test_secret",
			sessionData: mockSessionData,
		});

		expect(client.revokeToken).toHaveBeenCalledWith(
			expect.objectContaining({
				accessToken: "test_access_token",
			}),
		);
		expect(deletedId).toBe("123456789");
	});

	test("skips revocation when user not found in storage", async () => {
		const client = createMockClient();
		const storage = {
			findByDiscordId: mock(async () => null),
			delete: mock(async () => {}),
		} as unknown as UserStorage;

		await revokeAndCleanup({
			storage,
			client,
			clientId: "test_client_id",
			clientSecret: "test_secret",
			sessionData: mockSessionData,
		});

		expect(client.revokeToken).not.toHaveBeenCalled();
		expect(storage.delete).not.toHaveBeenCalled();
	});

	test("skips revocation when stored user has no access token", async () => {
		const client = createMockClient();
		const storage = {
			findByDiscordId: mock(async () =>
				({
					id: "test-id",
					discordId: "123456789",
					username: "testuser",
					globalName: null,
					avatar: null,
					email: null,
					locale: "en-US",
					roles: ["user"],
					mfaEnabled: false,
					accessToken: null as any, // No token
					refreshToken: "test_refresh_token",
					tokenExpiresAt: Date.now() / 1000 + 3600,
					createdAt: new Date(),
					updatedAt: new Date(),
				}) as StoredUser,
			),
			delete: mock(async () => {}),
		} as unknown as UserStorage;

		await revokeAndCleanup({
			storage,
			client,
			clientId: "test_client_id",
			clientSecret: "test_secret",
			sessionData: mockSessionData,
		});

		expect(client.revokeToken).not.toHaveBeenCalled();
		expect(storage.delete).not.toHaveBeenCalled();
	});

	test("continues even if revocation fails (silent failure)", async () => {
		const client = createMockClient();
		client.revokeToken = mock(async () => {
			throw new Error("Token revocation failed");
		});
		const storage = {
			findByDiscordId: mock(async () =>
				({
					id: "test-id",
					discordId: "123456789",
					username: "testuser",
					globalName: null,
					avatar: null,
					email: null,
					locale: "en-US",
					roles: ["user"],
					mfaEnabled: false,
					accessToken: "test_access_token",
					refreshToken: "test_refresh_token",
					tokenExpiresAt: Date.now() / 1000 + 3600,
					createdAt: new Date(),
					updatedAt: new Date(),
				}) as StoredUser,
			),
			delete: mock(async () => {}),
		} as unknown as UserStorage;

		// Should not throw - silent failure
		await revokeAndCleanup({
			storage,
			client,
			clientId: "test_client_id",
			clientSecret: "test_secret",
			sessionData: mockSessionData,
		});

		expect(client.revokeToken).toHaveBeenCalled();
		expect(storage.delete).not.toHaveBeenCalled();
	});
});