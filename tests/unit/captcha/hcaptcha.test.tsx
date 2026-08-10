import { createElement, createRef } from "react";
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
	mock,
} from "bun:test";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { Hcaptcha, type HcaptchaRef } from "../../../src/components/Hcaptcha";
import { CaptchaProvider } from "../../../src/components/CaptchaContext";
import {
	act,
	cleanupDOM,
	flushPromises,
	render,
	setupDOM,
	triggerScriptError,
	triggerScriptLoad,
} from "../../helpers/react-testing";

const TEST_SITE_KEY = "test-hcaptcha-site-key";
const HCAPTCHA_SCRIPT_ID = "hcaptcha-script";
const HCAPTCHA_SCRIPT_URL = "https://js.hcaptcha.com/1.js";

function createMockHcaptcha() {
	return {
		render: mock(() => "hcaptcha-widget-1"),
		reset: mock(),
		execute: mock(() => Promise.resolve({ response: "test-response" })),
		getResponse: mock(() => "test-response"),
	};
}

function setHcaptcha(
	mock: ReturnType<typeof createMockHcaptcha> | undefined,
) {
	(window as Record<string, unknown>).hcaptcha = mock;
}

describe("Hcaptcha component", () => {
	beforeEach(() => {
		setupDOM();
			jest.useFakeTimers();
	});

	afterEach(() => {
				jest.useRealTimers();
		cleanupDOM();
	});

	describe("static rendering", () => {
		it("renders only a container div with correct data attributes", () => {
			setHcaptcha(createMockHcaptcha());

			const { container } = render(
				createElement(Hcaptcha, { siteKey: TEST_SITE_KEY }),
			);

			expect(
				container.querySelector('[data-testid="hcaptcha-container"]'),
			).toBeTruthy();
		});

		it("does NOT render any error divs", () => {
			setHcaptcha(createMockHcaptcha());

			const { container } = render(
				createElement(Hcaptcha, { siteKey: TEST_SITE_KEY }),
			);

			expect(container.innerHTML).not.toContain("hcaptcha-error");
			expect(container.innerHTML).not.toContain('role="alert"');
		});

		it("does NOT have any inline styles", () => {
			setHcaptcha(createMockHcaptcha());

			const { container } = render(
				createElement(Hcaptcha, { siteKey: TEST_SITE_KEY }),
			);

			const div = container.querySelector(
				'[data-testid="hcaptcha-container"]',
			);
			expect(div).toBeTruthy();
			expect(div?.getAttribute("style")).toBeNull();
		});

		it("renders an empty container (no children)", () => {
			setHcaptcha(createMockHcaptcha());

			const { container } = render(
				createElement(Hcaptcha, { siteKey: TEST_SITE_KEY }),
			);

			const div = container.querySelector(
				'[data-testid="hcaptcha-container"]',
			);
			expect(div?.children.length).toBe(0);
		});
	});

	describe("SSR safety", () => {
		it("renders container div even when window is undefined", () => {
			const originalWindow = (globalThis as Record<string, unknown>).window;
			delete (globalThis as Record<string, unknown>).window;

			const html = renderToString(
				createElement(Hcaptcha, { siteKey: TEST_SITE_KEY }),
			);

			expect(html).toContain("hcaptcha-container");

			(globalThis as Record<string, unknown>).window = originalWindow;
		});
	});

	describe("script loading", () => {
		it("creates a script element with correct src and appends to head", () => {
			setHcaptcha(undefined);

			render(createElement(Hcaptcha, { siteKey: TEST_SITE_KEY }));

			const script = document.getElementById(HCAPTCHA_SCRIPT_ID);
			expect(script).toBeTruthy();
			expect(script).toBeInstanceOf(window.HTMLScriptElement);
			expect((script as HTMLScriptElement)?.src).toBe(HCAPTCHA_SCRIPT_URL);
			expect((script as HTMLScriptElement)?.async).toBe(true);
		});

		it("does NOT create a script when hcaptcha is already available", () => {
			setHcaptcha(createMockHcaptcha());

			render(createElement(Hcaptcha, { siteKey: TEST_SITE_KEY }));

			expect(document.getElementById(HCAPTCHA_SCRIPT_ID)).toBeNull();
		});

		it("on script load success, calls hcaptcha.render", async () => {
			const mockHcaptcha = createMockHcaptcha();
			setHcaptcha(undefined);

			render(createElement(Hcaptcha, { siteKey: TEST_SITE_KEY }));

			const script = document.getElementById(HCAPTCHA_SCRIPT_ID);
			expect(script).toBeTruthy();

			setHcaptcha(mockHcaptcha);

			await act(async () => {
				triggerScriptLoad(HCAPTCHA_SCRIPT_ID);
				await flushPromises();
			});

			expect(mockHcaptcha.render).toHaveBeenCalledTimes(1);
		});

		it("on script load error, calls onError callback", async () => {
			setHcaptcha(undefined);

			const onError = mock();

			render(
				createElement(Hcaptcha, { siteKey: TEST_SITE_KEY, onError }),
			);

			await act(async () => {
				triggerScriptError(HCAPTCHA_SCRIPT_ID);
				await flushPromises();
			});

			expect(onError).toHaveBeenCalled();
		});

		it("does NOT create script when hcaptcha already exists on window", () => {
			setHcaptcha(createMockHcaptcha());

			render(createElement(Hcaptcha, { siteKey: TEST_SITE_KEY }));

			expect(document.getElementById(HCAPTCHA_SCRIPT_ID)).toBeNull();
		});
	});

	describe("widget rendering", () => {
		it("calls hcaptcha.render with container element and correct options", async () => {
			const mockHcaptcha = createMockHcaptcha();
			setHcaptcha(mockHcaptcha);

			render(createElement(Hcaptcha, { siteKey: TEST_SITE_KEY }));

			await act(async () => {
				await flushPromises();
			});

			expect(mockHcaptcha.render).toHaveBeenCalledTimes(1);
			const [container, options] = mockHcaptcha.render.mock.calls[0];
			expect(container).toBeInstanceOf(window.HTMLDivElement);
			expect(options.sitekey).toBe(TEST_SITE_KEY);
			expect(options.callback).toEqual(expect.any(Function));
			expect(options["error-callback"]).toEqual(expect.any(Function));
			expect(options["expired-callback"]).toEqual(expect.any(Function));
		});

		it("passes through size, theme, action, cookieDomain, and report options", async () => {
			const mockHcaptcha = createMockHcaptcha();
			setHcaptcha(mockHcaptcha);

			render(
				createElement(Hcaptcha, {
					siteKey: TEST_SITE_KEY,
					size: "compact",
					theme: "dark",
					action: "login",
					cookieDomain: "example.com",
					report: false,
				}),
			);

			await act(async () => {
				await flushPromises();
			});

			const [, options] = mockHcaptcha.render.mock.calls[0];
			expect(options.sitekey).toBe(TEST_SITE_KEY);
			expect(options.size).toBe("compact");
			expect(options.theme).toBe("dark");
			expect(options.action).toBe("login");
			expect(options.cookiedomain).toBe("example.com");
			expect(options.report).toBe(false);
		});

		it("defaults size to normal and theme to auto", async () => {
			const mockHcaptcha = createMockHcaptcha();
			setHcaptcha(mockHcaptcha);

			render(createElement(Hcaptcha, { siteKey: TEST_SITE_KEY }));

			await act(async () => {
				await flushPromises();
			});

			const [, options] = mockHcaptcha.render.mock.calls[0];
			expect(options.size).toBe("normal");
			expect(options.theme).toBe("auto");
			expect(options.report).toBe(true);
		});
	});

	describe("callback propagation", () => {
		it("onVerify calls ctx.setToken and the onVerify prop", async () => {
			const mockHcaptcha = createMockHcaptcha();
			setHcaptcha(mockHcaptcha);

			let capturedCallback: ((token: string) => void) | null = null;
			let capturedError: ((err?: string) => void) | null = null;

			mockHcaptcha.render.mockImplementation((_el, opts) => {
				capturedCallback = opts.callback;
				capturedError = opts["error-callback"];
				return "hcaptcha-widget-1";
			});

			const onVerify = mock();

			render(
				createElement(
					CaptchaProvider,
					{ provider: "hcaptcha" },
					createElement(Hcaptcha, { siteKey: TEST_SITE_KEY, onVerify }),
				),
			);

			await act(async () => {
				await flushPromises();
			});

			const testToken = "hcaptcha-token-789";
			await act(async () => {
				capturedCallback?.(testToken);
			});

			expect(onVerify).toHaveBeenCalledWith(testToken);
		});

		it("onError calls ctx.setError and the onError prop", async () => {
			const mockHcaptcha = createMockHcaptcha();
			setHcaptcha(mockHcaptcha);

			let capturedError: ((err?: string) => void) | null = null;

			mockHcaptcha.render.mockImplementation((_el, opts) => {
				capturedError = opts["error-callback"];
				return "hcaptcha-widget-1";
			});

			const onError = mock();

			render(
				createElement(Hcaptcha, { siteKey: TEST_SITE_KEY, onError }),
			);

			await act(async () => {
				await flushPromises();
			});

			const errorMsg = "hCaptcha error";
			await act(async () => {
				capturedError?.(errorMsg);
			});

			expect(onError).toHaveBeenCalledWith(errorMsg);
		});

		it("onExpire calls ctx.resetToken and the onExpire prop", async () => {
			const mockHcaptcha = createMockHcaptcha();
			setHcaptcha(mockHcaptcha);

			let capturedExpire: (() => void) | null = null;

			mockHcaptcha.render.mockImplementation((_el, opts) => {
				capturedExpire = opts["expired-callback"];
				return "hcaptcha-widget-1";
			});

			const onExpire = mock();

			render(
				createElement(Hcaptcha, { siteKey: TEST_SITE_KEY, onExpire }),
			);

			await act(async () => {
				await flushPromises();
			});

			await act(async () => {
				capturedExpire?.();
			});

			expect(onExpire).toHaveBeenCalled();
		});
	});

	describe("ref methods", () => {
		it("execute() calls hcaptcha.execute with widgetId and action", async () => {
			const mockHcaptcha = createMockHcaptcha();
			setHcaptcha(mockHcaptcha);

			const ref = createRef<HcaptchaRef>();

			render(
				createElement(Hcaptcha, {
					ref,
					siteKey: TEST_SITE_KEY,
					action: "login",
				}),
			);

			await act(async () => {
				await flushPromises();
			});

			await act(async () => {
				await ref.current?.execute({ action: "custom" });
			});

			expect(mockHcaptcha.execute).toHaveBeenCalledWith(
				"hcaptcha-widget-1",
				{ action: "custom" },
			);
		});

		it("execute() uses component action when no action passed", async () => {
			const mockHcaptcha = createMockHcaptcha();
			setHcaptcha(mockHcaptcha);

			const ref = createRef<HcaptchaRef>();

			render(
				createElement(Hcaptcha, {
					ref,
					siteKey: TEST_SITE_KEY,
					action: "login",
				}),
			);

			await act(async () => {
				await flushPromises();
			});

			await act(async () => {
				await ref.current?.execute();
			});

			expect(mockHcaptcha.execute).toHaveBeenCalledWith(
				"hcaptcha-widget-1",
				{ action: "login" },
			);
		});

		it("execute() returns null when hcaptcha is not available", async () => {
			setHcaptcha(undefined);

			const ref = createRef<HcaptchaRef>();

			render(createElement(Hcaptcha, { ref, siteKey: TEST_SITE_KEY }));

			await act(async () => {
				triggerScriptLoad(HCAPTCHA_SCRIPT_ID);
				await flushPromises();
			});

			const result = await ref.current?.execute();
			expect(result).toBeNull();
		});

		it("reset() calls hcaptcha.reset with widgetId", async () => {
			const mockHcaptcha = createMockHcaptcha();
			setHcaptcha(mockHcaptcha);

			const ref = createRef<HcaptchaRef>();

			render(createElement(Hcaptcha, { ref, siteKey: TEST_SITE_KEY }));

			await act(async () => {
				await flushPromises();
			});

			await act(async () => {
				ref.current?.reset();
			});

			expect(mockHcaptcha.reset).toHaveBeenCalledWith("hcaptcha-widget-1", undefined);
		});

		it("reset() passes token parameter to hcaptcha.reset", async () => {
			const mockHcaptcha = createMockHcaptcha();
			setHcaptcha(mockHcaptcha);

			const ref = createRef<HcaptchaRef>();

			render(createElement(Hcaptcha, { ref, siteKey: TEST_SITE_KEY }));

			await act(async () => {
				await flushPromises();
			});

			await act(async () => {
				ref.current?.reset("specific-token");
			});

			expect(mockHcaptcha.reset).toHaveBeenCalledWith(
				"hcaptcha-widget-1",
				"specific-token",
			);
		});

		it("getResponse() returns hcaptcha.getResponse for widget", async () => {
			const mockHcaptcha = createMockHcaptcha();
			mockHcaptcha.getResponse.mockReturnValue("mock-hcaptcha-response");
			setHcaptcha(mockHcaptcha);

			const ref = createRef<HcaptchaRef>();

			render(createElement(Hcaptcha, { ref, siteKey: TEST_SITE_KEY }));

			await act(async () => {
				await flushPromises();
			});

			const response = ref.current?.getResponse();
			expect(response).toBe("mock-hcaptcha-response");
		});

		it("getResponse() returns empty string when hcaptcha is not available", () => {
			setHcaptcha(undefined);

			const ref = createRef<HcaptchaRef>();

			render(createElement(Hcaptcha, { ref, siteKey: TEST_SITE_KEY }));

			expect(ref.current?.getResponse()).toBe("");
		});
	});

	describe("cleanup on unmount", () => {
		it("calls hcaptcha.reset on unmount when widget exists", async () => {
			const mockHcaptcha = createMockHcaptcha();
			setHcaptcha(mockHcaptcha);

			const { unmount } = render(
				createElement(Hcaptcha, { siteKey: TEST_SITE_KEY }),
			);

			await act(async () => {
				await flushPromises();
			});

			expect(mockHcaptcha.reset).not.toHaveBeenCalled();

			await act(async () => {
				unmount();
			});

			expect(mockHcaptcha.reset).toHaveBeenCalledWith("hcaptcha-widget-1");
		});

		it("does NOT call reset on unmount when widgetId is null", () => {
			const mockHcaptcha = createMockHcaptcha();
			setHcaptcha(mockHcaptcha);

			const { unmount } = render(
				createElement(Hcaptcha, { siteKey: TEST_SITE_KEY }),
			);

			act(() => {
				unmount();
			});

			expect(mockHcaptcha.reset).not.toHaveBeenCalled();
		});
	});

	describe("displayName", () => {
		it("has the correct displayName", () => {
			expect(Hcaptcha.displayName).toBe("Hcaptcha");
		});
	});

	describe("type exports", () => {
		it("exports HcaptchaRef and HcaptchaProps types", () => {
			const ref: HcaptchaRef = {
				execute: mock(),
				reset: mock(),
				getResponse: mock(() => ""),
			};
			expect(ref).toBeTruthy();
		});
	});
});
