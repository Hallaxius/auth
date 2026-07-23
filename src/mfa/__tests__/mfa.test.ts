import { beforeEach, describe, expect, test } from "vitest";
import { AuthError, ErrorCodes } from "../errors";
import { mfa } from "../mfa";
import type { MfaStorage } from "../types";

class InMemoryMfaTestStorage implements MfaStorage {
	private secrets = new Map<string, string>();
	private codes = new Map<string, string[]>();
	private lastUsedCounters = new Map<string, number>();

	async getSecret(userId: string): Promise<string | null> {
		return this.secrets.get(userId) ?? null;
	}

	async setSecret(userId: string, encryptedSecret: string): Promise<void> {
		this.secrets.set(userId, encryptedSecret);
	}

	async deleteSecret(userId: string): Promise<void> {
		this.secrets.delete(userId);
		this.codes.delete(userId);
		this.lastUsedCounters.delete(userId);
	}

	async getBackupCodes(userId: string): Promise<string[] | null> {
		return this.codes.get(userId) ?? null;
	}

	async setBackupCodes(userId: string, hashedCodes: string[]): Promise<void> {
		this.codes.set(userId, [...hashedCodes]);
	}

	async consumeBackupCode(userId: string, codeIndex: number): Promise<void> {
		const codes = this.codes.get(userId);
		if (!codes) return;
		codes.splice(codeIndex, 1);
	}

	async getLastUsedCounter(userId: string): Promise<number | null> {
		return this.lastUsedCounters.get(userId) ?? null;
	}

	async setLastUsedCounter(userId: string, counter: number): Promise<void> {
		this.lastUsedCounters.set(userId, counter);
	}
}

class MockVerifyPassword {
	private passwords = new Map<string, string>();

	setPassword(userId: string, password: string) {
		this.passwords.set(userId, password);
	}

	async verify(userId: string, password: string): Promise<boolean> {
		return this.passwords.get(userId) === password;
	}
}

function createMfaConfig(
	overrides: Partial<{
		storage: MfaStorage;
		secret: string;
		issuer: string;
		allowedMethods: ("totp" | "backup_codes")[];
		verifyPassword: (userId: string, password: string) => Promise<boolean>;
	}> = {},
) {
	return {
		storage: overrides.storage ?? new InMemoryMfaTestStorage(),
		secret: overrides.secret ?? process.env.TEST_SECRET || "fallback-32-char-secret-key!!",
		issuer: overrides.issuer ?? "TestApp",
		allowedMethods: overrides.allowedMethods ?? ["totp", "backup_codes"],
		verifyPassword: overrides.verifyPassword,
	};
}

async function generateTotpCode(
	encryptedSecret: string,
	secret: string,
): Promise<string> {
	const { decrypt } = await import("../internal/crypto-aes");
	const decryptedSecret = await decrypt(encryptedSecret, secret);

	const base32Decode = (encoded: string): Uint8Array => {
		const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
		const clean = encoded.replace(/=+$/, "").toUpperCase();
		const bytes: number[] = [];
		let bits = 0;
		let value = 0;
		for (const char of clean) {
			const idx = alphabet.indexOf(char);
			if (idx === -1) continue;
			value = (value << 5) | idx;
			bits += 5;
			if (bits >= 8) {
				bits -= 8;
				bytes.push((value >> bits) & 0xff);
			}
		}
		return new Uint8Array(bytes);
	};

	const key = base32Decode(decryptedSecret);
	const now = Math.floor(Date.now() / 1000);
	const counter = Math.floor(now / 30);
	const counterBuf = new Uint8Array(8);
	const view = new DataView(counterBuf.buffer);
	view.setBigUint64(0, BigInt(counter), false);

	const cryptoKey = await crypto.subtle.importKey(
		"raw",
		key.buffer as ArrayBuffer,
		{ name: "HMAC", hash: "SHA-1" },
		false,
		["sign"],
	);
	const hmac = new Uint8Array(
		await crypto.subtle.sign("HMAC", cryptoKey, counterBuf),
	);
	const offset = hmac[hmac.length - 1] & 0xf;
	const code =
		((hmac[offset] & 0x7f) << 24) |
		(hmac[offset + 1] << 16) |
		(hmac[offset + 2] << 8) |
		hmac[offset + 3];
	return (code % 10 ** 6).toString().padStart(6, "0");
}

