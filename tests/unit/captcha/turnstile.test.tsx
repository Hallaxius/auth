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
import { Turnstile, type TurnstileRef } from "../../../src/components/Turnstile";
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

const TEST_SITE_KEY = "test-turnstile-site-key";
const TURNSTILE_SCRIPT_ID = "turnstile-script";
const TURNSTILE_SCRIPT_URL =
	"https://challenges.cloudflare.com/turnstile/v0/api.js";

function createMockTurnstile() {
	return {
		render: mock(() => "widget-id-1"),
		reset: mock(),
		execute: mock(),
	};
}

function setTurnstile(
	mock: ReturnType<typeof createMockTurnstile> | undefined,
) {
	(window as Record<string, unknown>).turnstile = mock;
}

describe("Turnstile component", () => {
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
			const { container } = render(
				createElement(Turnstile, { siteKey: TEST_SITE_KEY }),
			);

			expect(
				container.querySelector('[data-testid="turnstile-container"]'),
			).toBeTruthy();
			expect(
				container.querySelector('[data-captcha-provider="turnstile"]'),
			).toBeTruthy();
		});

		it("does NOT render any error divs", () => {
			const { container } = render(
				createElement(Turnstile, { siteKey: TEST_SITE_KEY }),
			);

			expect(container.innerHTML).not.toContain("turnstile-error");
			expect(container.innerHTML).not.toContain('role="alert"');
		});

		it("does NOT have any inline styles", () => {
			const { container } = render(
				createElement(Turnstile, { siteKey: TEST_SITE_KEY }),
			);

			const div = container.querySelector(
				'[data-testid="turnstile-container"]',
			);
			expect(div).toBeTruthy();
			expect(div?.getAttribute("style")).toBeNull();
		});

		it("renders an empty container (no children)", () => {
			const { container } = render(
				createElement(Turnstile, { siteKey: TEST_SITE_KEY }),
			);

			const div = container.querySelector(
				'[data-testid="turnstile-container"]',
			);
			expect(div?.children.length).toBe(0);
		});
	});

	describe("SSR safety", () => {
		it("renders container div even when window is undefined", () => {
			const originalWindow = (globalThis as Record<string, unknown>).window;
			delete (globalThis as Record<string, unknown>).window;

			const html = renderToString(
				createElement(Turnstile, { siteKey: TEST_SITE_KEY }),
			);

			expect(html).toContain("turnstile-container");

			(globalThis as Record<string, unknown>).window = originalWindow;
		});
	});

	describe("script loading", () => {
		it("creates a script element with correct attributes and appends to head", () => {
			setTurnstile(createMockTurnstile());

			render(createElement(Turnstile, { siteKey: TEST_SITE_KEY }));

			const script = document.getElementById(TURNSTILE_SCRIPT_ID);
			expect(script).toBeTruthy();
			expect(script).toBeInstanceOf(window.HTMLScriptElement);
			expect(script?.getAttribute("src")).toBe(TURNSTILE_SCRIPT_URL);
			expect((script as HTMLScriptElement)?.async).toBe(true);
			expect((script as HTMLScriptElement)?.defer).toBe(true);
		});

		it("on script load success, calls turnstile.render", async () => {
			const mockTurnstile = createMockTurnstile();
			setTurnstile(mockTurnstile);

			render(createElement(Turnstile, { siteKey: TEST_SITE_KEY }));

			await act(async () => {
				triggerScriptLoad(TURNSTILE_SCRIPT_ID);
				await flushPromises();
			});

			expect(mockTurnstile.render).toHaveBeenCalledTimes(1);
		});

		it("on script load error, calls onError callback", async () => {
			setTurnstile(undefined);

			const onError = mock();

			render(
				createElement(CaptchaProvider, { provider: "turnstile" },
					createElement(Turnstile, { siteKey: TEST_SITE_KEY, onError }),
				),
			);

			await act(async () => {
				triggerScriptError(TURNSTILE_SCRIPT_ID);
				await flushPromises();
			});

			expect(onError).toHaveBeenCalled();
		});

		it("does NOT create a duplicate script if it already exists", () => {
			setTurnstile(createMockTurnstile());

			render(createElement(Turnstile, { siteKey: TEST_SITE_KEY }));

			const script = document.getElementById(TURNSTILE_SCRIPT_ID);
			expect(script).toBeTruthy();

			render(createElement(Turnstile, { siteKey: TEST_SITE_KEY }));

			const scripts = document.querySelectorAll(
				`script[src="${TURNSTILE_SCRIPT_URL}"]`,
			);
			expect(scripts.length).toBe(1);
		});
	});

	describe("widget rendering", () => {
		it("calls turnstile.render with the container element and correct options", async () => {
			const mockTurnstile = createMockTurnstile();
			setTurnstile(mockTurnstile);

			render(createElement(Turnstile, { siteKey: TEST_SITE_KEY }));

			await act(async () => {
				triggerScriptLoad(TURNSTILE_SCRIPT_ID);
				await flushPromises();
			});

			expect(mockTurnstile.render).toHaveBeenCalledTimes(1);
			const [container, options] = mockTurnstile.render.mock.calls[0];
			expect(container).toBeInstanceOf(window.HTMLDivElement);
			expect(options.sitekey).toBe(TEST_SITE_KEY);
			expect(options.callback).toEqual(expect.any(Function));
			expect(options["error-callback"]).toEqual(expect.any(Function));
			expect(options["expired-callback"]).toEqual(expect.any(Function));
		});

		it("passes through all provider-specific options", async () => {
			const mockTurnstile = createMockTurnstile();
			setTurnstile(mockTurnstile);

			render(
				createElement(Turnstile, {
					siteKey: TEST_SITE_KEY,
					action: "login",
					cData: "test-data",
					appearance: "opaque",
					theme: "dark",
					size: "compact",
					tabIndex: 3,
					retry: "never",
					refreshExpired: "auto",
					customLanguages: { en: "English" },
				}),
			);

			await act(async () => {
				triggerScriptLoad(TURNSTILE_SCRIPT_ID);
				await flushPromises();
			});

			const [, options] = mockTurnstile.render.mock.calls[0];
			expect(options.action).toBe("login");
			expect(options.cdata).toBe("test-data");
			expect(options.appearance).toBe("opaque");
			expect(options.theme).toBe("dark");
			expect(options.size).toBe("compact");
			expect(options.tabIndex).toBe(3);
			expect(options.retry).toBe("never");
			expect(options["refresh-expired"]).toBe("auto");
			expect(options["custom-languages"]).toEqual({ en: "English" });
		});

		it("does NOT call render when siteKey is missing", async () => {
			const mockTurnstile = createMockTurnstile();
			setTurnstile(mockTurnstile);

			render(createElement(Turnstile, { siteKey: undefined }));

			await act(async () => {
				triggerScriptLoad(TURNSTILE_SCRIPT_ID);
				await flushPromises();
			});

			expect(mockTurnstile.render).not.toHaveBeenCalled();
		});

		it("does NOT call render when turnstile global is not loaded", async () => {
			setTurnstile(undefined);

			render(createElement(Turnstile, { siteKey: TEST_SITE_KEY }));

			await act(async () => {
				triggerScriptLoad(TURNSTILE_SCRIPT_ID);
				await flushPromises();
			});

		});
	});

	describe("callback propagation", () => {
		it("onSuccess calls ctx.setToken and the onSuccess prop", async () => {
			const mockTurnstile = createMockTurnstile();
			setTurnstile(mockTurnstile);

			let capturedCallback: ((token: string) => void) | null = null;
			let capturedError: ((err?: string) => void) | null = null;
			let capturedExpire: (() => void) | null = null;

			mockTurnstile.render.mockImplementation((_el, opts) => {
				capturedCallback = opts.callback;
				capturedError = opts["error-callback"];
				capturedExpire = opts["expired-callback"];
				return "widget-1";
			});

			const onSuccess = mock();

			render(
				createElement(
					CaptchaProvider,
					{ provider: "turnstile" },
					createElement(Turnstile, { siteKey: TEST_SITE_KEY, onSuccess }),
				),
			);

			await act(async () => {
				triggerScriptLoad(TURNSTILE_SCRIPT_ID);
				await flushPromises();
			});

			const testToken = "test-token-abc123";
			await act(async () => {
				capturedCallback?.(testToken);
			});

			expect(onSuccess).toHaveBeenCalledWith(testToken);
		});

		it("onError calls ctx.setError and the onError prop", async () => {
			const mockTurnstile = createMockTurnstile();
			setTurnstile(mockTurnstile);

			let capturedError: ((err?: string) => void) | null = null;

			mockTurnstile.render.mockImplementation((_el, opts) => {
				capturedError = opts["error-callback"];
				return "widget-1";
			});

			const onError = mock();

			render(
				createElement(Turnstile, { siteKey: TEST_SITE_KEY, onError }),
			);

			await act(async () => {
				triggerScriptLoad(TURNSTILE_SCRIPT_ID);
				await flushPromises();
			});

			const errorMsg = "Turnstile error";
			await act(async () => {
				capturedError?.(errorMsg);
			});

			expect(onError).toHaveBeenCalledWith(errorMsg);
		});

		it("onExpire calls ctx.resetToken and the onExpire prop", async () => {
			const mockTurnstile = createMockTurnstile();
			setTurnstile(mockTurnstile);

			let capturedExpire: (() => void) | null = null;

			mockTurnstile.render.mockImplementation((_el, opts) => {
				capturedExpire = opts["expired-callback"];
				return "widget-1";
			});

			const onExpire = mock();

			render(
				createElement(Turnstile, { siteKey: TEST_SITE_KEY, onExpire }),
			);

			await act(async () => {
				triggerScriptLoad(TURNSTILE_SCRIPT_ID);
				await flushPromises();
			});

			await act(async () => {
				capturedExpire?.();
			});

			expect(onExpire).toHaveBeenCalled();
		});
	});

	describe("ref methods", () => {
		it("reset() calls turnstile.reset with widgetId", async () => {
			const mockTurnstile = createMockTurnstile();
			setTurnstile(mockTurnstile);

			const ref = createRef<TurnstileRef>();

			render(
				createElement(Turnstile, { ref, siteKey: TEST_SITE_KEY }),
			);

			await act(async () => {
				triggerScriptLoad(TURNSTILE_SCRIPT_ID);
				await flushPromises();
			});

			expect(ref.current).toBeTruthy();

			await act(async () => {
				ref.current?.reset();
			});

			expect(mockTurnstile.reset).toHaveBeenCalledWith("widget-id-1");
		});

		it("reset() is a no-op when turnstile is not available", () => {
			setTurnstile(undefined);

			const ref = createRef<TurnstileRef>();

			render(
				createElement(Turnstile, { ref, siteKey: TEST_SITE_KEY }),
			);

			expect(() => {
				ref.current?.reset();
			}).not.toThrow();
			expect((globalThis.window as { turnstile?: unknown }).turnstile).toBeUndefined();
		});

		it("execute() calls turnstile.execute with widgetId and options", async () => {
			const mockTurnstile = createMockTurnstile();
			setTurnstile(mockTurnstile);

			const ref = createRef<TurnstileRef>();

			render(
				createElement(Turnstile, {
					ref,
					siteKey: TEST_SITE_KEY,
					action: "login",
				}),
			);

			await act(async () => {
				triggerScriptLoad(TURNSTILE_SCRIPT_ID);
				await flushPromises();
			});

			await act(async () => {
				ref.current?.execute({ action: "custom" });
			});

			expect(mockTurnstile.execute).toHaveBeenCalledWith("widget-id-1", {
				action: "custom",
			});
		});

		it("execute() passes undefined options when not provided", async () => {
			const mockTurnstile = createMockTurnstile();
			setTurnstile(mockTurnstile);

			const ref = createRef<TurnstileRef>();

			render(
				createElement(Turnstile, { ref, siteKey: TEST_SITE_KEY }),
			);

			await act(async () => {
				triggerScriptLoad(TURNSTILE_SCRIPT_ID);
				await flushPromises();
			});

			await act(async () => {
				ref.current?.execute();
			});

			expect(mockTurnstile.execute).toHaveBeenCalledWith(
				"widget-id-1",
				undefined,
			);
		});

		it("execute() is a no-op when turnstile is not available", () => {
			setTurnstile(undefined);

			const ref = createRef<TurnstileRef>();

			render(
				createElement(Turnstile, { ref, siteKey: TEST_SITE_KEY }),
			);

			expect(() => {
				ref.current?.execute();
			}).not.toThrow();
		});
	});

  describe("cleanup on unmount", () => {
    it("calls turnstile.reset on unmount when widget exists", async () => {
      const mockTurnstile = createMockTurnstile();
      setTurnstile(mockTurnstile);

      const { unmount } = render(
        createElement(Turnstile, { siteKey: TEST_SITE_KEY }),
      );

      await act(async () => {
        triggerScriptLoad(TURNSTILE_SCRIPT_ID);
        await flushPromises();
      });

      expect(mockTurnstile.reset).not.toHaveBeenCalled();

      await act(async () => {
        unmount();
      });

      expect(mockTurnstile.reset).toHaveBeenCalledWith("widget-id-1");
    });

    it("does NOT call reset when widgetId is null on unmount", () => {
      const mockTurnstile = createMockTurnstile();
      setTurnstile(mockTurnstile);

      const { unmount } = render(
        createElement(Turnstile, { siteKey: TEST_SITE_KEY }),
      );

      act(() => {
        unmount();
      });

      expect(mockTurnstile.reset).not.toHaveBeenCalled();
    });
  });

	describe("site key resolution", () => {
		it("uses siteKey from props", async () => {
			const mockTurnstile = createMockTurnstile();
			setTurnstile(mockTurnstile);

			const envKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
			delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

			render(
				createElement(Turnstile, { siteKey: "custom-key" }),
			);

			await act(async () => {
				triggerScriptLoad(TURNSTILE_SCRIPT_ID);
				await flushPromises();
			});

			expect(mockTurnstile.render).toHaveBeenCalled();
			expect(mockTurnstile.render.mock.calls[0][1].sitekey).toBe(
				"custom-key",
			);

			if (envKey !== undefined) {
				process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = envKey;
			}
		});

		it("falls back to NEXT_PUBLIC_TURNSTILE_SITE_KEY env var", async () => {
			const mockTurnstile = createMockTurnstile();
			setTurnstile(mockTurnstile);

			const envKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
			process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "env-site-key";

			render(createElement(Turnstile, {}));

			await act(async () => {
				triggerScriptLoad(TURNSTILE_SCRIPT_ID);
				await flushPromises();
			});

			expect(mockTurnstile.render).toHaveBeenCalled();
			expect(mockTurnstile.render.mock.calls[0][1].sitekey).toBe(
				"env-site-key",
			);

			if (envKey !== undefined) {
				process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = envKey;
			} else {
				delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
			}
		});

		it("does not render widget when neither props nor env has siteKey", async () => {
			const mockTurnstile = createMockTurnstile();
			setTurnstile(mockTurnstile);

			const envKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
			delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

			render(createElement(Turnstile, {}));

			await act(async () => {
				triggerScriptLoad(TURNSTILE_SCRIPT_ID);
				await flushPromises();
			});

			expect(mockTurnstile.render).not.toHaveBeenCalled();

			if (envKey !== undefined) {
				process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = envKey;
			}
		});
	});

	describe("context integration", () => {
		it("does not render any error UI when ctx has an error", async () => {
			const mockTurnstile = createMockTurnstile();
			setTurnstile(mockTurnstile);

			const { container } = render(
				createElement(
					CaptchaProvider,
					{ provider: "turnstile" },
					createElement(Turnstile, { siteKey: TEST_SITE_KEY }),
				),
			);

			await act(async () => {
				triggerScriptLoad(TURNSTILE_SCRIPT_ID);
				await flushPromises();
			});

			expect(container.innerHTML).not.toContain("turnstile-error");
		});
	});

	describe("displayName", () => {
		it("has the correct displayName", () => {
			expect(Turnstile.displayName).toBe("Turnstile");
		});
	});
});
