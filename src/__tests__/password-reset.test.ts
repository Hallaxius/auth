import { beforeEach, describe, expect, test } from "bun:test";
import { AuthError } from "../errors";
import { passwordReset } from "../password-reset";
import type {
	PasswordHasher,
	PasswordResetConfig,
	ResetNotifier,
	ResetTokenStorage,
} from "../types";

function createMockStorage(): ResetTokenStorage {
	const store = new Map<
		string,
		{
			selector: string;
			validatorHash: string;
			expiry: number;
			userId: string;
			email: string;
			username: string;
			consumed: boolean;
		}
	>();
	return {
		async create(data) {
			store.set(data.selector, { ...data, consumed: false });
		},
		async findBySelector(selector) {
			const entry = store.get(selector);
			return entry
				? {
						selector: entry.selector,
						validatorHash: entry.validatorHash,
						expiry: entry.expiry,
						userId: entry.userId,
						email: entry.email,
						username: entry.username,
					}
				: null;
		},
		async delete(selector) {
			store.delete(selector);
		},
		async consume(selector) {
			const entry = store.get(selector);
			if (!entry || entry.consumed) return null;
			entry.consumed = true;
			return {
				userId: entry.userId,
				email: entry.email,
				username: entry.username,
			};
		},
	};
}

function createMockNotifier(): ResetNotifier {
	return {
		async send() {},
	};
}

function createMockHasher(): PasswordHasher {
	return {
		async hash(password: string) {
			return `hashed:${password}`;
		},
		async verify(password: string, hash: string) {
			return hash === `hashed:${password}`;
		},
	};
}

function makeConfig(
	overrides?: Partial<PasswordResetConfig>,
): PasswordResetConfig {
	return {
		storage: createMockStorage(),
		notifier: createMockNotifier(),
		hasher: createMockHasher(),
		...overrides,
	};
}

