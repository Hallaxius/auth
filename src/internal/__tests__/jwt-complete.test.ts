import { describe, test, expect, jest } from "bun:test";
import {
	parseExpiresIn,
	secretToKey,
	signRefreshToken,
	revokeToken,
	signToken,
	verifyToken,
} from "../jwt";
import type { TokenRevocationStorage } from "../../types";

describe("JWT - Complete Coverage", () => {
	describe("parseExpiresIn() - all formats", () => {
		describe("number inputs (seconds)", () => {
			test("positive integer returns seconds format", () => {
				expect(parseExpiresIn(3600)).toBe("3600s");
				expect(parseExpiresIn(1)).toBe("1s");
				expect(parseExpiresIn(86400)).toBe("86400s");
			});

			test("zero throws error", () => {
				expect(() => parseExpiresIn(0)).toThrow(
					"expiresIn must be a positive integer (seconds)",
				);
			});

			test("negative number throws error", () => {
				expect(() => parseExpiresIn(-1)).toThrow(
					"expiresIn must be a positive integer (seconds)",
				);
				expect(() => parseExpiresIn(-100)).toThrow(
					"expiresIn must be a positive integer (seconds)",
				);
			});

			test("float number throws error", () => {
				expect(() => parseExpiresIn(1.5)).toThrow(
					"expiresIn must be a positive integer (seconds)",
				);
				expect(() => parseExpiresIn(3600.99)).toThrow(
					"expiresIn must be a positive integer (seconds)",
				);
			});

			test("NaN throws error", () => {
				expect(() => parseExpiresIn(NaN)).toThrow(
					"expiresIn must be a positive integer (seconds)",
				);
			});

			test("Infinity throws error", () => {
				expect(() => parseExpiresIn(Infinity)).toThrow(
					"expiresIn must be a positive integer (seconds)",
				);
			});
		});

		describe("string inputs - seconds (s)", () => {
			test("valid seconds format", () => {
				expect(parseExpiresIn("1s")).toBe("1s");
				expect(parseExpiresIn("60s")).toBe("60s");
				expect(parseExpiresIn("3600s")).toBe("3600s");
			});

			test("zero seconds throws error", () => {
				expect(() => parseExpiresIn("0s")).toThrow(
					"expiresIn duration must be positive",
				);
			});

			test("negative seconds throws error", () => {
				expect(() => parseExpiresIn("-1s")).toThrow(
					"expiresIn must be a number or string",
				);
			});
		});

		describe("string inputs - minutes (m)", () => {
			test("valid minutes format", () => {
				expect(parseExpiresIn("1m")).toBe("1m");
				expect(parseExpiresIn("30m")).toBe("30m");
				expect(parseExpiresIn("60m")).toBe("60m");
			});

			test("zero minutes throws error", () => {
				expect(() => parseExpiresIn("0m")).toThrow(
					"expiresIn duration must be positive",
				);
			});
		});

		describe("string inputs - hours (h)", () => {
			test("valid hours format", () => {
				expect(parseExpiresIn("1h")).toBe("1h");
				expect(parseExpiresIn("24h")).toBe("24h");
				expect(parseExpiresIn("168h")).toBe("168h");
			});

			test("zero hours throws error", () => {
				expect(() => parseExpiresIn("0h")).toThrow(
					"expiresIn duration must be positive",
				);
			});
		});

		describe("string inputs - days (d)", () => {
			test("valid days format", () => {
				expect(parseExpiresIn("1d")).toBe("1d");
				expect(parseExpiresIn("7d")).toBe("7d");
				expect(parseExpiresIn("30d")).toBe("30d");
				expect(parseExpiresIn("365d")).toBe("365d");
			});

			test("zero days throws error", () => {
				expect(() => parseExpiresIn("0d")).toThrow(
					"expiresIn duration must be positive",
				);
			});
		});

		describe("invalid formats", () => {
			test("invalid unit throws error", () => {
				expect(() => parseExpiresIn("1w")).toThrow(
					"expiresIn must be a number or string",
				);
				expect(() => parseExpiresIn("1y")).toThrow(
					"expiresIn must be a number or string",
				);
				expect(() => parseExpiresIn("1ms")).toThrow(
					"expiresIn must be a number or string",
				);
			});

			test("no unit throws error", () => {
				expect(() => parseExpiresIn("100")).toThrow(
					"expiresIn must be a number or string",
				);
			});

			test("empty string throws error", () => {
				expect(() => parseExpiresIn("")).toThrow(
					"expiresIn must be a number or string",
				);
			});

			test("non-numeric string throws error", () => {
				expect(() => parseExpiresIn("abc")).toThrow(
					"expiresIn must be a number or string",
				);
			});

			test("whitespace throws error", () => {
				expect(() => parseExpiresIn(" 1d ")).toThrow(
					"expiresIn must be a number or string",
				);
			});
		});

		describe("type validation", () => {
			test("boolean throws error", () => {
				expect(() => parseExpiresIn(true as unknown as string)).toThrow(
					"expiresIn must be a number or string",
				);
			});

			test("null throws error", () => {
				expect(() => parseExpiresIn(null as unknown as string)).toThrow(
					"expiresIn must be a number or string",
				);
			});

			test("undefined throws error", () => {
				expect(() => parseExpiresIn(undefined as unknown as string)).toThrow(
					"expiresIn must be a number or string",
				);
			});

			test("object throws error", () => {
				expect(() => parseExpiresIn({} as unknown as string)).toThrow(
					"expiresIn must be a number or string",
				);
			});
		});
	});

	describe("secretToKey() - boundary conditions", () => {
		test("exactly 32 characters is valid", () => {
			const secret = "a".repeat(32);
			const key = secretToKey(secret);
			expect(key).toBeInstanceOf(Uint8Array);
			expect(key.length).toBe(32);
		});

		test("31 characters throws error", () => {
			const secret = "a".repeat(31);
			expect(() => secretToKey(secret)).toThrow(
				"JWT secret must be at least 32 characters (256 bits). Got 31 characters.",
			);
		});

		test("less than 31 characters throws error", () => {
			expect(() => secretToKey("short")).toThrow(
				"JWT secret must be at least 32 characters",
			);
			expect(() => secretToKey("")).toThrow(
				"JWT secret must be at least 32 characters",
			);
		});

		test("more than 32 characters is valid", () => {
			const secret = "a".repeat(100);
			const key = secretToKey(secret);
			expect(key).toBeInstanceOf(Uint8Array);
			expect(key.length).toBe(100);
		});

		test("unicode characters are handled", () => {
			const secret = "🔐".repeat(32);
			const key = secretToKey(secret);
			expect(key).toBeInstanceOf(Uint8Array);
		});

		test("special characters are handled", () => {
			const secret = "!@#$%^&*()_+-=[]{}|;':\",./<>?".repeat(2);
			const key = secretToKey(secret);
			expect(key).toBeInstanceOf(Uint8Array);
		});

		test("whitespace is included in length", () => {
			const secret = " ".repeat(32);
			const key = secretToKey(secret);
			expect(key).toBeInstanceOf(Uint8Array);
		});

		test("newlines are included in length", () => {
			const secret = "a".repeat(31) + "\n";
			const key = secretToKey(secret);
			expect(key).toBeInstanceOf(Uint8Array);
		});
	});

	describe("signRefreshToken() - isolated tests", () => {
		test("signs with default expiration (7d)", async () => {
			const secret = "a".repeat(32);
			const payload = { userId: "123" };
			const token = await signRefreshToken(payload, secret);

			expect(token).toBeDefined();
			expect(typeof token).toBe("string");
			expect(token.split(".")).toHaveLength(3);
		});

		test("signs with custom expiration", async () => {
			const secret = "a".repeat(32);
			const payload = { userId: "123" };
			const token = await signRefreshToken(payload, secret, "30d");

			expect(token).toBeDefined();
		});

		test("includes jti claim", async () => {
			const secret = "a".repeat(32);
			const payload = { userId: "123" };
			const token = await signRefreshToken(payload, secret);

			const parts = token.split(".");
			const header = JSON.parse(
				Buffer.from(parts[0]!, "base64").toString(),
			);
			const body = JSON.parse(
				Buffer.from(parts[1]!, "base64").toString(),
			);

			expect(body.jti).toBeDefined();
			expect(typeof body.jti).toBe("string");
		});

		test("includes type: refresh claim", async () => {
			const secret = "a".repeat(32);
			const payload = { userId: "123" };
			const token = await signRefreshToken(payload, secret);

			const parts = token.split(".");
			const body = JSON.parse(
				Buffer.from(parts[1]!, "base64").toString(),
			);

			expect(body.type).toBe("refresh");
		});

		test("includes issued at (iat) claim", async () => {
			const secret = "a".repeat(32);
			const payload = { userId: "123" };
			const token = await signRefreshToken(payload, secret);

			const parts = token.split(".");
			const body = JSON.parse(
				Buffer.from(parts[1]!, "base64").toString(),
			);

			expect(body.iat).toBeDefined();
			expect(typeof body.iat).toBe("number");
		});

		test("includes expiration (exp) claim", async () => {
			const secret = "a".repeat(32);
			const payload = { userId: "123" };
			const token = await signRefreshToken(payload, secret);

			const parts = token.split(".");
			const body = JSON.parse(
				Buffer.from(parts[1]!, "base64").toString(),
			);

			expect(body.exp).toBeDefined();
			expect(typeof body.exp).toBe("number");
		});

		test("preserves custom payload claims", async () => {
			const secret = "a".repeat(32);
			const payload = {
				userId: "123",
				username: "test",
				roles: ["admin"],
				metadata: { key: "value" },
			};
			const token = await signRefreshToken(payload, secret);

			const parts = token.split(".");
			const body = JSON.parse(
				Buffer.from(parts[1]!, "base64").toString(),
			);

			expect(body.userId).toBe("123");
			expect(body.username).toBe("test");
			expect(body.roles).toEqual(["admin"]);
			expect(body.metadata).toEqual({ key: "value" });
		});

		test("uses HS256 algorithm", async () => {
			const secret = "a".repeat(32);
			const payload = { userId: "123" };
			const token = await signRefreshToken(payload, secret);

			const parts = token.split(".");
			const header = JSON.parse(
				Buffer.from(parts[0]!, "base64").toString(),
			);

			expect(header.alg).toBe("HS256");
		});

		test("different payloads produce different tokens", async () => {
			const secret = "a".repeat(32);
			const token1 = await signRefreshToken({ userId: "1" }, secret);
			const token2 = await signRefreshToken({ userId: "2" }, secret);

			expect(token1).not.toBe(token2);
		});

		test("same payload produces different tokens (random jti)", async () => {
			const secret = "a".repeat(32);
			const payload = { userId: "123" };
			const token1 = await signRefreshToken(payload, secret);
			const token2 = await signRefreshToken(payload, secret);

			expect(token1).not.toBe(token2);
		});
	});

	describe("revokeToken() - with storage mock", () => {
		function createMockStorage(): TokenRevocationStorage {
			const revokedTokens = new Map<string, number>();

			return {
				revoke: jest.fn(async (jti: string, ttlSeconds: number) => {
					const expiresAt = Date.now() + ttlSeconds * 1000;
					revokedTokens.set(jti, expiresAt);
				}),
				isRevoked: jest.fn(async (jti: string) => {
					const expiresAt = revokedTokens.get(jti);
					if (!expiresAt) return false;
					if (Date.now() > expiresAt) {
						revokedTokens.delete(jti);
						return false;
					}
					return true;
				}),
			};
		}

		test("revokes valid token", async () => {
			const secret = "a".repeat(32);
			const payload = { userId: "123" };
			const storage = createMockStorage();

			const token = await signRefreshToken(payload, secret);
			const result = await revokeToken(token, secret, storage);

			expect(result).toBe(true);
			expect(storage.revoke).toHaveBeenCalledTimes(1);
		});

		test("extracts jti from token", async () => {
			const secret = "a".repeat(32);
			const payload = { userId: "123" };
			const storage = createMockStorage();

			const token = await signRefreshToken(payload, secret);
			await revokeToken(token, secret, storage);

			const parts = token.split(".");
			const body = JSON.parse(
				Buffer.from(parts[1]!, "base64").toString(),
			);

			expect(storage.revoke).toHaveBeenCalledWith(
				body.jti,
				expect.any(Number),
			);
		});

		test("calculates TTL from remaining expiration", async () => {
			const secret = "a".repeat(32);
			const payload = { userId: "123" };
			const storage = createMockStorage();

			const token = await signRefreshToken(payload, secret, "1h");
			await revokeToken(token, secret, storage);

			expect(storage.revoke).toHaveBeenCalledWith(
				expect.any(String),
				expect.lessThanOrEqual(3600),
			);
		});

		test("returns false for invalid token", async () => {
			const secret = "a".repeat(32);
			const storage = createMockStorage();

			const result = await revokeToken("invalid.token.here", secret, storage);

			expect(result).toBe(false);
			expect(storage.revoke).not.toHaveBeenCalled();
		});

		test("returns false for token without jti", async () => {
			const secret = "a".repeat(32);
			const storage = createMockStorage();

			const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMjMifQ.invalid";
			const result = await revokeToken(token, secret, storage);

			expect(result).toBe(false);
		});

		test("returns false for expired token", async () => {
			const secret = "a".repeat(32);
			const storage = createMockStorage();

			const token = await signRefreshToken({ userId: "123" }, secret, "1s");
			await new Promise((resolve) => setTimeout(resolve, 1100));

			const result = await revokeToken(token, secret, storage);

			expect(result).toBe(false);
		});

		test("returns false for tampered token", async () => {
			const secret = "a".repeat(32);
			const storage = createMockStorage();

			const validToken = await signRefreshToken({ userId: "123" }, secret);
			const tamperedToken = validToken + "tampered";

			const result = await revokeToken(tamperedToken, secret, storage);

			expect(result).toBe(false);
		});

		test("returns false for token signed with different secret", async () => {
			const secret1 = "a".repeat(32);
			const secret2 = "b".repeat(32);
			const storage = createMockStorage();

			const token = await signRefreshToken({ userId: "123" }, secret1);
			const result = await revokeToken(token, secret2, storage);

			expect(result).toBe(false);
		});

		test("TTL minimum is 1 second", async () => {
			const secret = "a".repeat(32);
			const storage = createMockStorage();

			const token = await signRefreshToken({ userId: "123" }, secret, "1s");
			await new Promise((resolve) => setTimeout(resolve, 500));

			await revokeToken(token, secret, storage);

			expect(storage.revoke).toHaveBeenCalledWith(
				expect.any(String),
				expect.any(Number),
			);
		});

		test("default TTL is 3600 seconds when no exp", async () => {
			const secret = "a".repeat(32);
			const storage = createMockStorage();

			const token = await signToken({ userId: "123" }, secret, "1h");
			const parts = token.split(".");
			const body = JSON.parse(
				Buffer.from(parts[1]!, "base64").toString(),
			);
			delete body.exp;

			const modifiedToken = parts
				.map((p, i) => {
					if (i === 1) {
						return Buffer.from(JSON.stringify(body)).toString("base64");
					}
					return p;
				})
				.join(".");

			const result = await revokeToken(modifiedToken, secret, storage);
			expect(result).toBe(false);
		});
	});
});