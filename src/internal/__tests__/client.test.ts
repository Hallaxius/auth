import { beforeEach, describe, expect, it, vi } from "vitest";
import { DiscordClient } from "../client";

describe("DiscordClient", () => {
	let client: DiscordClient;
	const mockClientId = "test-client-id";
	const mockClientSecret = "test-client-secret";

	beforeEach(() => {
		client = new DiscordClient({ clientId: mockClientId, clientSecret: mockClientSecret });
		vi.clearAllMocks();
	});

	describe("constructor", () => {
		it("creates client with credentials", () => {
			const testClient = new DiscordClient({ clientId: "id123", clientSecret: "secret456" });
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

	describe("isExpiredError", () => {
		it("detects expired error from code", () => {
			const error1 = { code: "TOKEN_EXPIRED" };
			const error2 = { code: "token_expired" };
			const error3 = { code: "Expired" };

			expect(
				(
					client as unknown as { isExpiredError: (e: unknown) => boolean }
				).isExpiredError(error1),
			).toBe(true);
			expect(
				(
					client as unknown as { isExpiredError: (e: unknown) => boolean }
				).isExpiredError(error2),
			).toBe(true);
			expect(
				(
					client as unknown as { isExpiredError: (e: unknown) => boolean }
				).isExpiredError(error3),
			).toBe(true);
		});

		it("detects expired error from message", () => {
			const error1 = { message: "Token has expired" };
			const error2 = { message: "token EXPIRED" };

			expect(
				(
					client as unknown as { isExpiredError: (e: unknown) => boolean }
				).isExpiredError(error1),
			).toBe(true);
			expect(
				(
					client as unknown as { isExpiredError: (e: unknown) => boolean }
				).isExpiredError(error2),
			).toBe(true);
		});

		it("returns false for non-expired errors", () => {
			const error1 = { code: "INVALID_REQUEST" };
			const error2 = { message: "Network error" };
			const error3 = null;
			const error4 = undefined;
			const error5 = "string error";

			expect(
				(
					client as unknown as { isExpiredError: (e: unknown) => boolean }
				).isExpiredError(error1),
			).toBe(false);
			expect(
				(
					client as unknown as { isExpiredError: (e: unknown) => boolean }
				).isExpiredError(error2),
			).toBe(false);
			expect(
				(
					client as unknown as { isExpiredError: (e: unknown) => boolean }
				).isExpiredError(error3),
			).toBe(false);
			expect(
				(
					client as unknown as { isExpiredError: (e: unknown) => boolean }
				).isExpiredError(error4),
			).toBe(false);
			expect(
				(
					client as unknown as { isExpiredError: (e: unknown) => boolean }
				).isExpiredError(error5),
			).toBe(false);
		});

		it("handles error objects without code or message", () => {
			const error1 = { status: 401 };
			const error2 = { foo: "bar" };

			expect(
				(
					client as unknown as { isExpiredError: (e: unknown) => boolean }
				).isExpiredError(error1),
			).toBe(false);
			expect(
				(
					client as unknown as { isExpiredError: (e: unknown) => boolean }
				).isExpiredError(error2),
			).toBe(false);
		});
	});

	describe("getErrorStatus", () => {
		it("extracts status from error object", () => {
			const error1 = { status: 401 };
			const error2 = { status: 403 };
			const error3 = { status: "invalid" };
			const error4 = {};
			const error5 = null;

			expect(
				(
					client as unknown as {
						getErrorStatus: (e: unknown) => number | undefined;
					}
				).getErrorStatus(error1),
			).toBe(401);
			expect(
				(
					client as unknown as {
						getErrorStatus: (e: unknown) => number | undefined;
					}
				).getErrorStatus(error2),
			).toBe(403);
			expect(
				(
					client as unknown as {
						getErrorStatus: (e: unknown) => number | undefined;
					}
				).getErrorStatus(error3),
			).toBeUndefined();
			expect(
				(
					client as unknown as {
						getErrorStatus: (e: unknown) => number | undefined;
					}
				).getErrorStatus(error4),
			).toBeUndefined();
			expect(
				(
					client as unknown as {
						getErrorStatus: (e: unknown) => number | undefined;
					}
				).getErrorStatus(error5),
			).toBeUndefined();
		});
	});
});
