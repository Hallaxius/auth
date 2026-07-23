import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { discord } from "../discord";
import { credentials } from "../credentials";
import { mfa } from "../mfa";
import { passwordReset } from "../password-reset";
import type { DiscordAuthResult, CredentialsResult } from "../types";

describe("Full Auth Flow - Integration Tests", () => {
	describe("Discord OAuth2 Flow", () => {
		let auth: DiscordAuthResult;
		const mockStorage = {
			create: mock((data: any) => Promise.resolve({
				id: "user_123",
				discordId: data.discordId,
				username: data.username,
				globalName: data.globalName,
				avatar: data.avatar,
				email: data.email,
				locale: data.locale,
				roles: data.roles || ["user"],
				mfaEnabled: data.mfaEnabled,
				accessToken: data.accessToken,
				refreshToken: data.refreshToken,
				tokenExpiresAt: data.tokenExpiresAt,
				createdAt: Date.now(),
				updatedAt: Date.now(),
			})),
			findByDiscordId: mock((id: string) => Promise.resolve(null)),
			update: mock((id: string, data: any) => Promise.resolve({
				id: "user_123",
				discordId: id,
				username: data.username,
				globalName: data.globalName,
				avatar: data.avatar,
				email: data.email,
				mfaEnabled: data.mfaEnabled,
				accessToken: data.accessToken,
				refreshToken: data.refreshToken,
				tokenExpiresAt: data.tokenExpiresAt,
				updatedAt: Date.now(),
			})),
		};

		beforeEach(async () => {
			mockStorage.create.mockClear();
			mockStorage.findByDiscordId.mockClear();
			mockStorage.update.mockClear();

			auth = await discord({
				clientId: "test_client_id",
				clientSecret: "test_client_secret",
				secret: "a".repeat(32),
				callbackUrl: "http://localhost:3000/auth/callback",
				redirectUri: "http://localhost:3000/auth/callback",
				storage: mockStorage as any,
			});
		});

		afterEach(() => {
			auth.dispose?.();
		});

		test("login handler redirects to Discord", async () => {
			const request = new Request("http://localhost:3000/auth/discord");
			const response = await auth.handleLogin(request);

			expect(response.status).toBe(302);
			const location = response.headers.get("Location");
			expect(location).toContain("https://discord.com/oauth2/authorize");
			expect(location).toContain("client_id=test_client_id");
			expect(location).toContain("response_type=code");
		});

		test("login handler includes state parameter", async () => {
			const request = new Request("http://localhost:3000/auth/discord");
			const response = await auth.handleLogin(request);

			const location = response.headers.get("Location");
			expect(location).toContain("state=");
		});

		test("callback handler rejects missing code", async () => {
			const request = new Request(
				"http://localhost:3000/auth/callback?state=abc123",
			);
			const response = await auth.handleCallback(request);

			expect(response.status).toBe(400);
			const text = await response.text();
			expect(text).toContain("Missing authorization code");
		});

		test("callback handler rejects missing state", async () => {
			const request = new Request(
				"http://localhost:3000/auth/callback?code=xyz789",
			);
			const response = await auth.handleCallback(request);

			expect(response.status).toBe(400);
			const text = await response.text();
			expect(text).toContain("Missing state parameter");
		});

		test("callback handler rejects invalid state", async () => {
			const request = new Request(
				"http://localhost:3000/auth/callback?code=xyz789&state=invalid_state",
			);
			const response = await auth.handleCallback(request);

			expect(response.status).toBe(403);
			const text = await response.text();
			expect(text).toContain("Invalid state parameter");
		});

		test("me handler returns 401 without session", async () => {
			const request = new Request("http://localhost:3000/auth/me");
			const response = await auth.handleMe(request);

			expect(response.status).toBe(401);
			const json = await response.json();
			expect(json).toEqual({ error: "Unauthorized" });
		});

		test("logout handler clears session cookie", async () => {
			const request = new Request("http://localhost:3000/auth/logout", {
				method: "POST",
			});
			const response = await auth.handleLogout(request);

			expect(response.status).toBe(302);
			const setCookie = response.headers.get("Set-Cookie");
			expect(setCookie).toContain("discord-auth-session=");
			expect(setCookie).toContain("Max-Age=0");
		});

		test("logout handler rejects non-POST method", async () => {
			const request = new Request("http://localhost:3000/auth/logout", {
				method: "GET",
			});
			const response = await auth.handleLogout(request);

			expect(response.status).toBe(405);
			const json = await response.json();
			expect(json).toEqual({ error: "Method not allowed" });
		});
	});

	describe("Credentials Registration/Login Flow", () => {
		let auth: CredentialsResult;
		const mockStorage = {
			create: mock((data: any) => Promise.resolve({
				id: `user_${Date.now()}`,
				username: data.username,
				email: data.email,
				passwordHash: data.passwordHash,
				roles: data.roles || ["user"],
				createdAt: Date.now(),
				updatedAt: Date.now(),
			})),
			findByUsername: mock((username: string) => Promise.resolve(null)),
			findByEmail: mock((email: string) => Promise.resolve(null)),
			findById: mock((id: string) => Promise.resolve({
				id,
				username: "testuser",
				email: "test@example.com",
				passwordHash: "hashed_password",
				roles: ["user"],
				createdAt: Date.now(),
				updatedAt: Date.now(),
			})),
		};

		const mockHasher = {
			hash: mock((password: string) => Promise.resolve(`hashed_${password}`)),
			verify: mock((password: string, hash: string) => {
				return Promise.resolve(hash === `hashed_${password}`);
			}),
		};

		beforeEach(() => {
			mockStorage.create.mockClear();
			mockStorage.findByUsername.mockClear();
			mockStorage.findByEmail.mockClear();
			mockStorage.findById.mockClear();
			mockHasher.hash.mockClear();
			mockHasher.verify.mockClear();

			auth = credentials({
				strategy: "username_email",
				session: {
					secret: "a".repeat(32),
					expiresIn: "15m",
				},
				storage: mockStorage as any,
				hasher: mockHasher as any,
			});
		});

		test("register creates new user", async () => {
			const request = new Request("http://localhost:3000/auth/register", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					username: "newuser",
					email: "new@example.com",
					password: "SecurePass123!",
				}),
			});
			const response = await auth.handleRegister(request);

			expect(response.status).toBe(201);
			const json = await response.json();
			expect(json.user).toBeDefined();
			expect(json.user.username).toBe("newuser");
			expect(json.token).toBeDefined();
		});

		test("register validates password length", async () => {
			const request = new Request("http://localhost:3000/auth/register", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					username: "newuser",
					email: "new@example.com",
					password: "short",
				}),
			});
			const response = await auth.handleRegister(request);

			expect(response.status).toBe(400);
			const json = await response.json();
			expect(json.error).toContain("Password must be at least");
		});

		test("register validates email format", async () => {
			const request = new Request("http://localhost:3000/auth/register", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					username: "newuser",
					email: "invalid-email",
					password: "SecurePass123!",
				}),
			});
			const response = await auth.handleRegister(request);

			expect(response.status).toBe(400);
			const json = await response.json();
			expect(json.error).toContain("Email format is invalid");
		});

		test("register rejects duplicate username", async () => {
			mockStorage.findByUsername.mockImplementationOnce(() =>
				Promise.resolve({
					id: "existing_user",
					username: "existing",
					email: "existing@example.com",
					passwordHash: "hash",
					roles: ["user"],
					createdAt: Date.now(),
					updatedAt: Date.now(),
				}),
			);

			const request = new Request("http://localhost:3000/auth/register", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					username: "existing",
					email: "new@example.com",
					password: "SecurePass123!",
				}),
			});
			const response = await auth.handleRegister(request);

			expect(response.status).toBe(409);
			const json = await response.json();
			expect(json.error).toContain("Username is already taken");
		});

		test("login with valid credentials returns token", async () => {
			mockStorage.findByUsername.mockImplementationOnce(() =>
				Promise.resolve({
					id: "user_123",
					username: "testuser",
					email: "test@example.com",
					passwordHash: "hashed_SecurePass123!",
					roles: ["user"],
					createdAt: Date.now(),
					updatedAt: Date.now(),
				}),
			);

			const request = new Request("http://localhost:3000/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					username: "testuser",
					password: "SecurePass123!",
				}),
			});
			const response = await auth.handleLogin(request);

			expect(response.status).toBe(200);
			const json = await response.json();
			expect(json.user).toBeDefined();
			expect(json.token).toBeDefined();
		});

		test("login with invalid credentials returns 401", async () => {
			mockStorage.findByUsername.mockImplementationOnce(() =>
				Promise.resolve({
					id: "user_123",
					username: "testuser",
					email: "test@example.com",
					passwordHash: "hashed_correctpassword",
					roles: ["user"],
					createdAt: Date.now(),
					updatedAt: Date.now(),
				}),
			);

			const request = new Request("http://localhost:3000/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					username: "testuser",
					password: "wrongpassword",
				}),
			});
			const response = await auth.handleLogin(request);

			expect(response.status).toBe(401);
			const json = await response.json();
			expect(json.error).toContain("Invalid credentials");
		});

		test("me handler returns user data", async () => {
			const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c2VyXzEyMyIsInVzZXJuYW1lIjoidGVzdHVzZXIiLCJlbWFpbCI6InRlc3RAZXhhbXBsZS5jb20iLCJyb2xlcyI6WyJ1c2VyIl0sImlhdCI6MTYwMDAwMDAwMCwiZXhwIjoxNjAwMDAwOTAwfQ.test_signature";
			
			const request = new Request("http://localhost:3000/auth/me", {
				headers: {
					Cookie: `credentials-session=${token}`,
				},
			});
			const response = await auth.handleMe(request);

			expect(response.status).toBe(200);
		});

		test("logout clears session cookie", async () => {
			const request = new Request("http://localhost:3000/auth/logout", {
				method: "POST",
			});
			const response = await auth.handleLogout(request);

			expect(response.status).toBe(200);
			const setCookie = response.headers.get("Set-Cookie");
			expect(setCookie).toContain("credentials-session=");
			expect(setCookie).toContain("Max-Age=0");
		});
	});

	describe("MFA Setup/Verify Flow", () => {
		let mfaInstance: ReturnType<typeof mfa>;
		const mockMfaStorage = {
			getSecret: mock((userId: string) => Promise.resolve<string | null>(null)),
			setSecret: mock((userId: string, secret: string) => Promise.resolve()),
			setSecretIfAbsent: mock((userId: string, secret: string) => Promise.resolve(true)),
			setBackupCodes: mock((userId: string, codes: string[]) => Promise.resolve()),
			getBackupCodes: mock((userId: string) => Promise.resolve<string[]>([])),
			consumeBackupCode: mock((userId: string, index: number) => Promise.resolve()),
			getLastUsedCounter: mock((userId: string) => Promise.resolve<number | null>(null)),
			setLastUsedCounter: mock((userId: string, counter: number) => Promise.resolve()),
			deleteSecret: mock((userId: string) => Promise.resolve()),
			setPendingToken: mock((userId: string, entry: any) => Promise.resolve()),
		};

		beforeEach(() => {
			mockMfaStorage.getSecret.mockClear();
			mockMfaStorage.setSecret.mockClear();
			mockMfaStorage.setBackupCodes.mockClear();
			mockMfaStorage.getBackupCodes.mockClear();
			mockMfaStorage.consumeBackupCode.mockClear();
			mockMfaStorage.getLastUsedCounter.mockClear();
			mockMfaStorage.setLastUsedCounter.mockClear();

			mfaInstance = mfa({
				storage: mockMfaStorage as any,
				secret: "a".repeat(32),
				issuer: "TestApp",
			});
		});

		test("setup generates TOTP URI and backup codes", async () => {
			const result = await mfaInstance.setup("user_123");

			expect(result.uri).toContain("otpauth://totp/");
			expect(result.uri).toContain("TestApp");
			expect(result.uri).toContain("user_123");
			expect(result.secret).toBeDefined();
			expect(result.backupCodes).toHaveLength(10);
			expect(result.pendingToken).toBeDefined();
		});

		test("setup fails if MFA already configured", async () => {
			mockMfaStorage.getSecret.mockImplementationOnce(() =>
				Promise.resolve("existing_secret"),
			);

			await expect(mfaInstance.setup("user_123")).rejects.toThrow(
				"MFA is already configured",
			);
		});

		test("verify rejects invalid code format", async () => {
			mockMfaStorage.getSecret.mockImplementationOnce(() =>
				Promise.resolve("encrypted_secret"),
			);

			await expect(
				mfaInstance.verify("user_123", "12345"),
			).rejects.toThrow("Invalid MFA code format");
		});

		test("verify rejects when MFA not setup", async () => {
			mockMfaStorage.getSecret.mockImplementationOnce(() =>
				Promise.resolve(null),
			);

			await expect(
				mfaInstance.verify("user_123", "123456"),
			).rejects.toThrow("MFA not configured");
		});

		test("isEnabled returns false when no secret", async () => {
			mockMfaStorage.getSecret.mockImplementationOnce(() =>
				Promise.resolve(null),
			);

			const result = await mfaInstance.isEnabled("user_123");
			expect(result).toBe(false);
		});

		test("disable removes MFA secret", async () => {
			await mfaInstance.disable("user_123");
			expect(mockMfaStorage.deleteSecret).toHaveBeenCalledWith("user_123");
		});

		test("handleMfaSetup requires POST method", async () => {
			const request = new Request("http://localhost:3000/mfa/setup", {
				method: "GET",
			});
			const response = await mfaInstance.handleMfaSetup(request);

			expect(response.status).toBe(405);
		});

		test("handleMfaVerify requires POST method", async () => {
			const request = new Request("http://localhost:3000/mfa/verify", {
				method: "GET",
			});
			const response = await mfaInstance.handleMfaVerify(request);

			expect(response.status).toBe(405);
		});

		test("handleMfaDisable requires POST method", async () => {
			const request = new Request("http://localhost:3000/mfa/disable", {
				method: "GET",
			});
			const response = await mfaInstance.handleMfaDisable(request);

			expect(response.status).toBe(405);
		});
	});

	describe("Password Reset Flow", () => {
		let reset: ReturnType<typeof passwordReset>;
		const mockStorage = {
			create: mock((data: any) => Promise.resolve()),
			findBySelector: mock((selector: string) =>
				Promise.resolve<{
					userId: string;
					email: string;
					username: string;
					validatorHash: string;
					expiry: number;
				} | null>(null),
			),
			delete: mock((selector: string) => Promise.resolve()),
			deleteAllUserTokens: mock((userId: string) => Promise.resolve()),
			consume: mock((selector: string) =>
				Promise.resolve<{
					userId: string;
					email: string;
					username: string;
				} | null>(null),
			),
		};

		const mockHasher = {
			hash: mock((password: string) => Promise.resolve(`hashed_${password}`)),
		};

		const mockNotifier = {
			send: mock(
				(
					token: { selector: string; validator: string },
					userId: string,
					email: string,
					username: string,
				) => Promise.resolve(),
			),
		};

		const mockUserLookup = mock((emailOrUsername: string) =>
			Promise.resolve<{
				userId: string;
				email: string;
				username: string;
			} | null>({
				userId: "user_123",
				email: "test@example.com",
				username: "testuser",
			}),
		);

		beforeEach(() => {
			mockStorage.create.mockClear();
			mockStorage.findBySelector.mockClear();
			mockStorage.delete.mockClear();
			mockStorage.consume.mockClear();
			mockHasher.hash.mockClear();
			mockNotifier.send.mockClear();
			mockUserLookup.mockClear();

			reset = passwordReset({
				storage: mockStorage as any,
				hasher: mockHasher as any,
				notifier: mockNotifier as any,
				userLookup: mockUserLookup as any,
			});
		});

		test("requestReset generates token and notifies user", async () => {
			const result = await reset.requestReset("test@example.com");

			expect(result.processed).toBe(true);
			expect(mockStorage.create).toHaveBeenCalled();
			expect(mockNotifier.send).toHaveBeenCalled();
		});

		test("handleForgotPassword requires POST method", async () => {
			const request = new Request("http://localhost:3000/auth/forgot-password", {
				method: "GET",
			});
			const response = await reset.handleForgotPassword(request);

			expect(response?.status).toBe(405);
		});

		test("handleForgotPassword accepts valid JSON", async () => {
			const request = new Request("http://localhost:3000/auth/forgot-password", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ emailOrUsername: "test@example.com" }),
			});
			const response = await reset.handleForgotPassword(request);

			expect(response?.status).toBe(200);
			const json = await response?.json();
			expect(json?.success).toBe(true);
		});

		test("handleResetPassword requires POST method", async () => {
			const request = new Request("http://localhost:3000/auth/reset-password", {
				method: "GET",
			});
			const response = await reset.handleResetPassword(request);

			expect(response?.status).toBe(405);
		});

		test("handleResetPassword validates password length", async () => {
			const request = new Request("http://localhost:3000/auth/reset-password", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					token: "selector.validator",
					newPassword: "short",
				}),
			});
			const response = await reset.handleResetPassword(request);

			expect(response?.status).toBe(400);
		});

		test("handleResetPassword rejects invalid token format", async () => {
			const request = new Request("http://localhost:3000/auth/reset-password", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					token: "invalid_token",
					newPassword: "SecurePass123!",
				}),
			});
			const response = await reset.handleResetPassword(request);

			expect(response?.status).toBe(400);
		});

		test("handleResetPassword rejects non-existent token", async () => {
			const request = new Request("http://localhost:3000/auth/reset-password", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					token: "selector.validator",
					newPassword: "SecurePass123!",
				}),
			});
			const response = await reset.handleResetPassword(request);

			expect(response?.status).toBe(400);
		});

		test("consumeResetToken validates token", async () => {
			mockStorage.findBySelector.mockImplementationOnce(() =>
				Promise.resolve({
					userId: "user_123",
					email: "test@example.com",
					username: "testuser",
					validatorHash: "hash",
					expiry: Date.now() + 3600000,
				}),
			);

			await expect(reset.consumeResetToken("selector.validator")).rejects.toThrow(
				"Invalid or expired reset token",
			);
		});
	});

	describe("Rate Limiting Integration", () => {
		test("brute force protection blocks after max attempts", async () => {
			const { BruteForceProtection, MemoryBruteForceStorage } = await import("../credentials");

			const storage = new MemoryBruteForceStorage();
			const bruteForce = new BruteForceProtection({
				enabled: true,
				maxAttempts: 3,
				windowMs: 60000,
				blockDurationMs: 300000,
				storage,
			});

			const key = "test_user";

			for (let i = 0; i < 3; i++) {
				const result = await bruteForce.recordAttempt(key);
				expect(result.allowed).toBe(true);
			}

			const result = await bruteForce.recordAttempt(key);
			expect(result.allowed).toBe(false);
			expect(result.retryAfter).toBe(300000);
		});

		test("brute force protection resets after window", async () => {
			const { BruteForceProtection, MemoryBruteForceStorage } = await import("../credentials");

			const storage = new MemoryBruteForceStorage();
			const bruteForce = new BruteForceProtection({
				enabled: true,
				maxAttempts: 2,
				windowMs: 100,
				blockDurationMs: 100,
				storage,
			});

			const key = "test_user_2";

			await bruteForce.recordAttempt(key);
			await bruteForce.recordAttempt(key);

			await new Promise((resolve) => setTimeout(resolve, 150));

			const result = await bruteForce.recordAttempt(key);
			expect(result.allowed).toBe(true);
		});

		test("isBlocked returns correct status", async () => {
			const { BruteForceProtection, MemoryBruteForceStorage } = await import("../credentials");

			const storage = new MemoryBruteForceStorage();
			const bruteForce = new BruteForceProtection({
				enabled: true,
				maxAttempts: 1,
				windowMs: 60000,
				blockDurationMs: 300000,
				storage,
			});

			const key = "test_user_3";

			let blocked = await bruteForce.isBlocked(key);
			expect(blocked).toBe(false);

			await bruteForce.recordAttempt(key);
			blocked = await bruteForce.isBlocked(key);
			expect(blocked).toBe(true);
		});

		test("getRemainingAttempts decrements correctly", async () => {
			const { BruteForceProtection, MemoryBruteForceStorage } = await import("../credentials");

			const storage = new MemoryBruteForceStorage();
			const bruteForce = new BruteForceProtection({
				enabled: true,
				maxAttempts: 5,
				windowMs: 60000,
				blockDurationMs: 300000,
				storage,
			});

			const key = "test_user_4";

			let remaining = await bruteForce.getRemainingAttempts(key);
			expect(remaining).toBe(5);

			await bruteForce.recordAttempt(key);
			remaining = await bruteForce.getRemainingAttempts(key);
			expect(remaining).toBe(4);

			await bruteForce.recordAttempt(key);
			remaining = await bruteForce.getRemainingAttempts(key);
			expect(remaining).toBe(3);
		});

		test("reset clears attempts", async () => {
			const { BruteForceProtection, MemoryBruteForceStorage } = await import("../credentials");

			const storage = new MemoryBruteForceStorage();
			const bruteForce = new BruteForceProtection({
				enabled: true,
				maxAttempts: 2,
				windowMs: 60000,
				blockDurationMs: 300000,
				storage,
			});

			const key = "test_user_5";

			await bruteForce.recordAttempt(key);
			await bruteForce.recordAttempt(key);

			let blocked = await bruteForce.isBlocked(key);
			expect(blocked).toBe(true);

			await bruteForce.reset(key);

			blocked = await bruteForce.isBlocked(key);
			expect(blocked).toBe(false);

			const remaining = await bruteForce.getRemainingAttempts(key);
			expect(remaining).toBe(2);
		});
	});
});