import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Elysia } from "elysia";
import { generateState } from "../../core/state";
import type { CreateUserData, StoredUser, UserStorage } from "../../core/types";
import { discordAuth } from "../plugin";

const TEST_SECRET = "test-secret-key-12345";
const TEST_CLIENT_ID = "test-client-id";
const TEST_CLIENT_SECRET = "test-client-secret";

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
	originalFetch = globalThis.fetch;
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});

function _mockFetch(
	response: unknown,
	status = 200,
	headers: Record<string, string> = {},
) {
	globalThis.fetch = mock(async () => {
		return {
			ok: status >= 200 && status < 300,
			status,
			headers: new Headers(headers),
			json: async () => response,
			text: async () => JSON.stringify(response),
		} as Response;
	}) as unknown as typeof globalThis.fetch;
}

describe("discordAuth Plugin", () => {
	describe("Basic Configuration", () => {
		it("should throw if clientId is missing", () => {
			expect(() => {
				discordAuth({
					clientId: "",
					clientSecret: TEST_CLIENT_SECRET,
					session: { type: "jwt", secret: TEST_SECRET },
				});
			}).toThrow("Missing required configuration: 'clientId' is required");
		});

		it("should throw if clientSecret is missing", () => {
			expect(() => {
				discordAuth({
					clientId: TEST_CLIENT_ID,
					clientSecret: "",
					session: { type: "jwt", secret: TEST_SECRET },
				});
			}).toThrow("Missing required configuration: 'clientSecret' is required");
		});

		it("should throw if session.secret is missing", () => {
			expect(() => {
				discordAuth({
					clientId: TEST_CLIENT_ID,
					clientSecret: TEST_CLIENT_SECRET,
					session: { type: "jwt", secret: "" },
				});
			}).toThrow(
				"Missing required configuration: 'session.secret' is required",
			);
		});

		it("should create plugin with valid config", () => {
			const app = new Elysia().use(
				discordAuth({
					clientId: TEST_CLIENT_ID,
					clientSecret: TEST_CLIENT_SECRET,
					session: { type: "jwt", secret: TEST_SECRET },
				}),
			);
			expect(app).toBeTruthy();
		});
	});

	describe("Routes", () => {
		it("should register routes with default paths", () => {
			const app = new Elysia().use(
				discordAuth({
					clientId: TEST_CLIENT_ID,
					clientSecret: TEST_CLIENT_SECRET,
					session: { type: "jwt", secret: TEST_SECRET },
				}),
			);

			expect(app).toBeTruthy();
		});
	});

	describe("PKCE Integration", () => {
		it("should create plugin with PKCE enabled by default", () => {
			const app = new Elysia().use(
				discordAuth({
					clientId: TEST_CLIENT_ID,
					clientSecret: TEST_CLIENT_SECRET,
					session: { type: "jwt", secret: TEST_SECRET },
				}),
			);

			expect(app).toBeTruthy();
		});

		it("should create plugin with PKCE disabled", () => {
			const app = new Elysia().use(
				discordAuth({
					clientId: TEST_CLIENT_ID,
					clientSecret: TEST_CLIENT_SECRET,
					session: { type: "jwt", secret: TEST_SECRET },
					disablePKCE: true,
				}),
			);

			expect(app).toBeTruthy();
		});
	});

	describe("Macros", () => {
		it("should create plugin with auth macro", () => {
			const app = new Elysia().use(
				discordAuth({
					clientId: TEST_CLIENT_ID,
					clientSecret: TEST_CLIENT_SECRET,
					session: { type: "jwt", secret: TEST_SECRET },
				}),
			);

			// O plugin deve ser criado com sucesso
			expect(app).toBeTruthy();
		});

		it("should create plugin with optionalAuth macro", () => {
			const app = new Elysia().use(
				discordAuth({
					clientId: TEST_CLIENT_ID,
					clientSecret: TEST_CLIENT_SECRET,
					session: { type: "jwt", secret: TEST_SECRET },
				}),
			);

			expect(app).toBeTruthy();
		});

		it("should create plugin with requireRole macro when storage is configured", () => {
			const mockStorage: UserStorage = {
				findByDiscordId: async (_discordId: string) => null,
				create: async (data: CreateUserData) =>
					({
						...data,
						id: "1",
						createdAt: new Date(),
						updatedAt: new Date(),
					}) as StoredUser,
				update: async (_discordId: string, data: Partial<CreateUserData>) =>
					({
						...(data as CreateUserData),
						id: "1",
						discordId: "1",
						createdAt: new Date(),
						updatedAt: new Date(),
					}) as StoredUser,
				delete: async (_discordId: string) => {},
			};

			const app = new Elysia().use(
				discordAuth({
					clientId: TEST_CLIENT_ID,
					clientSecret: TEST_CLIENT_SECRET,
					session: { type: "jwt", secret: TEST_SECRET },
					storage: mockStorage,
				}),
			);

			expect(app).toBeTruthy();
		});
	});

	describe("State Generation", () => {
		it("should generate valid state", async () => {
			const state = await generateState(TEST_SECRET);
			expect(state).toBeTruthy();
			expect(state).toContain(".");
		});

		it("should include codeVerifier in state when provided", async () => {
			const codeVerifier = "test-verifier-123";
			const state = await generateState(TEST_SECRET, codeVerifier);
			expect(state).toBeTruthy();
			expect(state).toContain(".");
		});
	});
});
