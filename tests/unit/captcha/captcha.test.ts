import { afterEach, beforeEach, describe, expect, it, jest, mock } from "bun:test";
import { ConfigurationError } from "../../../src/errors";
import {
	resolveCaptchaConfig,
	verifyCaptcha,
} from "../../../src/captcha";
import type { CaptchaConfig, ResolvedCaptchaConfig } from "../../../src/captcha";

const originalFetch = global.fetch;

function makeConfig(
	overrides: Partial<CaptchaConfig> = {},
): ResolvedCaptchaConfig {
	return {
		provider: "hcaptcha",
		enabled: true,
		secretKey: "test-secret",
		siteKey: "test-sitekey",
		...overrides,
	};
}

function mockFetchResponse(
	body: unknown,
	init?: ResponseInit,
): typeof fetch {
	return mock(async () => {
		return new Response(JSON.stringify(body), init ?? { status: 200 });
	}) as unknown as typeof fetch;
}

describe("verifyCaptcha", () => {
	beforeEach(() => {
		mock.clearAllMocks();
	});

	afterEach(() => {
		global.fetch = originalFetch;
		jest.restoreAllMocks();
	});

	describe("token validation", () => {
		it("returns missing-input-response when token is empty string", async () => {
			const result = await verifyCaptcha(makeConfig(), "");
			expect(result.success).toBe(false);
			expect(result.error).toBe("missing-input-response");
		});

		it("returns missing-input-response when token is undefined", async () => {
			const result = await verifyCaptcha(
				makeConfig(),
				undefined as unknown as string,
			);
			expect(result.success).toBe(false);
			expect(result.error).toBe("missing-input-response");
		});

		it("returns missing-input-response when token is non-string", async () => {
			const result = await verifyCaptcha(
				makeConfig(),
				12345 as unknown as string,
			);
			expect(result.success).toBe(false);
			expect(result.error).toBe("missing-input-response");
		});
	});

	describe("network errors", () => {
		it("returns timeout-or-duplicate on AbortError", async () => {
			global.fetch = mock(() =>
				Promise.reject(
					Object.assign(new Error("aborted"), { name: "AbortError" }),
				),
			) as unknown as typeof fetch;

			const result = await verifyCaptcha(makeConfig(), "token");
			expect(result.success).toBe(false);
			expect(result.error).toBe("timeout-or-duplicate");
			expect(result.message).toBe("Captcha verification failed");
		});

		it("returns internal-error on other fetch errors", async () => {
			global.fetch = mock(() =>
				Promise.reject(new Error("DNS resolution failed")),
			) as unknown as typeof fetch;

			const result = await verifyCaptcha(makeConfig(), "token");
			expect(result.success).toBe(false);
			expect(result.error).toBe("internal-error");
			expect(result.message).toBe("Captcha verification failed");
		});
	});

	describe("non-ok response", () => {
		it("returns bad-request when provider returns 500", async () => {
			global.fetch = mockFetchResponse(
				{ success: false },
				{ status: 500, statusText: "Internal Server Error" },
			);

			const result = await verifyCaptcha(
				makeConfig({ provider: "turnstile" }),
				"token",
			);
			expect(result.success).toBe(false);
			expect(result.error).toBe("bad-request");
			expect(result.message).toBe("Captcha verification failed");
		});
	});

	describe("provider failure", () => {
		it("returns error code from provider response", async () => {
			global.fetch = mockFetchResponse({
				success: false,
				"error-codes": ["invalid-input-response"],
			});

			const result = await verifyCaptcha(makeConfig(), "token");
			expect(result.success).toBe(false);
			expect(result.error).toBe("invalid-input-response");
			expect(result.message).toBe("Captcha verification failed");
		});

		it("defaults to invalid-input-response when no error-codes provided", async () => {
			global.fetch = mockFetchResponse({ success: false });

			const result = await verifyCaptcha(makeConfig(), "token");
			expect(result.success).toBe(false);
			expect(result.error).toBe("invalid-input-response");
		});
	});

	describe("hostname validation", () => {
		it("passes when hostname is in allowedHostnames", async () => {
			global.fetch = mockFetchResponse({
				success: true,
				hostname: "example.com",
			});

			const result = await verifyCaptcha(
				makeConfig({
					allowedHostnames: ["example.com", "test.com"],
				}),
				"token",
			);
			expect(result.success).toBe(true);
		});

		it("fails when hostname is not in allowedHostnames", async () => {
			global.fetch = mockFetchResponse({
				success: true,
				hostname: "evil.com",
			});

			const result = await verifyCaptcha(
				makeConfig({
					allowedHostnames: ["example.com"],
				}),
				"token",
			);
			expect(result.success).toBe(false);
			expect(result.error).toBe("hostname-not-allowed");
		});

		it("skips hostname validation when allowedHostnames is empty", async () => {
			global.fetch = mockFetchResponse({
				success: true,
				hostname: "anything.com",
			});

			const result = await verifyCaptcha(
				makeConfig({ allowedHostnames: [] }),
				"token",
			);
			expect(result.success).toBe(true);
		});

		it("skips hostname validation when allowedHostnames is undefined", async () => {
			global.fetch = mockFetchResponse({
				success: true,
				hostname: "anything.com",
			});

			const result = await verifyCaptcha(makeConfig(), "token");
			expect(result.success).toBe(true);
		});
	});

	describe("action validation", () => {
		it("passes when action matches expectedAction", async () => {
			global.fetch = mockFetchResponse({
				success: true,
				action: "login",
			});

			const result = await verifyCaptcha(
				makeConfig({ expectedAction: "login" }),
				"token",
			);
			expect(result.success).toBe(true);
		});

		it("fails when action does not match expectedAction", async () => {
			global.fetch = mockFetchResponse({
				success: true,
				action: "signup",
			});

			const result = await verifyCaptcha(
				makeConfig({ expectedAction: "login" }),
				"token",
			);
			expect(result.success).toBe(false);
			expect(result.error).toBe("action-mismatch");
		});
	});

	describe("score validation (reCAPTCHA)", () => {
		it("passes when score meets minimum", async () => {
			global.fetch = mockFetchResponse({
				success: true,
				score: 0.8,
			});

			const result = await verifyCaptcha(
				makeConfig({ provider: "recaptcha", minScore: 0.5 }),
				"token",
			);
			expect(result.success).toBe(true);
			expect(result.score).toBe(0.8);
		});

		it("fails when score is below minimum", async () => {
			global.fetch = mockFetchResponse({
				success: true,
				score: 0.3,
			});

			const result = await verifyCaptcha(
				makeConfig({ provider: "recaptcha", minScore: 0.5 }),
				"token",
			);
			expect(result.success).toBe(false);
			expect(result.error).toBe("score-too-low");
		});

		it("skips score validation when minScore is undefined", async () => {
			global.fetch = mockFetchResponse({
				success: true,
				score: 0.1,
			});

			const result = await verifyCaptcha(
				makeConfig({ provider: "recaptcha" }),
				"token",
			);
			expect(result.success).toBe(true);
		});

		it("skips score validation for non-recaptcha providers", async () => {
			global.fetch = mockFetchResponse({
				success: true,
				score: 0.1,
			});

			const result = await verifyCaptcha(
				makeConfig({
					provider: "hcaptcha",
					minScore: 0.5,
				}),
				"token",
			);
			expect(result.success).toBe(true);
		});

		it("skips score validation when score is not a number", async () => {
			global.fetch = mockFetchResponse({
				success: true,
			});

			const result = await verifyCaptcha(
				makeConfig({ provider: "recaptcha", minScore: 0.5 }),
				"token",
			);
			expect(result.success).toBe(true);
		});
	});

	describe("success result", () => {
		it("returns provider, hostname, action, and score on success", async () => {
			global.fetch = mockFetchResponse({
				success: true,
				hostname: "example.com",
				action: "login",
				score: 0.9,
			});

			const result = await verifyCaptcha(
				makeConfig({ provider: "recaptcha", minScore: 0.5 }),
				"token",
				{ remoteip: "192.168.1.1" },
			);
			expect(result.success).toBe(true);
			expect(result.provider).toBe("recaptcha");
			expect(result.hostname).toBe("example.com");
			expect(result.action).toBe("login");
			expect(result.score).toBe(0.9);
		});
	});

	describe("request body", () => {
		it("includes remoteip in request body when provided", async () => {
			const captureFetch = jest.fn<
				(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
			>(async () =>
				new Response(JSON.stringify({ success: true }), { status: 200 }),
			);
			global.fetch = captureFetch as unknown as typeof fetch;

			await verifyCaptcha(
				makeConfig({ provider: "turnstile" }),
				"token",
				{ remoteip: "192.168.1.1" },
			);

			const call = captureFetch.mock.calls[0]!;
			expect(call[1]?.method).toBe("POST");
			expect((call[1]?.headers as Record<string, string>)["Content-Type"]).toBe(
				"application/x-www-form-urlencoded",
			);
			expect(call[1]?.body).toContain("remoteip=192.168.1.1");
			expect(call[1]?.body).toContain("response=token");
			expect(call[1]?.body).toContain("secret=test-secret");
		});

		it("does not include remoteip when not provided", async () => {
			const captureFetch = jest.fn<
				(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
			>(async () =>
				new Response(JSON.stringify({ success: true }), { status: 200 }),
			);
			global.fetch = captureFetch as unknown as typeof fetch;

			await verifyCaptcha(makeConfig({ provider: "turnstile" }), "token");

			const call = captureFetch.mock.calls[0]!;
			expect(call[1]?.body).not.toContain("remoteip");
		});

		it("uses correct endpoint per provider", async () => {
			const captureFetch = jest.fn<
				(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
			>(async () =>
				new Response(JSON.stringify({ success: true }), { status: 200 }),
			);
			global.fetch = captureFetch as unknown as typeof fetch;

			await verifyCaptcha(
				makeConfig({ provider: "hcaptcha" }),
				"token",
			);
			expect(captureFetch.mock.calls[0]![0]).toBe(
				"https://api.hcaptcha.com/siteverify",
			);

			await verifyCaptcha(
				makeConfig({ provider: "recaptcha" }),
				"token",
			);
			expect(captureFetch.mock.calls[1]![0]).toBe(
				"https://www.google.com/recaptcha/api/siteverify",
			);

			await verifyCaptcha(
				makeConfig({ provider: "turnstile" }),
				"token",
			);
			expect(captureFetch.mock.calls[2]![0]).toBe(
				"https://challenges.cloudflare.com/turnstile/v0/siteverify",
			);
		});
	});
});

describe("resolveCaptchaConfig", () => {
	const originalEnv = { ...process.env };

	beforeEach(() => {
		mock.clearAllMocks();
	});

	afterEach(() => {
		process.env = { ...originalEnv };
		jest.restoreAllMocks();
	});

	it("returns null when config is undefined", () => {
		expect(resolveCaptchaConfig(undefined)).toBeNull();
	});

	it("returns null when provider is undefined", () => {
		expect(resolveCaptchaConfig({} as CaptchaConfig)).toBeNull();
	});

	it("throws ConfigurationError when secret key is missing and not in env", () => {
		delete process.env.HCAPTCHA_SECRET_KEY;
		expect(() =>
			resolveCaptchaConfig({ provider: "hcaptcha" }),
		).toThrow(ConfigurationError);
	});

	it("throws ConfigurationError with helpful message for missing secret", () => {
		delete process.env.RECAPTCHA_SECRET_KEY;
		try {
			resolveCaptchaConfig({ provider: "recaptcha" });
			expect.fail("Should have thrown");
		} catch (e) {
			expect(e).toBeInstanceOf(ConfigurationError);
			expect((e as Error).message).toContain("RECAPTCHA_SECRET_KEY");
		}
	});

	it("uses secret key from env when not provided explicitly", () => {
		process.env.HCAPTCHA_SECRET_KEY = "env-secret-key";
		const config = resolveCaptchaConfig({ provider: "hcaptcha" });
		expect(config).not.toBeNull();
		expect(config!.secretKey).toBe("env-secret-key");
	});

	it("prefers explicit secret key over env var", () => {
		process.env.HCAPTCHA_SECRET_KEY = "env-secret-key";
		const config = resolveCaptchaConfig({
			provider: "hcaptcha",
			secretKey: "explicit-secret",
		});
		expect(config).not.toBeNull();
		expect(config!.secretKey).toBe("explicit-secret");
	});

	it("defaults enabled to true when not specified", () => {
		process.env.HCAPTCHA_SECRET_KEY = "env-secret-key";
		const config = resolveCaptchaConfig({ provider: "hcaptcha" });
		expect(config!.enabled).toBe(true);
	});

	it("respects enabled: false", () => {
		process.env.HCAPTCHA_SECRET_KEY = "env-secret-key";
		const config = resolveCaptchaConfig({
			provider: "hcaptcha",
			enabled: false,
		});
		expect(config!.enabled).toBe(false);
	});

	it("passes through siteKey, minScore, expectedAction, allowedHostnames", () => {
		process.env.HCAPTCHA_SECRET_KEY = "env-secret-key";
		const config = resolveCaptchaConfig({
			provider: "hcaptcha",
			siteKey: "my-site-key",
			minScore: 0.7,
			expectedAction: "login",
			allowedHostnames: ["example.com"],
		});
		expect(config).toEqual({
			provider: "hcaptcha",
			enabled: true,
			secretKey: "env-secret-key",
			siteKey: "my-site-key",
			minScore: 0.7,
			expectedAction: "login",
			allowedHostnames: ["example.com"],
		});
	});
});
