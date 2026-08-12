import { beforeEach, describe, expect, it, mock } from "bun:test";
import { DiscordClient } from "../../../src/";

describe("DiscordClient", () => {
	let client: DiscordClient;
	const mockClientId = "test-client-id";
	const mockClientSecret = "test-client-secret";

	beforeEach(() => {
		client = new DiscordClient({
			clientId: mockClientId,
			clientSecret: mockClientSecret,
		});
		mock.clearAllMocks();
	});

	describe("constructor", () => {
		it("creates client with credentials", () => {
			const testClient = new DiscordClient({
				clientId: "id123",
				clientSecret: "secret456",
			});
			expect(testClient).toBeInstanceOf(DiscordClient);
		});
	});

	describe("generateAuthUrl", () => {
		it("generates basic auth URL", () => {
			const url = client.generateAuthUrl({
				clientId: mockClientId,
				redirectUri: "https://example.com/callback",
				responseType: "code",
				scopes: ["identify", "email"],
				state: "random-state",
			});

			expect(url).toContain("https://discord.com/oauth2/authorize");
			expect(url).toContain(`client_id=${mockClientId}`);
			expect(url).toContain(
				"redirect_uri=https%3A%2F%2Fexample.com%2Fcallback",
			);
			expect(url).toContain("response_type=code");
			expect(url).toContain("scope=identify+email");
			expect(url).toContain("state=random-state");
		});

		it("includes PKCE parameters", () => {
			const url = client.generateAuthUrl({
				clientId: mockClientId,
				redirectUri: "https://example.com/callback",
				scopes: ["identify"],
				state: "state123",
				codeChallenge: "challenge-abc",
				codeChallengeMethod: "S256",
			});

			expect(url).toContain("code_challenge=challenge-abc");
			expect(url).toContain("code_challenge_method=S256");
		});

		it("includes prompt parameter", () => {
			const url = client.generateAuthUrl({
				clientId: mockClientId,
				redirectUri: "https://example.com/callback",
				scopes: ["identify"],
				state: "state123",
				prompt: "consent",
			});

			expect(url).toContain("prompt=consent");
		});

		it("includes prompt none", () => {
			const url = client.generateAuthUrl({
				clientId: mockClientId,
				redirectUri: "https://example.com/callback",
				scopes: ["identify"],
				state: "state123",
				prompt: "none",
			});

			expect(url).toContain("prompt=none");
		});

		it("excludes PKCE when not provided", () => {
			const url = client.generateAuthUrl({
				clientId: mockClientId,
				redirectUri: "https://example.com/callback",
				scopes: ["identify"],
				state: "state123",
			});

			expect(url).not.toContain("code_challenge");
			expect(url).not.toContain("code_challenge_method");
		});

		it("excludes prompt when not provided", () => {
			const url = client.generateAuthUrl({
				clientId: mockClientId,
				redirectUri: "https://example.com/callback",
				scopes: ["identify"],
				state: "state123",
			});

			expect(url).not.toContain("prompt=");
		});

		it("handles multiple scopes", () => {
			const url = client.generateAuthUrl({
				clientId: mockClientId,
				redirectUri: "https://example.com/callback",
				scopes: ["identify", "email", "guilds", "guilds.join"],
				state: "state123",
			});

			expect(url).toContain("scope=identify+email+guilds+guilds.join");
		});
	});
});

