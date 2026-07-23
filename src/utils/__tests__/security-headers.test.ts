/**
 * @file Security headers middleware tests
 */

import { describe, expect, test } from "bun:test";
import {
	securityHeaders,
	applySecurityHeaders,
	defaultSecurityHeaders,
	type SecurityHeadersConfig,
} from "../security-headers";

describe("securityHeaders middleware", () => {
	test("returns headers object", () => {
		const middleware = securityHeaders();
		const request = new Request("https://example.com/test");
		const result = middleware(request);

		expect(result).toBeDefined();
		expect(result?.headers).toBeInstanceOf(Headers);
	});

	test("sets default security headers", () => {
		const middleware = securityHeaders(defaultSecurityHeaders);
		const request = new Request("https://example.com/test");
		const result = middleware(request);

		expect(result?.headers.get("Content-Security-Policy")).toContain("default-src 'self'");
		expect(result?.headers.get("Strict-Transport-Security")).toContain("max-age=31536000");
		expect(result?.headers.get("X-Content-Type-Options")).toBe("nosniff");
		expect(result?.headers.get("X-Frame-Options")).toBe("DENY");
		expect(result?.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
	});

	test("sets custom CSP directives", () => {
		const config: SecurityHeadersConfig = {
			csp: {
				enabled: true,
				defaultSrc: ["'self'"],
				scriptSrc: ["'self'", "https://cdn.example.com"],
				styleSrc: ["'self'", "'unsafe-inline'"],
				imgSrc: ["'self'", "data:", "https:"],
			},
		};

		const middleware = securityHeaders(config);
		const request = new Request("https://example.com/test");
		const result = middleware(request);

		const csp = result?.headers.get("Content-Security-Policy") ?? "";
		expect(csp).toContain("default-src 'self'");
		expect(csp).toContain("script-src 'self' https://cdn.example.com");
		expect(csp).toContain("style-src 'self' 'unsafe-inline'");
		expect(csp).toContain("img-src 'self' data: https:");
	});

	test("sets HSTS with custom max-age", () => {
		const config: SecurityHeadersConfig = {
			hsts: {
				enabled: true,
				maxAge: 86400,
				includeSubDomains: true,
				preload: true,
			},
		};

		const middleware = securityHeaders(config);
		const request = new Request("https://example.com/test");
		const result = middleware(request);

		const hsts = result?.headers.get("Strict-Transport-Security") ?? "";
		expect(hsts).toBe("max-age=86400; includeSubDomains; preload");
	});

	test("disables HSTS when enabled is false", () => {
		const config: SecurityHeadersConfig = {
			hsts: {
				enabled: false,
			},
		};

		const middleware = securityHeaders(config);
		const request = new Request("https://example.com/test");
		const result = middleware(request);

		expect(result?.headers.get("Strict-Transport-Security")).toBeNull();
	});

	test("sets X-Frame-Options to SAMEORIGIN", () => {
		const config: SecurityHeadersConfig = {
			frameOptions: {
				enabled: true,
				option: "SAMEORIGIN",
			},
		};

		const middleware = securityHeaders(config);
		const request = new Request("https://example.com/test");
		const result = middleware(request);

		expect(result?.headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
	});

	test("disables X-Frame-Options when enabled is false", () => {
		const config: SecurityHeadersConfig = {
			frameOptions: {
				enabled: false,
			},
		};

		const middleware = securityHeaders(config);
		const request = new Request("https://example.com/test");
		const result = middleware(request);

		expect(result?.headers.get("X-Frame-Options")).toBeNull();
	});

	test("sets X-XSS-Protection when enabled", () => {
		const config: SecurityHeadersConfig = {
			xssProtection: true,
		};

		const middleware = securityHeaders(config);
		const request = new Request("https://example.com/test");
		const result = middleware(request);

		expect(result?.headers.get("X-XSS-Protection")).toBe("1; mode=block");
	});

	test("sets custom Referrer-Policy", () => {
		const config: SecurityHeadersConfig = {
			referrerPolicy: "no-referrer",
		};

		const middleware = securityHeaders(config);
		const request = new Request("https://example.com/test");
		const result = middleware(request);

		expect(result?.headers.get("Referrer-Policy")).toBe("no-referrer");
	});

	test("sets Permissions-Policy", () => {
		const config: SecurityHeadersConfig = {
			permissionsPolicy: {
				camera: [],
				microphone: [],
				geolocation: ["'self'"],
			},
		};

		const middleware = securityHeaders(config);
		const request = new Request("https://example.com/test");
		const result = middleware(request);

		const permissions = result?.headers.get("Permissions-Policy") ?? "";
		expect(permissions).toContain("camera=()");
		expect(permissions).toContain("microphone=()");
		expect(permissions).toContain("geolocation=('self')");
	});

	test("sets Cross-Origin headers", () => {
		const config: SecurityHeadersConfig = {
			crossOriginOpenerPolicy: "same-origin",
			crossOriginEmbedderPolicy: "require-corp",
			crossOriginResourcePolicy: "same-origin",
		};

		const middleware = securityHeaders(config);
		const request = new Request("https://example.com/test");
		const result = middleware(request);

		expect(result?.headers.get("Cross-Origin-Opener-Policy")).toBe("same-origin");
		expect(result?.headers.get("Cross-Origin-Embedder-Policy")).toBe("require-corp");
		expect(result?.headers.get("Cross-Origin-Resource-Policy")).toBe("same-origin");
	});

	test("sets Cache-Control for sensitive pages", () => {
		const config: SecurityHeadersConfig = {
			cacheControl: {
				enabled: true,
				noStore: true,
				noCache: true,
				private: true,
			},
		};

		const middleware = securityHeaders(config);
		const request = new Request("https://example.com/test");
		const result = middleware(request);

		const cacheControl = result?.headers.get("Cache-Control") ?? "";
		expect(cacheControl).toContain("no-store");
		expect(cacheControl).toContain("no-cache");
		expect(cacheControl).toContain("private");
	});

	test("CSP with upgrade-insecure-requests", () => {
		const config: SecurityHeadersConfig = {
			csp: {
				enabled: true,
				defaultSrc: ["'self'"],
				upgradeInsecureRequests: true,
			},
		};

		const middleware = securityHeaders(config);
		const request = new Request("https://example.com/test");
		const result = middleware(request);

		const csp = result?.headers.get("Content-Security-Policy") ?? "";
		expect(csp).toContain("upgrade-insecure-requests");
	});

	test("CSP with block-all-mixed-content", () => {
		const config: SecurityHeadersConfig = {
			csp: {
				enabled: true,
				defaultSrc: ["'self'"],
				blockAllMixedContent: true,
			},
		};

		const middleware = securityHeaders(config);
		const request = new Request("https://example.com/test");
		const result = middleware(request);

		const csp = result?.headers.get("Content-Security-Policy") ?? "";
		expect(csp).toContain("block-all-mixed-content");
	});

	test("CSP with report-uri", () => {
		const config: SecurityHeadersConfig = {
			csp: {
				enabled: true,
				defaultSrc: ["'self'"],
				reportUri: "https://report.example.com/csp",
			},
		};

		const middleware = securityHeaders(config);
		const request = new Request("https://example.com/test");
		const result = middleware(request);

		const csp = result?.headers.get("Content-Security-Policy") ?? "";
		expect(csp).toContain("report-uri https://report.example.com/csp");
	});

	test("empty config returns minimal headers", () => {
		const middleware = securityHeaders({});
		const request = new Request("https://example.com/test");
		const result = middleware(request);

		expect(result?.headers.get("X-Content-Type-Options")).toBe("nosniff");
		expect(result?.headers.get("X-Frame-Options")).toBe("DENY");
		expect(result?.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
	});
});

describe("applySecurityHeaders", () => {
	test("applies headers to existing response", () => {
		const originalResponse = new Response("OK", {
			status: 200,
			headers: {
				"Content-Type": "text/html",
			},
		});

		const config: SecurityHeadersConfig = {
			csp: {
				enabled: true,
				defaultSrc: ["'self'"],
			},
			hsts: {
				enabled: true,
				maxAge: 31536000,
			},
		};

		const response = applySecurityHeaders(originalResponse, config);

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe("text/html");
		expect(response.headers.get("Content-Security-Policy")).toContain("default-src 'self'");
		expect(response.headers.get("Strict-Transport-Security")).toContain("max-age=31536000");
	});

	test("preserves original response body", () => {
		const originalResponse = new Response("Test body", {
			status: 200,
		});

		const response = applySecurityHeaders(originalResponse, defaultSecurityHeaders);

		expect(response.body).toBeDefined();
	});

	test("preserves original response status", () => {
		const originalResponse = new Response("Not Found", {
			status: 404,
		});

		const response = applySecurityHeaders(originalResponse, defaultSecurityHeaders);

		expect(response.status).toBe(404);
		expect(response.statusText).toBe("Not Found");
	});
});

describe("defaultSecurityHeaders", () => {
	test("has all expected properties", () => {
		expect(defaultSecurityHeaders.csp).toBeDefined();
		expect(defaultSecurityHeaders.hsts).toBeDefined();
		expect(defaultSecurityHeaders.contentTypeOptions).toBe(true);
		expect(defaultSecurityHeaders.frameOptions).toBeDefined();
		expect(defaultSecurityHeaders.referrerPolicy).toBeDefined();
		expect(defaultSecurityHeaders.permissionsPolicy).toBeDefined();
		expect(defaultSecurityHeaders.crossOriginOpenerPolicy).toBeDefined();
		expect(defaultSecurityHeaders.crossOriginEmbedderPolicy).toBeDefined();
		expect(defaultSecurityHeaders.crossOriginResourcePolicy).toBeDefined();
		expect(defaultSecurityHeaders.cacheControl).toBeDefined();
	});

	test("CSP has secure defaults", () => {
		expect(defaultSecurityHeaders.csp?.defaultSrc).toEqual(["'self'"]);
		expect(defaultSecurityHeaders.csp?.scriptSrc).toEqual(["'self'"]);
		expect(defaultSecurityHeaders.csp?.objectSrc).toEqual(["'none'"]);
		expect(defaultSecurityHeaders.csp?.frameAncestors).toEqual(["'none'"]);
		expect(defaultSecurityHeaders.csp?.upgradeInsecureRequests).toBe(true);
		expect(defaultSecurityHeaders.csp?.blockAllMixedContent).toBe(true);
	});

	test("HSTS has secure defaults", () => {
		expect(defaultSecurityHeaders.hsts?.maxAge).toBe(31536000);
		expect(defaultSecurityHeaders.hsts?.includeSubDomains).toBe(true);
		expect(defaultSecurityHeaders.hsts?.preload).toBe(true);
	});

	test("frameOptions defaults to DENY", () => {
		expect(defaultSecurityHeaders.frameOptions?.option).toBe("DENY");
	});

	test("referrerPolicy defaults to strict-origin-when-cross-origin", () => {
		expect(defaultSecurityHeaders.referrerPolicy).toBe("strict-origin-when-cross-origin");
	});
});