describe("passwordReset", () => {
	let manager: ReturnType<typeof passwordReset>;
	let config: PasswordResetConfig;

	beforeEach(() => {
		config = makeConfig();
		manager = passwordReset(config);
	});

	describe("requestReset", () => {
		test("returns processed: true", async () => {
			const result = await manager.requestReset("user@example.com");
			expect(result.processed).toBe(true);
		});

		test("works with userLookup that returns null", async () => {
			config = makeConfig({
				userLookup: async () => null,
			});
			manager = passwordReset(config);
			const result = await manager.requestReset("unknown");
			expect(result.processed).toBe(true);
		});
	});

	describe("consumeResetToken", () => {
		test("consumes a valid token", async () => {
			let capturedToken = "";
			config = makeConfig({
				notifier: {
					async send({ selector, validator }) {
						capturedToken = `${selector}.${validator}`;
					},
				},
				userLookup: async () => ({
					userId: "user-1",
					email: "test@example.com",
					username: "testuser",
				}),
			});
			manager = passwordReset(config);
			await manager.requestReset("user@example.com");
			expect(capturedToken).toBeTruthy();
			const result = await manager.consumeResetToken(capturedToken);
			expect(result.userId).toBe("user-1");
			expect(result.email).toBe("test@example.com");
			expect(result.username).toBe("testuser");
		});

		test("throws on invalid token", async () => {
			await expect(
				manager.consumeResetToken("bad-selector.bad-validator"),
			).rejects.toThrow();
		});

		test("throws on malformed token", async () => {
			await expect(manager.consumeResetToken("invalid")).rejects.toThrow();
		});

		test("throws on consumed token", async () => {
			let capturedToken = "";
			config = makeConfig({
				notifier: {
					async send({ selector, validator }) {
						capturedToken = `${selector}.${validator}`;
					},
				},
			});
			manager = passwordReset(config);
			await manager.requestReset("user@example.com");
			await manager.consumeResetToken(capturedToken);
			await expect(manager.consumeResetToken(capturedToken)).rejects.toThrow();
		});
	});

	describe("handleForgotPassword", () => {
		test("returns 405 on non-POST", async () => {
			const res = await manager.handleForgotPassword(
				new Request("http://localhost", { method: "GET" }),
			);
			expect(res?.status).toBe(405);
		});

		test("processes POST request", async () => {
			config = makeConfig({
				userLookup: async (_emailOrUsername) => ({
					userId: "user-1",
					email: "test@example.com",
					username: "testuser",
				}),
				forgotPasswordRateLimit: { maxAttempts: 100, windowMs: 60000 },
			});
			manager = passwordReset(config);
			const res = await manager.handleForgotPassword(
				new Request("http://localhost", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ emailOrUsername: "test@example.com" }),
				}),
			);
			expect(res?.status).toBe(200);
		});

		test("returns error on invalid JSON", async () => {
			config = makeConfig({
				forgotPasswordRateLimit: { maxAttempts: 100, windowMs: 60000 },
			});
			manager = passwordReset(config);
			const res = await manager.handleForgotPassword(
				new Request("http://localhost", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: "not-json",
				}),
			);
			const json = (await res?.json()) as { error: string };
			expect(json.error).toBe("Invalid JSON");
			expect(res?.status).toBe(400);
		});
	});

	describe("handleResetPassword", () => {
		test("returns 405 on non-POST", async () => {
			const res = await manager.handleResetPassword(
				new Request("http://localhost", { method: "GET" }),
			);
			expect(res?.status).toBe(405);
		});

		test("handles complete reset flow", async () => {
			let capturedToken = "";
			config = makeConfig({
				notifier: {
					async send({ selector, validator }) {
						capturedToken = `${selector}.${validator}`;
					},
				},
				resetPasswordRateLimit: { maxAttempts: 100, windowMs: 60000 },
				onPasswordReset: async (_userId, _newPasswordHash) => {},
				userLookup: async (_emailOrUsername) => ({
					userId: "user-1",
					email: "test@example.com",
					username: "testuser",
				}),
			});
			manager = passwordReset(config);
			await manager.requestReset("test@example.com");
			const res = await manager.handleResetPassword(
				new Request("http://localhost", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						token: capturedToken,
						newPassword: "new-password-123",
					}),
				}),
			);
			expect(res?.status).toBe(200);
		});

		test("throws on short password", async () => {
			const config2 = makeConfig({
				resetPasswordRateLimit: { maxAttempts: 100, windowMs: 60000 },
			});
			const m = passwordReset(config2);
			await expect(
				m.handleResetPassword(
					new Request("http://localhost", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ token: "some-token", newPassword: "short" }),
					}),
				),
			).rejects.toThrow(AuthError);
		});

		test("returns error on invalid JSON", async () => {
			config = makeConfig({
				resetPasswordRateLimit: { maxAttempts: 100, windowMs: 60000 },
			});
			manager = passwordReset(config);
			const res = await manager.handleResetPassword(
				new Request("http://localhost", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: "not-json",
				}),
			);
			const json = (await res?.json()) as { error: string };
			expect(json.error).toBe("Invalid JSON");
			expect(res?.status).toBe(400);
		});

		test("returns 429 when rate limited on forgotPassword", async () => {
			let fail = true;
			const configLimited = makeConfig({
				forgotPasswordRateLimit: { maxAttempts: 1, windowMs: 60000 },
				notifier: {
					async send() {
						if (fail) {
							fail = false;
							throw new Error("fail to trigger rate limit");
						}
					},
				},
			});
			const m = passwordReset(configLimited);
			await m
				.handleForgotPassword(
					new Request("http://localhost", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ emailOrUsername: "test@example.com" }),
					}),
				)
				.catch(() => {});
			await expect(
				m.handleForgotPassword(
					new Request("http://localhost", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ emailOrUsername: "test@example.com" }),
					}),
				),
			).rejects.toThrow(AuthError);
		});

		test("throws on expired token in handleResetPassword", async () => {
			let capturedToken = "";
			const configExpired = makeConfig({
				tokenExpirationSeconds: 0,
				notifier: {
					async send({ selector, validator }) {
						capturedToken = `${selector}.${validator}`;
					},
				},
				userLookup: async () => ({
					userId: "user-1",
					email: "test@example.com",
					username: "testuser",
				}),
				resetPasswordRateLimit: { maxAttempts: 100, windowMs: 60000 },
			});
			const m = passwordReset(configExpired);
			await m.requestReset("test@example.com");
			await new Promise((r) => setTimeout(r, 5));
			await expect(
				m.handleResetPassword(
					new Request("http://localhost", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							token: capturedToken,
							newPassword: "new-password-123",
						}),
					}),
				),
			).rejects.toThrow("Reset token has expired");
		});

		test("throws on invalid validator in handleResetPassword", async () => {
			config = makeConfig({
				userLookup: async () => ({
					userId: "user-1",
					email: "test@example.com",
					username: "testuser",
				}),
				resetPasswordRateLimit: { maxAttempts: 100, windowMs: 60000 },
			});
			manager = passwordReset(config);
			await manager.requestReset("test@example.com");
			await expect(
				manager.handleResetPassword(
					new Request("http://localhost", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							token: "bad-selector.bad-validator",
							newPassword: "new-password-123",
						}),
					}),
				),
			).rejects.toThrow();
		});

		test("handleForgotPassword with x-forwarded-for header", async () => {
			config = makeConfig({
				userLookup: async (_emailOrUsername) => ({
					userId: "user-1",
					email: "test@example.com",
					username: "testuser",
				}),
				forgotPasswordRateLimit: { maxAttempts: 100, windowMs: 60000 },
			});
			manager = passwordReset(config);
			const res = await manager.handleForgotPassword(
				new Request("http://localhost", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"x-forwarded-for": "10.0.0.1",
					},
					body: JSON.stringify({ emailOrUsername: "test@example.com" }),
				}),
			);
			expect(res?.status).toBe(200);
		});

		test("handleForgotPassword with x-real-ip header", async () => {
			config = makeConfig({
				userLookup: async (_emailOrUsername) => ({
					userId: "user-1",
					email: "test@example.com",
					username: "testuser",
				}),
				forgotPasswordRateLimit: { maxAttempts: 100, windowMs: 60000 },
			});
			manager = passwordReset(config);
			const res = await manager.handleForgotPassword(
				new Request("http://localhost", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"x-real-ip": "10.0.0.2",
					},
					body: JSON.stringify({ emailOrUsername: "test@example.com" }),
				}),
			);
			expect(res?.status).toBe(200);
		});

		test("handleForgotPassword with cf-connecting-ip header", async () => {
			config = makeConfig({
				userLookup: async (_emailOrUsername) => ({
					userId: "user-1",
					email: "test@example.com",
					username: "testuser",
				}),
				forgotPasswordRateLimit: { maxAttempts: 100, windowMs: 60000 },
			});
			manager = passwordReset(config);
			const res = await manager.handleForgotPassword(
				new Request("http://localhost", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"cf-connecting-ip": "10.0.0.3",
					},
					body: JSON.stringify({ emailOrUsername: "test@example.com" }),
				}),
			);
			expect(res?.status).toBe(200);
		});

		test("handleForgotPassword rate limited with x-forwarded-for", async () => {
			let fail = true;
			const configLimited = makeConfig({
				forgotPasswordRateLimit: { maxAttempts: 1, windowMs: 60000 },
				notifier: {
					async send() {
						if (fail) {
							fail = false;
							throw new Error("fail to trigger rate limit");
						}
					},
				},
				userLookup: async () => ({
					userId: "user-1",
					email: "test@example.com",
					username: "testuser",
				}),
			});
			const m = passwordReset(configLimited);
			const req = (ip: string) =>
				new Request("http://localhost", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"x-forwarded-for": ip,
					},
					body: JSON.stringify({ emailOrUsername: "test@example.com" }),
				});
			await m.handleForgotPassword(req("192.168.1.1")).catch(() => {});
			await expect(m.handleForgotPassword(req("192.168.1.1"))).rejects.toThrow(
				AuthError,
			);
		});

		test("handleResetPassword rate limited", async () => {
			const configLimited = makeConfig({
				forgotPasswordRateLimit: { maxAttempts: 100, windowMs: 60000 },
				resetPasswordRateLimit: { maxAttempts: 1, windowMs: 60000 },
				storage: {
					create: async () => {},
					findBySelector: async () => {
						throw new Error("Generic error to trigger rate limit");
					},
					delete: async () => {},
					consume: async () => null,
				},
				userLookup: async () => ({
					userId: "user-1",
					email: "test@example.com",
					username: "testuser",
				}),
			});
			const m = passwordReset(configLimited);
			const req = (ip: string) =>
				new Request("http://localhost", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"x-forwarded-for": ip,
					},
					body: JSON.stringify({
						token: "a.b",
						newPassword: "new-password-123",
					}),
				});
			await m.handleResetPassword(req("10.0.0.1")).catch(() => {});
			await expect(m.handleResetPassword(req("10.0.0.1"))).rejects.toThrow(
				AuthError,
			);
		});

		test("consumeResetToken throws on expired token", async () => {
			let capturedToken = "";
			config = makeConfig({
				tokenExpirationSeconds: 0,
				notifier: {
					async send({ selector, validator }) {
						capturedToken = `${selector}.${validator}`;
					},
				},
				userLookup: async () => ({
					userId: "user-1",
					email: "test@example.com",
					username: "testuser",
				}),
			});
			manager = passwordReset(config);
			await manager.requestReset("test@example.com");
			await new Promise((r) => setTimeout(r, 5));
			await expect(manager.consumeResetToken(capturedToken)).rejects.toThrow(
				"Reset token has expired",
			);
		});

		test("consumeResetToken throws on invalid validator", async () => {
			const hasher = createMockHasher();
			config = makeConfig({
				hasher,
				notifier: {
					async send() {},
				},
				userLookup: async () => ({
					userId: "user-1",
					email: "test@example.com",
					username: "testuser",
				}),
			});
			manager = passwordReset(config);
			await manager.requestReset("test@example.com");
			await expect(
				manager.consumeResetToken("bad-selector.bad-validator"),
			).rejects.toThrow("Invalid or expired reset token");
		});

		test("handleForgotPassword with invalid x-forwarded-for (sanitizeIP fallback)", async () => {
			config = makeConfig({
				userLookup: async (_emailOrUsername) => ({
					userId: "user-1",
					email: "test@example.com",
					username: "testuser",
				}),
				forgotPasswordRateLimit: { maxAttempts: 100, windowMs: 60000 },
			});
			manager = passwordReset(config);
			const res = await manager.handleForgotPassword(
				new Request("http://localhost", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"x-forwarded-for": "invalid-ip-format!",
					},
					body: JSON.stringify({ emailOrUsername: "test@example.com" }),
				}),
			);
			expect(res?.status).toBe(200);
		});

		test("handleResetPassword with wrong validator hash", async () => {
			let capturedToken = "";
			config = makeConfig({
				notifier: {
					async send({ selector, validator }) {
						capturedToken = `${selector}.${validator}`;
					},
				},
				userLookup: async () => ({
					userId: "user-1",
					email: "test@example.com",
					username: "testuser",
				}),
				resetPasswordRateLimit: { maxAttempts: 100, windowMs: 60000 },
			});
			manager = passwordReset(config);
			await manager.requestReset("test@example.com");
			const parts = capturedToken.split(".");
			const tamperedToken = `${parts[0]}.different-validator-part`;
			await expect(
				manager.handleResetPassword(
					new Request("http://localhost", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							token: tamperedToken,
							newPassword: "new-password-123",
						}),
					}),
				),
			).rejects.toThrow("Invalid or expired reset token");
		});

		test("consumeResetToken with invalid validator", async () => {
			let capturedToken = "";
			config = makeConfig({
				notifier: {
					async send({ selector, validator }) {
						capturedToken = `${selector}.${validator}`;
					},
				},
				userLookup: async () => ({
					userId: "user-1",
					email: "test@example.com",
					username: "testuser",
				}),
			});
			manager = passwordReset(config);
			await manager.requestReset("test@example.com");
			const parts = capturedToken.split(".");
			const tamperedToken = `${parts[0]}.wrong-validator`;
			await expect(manager.consumeResetToken(tamperedToken)).rejects.toThrow(
				"Invalid or expired reset token",
			);
		});

		test("handleResetPassword rethrows generic errors after recording attempt", async () => {
			const configError = makeConfig({
				forgotPasswordRateLimit: { maxAttempts: 100, windowMs: 60000 },
				resetPasswordRateLimit: { maxAttempts: 100, windowMs: 60000 },
				storage: {
					create: async () => {},
					findBySelector: async () => {
						throw new Error("Unexpected storage error");
					},
					delete: async () => {},
					consume: async () => null,
				},
				userLookup: async () => ({
					userId: "user-1",
					email: "test@example.com",
					username: "testuser",
				}),
			});
			const m = passwordReset(configError);
			await expect(
				m.handleResetPassword(
					new Request("http://localhost", {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							"x-forwarded-for": "10.0.0.99",
						},
						body: JSON.stringify({
							token: "a.b",
							newPassword: "new-password-123",
						}),
					}),
				),
			).rejects.toThrow("Unexpected storage error");
		});
	});
});
