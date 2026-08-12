import { describe, expect, test } from "bun:test";
import { applySecurityHeaders, defaultSecurityHeaders, securityHeaders } from "../../src/";

describe("CSP - No unsafe-inline", () => {
	test("default CSP does not contain unsafe-inline", () => {
		const csp = defaultSecurityHeaders.csp!;
		expect(csp.styleSrc).toEqual(["'self'"]);
		expect(csp.scriptSrc).toEqual(["'self'"]);
		expect(csp.styleSrc!.some((s) => s.includes("unsafe-inline"))).toBe(false);
		expect(csp.scriptSrc!.some((s) => s.includes("unsafe-inline"))).toBe(false);
		expect(csp.scriptSrc!.some((s) => s.includes("unsafe-eval"))).toBe(false);
	});

	test("default CSP includes base-uri and form-action", () => {
		const csp = defaultSecurityHeaders.csp!;
		expect(csp.baseUri).toEqual(["'self'"]);
		expect(csp.formAction).toEqual(["'self'"]);
	});

	test("default CSP includes frame-ancestors none", () => {
		const csp = defaultSecurityHeaders.csp!;
		expect(csp.frameAncestors).toEqual(["'none'"]);
	});

	test("securityHeaders middleware with default config applies strict CSP", () => {
		const middleware = securityHeaders(defaultSecurityHeaders);
		const request = new Request("https://example.com");
		const result = middleware(request);

		const csp = result?.headers.get("Content-Security-Policy") ?? "";
		expect(csp).toContain("default-src 'self'");
		expect(csp).toContain("script-src 'self'");
		expect(csp).toContain("style-src 'self'");
		expect(csp).toContain("base-uri 'self'");
		expect(csp).toContain("form-action 'self'");
		expect(csp).toContain("frame-ancestors 'none'");
		expect(csp).toContain("upgrade-insecure-requests");
		expect(csp).not.toContain("unsafe-inline");
		expect(csp).not.toContain("unsafe-eval");
	});

	test("applySecurityHeaders with default config applies strict CSP", () => {
		const response = applySecurityHeaders(
			new Response("OK", { status: 200 }),
			defaultSecurityHeaders,
		);

		const csp = response.headers.get("Content-Security-Policy") ?? "";
		expect(csp).toContain("default-src 'self'");
		expect(csp).toContain("script-src 'self'");
		expect(csp).toContain("style-src 'self'");
		expect(csp).toContain("base-uri 'self'");
		expect(csp).toContain("form-action 'self'");
		expect(csp).toContain("frame-ancestors 'none'");
		expect(csp).not.toContain("unsafe-inline");
	});

	test("custom CSP without config uses minimal defaults", () => {
		const config = {
			csp: {
				enabled: true,
				defaultSrc: ["'self'"],
			},
		};

		const response = applySecurityHeaders(new Response("OK", { status: 200 }), config);
		const csp = response.headers.get("Content-Security-Policy") ?? "";
		expect(csp).toContain("default-src 'self'");
		expect(csp).not.toContain("unsafe-inline");
	});
});

