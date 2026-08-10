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
import {
	Recaptcha,
	type RecaptchaRef,
} from "../../../src/components/Recaptcha";
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

const TEST_SITE_KEY = "test-recaptcha-site-key";
const RECAPTCHA_SCRIPT_ID = "recaptcha-script";
const RECAPTCHA_SCRIPT_URL = "https://www.google.com/recaptcha/api.js";

function createMockGrecaptcha() {
	return {
		render: mock(() => "recaptcha-widget-1"),
		reset: mock(),
		execute: mock(() => Promise.resolve("test-token")),
		getResponse: mock(() => "test-response"),
	};
}

function setGrecaptcha(
	mock: ReturnType<typeof createMockGrecaptcha> | undefined,
) {
	(window as Record<string, unknown>).grecaptcha = mock;
}

describe("Recaptcha component", () => {
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
			setGrecaptcha(createMockGrecaptcha());

			const { container } = render(
				createElement(Recaptcha, { siteKey: TEST_SITE_KEY }),
			);

			expect(
				container.querySelector('[data-testid="recaptcha-container"]'),
			).toBeTruthy();
		});

		it("does NOT render any error divs", () => {
			setGrecaptcha(createMockGrecaptcha());

			const { container } = render(
				createElement(Recaptcha, { siteKey: TEST_SITE_KEY }),
			);

			expect(container.innerHTML).not.toContain("recaptcha-error");
			expect(container.innerHTML).not.toContain('role="alert"');
		});

		it("does NOT have any inline styles", () => {
			setGrecaptcha(createMockGrecaptcha());

			const { container } = render(
				createElement(Recaptcha, { siteKey: TEST_SITE_KEY }),
			);

			const div = container.querySelector(
				'[data-testid="recaptcha-container"]',
			);
			expect(div).toBeTruthy();
			expect(div?.getAttribute("style")).toBeNull();
		});

		it("renders an empty container (no children)", () => {
			setGrecaptcha(createMockGrecaptcha());

			const { container } = render(
				createElement(Recaptcha, { siteKey: TEST_SITE_KEY }),
			);

			const div = container.querySelector(
				'[data-testid="recaptcha-container"]',
			);
			expect(div?.children.length).toBe(0);
		});
	});

	describe("SSR safety", () => {
		it("renders container div even when window is undefined", () => {
			const originalWindow = (globalThis as Record<string, unknown>).window;
			delete (globalThis as Record<string, unknown>).window;

			const html = renderToString(
				createElement(Recaptcha, { siteKey: TEST_SITE_KEY }),
			);

			expect(html).toContain("recaptcha-container");

			(globalThis as Record<string, unknown>).window = originalWindow;
		});
	});

	describe("script loading", () => {
		it("creates a script element with correct src for invisible size", () => {
			render(
				createElement(Recaptcha, { siteKey: TEST_SITE_KEY, size: "invisible" }),
			);

			const script = document.getElementById(RECAPTCHA_SCRIPT_ID);
			expect(script).toBeTruthy();
			expect((script as HTMLScriptElement)?.src).toBe(
				`${RECAPTCHA_SCRIPT_URL}?render=${TEST_SITE_KEY}`,
			);
			expect((script as HTMLScriptElement)?.async).toBe(true);
		});

		it("creates a script element without render param for normal size", () => {
			render(
				createElement(Recaptcha, { siteKey: TEST_SITE_KEY, size: "normal" }),
			);

			const script = document.getElementById(RECAPTCHA_SCRIPT_ID);
			expect(script).toBeTruthy();
			expect((script as HTMLScriptElement)?.src).toBe(RECAPTCHA_SCRIPT_URL);
		});

		it("does NOT create a script when grecaptcha is already available", () => {
			setGrecaptcha(createMockGrecaptcha());

			render(
				createElement(Recaptcha, { siteKey: TEST_SITE_KEY }),
			);

			expect(document.getElementById(RECAPTCHA_SCRIPT_ID)).toBeNull();
		});

		it("on script load error, calls onError callback", async () => {
			setGrecaptcha(undefined);

			const onError = mock();

			render(
				createElement(Recaptcha, { siteKey: TEST_SITE_KEY, onError }),
			);

			await act(async () => {
				triggerScriptError(RECAPTCHA_SCRIPT_ID);
				await flushPromises();
			});

			expect(onError).toHaveBeenCalled();
		});

		it("does NOT load script when siteKey is missing", () => {
			setGrecaptcha(createMockGrecaptcha());

			render(createElement(Recaptcha, { siteKey: undefined }));

			expect(document.getElementById(RECAPTCHA_SCRIPT_ID)).toBeNull();
		});
	});

	describe("widget rendering", () => {
		it("calls grecaptcha.render with container element and correct options", async () => {
			const mockGrecaptcha = createMockGrecaptcha();
			setGrecaptcha(mockGrecaptcha);

			render(
				createElement(Recaptcha, { siteKey: TEST_SITE_KEY }),
			);

			await act(async () => {
				await flushPromises();
			});

			expect(mockGrecaptcha.render).toHaveBeenCalledTimes(1);
			const [container, options] = mockGrecaptcha.render.mock.calls[0];
			expect(container).toBeInstanceOf(window.HTMLDivElement);
			expect(options.sitekey).toBe(TEST_SITE_KEY);
			expect(options.callback).toEqual(expect.any(Function));
			expect(options["error-callback"]).toEqual(expect.any(Function));
			expect(options["expired-callback"]).toEqual(expect.any(Function));
		});

		it("passes through size, theme, action, and tabIndex options", async () => {
			const mockGrecaptcha = createMockGrecaptcha();
			setGrecaptcha(mockGrecaptcha);

			render(
				createElement(Recaptcha, {
					siteKey: TEST_SITE_KEY,
					size: "normal",
					theme: "dark",
					action: "signup",
					tabIndex: 5,
				}),
			);

			await act(async () => {
				await flushPromises();
			});

			const [, options] = mockGrecaptcha.render.mock.calls[0];
			expect(options.sitekey).toBe(TEST_SITE_KEY);
			expect(options.size).toBe("normal");
			expect(options.theme).toBe("dark");
			expect(options.action).toBe("signup");
			expect(options.tabIndex).toBe(5);
		});

		it("defaults size to invisible and theme to auto", async () => {
			const mockGrecaptcha = createMockGrecaptcha();
			setGrecaptcha(mockGrecaptcha);

			render(
				createElement(Recaptcha, { siteKey: TEST_SITE_KEY }),
			);

			await act(async () => {
				await flushPromises();
			});

			const [, options] = mockGrecaptcha.render.mock.calls[0];
			expect(options.size).toBe("invisible");
			expect(options.theme).toBe("auto");
		});

		it("does NOT call render when siteKey is missing", async () => {
			const mockGrecaptcha = createMockGrecaptcha();
			setGrecaptcha(mockGrecaptcha);

			render(createElement(Recaptcha, { siteKey: undefined }));

			await act(async () => {
				await flushPromises();
			});

			expect(mockGrecaptcha.render).not.toHaveBeenCalled();
		});
	});

	describe("callback propagation", () => {
		it("onVerify calls ctx.setToken and the onVerify prop", async () => {
			const mockGrecaptcha = createMockGrecaptcha();
			setGrecaptcha(mockGrecaptcha);

			let capturedCallback: ((token: string) => void) | null = null;
			let capturedError: ((err?: string) => void) | null = null;

			mockGrecaptcha.render.mockImplementation((_el, opts) => {
				capturedCallback = opts.callback;
				capturedError = opts["error-callback"];
				return "recaptcha-widget-1";
			});

			const onVerify = mock();

			render(
				createElement(
					CaptchaProvider,
					{ provider: "recaptcha" },
					createElement(Recaptcha, {
						siteKey: TEST_SITE_KEY,
						onVerify,
					}),
				),
			);

			await act(async () => {
				await flushPromises();
			});

			const testToken = "verify-token-456";
			await act(async () => {
				capturedCallback?.(testToken);
			});

			expect(onVerify).toHaveBeenCalledWith(testToken);
		});

		it("onError calls ctx.setError and the onError prop", async () => {
			const mockGrecaptcha = createMockGrecaptcha();
			setGrecaptcha(mockGrecaptcha);

			let capturedError: ((err?: string) => void) | null = null;

			mockGrecaptcha.render.mockImplementation((_el, opts) => {
				capturedError = opts["error-callback"];
				return "recaptcha-widget-1";
			});

			const onError = mock();

			render(
				createElement(Recaptcha, { siteKey: TEST_SITE_KEY, onError }),
			);

			await act(async () => {
				await flushPromises();
			});

			await act(async () => {
				capturedError?.();
			});

			expect(onError).toHaveBeenCalled();
		});

		it("onExpire calls ctx.resetToken and the onExpire prop", async () => {
			const mockGrecaptcha = createMockGrecaptcha();
			setGrecaptcha(mockGrecaptcha);

			let capturedExpire: (() => void) | null = null;

			mockGrecaptcha.render.mockImplementation((_el, opts) => {
				capturedExpire = opts["expired-callback"];
				return "recaptcha-widget-1";
			});

			const onExpire = mock();

			render(
				createElement(Recaptcha, { siteKey: TEST_SITE_KEY, onExpire }),
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
		it("execute() calls grecaptcha.execute with widgetId and action", async () => {
			const mockGrecaptcha = createMockGrecaptcha();
			setGrecaptcha(mockGrecaptcha);

			const ref = createRef<RecaptchaRef>();

			render(
				createElement(Recaptcha, {
					ref,
					siteKey: TEST_SITE_KEY,
					action: "login",
				}),
			);

			await act(async () => {
				await flushPromises();
			});

			await act(async () => {
				await ref.current?.execute("custom_action");
			});

			expect(mockGrecaptcha.execute).toHaveBeenCalledWith(
				"recaptcha-widget-1",
				{ action: "custom_action" },
			);
		});

		it("execute() uses component action when no action passed", async () => {
			const mockGrecaptcha = createMockGrecaptcha();
			setGrecaptcha(mockGrecaptcha);

			const ref = createRef<RecaptchaRef>();

			render(
				createElement(Recaptcha, {
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

			expect(mockGrecaptcha.execute).toHaveBeenCalledWith(
				"recaptcha-widget-1",
				{ action: "login" },
			);
		});

		it("execute() returns null when grecaptcha is not available", async () => {
			setGrecaptcha(undefined);

			const ref = createRef<RecaptchaRef>();

			render(
				createElement(Recaptcha, {
					ref,
					siteKey: TEST_SITE_KEY,
					size: "invisible",
				}),
			);

			await act(async () => {
				triggerScriptLoad(RECAPTCHA_SCRIPT_ID);
				await flushPromises();
			});

			const result = await ref.current?.execute();
			expect(result).toBeNull();
		});

		it("reset() calls grecaptcha.reset with widgetId", async () => {
			const mockGrecaptcha = createMockGrecaptcha();
			setGrecaptcha(mockGrecaptcha);

			const ref = createRef<RecaptchaRef>();

			render(
				createElement(Recaptcha, {
					ref,
					siteKey: TEST_SITE_KEY,
				}),
			);

			await act(async () => {
				await flushPromises();
			});

			await act(async () => {
				ref.current?.reset();
			});

			expect(mockGrecaptcha.reset).toHaveBeenCalledWith(
				"recaptcha-widget-1",
				undefined,
			);
		});

		it("reset() passes token parameter to grecaptcha.reset", async () => {
			const mockGrecaptcha = createMockGrecaptcha();
			setGrecaptcha(mockGrecaptcha);

			const ref = createRef<RecaptchaRef>();

			render(
				createElement(Recaptcha, {
					ref,
					siteKey: TEST_SITE_KEY,
				}),
			);

			await act(async () => {
				await flushPromises();
			});

			await act(async () => {
				ref.current?.reset("specific-token");
			});

			expect(mockGrecaptcha.reset).toHaveBeenCalledWith(
				"recaptcha-widget-1",
				"specific-token",
			);
		});

		it("getResponse() returns grecaptcha.getResponse for widget", async () => {
			const mockGrecaptcha = createMockGrecaptcha();
			mockGrecaptcha.getResponse.mockReturnValue("mock-response");
			setGrecaptcha(mockGrecaptcha);

			const ref = createRef<RecaptchaRef>();

			render(
				createElement(Recaptcha, {
					ref,
					siteKey: TEST_SITE_KEY,
				}),
			);

			await act(async () => {
				await flushPromises();
			});

			const response = ref.current?.getResponse();
			expect(response).toBe("mock-response");
		});

		it("getResponse() returns empty string when grecaptcha is not available", () => {
			setGrecaptcha(undefined);

			const ref = createRef<RecaptchaRef>();

			render(
				createElement(Recaptcha, {
					ref,
					siteKey: TEST_SITE_KEY,
				}),
			);

			expect(ref.current?.getResponse()).toBe("");
		});
	});

	describe("cleanup on unmount", () => {
		it("calls grecaptcha.reset on unmount when widget exists", async () => {
			const mockGrecaptcha = createMockGrecaptcha();
			setGrecaptcha(mockGrecaptcha);

			const { unmount } = render(
				createElement(Recaptcha, { siteKey: TEST_SITE_KEY }),
			);

			await act(async () => {
				await flushPromises();
			});

			expect(mockGrecaptcha.reset).not.toHaveBeenCalled();

			await act(async () => {
				unmount();
			});

			expect(mockGrecaptcha.reset).toHaveBeenCalledWith(
				"recaptcha-widget-1",
			);
		});

		it("does NOT call reset on unmount when widgetId is null", () => {
			const mockGrecaptcha = createMockGrecaptcha();
			setGrecaptcha(mockGrecaptcha);

			const { unmount } = render(
				createElement(Recaptcha, { siteKey: TEST_SITE_KEY }),
			);

			act(() => {
				unmount();
			});

			expect(mockGrecaptcha.reset).not.toHaveBeenCalled();
		});
	});

	describe("displayName", () => {
		it("has the correct displayName", () => {
			expect(Recaptcha.displayName).toBe("Recaptcha");
		});
	});

	describe("type exports", () => {
		it("exports RecaptchaRef and RecaptchaProps types", () => {
			const ref: RecaptchaRef = {
				execute: mock(),
				reset: mock(),
				getResponse: mock(() => ""),
			};
			expect(ref).toBeTruthy();
		});
	});
});