describe("mfa - setup, verify, backup codes, disable", () => {
	let config: ReturnType<typeof createMfaConfig>;
	let mfaHandler: ReturnType<typeof mfa>;
	let userIdCounter = 0;

	function nextUserId(): string {
		return `user-${++userIdCounter}`;
	}

	beforeEach(() => {
		vi.clearAllMocks();
		config = createMfaConfig();
		mfaHandler = mfa(config);
		userIdCounter = 0;
	});

	describe("setup", () => {
		test("returns secret, uri, backup codes, and pending token", async () => {
			const userId = nextUserId();
			const result = await mfaHandler.setup(userId);

			expect(result.secret).toBeDefined();
			expect(typeof result.secret).toBe("string");
			expect(result.secret.length).toBeGreaterThan(0);

			expect(result.uri).toContain("otpauth://totp/");
			expect(result.uri).toContain(`secret=${result.secret}`);
			expect(result.uri).toContain("issuer=TestApp");

			expect(result.backupCodes).toBeInstanceOf(Array);
			expect(result.backupCodes.length).toBe(10);
			result.backupCodes.forEach((code) => {
				expect(code).toMatch(/^[A-F0-9]{12}$/);
			});

			expect(result.pendingToken).toBeDefined();
			expect(typeof result.pendingToken).toBe("string");
		});

		test("throws MFA_ALREADY_SETUP for existing user", async () => {
			const userId = nextUserId();
			await mfaHandler.setup(userId);
			await expect(mfaHandler.setup(userId)).rejects.toThrow(
				"MFA is already configured",
			);
		});

		test("generates unique secrets per user", async () => {
			const userId1 = nextUserId();
			const userId2 = nextUserId();
			const result1 = await mfaHandler.setup(userId1);
			const result2 = await mfaHandler.setup(userId2);
			expect(result1.secret).not.toBe(result2.secret);
		});

		test("stores encrypted secret in storage", async () => {
			const userId = nextUserId();
			await mfaHandler.setup(userId);
			const stored = await config.storage.getSecret(userId);
			expect(stored).toBeDefined();
			expect(stored).not.toBe(userId);
		});

		test("stores hashed backup codes", async () => {
			const userId = nextUserId();
			await mfaHandler.setup(userId);
			const codes = await config.storage.getBackupCodes(userId);
			expect(codes).toBeDefined();
			expect(codes!.length).toBe(10);
			codes!.forEach((code) => {
				expect(code.length).toBe(64);
			});
		});
	});

	describe("verify (TOTP)", () => {
		test("throws MFA_NOT_SETUP for unknown user", async () => {
			await expect(mfaHandler.verify("unknown-user", "000000")).rejects.toThrow(
				"MFA not configured",
			);
		});

		test("rejects invalid code format", async () => {
			const userId = nextUserId();
			await mfaHandler.setup(userId);

			await expect(mfaHandler.verify(userId, "abc")).rejects.toThrow(
				"Invalid MFA code format",
			);
			await expect(mfaHandler.verify(userId, "12345")).rejects.toThrow(
				"Invalid MFA code format",
			);
			await expect(mfaHandler.verify(userId, "1234567")).rejects.toThrow(
				"Invalid MFA code format",
			);
			await expect(mfaHandler.verify(userId, "abcdef")).rejects.toThrow(
				"Invalid MFA code format",
			);
		});

		test("accepts valid TOTP code", async () => {
			const userId = nextUserId();
			await mfaHandler.setup(userId);
			const secret = await config.storage.getSecret(userId);
			expect(secret).toBeDefined();

			const totp = await generateTotpCode(secret!, config.secret);
			const result = await mfaHandler.verify(userId, totp);
			expect(result.success).toBe(true);
		});

		test("rejects invalid TOTP code", async () => {
			const userId = nextUserId();
			await mfaHandler.setup(userId);
			await expect(mfaHandler.verify(userId, "000000")).rejects.toThrow(
				"Invalid MFA code",
			);
		});

		test("rejects backup code format (use verifyBackupCode instead)", async () => {
			const userId = nextUserId();
			const setup = await mfaHandler.setup(userId);

			// verify() only accepts 6-digit TOTP codes
			await expect(
				mfaHandler.verify(userId, setup.backupCodes[0]),
			).rejects.toThrow("Invalid MFA code format");
		});
	});

	describe("verifyBackupCode", () => {
		test("returns false for invalid code", async () => {
			const userId = nextUserId();
			await mfaHandler.setup(userId);
			const result = await mfaHandler.verifyBackupCode(userId, "INVALID-CODE");
			expect(result).toBe(false);
		});

		test("returns true for valid backup code and consumes it", async () => {
			const userId = nextUserId();
			const setup = await mfaHandler.setup(userId);

			const result = await mfaHandler.verifyBackupCode(
				userId,
				setup.backupCodes[0],
			);
			expect(result).toBe(true);

			const codes = await config.storage.getBackupCodes(userId);
			expect(codes!.length).toBe(9);
		});

		test("returns false for already consumed backup code", async () => {
			const userId = nextUserId();
			const setup = await mfaHandler.setup(userId);

			await mfaHandler.verifyBackupCode(userId, setup.backupCodes[0]);
			const result = await mfaHandler.verifyBackupCode(
				userId,
				setup.backupCodes[0],
			);
			expect(result).toBe(false);
		});

		test("returns false for user without backup codes", async () => {
			const userId = nextUserId();
			await mfaHandler.setup(userId);
			await config.storage.deleteSecret(userId);
			const result = await mfaHandler.verifyBackupCode(userId, "ANY-CODE");
			expect(result).toBe(false);
		});
	});

	describe("challenge", () => {
		test("returns success for valid TOTP", async () => {
			const userId = nextUserId();
			await mfaHandler.setup(userId);
			const secret = await config.storage.getSecret(userId);
			expect(secret).toBeDefined();

			const totp = await generateTotpCode(secret!, config.secret);
			const result = await mfaHandler.challenge(userId, "totp", totp);
			expect(result.success).toBe(true);
			expect(result.method).toBe("totp");
		});

		test("returns success for valid backup code", async () => {
			const userId = nextUserId();
			const setup = await mfaHandler.setup(userId);

			const result = await mfaHandler.challenge(
				userId,
				"backup_codes",
				setup.backupCodes[0],
			);
			expect(result.success).toBe(true);
			expect(result.method).toBe("backup_codes");
		});

		test("throws MFA_INVALID_CODE for invalid TOTP", async () => {
			const userId = nextUserId();
			await mfaHandler.setup(userId);
			await expect(
				mfaHandler.challenge(userId, "totp", "000000"),
			).rejects.toThrow("Invalid MFA code");
		});

		test("throws MFA_INVALID_CODE for invalid backup code", async () => {
			const userId = nextUserId();
			await mfaHandler.setup(userId);
			await expect(
				mfaHandler.challenge(userId, "backup_codes", "INVALID"),
			).rejects.toThrow("Invalid MFA code");
		});
	});

	describe("isEnabled", () => {
		test("returns false for user without MFA", async () => {
			expect(await mfaHandler.isEnabled(nextUserId())).toBe(false);
		});

		test("returns true after setup", async () => {
			const userId = nextUserId();
			await mfaHandler.setup(userId);
			expect(await mfaHandler.isEnabled(userId)).toBe(true);
		});

		test("returns false after disable", async () => {
			const userId = nextUserId();
			await mfaHandler.setup(userId);
			await mfaHandler.disable(userId);
			expect(await mfaHandler.isEnabled(userId)).toBe(false);
		});
	});

	describe("disable", () => {
		test("removes MFA configuration", async () => {
			const userId = nextUserId();
			await mfaHandler.setup(userId);
			await mfaHandler.disable(userId);
			expect(await mfaHandler.isEnabled(userId)).toBe(false);

			const secret = await config.storage.getSecret(userId);
			expect(secret).toBeNull();
		});

		test("handles disable on non-existent user", async () => {
			await expect(mfaHandler.disable(nextUserId())).resolves.toBeUndefined();
		});
	});

	describe("generateTotpUri", () => {
		test("returns correct URI format", () => {
			const uri = mfaHandler.generateTotpUri("user-1", "JBSWY3DPEHPK3PXP");
			expect(uri).toContain("otpauth://totp/");
			expect(uri).toContain("secret=JBSWY3DPEHPK3PXP");
			expect(uri).toContain("issuer=TestApp");
		});
	});

	describe("handleMfaSetup", () => {
		test("returns 405 for non-POST", async () => {
			const req = new Request("http://localhost/mfa/setup", { method: "GET" });
			const res = await mfaHandler.handleMfaSetup(req);
			expect(res?.status).toBe(405);
		});

		test("returns 401 without session", async () => {
			const req = new Request("http://localhost/mfa/setup", { method: "POST" });
			const res = await mfaHandler.handleMfaSetup(req);
			expect(res?.status).toBe(401);
		});

		test("returns setup result with valid session", async () => {
			const userId = nextUserId();

			const { signToken } = await import("../internal/jwt");
			const token = await signToken({ userId }, config.secret, "7d");

			const req = new Request("http://localhost/mfa/setup", {
				method: "POST",
				headers: { Cookie: `mfa-session=${token}` },
			});
			const res = await mfaHandler.handleMfaSetup(req);
			expect(res?.status).toBe(200);

			const body = await res?.json();
			expect(body.secret).toBeDefined();
		});
	});

	describe("handleMfaVerify", () => {
		test("returns 405 for non-POST", async () => {
			const req = new Request("http://localhost/mfa/verify", { method: "GET" });
			const res = await mfaHandler.handleMfaVerify(req);
			expect(res?.status).toBe(405);
		});

		test("returns 401 without session", async () => {
			const req = new Request("http://localhost/mfa/verify", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ code: "123456" }),
			});
			const res = await mfaHandler.handleMfaVerify(req);
			expect(res?.status).toBe(401);
		});

		test("returns 401 for missing code (no session check)", async () => {
			const req = new Request("http://localhost/mfa/verify", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			});
			const res = await mfaHandler.handleMfaVerify(req);
			expect(res?.status).toBe(401);
		});

		test("verifies TOTP code with valid session", async () => {
			const userId = nextUserId();
			await mfaHandler.setup(userId);
			const secret = await config.storage.getSecret(userId);
			expect(secret).toBeDefined();

			const totp = await generateTotpCode(secret!, config.secret);

			const { signToken } = await import("../internal/jwt");
			const token = await signToken({ userId }, config.secret, "7d");

			const req = new Request("http://localhost/mfa/verify", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Cookie: `mfa-session=${token}`,
				},
				body: JSON.stringify({ code: totp }),
			});
			const res = await mfaHandler.handleMfaVerify(req);
			expect(res?.status).toBe(200);

			const body = await res?.json();
			expect(body.success).toBe(true);
		});
	});

	describe("handleMfaChallenge", () => {
		test("returns 405 for non-POST", async () => {
			const req = new Request("http://localhost/mfa/challenge", {
				method: "GET",
			});
			const res = await mfaHandler.handleMfaChallenge(req);
			expect(res?.status).toBe(405);
		});

		test("returns 400 for missing fields", async () => {
			const req = new Request("http://localhost/mfa/challenge", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ userId: "user-1" }),
			});
			const res = await mfaHandler.handleMfaChallenge(req);
			expect(res?.status).toBe(400);
		});

		test("challenges TOTP successfully", async () => {
			const userId = nextUserId();
			await mfaHandler.setup(userId);
			const secret = await config.storage.getSecret(userId);
			expect(secret).toBeDefined();

			const totp = await generateTotpCode(secret!, config.secret);

			const req = new Request("http://localhost/mfa/challenge", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ userId, method: "totp", code: totp }),
			});
			const res = await mfaHandler.handleMfaChallenge(req);
			expect(res?.status).toBe(200);

			const body = await res?.json();
			expect(body.success).toBe(true);
			expect(body.method).toBe("totp");
		});

		test("challenges backup code successfully", async () => {
			const userId = nextUserId();
			const setup = await mfaHandler.setup(userId);

			const req = new Request("http://localhost/mfa/challenge", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					userId,
					method: "backup_codes",
					code: setup.backupCodes[0],
				}),
			});
			const res = await mfaHandler.handleMfaChallenge(req);
			expect(res?.status).toBe(200);

			const body = await res?.json();
			expect(body.success).toBe(true);
			expect(body.method).toBe("backup_codes");
		});
	});

	describe("handleMfaDisable", () => {
		test("returns 405 for non-POST", async () => {
			const req = new Request("http://localhost/mfa/disable", {
				method: "GET",
			});
			const res = await mfaHandler.handleMfaDisable(req);
			expect(res?.status).toBe(405);
		});

		test("returns 401 without session", async () => {
			const req = new Request("http://localhost/mfa/disable", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ password: "password" }),
			});
			const res = await mfaHandler.handleMfaDisable(req);
			expect(res?.status).toBe(401);
		});

		test("returns 401 for missing password", async () => {
			const req = new Request("http://localhost/mfa/disable", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			});
			const res = await mfaHandler.handleMfaDisable(req);
			expect(res?.status).toBe(401);
		});

		test("disables MFA with correct password when verifyPassword provided", async () => {
			const verifyPassword = new MockVerifyPassword();
			verifyPassword.setPassword("user-disable-pwd", "correct-password");

			const configWithVerify = createMfaConfig({
				verifyPassword: verifyPassword.verify.bind(verifyPassword),
			});
			const mfaWithVerify = mfa(configWithVerify);

			const userId = "user-disable-pwd";
			await mfaWithVerify.setup(userId);

			const { signToken } = await import("../internal/jwt");
			const token = await signToken({ userId }, configWithVerify.secret, "7d");

			const req = new Request("http://localhost/mfa/disable", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Cookie: `mfa-session=${token}`,
				},
				body: JSON.stringify({ password: "correct-password" }),
			});
			const res = await mfaWithVerify.handleMfaDisable(req);
			expect(res?.status).toBe(200);

			const body = await res?.json();
			expect(body.success).toBe(true);
			expect(await mfaWithVerify.isEnabled(userId)).toBe(false);
		});

		test("returns 401 for incorrect password", async () => {
			const verifyPassword = new MockVerifyPassword();
			verifyPassword.setPassword("user-wrong-pwd", "correct-password");

			const configWithVerify = createMfaConfig({
				verifyPassword: verifyPassword.verify.bind(verifyPassword),
			});
			const mfaWithVerify = mfa(configWithVerify);

			const userId = "user-wrong-pwd";
			await mfaWithVerify.setup(userId);

			const { signToken } = await import("../internal/jwt");
			const token = await signToken({ userId }, configWithVerify.secret, "7d");

			const req = new Request("http://localhost/mfa/disable", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Cookie: `mfa-session=${token}`,
				},
				body: JSON.stringify({ password: "wrong-password" }),
			});
			const res = await mfaWithVerify.handleMfaDisable(req);
			expect(res?.status).toBe(401);
		});
	});

	describe("handleMfaChallenge error path", () => {
		test("returns error response for AuthError", async () => {
			const badStorage = new InMemoryMfaTestStorage();
			badStorage.getSecret = async () => {
				throw new AuthError(ErrorCodes.MFA_INVALID_CODE, "bad", {
					statusCode: 400,
				});
			};
			const badConfig = createMfaConfig({ storage: badStorage });
			const badMfa = mfa(badConfig);

			const req = new Request("http://localhost/mfa/challenge", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					userId: "user-1",
					method: "totp",
					code: "000000",
				}),
			});
			const res = await badMfa.handleMfaChallenge(req);
			expect(res?.status).toBe(400);
		});
	});

	describe("handleMfaSetup error path", () => {
		test("returns error response for AuthError", async () => {
			const badStorage = new InMemoryMfaTestStorage();
			badStorage.setSecret = async () => {
				throw new AuthError(ErrorCodes.MFA_ALREADY_SETUP, "setup error", {
					statusCode: 400,
				});
			};
			const badConfig = createMfaConfig({ storage: badStorage });
			const badMfa = mfa(badConfig);
			const userId = nextUserId();

			const { signToken } = await import("../internal/jwt");
			const token = await signToken({ userId }, badConfig.secret, "7d");

			const req = new Request("http://localhost/mfa/setup", {
				method: "POST",
				headers: { Cookie: `mfa-session=${token}` },
			});
			const res = await badMfa.handleMfaSetup(req);
			expect(res?.status).toBe(400);
		});
	});

	describe("handleMfaVerify error path", () => {
		test("returns error response for AuthError", async () => {
			const badStorage = new InMemoryMfaTestStorage();
			badStorage.getSecret = async () => {
				throw new AuthError(ErrorCodes.MFA_NOT_SETUP, "not setup", {
					statusCode: 400,
				});
			};
			const badConfig = createMfaConfig({ storage: badStorage });
			const badMfa = mfa(badConfig);
			const userId = nextUserId();

			const { signToken } = await import("../internal/jwt");
			const token = await signToken({ userId }, badConfig.secret, "7d");

			const req = new Request("http://localhost/mfa/verify", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Cookie: `mfa-session=${token}`,
				},
				body: JSON.stringify({ code: "123456" }),
			});
			const res = await badMfa.handleMfaVerify(req);
			expect(res?.status).toBe(400);
		});
	});

	describe("handleMfaDisable error path", () => {
		test("returns error response for AuthError", async () => {
			const badStorage = new InMemoryMfaTestStorage();
			badStorage.deleteSecret = async () => {
				throw new AuthError(ErrorCodes.MFA_NOT_SETUP, "not setup", {
					statusCode: 400,
				});
			};
			const badConfig = createMfaConfig({ storage: badStorage });
			const badMfa = mfa(badConfig);
			const userId = nextUserId();
			await badMfa.setup(userId);

			const { signToken } = await import("../internal/jwt");
			const token = await signToken({ userId }, badConfig.secret, "7d");

			const req = new Request("http://localhost/mfa/disable", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Cookie: `mfa-session=${token}`,
				},
				body: JSON.stringify({ password: "password" }),
			});
			const res = await badMfa.handleMfaDisable(req);
			expect(res?.status).toBe(400);
		});
	});

	describe("handleMfaVerify with missing code (+ valid session)", () => {
		test("returns 400 for missing code with valid session", async () => {
			const userId = nextUserId();
			await mfaHandler.setup(userId);

			const { signToken } = await import("../internal/jwt");
			const token = await signToken({ userId }, config.secret, "7d");

			const req = new Request("http://localhost/mfa/verify", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Cookie: `mfa-session=${token}`,
				},
				body: JSON.stringify({}),
			});
			const res = await mfaHandler.handleMfaVerify(req);
			expect(res?.status).toBe(400);
		});
	});

	describe("handleMfaDisable without verifyPassword", () => {
		test("disables MFA without verifyPassword", async () => {
			const userId = nextUserId();
			await mfaHandler.setup(userId);

			const { signToken } = await import("../internal/jwt");
			const token = await signToken({ userId }, config.secret, "7d");

			const req = new Request("http://localhost/mfa/disable", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Cookie: `mfa-session=${token}`,
				},
				body: JSON.stringify({ password: "any-password" }),
			});
			const res = await mfaHandler.handleMfaDisable(req);
			expect(res?.status).toBe(200);

			const body = await res?.json();
			expect(body.success).toBe(true);
			expect(await mfaHandler.isEnabled(userId)).toBe(false);
		});
	});

	describe("error codes", () => {
		test("throws MFA_ALREADY_SETUP error code", async () => {
			const userId = nextUserId();
			await mfaHandler.setup(userId);
			try {
				await mfaHandler.setup(userId);
			} catch (error) {
				expect((error as AuthError).code).toBe("MFA_ALREADY_SETUP");
			}
		});

		test("throws MFA_NOT_SETUP error code", async () => {
			try {
				await mfaHandler.verify("unknown", "123456");
			} catch (error) {
				expect((error as AuthError).code).toBe("MFA_NOT_SETUP");
			}
		});

		test("throws MFA_INVALID_CODE error code", async () => {
			const userId = nextUserId();
			await mfaHandler.setup(userId);
			try {
				await mfaHandler.verify(userId, "000000");
			} catch (error) {
				expect((error as AuthError).code).toBe("MFA_INVALID_CODE");
			}
		});
	});

	describe("handleMfaSetup throws non-AuthError", () => {
		test("rethrows non-AuthError", async () => {
			const badStorage = new InMemoryMfaTestStorage();
			badStorage.setSecret = async () => {
				throw new Error("Raw error");
			};
			const badConfig = createMfaConfig({ storage: badStorage });
			const badMfa = mfa(badConfig);
			const userId = nextUserId();
			const { signToken } = await import("../internal/jwt");
			const token = await signToken({ userId }, badConfig.secret, "7d");
			const req = new Request("http://localhost/mfa/setup", {
				method: "POST",
				headers: { Cookie: `mfa-session=${token}` },
			});
			await expect(badMfa.handleMfaSetup(req)).rejects.toThrow("Raw error");
		});
	});

	describe("handleMfaVerify throws non-AuthError", () => {
		test("rethrows non-AuthError", async () => {
			const userId = nextUserId();
			await mfaHandler.setup(userId);
			const badStorage = new InMemoryMfaTestStorage();
			Object.assign(badStorage, {
				getSecret: async () => {
					throw new Error("Raw verify error");
				},
				setSecret: async () => {},
				getBackupCodes: async () => null,
				setBackupCodes: async () => {},
				consumeBackupCode: async () => {},
				deleteSecret: async () => {},
			});
			const badConfig = createMfaConfig({ storage: badStorage });
			const badMfa = mfa(badConfig);
			const { signToken } = await import("../internal/jwt");
			const token = await signToken({ userId }, badConfig.secret, "7d");
			const req = new Request("http://localhost/mfa/verify", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Cookie: `mfa-session=${token}`,
				},
				body: JSON.stringify({ code: "123456" }),
			});
			await expect(badMfa.handleMfaVerify(req)).rejects.toThrow(
				"Raw verify error",
			);
		});
	});

	describe("handleMfaChallenge throws non-AuthError", () => {
		test("rethrows non-AuthError", async () => {
			const badStorage = new InMemoryMfaTestStorage();
			badStorage.getSecret = async () => {
				throw new Error("Raw challenge error");
			};
			const badConfig = createMfaConfig({ storage: badStorage });
			const badMfa = mfa(badConfig);
			const req = new Request("http://localhost/mfa/challenge", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					userId: "user-1",
					method: "totp",
					code: "123456",
				}),
			});
			await expect(badMfa.handleMfaChallenge(req)).rejects.toThrow(
				"Raw challenge error",
			);
		});
	});

	describe("extractUserId with invalid JWT", () => {
		test("returns null when verifyToken throws", async () => {
			const req = new Request("http://localhost/mfa/setup", {
				method: "POST",
				headers: { Cookie: "mfa-session=not-a-valid-jwt-token" },
			});
			const res = await mfaHandler.handleMfaSetup(req);
			expect(res?.status).toBe(401);
		});
	});

	describe("handleMfaDisable missing password with valid session", () => {
		test("returns 400 when password is missing", async () => {
			const userId = nextUserId();
			await mfaHandler.setup(userId);
			const { signToken } = await import("../internal/jwt");
			const token = await signToken({ userId }, config.secret, "7d");
			const req = new Request("http://localhost/mfa/disable", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Cookie: `mfa-session=${token}`,
				},
				body: JSON.stringify({}),
			});
			const res = await mfaHandler.handleMfaDisable(req);
			expect(res?.status).toBe(400);
		});
	});
});
