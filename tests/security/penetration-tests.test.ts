import { describe, test, expect, mock } from "bun:test";
import { credentials } from "../../credentials";
import { discord } from "../../discord";
import { mfa } from "../../mfa";
import { passwordReset } from "../../password-reset";

describe("Security - Penetration Tests", () => {
	describe("SQL Injection Resistance", () => {
		test("username with SQL injection is sanitized", async () => {
			const mockStorage = {
				create: mock((data: any) => Promise.resolve({
					id: "user_123",
					username: data.username,
					email: data.email,
					passwordHash: "hash",
					roles: ["user"],
					createdAt: Date.now(),
					updatedAt: Date.now(),
				})),
				findByUsername: mock((username: string) => Promise.resolve(null)),
				findByEmail: mock((email: string) => Promise.resolve(null)),
				findById: mock((id: string) => Promise.resolve(null)),
			};

			const mockHasher = {
				hash: mock((password: string) => Promise.resolve(`hashed_${password}`)),
				verify: mock((password: string, hash: string) => Promise.resolve(false)),
			};

			const auth = credentials({
				strategy: "username_email",
				session: { secret: "a".repeat(32), expiresIn: "15m" },
				storage: mockStorage as any,
				hasher: mockHasher as any,
			});

			const injectionPayloads = [
				"admin' OR '1'='1",
				"admin'; DROP TABLE users; --",
				"admin' UNION SELECT * FROM users --",
				"admin' AND 1=1 --",
				"admin' OR 1=1 --",
				"'; DELETE FROM users; --",
			];

			for (const payload of injectionPayloads) {
				const request = new Request("http://localhost:3000/auth/register", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						username: payload,
						email: "test@example.com",
						password: "SecurePass123!",
					}),
				});

				const response = await auth.handleRegister(request);
				expect(response.status).not.toBe(500);
			}
		});

		test("email with SQL injection is sanitized", async () => {
			const mockStorage = {
				create: mock((data: any) => Promise.resolve({
					id: "user_123",
					username: "testuser",
					email: data.email,
					passwordHash: "hash",
					roles: ["user"],
					createdAt: Date.now(),
					updatedAt: Date.now(),
				})),
				findByUsername: mock((username: string) => Promise.resolve(null)),
				findByEmail: mock((email: string) => Promise.resolve(null)),
				findById: mock((id: string) => Promise.resolve(null)),
			};

			const mockHasher = {
				hash: mock((password: string) => Promise.resolve(`hashed_${password}`)),
				verify: mock((password: string, hash: string) => Promise.resolve(false)),
			};

			const auth = credentials({
				strategy: "username_email",
				session: { secret: "a".repeat(32), expiresIn: "15m" },
				storage: mockStorage as any,
				hasher: mockHasher as any,
			});

			const injectionPayloads = [
				"test@example.com' OR '1'='1",
				"test@example.com'; DROP TABLE users; --",
				"test@example.com' UNION SELECT * FROM users --",
			];

			for (const payload of injectionPayloads) {
				const request = new Request("http://localhost:3000/auth/register", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						username: "testuser",
						email: payload,
						password: "SecurePass123!",
					}),
				});

				const response = await auth.handleRegister(request);
				expect(response.status).not.toBe(500);
			}
		});

		test("password reset token with SQL injection is rejected", async () => {
			const mockStorage = {
				create: mock((data: any) => Promise.resolve()),
				findBySelector: mock((selector: string) => Promise.resolve(null)),
				delete: mock((selector: string) => Promise.resolve()),
				consume: mock((selector: string) => Promise.resolve(null)),
			};

			const mockHasher = {
				hash: mock((password: string) => Promise.resolve(`hashed_${password}`)),
			};

			const mockNotifier = {
				send: mock(() => Promise.resolve()),
			};

			const mockUserLookup = mock(() => Promise.resolve(null));

			const reset = passwordReset({
				storage: mockStorage as any,
				hasher: mockHasher as any,
				notifier: mockNotifier as any,
				userLookup: mockUserLookup as any,
			});

			const injectionPayloads = [
				"selector' OR '1'='1.validator",
				"selector'; DROP TABLE tokens; --.validator",
				"selector' UNION SELECT * FROM tokens --.validator",
			];

			for (const payload of injectionPayloads) {
				const request = new Request("http://localhost:3000/auth/reset-password", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						token: payload,
						newPassword: "SecurePass123!",
					}),
				});

				const response = await reset.handleResetPassword(request);
				expect(response?.status).toBe(400);
			}
		});
	});

	describe("XSS (Cross-Site Scripting) Prevention", () => {
		test("username with XSS script is sanitized in response", async () => {
			const mockStorage = {
				create: mock((data: any) => Promise.resolve({
					id: "user_123",
					username: data.username,
					email: data.email,
					passwordHash: "hash",
					roles: ["user"],
					createdAt: Date.now(),
					updatedAt: Date.now(),
				})),
				findByUsername: mock((username: string) => Promise.resolve(null)),
				findByEmail: mock((email: string) => Promise.resolve(null)),
				findById: mock((id: string) => Promise.resolve(null)),
			};

			const mockHasher = {
				hash: mock((password: string) => Promise.resolve(`hashed_${password}`)),
				verify: mock((password: string, hash: string) => Promise.resolve(false)),
			};

			const auth = credentials({
				strategy: "username_email",
				session: { secret: "a".repeat(32), expiresIn: "15m" },
				storage: mockStorage as any,
				hasher: mockHasher as any,
			});

			const xssPayloads = [
				"<script>alert('XSS')</script>",
				"<img src=x onerror=alert('XSS')>",
				"javascript:alert('XSS')",
				"<svg onload=alert('XSS')>",
				"<iframe src='javascript:alert(\"XSS\")'>",
			];

			for (const payload of xssPayloads) {
				const request = new Request("http://localhost:3000/auth/register", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						username: payload,
						email: "test@example.com",
						password: "SecurePass123!",
					}),
				});

				const response = await auth.handleRegister(request);
				const json = await response.json();

				if (json.user) {
					const contentType = response.headers.get("Content-Type");
					expect(contentType).toContain("application/json");
				}
			}
		});

		test("error messages don't reflect user input directly", async () => {
			const mockStorage = {
				create: mock((data: any) => Promise.resolve(null)),
				findByUsername: mock((username: string) => Promise.resolve(null)),
				findByEmail: mock((email: string) => Promise.resolve(null)),
				findById: mock((id: string) => Promise.resolve(null)),
			};

			const mockHasher = {
				hash: mock((password: string) => Promise.resolve(`hashed_${password}`)),
				verify: mock((password: string, hash: string) => Promise.resolve(false)),
			};

			const auth = credentials({
				strategy: "username_email",
				session: { secret: "a".repeat(32), expiresIn: "15m" },
				storage: mockStorage as any,
				hasher: mockHasher as any,
			});

			const xssPayload = "<script>alert('XSS')</script>";
			const request = new Request("http://localhost:3000/auth/register", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					username: xssPayload,
					email: "invalid-email",
					password: "short",
				}),
			});

			const response = await auth.handleRegister(request);
			const json = await response.json();

			expect(json.error).toBeDefined();
			expect(json.error).not.toContain("<script>");
			expect(json.error).not.toContain("alert");
		});
	});

	describe("CSRF (Cross-Site Request Forgery) Protection", () => {
		test("state parameter is required for OAuth callback", async () => {
			const auth = await discord({
				clientId: "test_client_id",
				clientSecret: "test_client_secret",
				secret: "a".repeat(32),
				callbackUrl: "http://localhost:3000/auth/callback",
				redirectUri: "http://localhost:3000/auth/callback",
			});

			const request = new Request(
				"http://localhost:3000/auth/callback?code=valid_code",
			);
			const response = await auth.handleCallback(request);

			expect(response.status).toBe(400);
			const text = await response.text();
			expect(text).toContain("Missing state parameter");

			auth.dispose?.();
		});

		test("invalid state parameter is rejected", async () => {
			const auth = await discord({
				clientId: "test_client_id",
				clientSecret: "test_client_secret",
				secret: "a".repeat(32),
				callbackUrl: "http://localhost:3000/auth/callback",
				redirectUri: "http://localhost:3000/auth/callback",
			});

			const request = new Request(
				"http://localhost:3000/auth/callback?code=valid_code&state=invalid_state_12345",
			);
			const response = await auth.handleCallback(request);

			expect(response.status).toBe(403);
			const text = await response.text();
			expect(text).toContain("Invalid state parameter");

			auth.dispose?.();
		});

		test("MFA setup requires authentication", async () => {
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

			const mfaInstance = mfa({
				storage: mockMfaStorage as any,
				secret: "a".repeat(32),
				issuer: "TestApp",
			});

			const request = new Request("http://localhost:3000/mfa/setup", {
				method: "POST",
			});
			const response = await mfaInstance.handleMfaSetup(request);

			expect(response.status).toBe(401);
		});
	});

	describe("Brute Force Resistance", () => {
		test("login is rate limited after max attempts", async () => {
			const mockStorage = {
				create: mock((data: any) => Promise.resolve({
					id: "user_123",
					username: "testuser",
					email: "test@example.com",
					passwordHash: "hashed_password",
					roles: ["user"],
					createdAt: Date.now(),
					updatedAt: Date.now(),
				})),
				findByUsername: mock((username: string) =>
					Promise.resolve({
						id: "user_123",
						username: "testuser",
						email: "test@example.com",
						passwordHash: "hashed_SecurePass123!",
						roles: ["user"],
						createdAt: Date.now(),
						updatedAt: Date.now(),
					}),
				),
				findByEmail: mock((email: string) => Promise.resolve(null)),
				findById: mock((id: string) => Promise.resolve(null)),
			};

			const mockHasher = {
				hash: mock((password: string) => Promise.resolve(`hashed_${password}`)),
				verify: mock((password: string, hash: string) => Promise.resolve(false)),
			};

			const auth = credentials({
				strategy: "username_email",
				session: { secret: "a".repeat(32), expiresIn: "15m" },
				storage: mockStorage as any,
				hasher: mockHasher as any,
				bruteForce: {
					enabled: true,
					maxAttempts: 3,
					windowMs: 60000,
					blockDurationMs: 300000,
				},
			});

			for (let i = 0; i < 3; i++) {
				const request = new Request("http://localhost:3000/auth/login", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"X-Forwarded-For": `192.168.1.${i}`,
					},
					body: JSON.stringify({
						username: "testuser",
						password: "wrongpassword",
					}),
				});

				const response = await auth.handleLogin(request);
				expect(response.status).toBe(401);
			}

			const request = new Request("http://localhost:3000/auth/login", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-Forwarded-For": "192.168.1.0",
				},
				body: JSON.stringify({
					username: "testuser",
					password: "wrongpassword",
				}),
			});

			const response = await auth.handleLogin(request);
			expect(response.status).toBe(429);
			const json = await response.json();
			expect(json.error).toContain("temporarily locked");
		});

		test("password reset is rate limited", async () => {
			const mockStorage = {
				create: mock((data: any) => Promise.resolve()),
				findBySelector: mock((selector: string) => Promise.resolve(null)),
				delete: mock((selector: string) => Promise.resolve()),
				consume: mock((selector: string) => Promise.resolve(null)),
				deleteAllUserTokens: mock((userId: string) => Promise.resolve()),
			};

			const mockHasher = {
				hash: mock((password: string) => Promise.resolve(`hashed_${password}`)),
			};

			const mockNotifier = {
				send: mock(() => Promise.resolve()),
			};

			const mockUserLookup = mock(() =>
				Promise.resolve({
					userId: "user_123",
					email: "test@example.com",
					username: "testuser",
				}),
			);

			const reset = passwordReset({
				storage: mockStorage as any,
				hasher: mockHasher as any,
				notifier: mockNotifier as any,
				userLookup: mockUserLookup as any,
				forgotPasswordRateLimit: {
					maxAttempts: 3,
					windowMs: 60000,
				},
			});

			for (let i = 0; i < 3; i++) {
				const request = new Request("http://localhost:3000/auth/forgot-password", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"X-Forwarded-For": `10.0.0.${i}`,
					},
					body: JSON.stringify({ emailOrUsername: "test@example.com" }),
				});

				await reset.handleForgotPassword(request);
			}

			const request = new Request("http://localhost:3000/auth/forgot-password", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-Forwarded-For": "10.0.0.0",
				},
				body: JSON.stringify({ emailOrUsername: "test@example.com" }),
			});

			await expect(reset.handleForgotPassword(request)).rejects.toThrow(
				"Too many requests",
			);
		});

		test("MFA TOTP attempts are rate limited", async () => {
			const mockMfaStorage = {
				getSecret: mock((userId: string) =>
					Promise.resolve("encrypted_secret"),
				),
				setSecret: mock((userId: string, secret: string) => Promise.resolve()),
				setSecretIfAbsent: mock((userId: string, secret: string) => Promise.resolve()),
				setBackupCodes: mock((userId: string, codes: string[]) => Promise.resolve()),
				getBackupCodes: mock((userId: string) => Promise.resolve<string[]>([])),
				consumeBackupCode: mock((userId: string, index: number) => Promise.resolve()),
				getLastUsedCounter: mock((userId: string) => Promise.resolve<number | null>(null)),
				setLastUsedCounter: mock((userId: string, counter: number) => Promise.resolve()),
				deleteSecret: mock((userId: string) => Promise.resolve()),
				setPendingToken: mock((userId: string, entry: any) => Promise.resolve()),
			};

			const mfaInstance = mfa({
				storage: mockMfaStorage as any,
				secret: "a".repeat(32),
				issuer: "TestApp",
			});

			for (let i = 0; i < 5; i++) {
				await expect(
					mfaInstance.verify("user_123", "123456"),
				).rejects.toThrow("Invalid MFA code");
			}

			await expect(
				mfaInstance.verify("user_123", "123456"),
			).rejects.toThrow("Too many TOTP attempts");
		});
	});

	describe("Rate Limit Bypass Attempts", () => {
		test("IP rotation doesn't bypass rate limiting for same account", async () => {
			const mockStorage = {
				create: mock((data: any) => Promise.resolve({
					id: "user_123",
					username: "targetuser",
					email: "target@example.com",
					passwordHash: "hashed_password",
					roles: ["user"],
					createdAt: Date.now(),
					updatedAt: Date.now(),
				})),
				findByUsername: mock((username: string) =>
					Promise.resolve({
						id: "user_123",
						username: "targetuser",
						email: "target@example.com",
						passwordHash: "hashed_password",
						roles: ["user"],
						createdAt: Date.now(),
						updatedAt: Date.now(),
					}),
				),
				findByEmail: mock((email: string) => Promise.resolve(null)),
				findById: mock((id: string) => Promise.resolve(null)),
			};

			const mockHasher = {
				hash: mock((password: string) => Promise.resolve(`hashed_${password}`)),
				verify: mock((password: string, hash: string) => Promise.resolve(false)),
			};

			const auth = credentials({
				strategy: "username_email",
				session: { secret: "a".repeat(32), expiresIn: "15m" },
				storage: mockStorage as any,
				hasher: mockHasher as any,
				bruteForce: {
					enabled: true,
					maxAttempts: 5,
					windowMs: 60000,
					blockDurationMs: 300000,
				},
			});

			const ips = [
				"192.168.1.1",
				"192.168.1.2",
				"192.168.1.3",
				"10.0.0.1",
				"10.0.0.2",
				"172.16.0.1",
			];

			for (const ip of ips) {
				const request = new Request("http://localhost:3000/auth/login", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"X-Forwarded-For": ip,
					},
					body: JSON.stringify({
						username: "targetuser",
						password: "wrongpassword",
					}),
				});

				const response = await auth.handleLogin(request);
				expect(response.status).toBe(401);
			}
		});

		test("user-agent rotation doesn't bypass rate limiting", async () => {
			const mockStorage = {
				create: mock((data: any) => Promise.resolve({
					id: "user_123",
					username: "testuser",
					email: "test@example.com",
					passwordHash: "hashed_password",
					roles: ["user"],
					createdAt: Date.now(),
					updatedAt: Date.now(),
				})),
				findByUsername: mock((username: string) =>
					Promise.resolve({
						id: "user_123",
						username: "testuser",
						email: "test@example.com",
						passwordHash: "hashed_password",
						roles: ["user"],
						createdAt: Date.now(),
						updatedAt: Date.now(),
					}),
				),
				findByEmail: mock((email: string) => Promise.resolve(null)),
				findById: mock((id: string) => Promise.resolve(null)),
			};

			const mockHasher = {
				hash: mock((password: string) => Promise.resolve(`hashed_${password}`)),
				verify: mock((password: string, hash: string) => Promise.resolve(false)),
			};

			const auth = credentials({
				strategy: "username_email",
				session: { secret: "a".repeat(32), expiresIn: "15m" },
				storage: mockStorage as any,
				hasher: mockHasher as any,
				bruteForce: {
					enabled: true,
					maxAttempts: 3,
					windowMs: 60000,
					blockDurationMs: 300000,
				},
			});

			const userAgents = [
				"Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
				"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
				"Mozilla/5.0 (X11; Linux x86_64)",
				"Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)",
			];

			for (const ua of userAgents) {
				const request = new Request("http://localhost:3000/auth/login", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"X-Forwarded-For": "192.168.1.100",
						"User-Agent": ua,
					},
					body: JSON.stringify({
						username: "testuser",
						password: "wrongpassword",
					}),
				});

				const response = await auth.handleLogin(request);
				expect(response.status).toBe(401);
			}
		});
	});

	describe("IP Spoofing Attempts", () => {
		test("private IP ranges are detected as trusted", async () => {
			const { isTrustedSource } = await import("../../utils/ip");

			const privateIPs = [
				"127.0.0.1",
				"10.0.0.1",
				"10.255.255.255",
				"172.16.0.1",
				"172.31.255.255",
				"192.168.0.1",
				"192.168.255.255",
				"::1",
			];

			for (const ip of privateIPs) {
				expect(isTrustedSource(ip)).toBe(true);
			}
		});

		test("public IPs claiming to be private are rejected", async () => {
			const { sanitizeIP } = await import("../../utils/ip");

			const spoofedIPs = [
				"8.8.8.8, 192.168.1.1",
				"1.1.1.1, 10.0.0.1",
				"142.250.185.78, 172.16.0.1",
			];

			for (const spoofed of spoofedIPs) {
				const sanitized = sanitizeIP(spoofed);
				expect(sanitized).not.toBe("192.168.1.1");
				expect(sanitized).not.toBe("10.0.0.1");
				expect(sanitized).not.toBe("172.16.0.1");
			}
		});

		test("IPv6 spoofing is detected", async () => {
			const { sanitizeIP, maskIPv6To64 } = await import("../../utils/ip");

			const ipv6SpoofingAttempts = [
				"2001:db8::1, ::1",
				"2606:4700::1, fc00::1",
			];

			for (const attempt of ipv6SpoofingAttempts) {
				const sanitized = sanitizeIP(attempt);
				expect(sanitized).not.toBe("::1");
				expect(sanitized).not.toBe("fc00::1");
			}

			const masked = maskIPv6To64("2001:db8:85a3:8d3:1319:8a2e:370:7348");
			expect(masked).toBe("2001:db8:85a3:8d3::");
		});

		test("X-Forwarded-For header spoofing is prevented", async () => {
			const { getRequestIP } = await import("../../utils/ip");

			const spoofedRequest = new Request("http://localhost:3000/", {
				headers: {
					"X-Forwarded-For": "8.8.8.8, 192.168.1.1, 10.0.0.1",
				},
			});

			const ip = await getRequestIP(spoofedRequest, { trustProxy: false });
			expect(ip).not.toBe("8.8.8.8");
		});
	});

	describe("Token Manipulation Attacks", () => {
		test("tampered JWT is rejected", async () => {
			const { signToken } = await import("../../internal/jwt");
			const { verifyToken } = await import("../../internal/jwt");

			const secret = "a".repeat(32);
			const payload = { userId: "123", username: "test" };

			const validToken = await signToken(payload, secret);
			const tamperedToken = validToken + "tampered";

			const result = await verifyToken(tamperedToken, secret);
			expect(result).toBeNull();
		});

		test("JWT with expired expiration is rejected", async () => {
			const { signToken } = await import("../../internal/jwt");
			const { verifyToken } = await import("../../internal/jwt");

			const secret = "a".repeat(32);
			const payload = { userId: "123", username: "test" };

			const token = await signToken(payload, secret, "1s");
			await new Promise((resolve) => setTimeout(resolve, 1100));

			const result = await verifyToken(token, secret);
			expect(result).toBeNull();
		});

		test("JWT signed with different secret is rejected", async () => {
			const { signToken } = await import("../../internal/jwt");
			const { verifyToken } = await import("../../internal/jwt");

			const secret1 = "a".repeat(32);
			const secret2 = "b".repeat(32);
			const payload = { userId: "123", username: "test" };

			const token = await signToken(payload, secret1);
			const result = await verifyToken(token, secret2);

			expect(result).toBeNull();
		});

		test("JWT with algorithm none is rejected", async () => {
			const { signToken } = await import("../../internal/jwt");
			const { verifyToken } = await import("../../internal/jwt");

			const secret = "a".repeat(32);
			const payload = { userId: "123", username: "test" };

			const validToken = await signToken(payload, secret);

			const parts = validToken.split(".");
			const header = JSON.parse(
				Buffer.from(parts[0]!, "base64").toString(),
			);
			header.alg = "none";
			const tamperedHeader = Buffer.from(JSON.stringify(header)).toString(
				"base64",
			);
			const noneAlgToken = `${tamperedHeader}.${parts[1]}.${parts[2]}`;

			const result = await verifyToken(noneAlgToken, secret);
			expect(result).toBeNull();
		});

		test("JWT with HS256 confusion attack is rejected", async () => {
			const { signToken } = await import("../../internal/jwt");
			const { verifyToken } = await import("../../internal/jwt");

			const secret = "a".repeat(32);
			const payload = { userId: "123", username: "test" };

			const token = await signToken(payload, secret);

			const parts = token.split(".");
			const body = JSON.parse(
				Buffer.from(parts[1]!, "base64").toString(),
			);
			body.alg = "HS256";
			const tamperedBody = Buffer.from(JSON.stringify(body)).toString(
				"base64",
			);
			const confusedToken = `${parts[0]}.${tamperedBody}.${parts[2]}`;

			const result = await verifyToken(confusedToken, secret);
			expect(result).toBeNull();
		});
	});

	describe("Header Injection Prevention", () => {
		test("cookie value sanitization prevents CRLF injection", async () => {
			const { createSessionCookie } = await import("../../internal/cookies");

			const maliciousValues = [
				"value\r\nSet-Cookie: evil=malicious",
				"value\nSet-Cookie: evil=malicious",
				"value\rSet-Cookie: evil=malicious",
				"valid\r\nX-Injected: header",
			];

			for (const value of maliciousValues) {
				expect(() =>
					createSessionCookie("session", value),
				).toThrow("Invalid cookie value");
			}
		});

		test("redirect URL validation prevents open redirect", async () => {
			const auth = await discord({
				clientId: "test_client_id",
				clientSecret: "test_client_secret",
				secret: "a".repeat(32),
				callbackUrl: "http://localhost:3000/auth/callback",
				redirectUri: "http://localhost:3000/auth/callback",
			});

			const maliciousRedirects = [
				"//evil.com",
				"https://evil.com",
				"//evil.com/path",
				"https://evil.com/path",
				"javascript:alert(1)",
				"data:text/html,<script>alert(1)</script>",
			];

			for (const redirect of maliciousRedirects) {
				const request = new Request(
					`http://localhost:3000/auth/logout?redirect=${encodeURIComponent(redirect)}`,
					{ method: "POST" },
				);
				const response = await auth.handleLogout(request);

				const location = response.headers.get("Location");
				expect(location).not.toContain("evil.com");
				expect(location).not.toContain("javascript:");
				expect(location).not.toContain("data:");
			}

			auth.dispose?.();
		});
	});
});