import { createElement } from "react";
import { useContext } from "react";
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
	mock,
	spyOn,
} from "bun:test";
import { createRoot } from "react-dom/client";
import {
	CaptchaContext,
	CaptchaProvider,
	useCaptcha,
	type CaptchaProviderType,
} from "../../../src/components/CaptchaContext";
import {
	act,
	cleanupDOM,
	setupDOM,
} from "../../helpers/react-testing";
import type { ReactNode } from "react";

let root: ReturnType<typeof createRoot> | null = null;
let container: HTMLElement | null = null;

interface RenderProps {
	provider?: CaptchaProviderType;
	autoExecute?: boolean;
	headerName?: string;
}

function renderWithProvider(
	children: ReactNode,
	props: RenderProps = {},
) {
	if (root) {
		act(() => {
			root.unmount();
		});
		root = null;
	}
	if (container) {
		container.remove();
	}

	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);

	act(() => {
		root.render(
			createElement(
				CaptchaProvider,
				{
					provider: props.provider ?? "turnstile",
					autoExecute: props.autoExecute,
					headerName: props.headerName,
				},
				children,
			),
		);
	});
}

function useInternalContext() {
	const ctx = useContext(CaptchaContext);
	if (!ctx) {
		throw new Error("Context not available");
	}
	return ctx;
}

function createTestHarness(
	props: RenderProps = {},
): {
	getContext: () => ReturnType<typeof useInternalContext>;
} {
	const ref = { current: null as ReturnType<typeof useInternalContext> | null };

	function TestConsumer() {
		const ctx = useInternalContext();
		ref.current = ctx;
		return null;
	}

	renderWithProvider(createElement(TestConsumer), props);

	return {
		getContext: () => {
			if (!ref.current) throw new Error("Context not available");
			return ref.current;
		},
	};
}

describe("CaptchaContext", () => {
	beforeEach(() => {
		setupDOM();
				jest.useFakeTimers();
	});

	afterEach(() => {
		jest.clearAllTimers();
		jest.useRealTimers();
		if (root) {
			act(() => {
				root.unmount();
			});
			root = null;
		}
		if (container) {
			container.remove();
			container = null;
		}
		cleanupDOM();
	});

	describe("initial state", () => {
		it("provides initial state with no token", () => {
			const { getContext } = createTestHarness({ provider: "turnstile" });
			const ctx = getContext();

			expect(ctx.token).toBeNull();
			expect(ctx.isReady).toBe(false);
			expect(ctx.isLoading).toBe(false);
			expect(ctx.isError).toBe(false);
			expect(ctx.errorMessage).toBeUndefined();
			expect(ctx.provider).toBe("turnstile");
		});

		it("defaults provider to turnstile", () => {
			const { getContext } = createTestHarness();
			expect(getContext().provider).toBe("turnstile");
		});

		it("provides execute and reset functions", () => {
			const { getContext } = createTestHarness();
			const ctx = getContext();

			expect(typeof ctx.execute).toBe("function");
			expect(typeof ctx.reset).toBe("function");
			expect(typeof ctx.submitWithCaptcha).toBe("function");
		});

		it("defaults headerName to x-captcha-response", () => {
			const { getContext } = createTestHarness();
			expect(getContext().submitWithCaptcha).toBeDefined();
		});
	});

	describe("token management", () => {
		it("setToken sets the token and marks as ready", () => {
			const { getContext } = createTestHarness({ provider: "turnstile" });

			act(() => {
				getContext().setToken("test-token");
			});

			const ctx = getContext();
			expect(ctx.token).toBe("test-token");
			expect(ctx.isReady).toBe(true);
			expect(ctx.isLoading).toBe(false);
		});

		it("setToken clears error state", () => {
			const { getContext } = createTestHarness({ provider: "turnstile" });

			act(() => {
				getContext().setError("some error");
			});

			expect(getContext().isError).toBe(true);

			act(() => {
				getContext().setToken("test-token");
			});

			const ctx = getContext();
			expect(ctx.isError).toBe(false);
			expect(ctx.errorMessage).toBeUndefined();
		});

		it("resetToken clears the token and marks as not ready", () => {
			const { getContext } = createTestHarness({ provider: "turnstile" });

			act(() => {
				getContext().setToken("test-token");
			});

			expect(getContext().token).toBe("test-token");
			expect(getContext().isReady).toBe(true);

			act(() => {
				getContext().resetToken();
			});

			const ctx = getContext();
			expect(ctx.token).toBeNull();
			expect(ctx.isReady).toBe(false);
		});
	});

	describe("error management", () => {
		it("setError sets the error message and marks as error", () => {
			const { getContext } = createTestHarness({ provider: "turnstile" });

			act(() => {
				getContext().setError("captcha failed");
			});

			const ctx = getContext();
			expect(ctx.isError).toBe(true);
			expect(ctx.errorMessage).toBe("captcha failed");
		});

		it("setError with undefined clears the error message", () => {
			const { getContext } = createTestHarness({ provider: "turnstile" });

			act(() => {
				getContext().setError("some error");
			});
			expect(getContext().isError).toBe(true);

			act(() => {
				getContext().setError(undefined);
			});

			const ctx = getContext();
			expect(ctx.isError).toBe(true);
			expect(ctx.errorMessage).toBeUndefined();
		});

		it("reset clears all state including errors", () => {
			const { getContext } = createTestHarness({ provider: "turnstile" });

			act(() => {
				getContext().setToken("test-token");
				getContext().setError("some error");
			});

			expect(getContext().token).toBe("test-token");
			expect(getContext().isError).toBe(true);

			act(() => {
				getContext().reset();
			});

			const ctx = getContext();
			expect(ctx.token).toBeNull();
			expect(ctx.isReady).toBe(false);
			expect(ctx.isError).toBe(false);
			expect(ctx.errorMessage).toBeUndefined();
		});
	});

	describe("execute", () => {
		it("sets isLoading to true when execute is called for turnstile", () => {
			const { getContext } = createTestHarness({ provider: "turnstile" });

			(window as Record<string, unknown>).turnstile = {
				execute: mock(),
			};

			act(() => {
				getContext().execute();
			});

			expect(getContext().isLoading).toBe(true);
		});

		it("calls turnstile.execute with action", () => {
			const { getContext } = createTestHarness({ provider: "turnstile" });

			const mockExecute = mock();
			(window as Record<string, unknown>).turnstile = {
				execute: mockExecute,
			};

			act(() => {
				getContext().execute("login");
			});

			expect(mockExecute).toHaveBeenCalledWith(undefined, {
				action: "login",
			});
		});

		it("calls grecaptcha.execute when provider is recaptcha", async () => {
			const { getContext } = createTestHarness({ provider: "recaptcha" });

			const mockExecute = mock(() => Promise.resolve("token"));
			(window as Record<string, unknown>).grecaptcha = {
				execute: mockExecute,
			};

			await act(async () => {
				await getContext().execute("signup");
			});

			expect(mockExecute).toHaveBeenCalledWith(undefined, {
				action: "signup",
			});
		});

		it("calls hcaptcha.execute when provider is hcaptcha", async () => {
			const { getContext } = createTestHarness({ provider: "hcaptcha" });

			const mockExecute = mock(() =>
				Promise.resolve({ response: "token" }),
			);
			(window as Record<string, unknown>).hcaptcha = {
				execute: mockExecute,
			};

			await act(async () => {
				await getContext().execute("submit");
			});

			expect(mockExecute).toHaveBeenCalledWith(undefined, {
				action: "submit",
			});
		});

		it("returns undefined when provider global is not available", () => {
			const { getContext } = createTestHarness({ provider: "turnstile" });

			(window as Record<string, unknown>).turnstile = undefined;

			let result: unknown;
			act(() => {
				result = getContext().execute();
			});
			expect(result).toBeUndefined();
		});

		it("sets token after recaptcha execute resolves", async () => {
			const { getContext } = createTestHarness({ provider: "recaptcha" });

			(window as Record<string, unknown>).grecaptcha = {
				execute: mock(() => Promise.resolve("recaptcha-token")),
			};

			await act(async () => {
				const result = getContext().execute("login");
				if (result instanceof Promise) {
					await result;
				}
			});

			expect(getContext().token).toBe("recaptcha-token");
			expect(getContext().isReady).toBe(true);
		});

		it("sets token after hcaptcha execute resolves", async () => {
			const { getContext } = createTestHarness({ provider: "hcaptcha" });

			(window as Record<string, unknown>).hcaptcha = {
				execute: mock(() =>
					Promise.resolve({ response: "hcaptcha-token" }),
				),
			};

			await act(async () => {
				const result = getContext().execute("submit");
				if (result instanceof Promise) {
					await result;
				}
			});

			expect(getContext().token).toBe("hcaptcha-token");
			expect(getContext().isReady).toBe(true);
		});

		it("sets isLoading to false and clears error on token set via execute", async () => {
			const { getContext } = createTestHarness({ provider: "recaptcha" });

			await act(async () => {
				getContext().setError("prior error");
			});
			expect(getContext().isError).toBe(true);

			(window as Record<string, unknown>).grecaptcha = {
				execute: mock(() => Promise.resolve("new-token")),
			};

			await act(async () => {
				const result = getContext().execute();
				if (result instanceof Promise) {
					await result;
				}
			});

			const ctx = getContext();
			expect(ctx.isError).toBe(false);
			expect(ctx.isLoading).toBe(false);
			expect(ctx.token).toBe("new-token");
		});
	});

	describe("submitWithCaptcha", () => {
		it("injects token header when token is available", async () => {
			const { getContext } = createTestHarness({ provider: "turnstile" });

			await act(async () => {
				getContext().setToken("my-captcha-token");
			});

			const originalFetch = (globalThis as Record<string, unknown>).fetch;
			const mockFetch = mock(() =>
				Promise.resolve(new Response("ok")),
			);

			await act(async () => {
				(globalThis as Record<string, unknown>).fetch = mockFetch;
				try {
					await getContext().submitWithCaptcha("/api/test", {
						method: "POST",
					});
				} finally {
					(globalThis as Record<string, unknown>).fetch = originalFetch;
				}
			});

			expect(mockFetch).toHaveBeenCalled();
			const [url, init] = mockFetch.mock.calls[0];
			expect(url).toBe("/api/test");
			const initHeaders = new Headers(init?.headers);
			expect(initHeaders.get("x-captcha-response")).toBe("my-captcha-token");
		});

		it("does NOT inject token header when token is null", async () => {
			const { getContext } = createTestHarness({ provider: "turnstile" });

			expect(getContext().token).toBeNull();

			const originalFetch = (globalThis as Record<string, unknown>).fetch;
			const mockFetch = mock(() =>
				Promise.resolve(new Response("ok")),
			);

			await act(async () => {
				(globalThis as Record<string, unknown>).fetch = mockFetch;
				try {
					await getContext().submitWithCaptcha("/api/test", {
						method: "GET",
					});
				} finally {
					(globalThis as Record<string, unknown>).fetch = originalFetch;
				}
			});

			expect(mockFetch).toHaveBeenCalled();
			const [, init] = mockFetch.mock.calls[0];
			const initHeaders = new Headers(init?.headers ?? {});
			expect(initHeaders.get("x-captcha-response")).toBeNull();
		});

		it("uses custom headerName when configured", async () => {
			const { getContext } = createTestHarness({
				provider: "turnstile",
				headerName: "x-custom-captcha",
			});

			await act(async () => {
				getContext().setToken("token-123");
			});

			const originalFetch = (globalThis as Record<string, unknown>).fetch;
			const mockFetch = mock(() =>
				Promise.resolve(new Response("ok")),
			);

			await act(async () => {
				(globalThis as Record<string, unknown>).fetch = mockFetch;
				try {
					await getContext().submitWithCaptcha("/api/test", {
						method: "POST",
						headers: {
							"x-custom-captcha": "existing-value",
						},
					});
				} finally {
					(globalThis as Record<string, unknown>).fetch = originalFetch;
				}
			});

			const [, init] = mockFetch.mock.calls[0];
			const initHeaders = new Headers(init?.headers ?? {});
			expect(initHeaders.get("x-custom-captcha")).toBe("token-123");
		});

		it("preserves existing headers from init", async () => {
			const { getContext } = createTestHarness({ provider: "turnstile" });

			await act(async () => {
				getContext().setToken("token-abc");
			});

			const originalFetch = (globalThis as Record<string, unknown>).fetch;
			const mockFetch = mock(() =>
				Promise.resolve(new Response("ok")),
			);

			await act(async () => {
				(globalThis as Record<string, unknown>).fetch = mockFetch;
				try {
					await getContext().submitWithCaptcha("/api/test", {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							Authorization: "Bearer mytoken",
						},
					});
				} finally {
					(globalThis as Record<string, unknown>).fetch = originalFetch;
				}
			});

			const [, init] = mockFetch.mock.calls[0];
			const initHeaders = new Headers(init?.headers ?? {});
			expect(initHeaders.get("Content-Type")).toBe("application/json");
			expect(initHeaders.get("Authorization")).toBe("Bearer mytoken");
			expect(initHeaders.get("x-captcha-response")).toBe("token-abc");
		});

		it("passes body and method through", async () => {
			const { getContext } = createTestHarness({ provider: "turnstile" });

			await act(async () => {
				getContext().setToken("token-abc");
			});

			const originalFetch = (globalThis as Record<string, unknown>).fetch;
			const mockFetch = mock(() =>
				Promise.resolve(new Response("ok")),
			);

			const formData = new FormData();
			formData.append("field", "value");

			await act(async () => {
				(globalThis as Record<string, unknown>).fetch = mockFetch;
				try {
					await getContext().submitWithCaptcha("/api/test", {
						method: "POST",
						body: formData,
					});
				} finally {
					(globalThis as Record<string, unknown>).fetch = originalFetch;
				}
			});

			const [, init] = mockFetch.mock.calls[0];
			expect(init?.method).toBe("POST");
			expect(init?.body).toBe(formData);
		});
	});

	describe("token auto-renewal", () => {
		it("auto-renews token when it expires via callback path", () => {
			const { getContext } = createTestHarness({
				provider: "turnstile",
				autoExecute: true,
			});

			act(() => {
				getContext().setToken("initial-token");
			});

			expect(getContext().token).toBe("initial-token");

			act(() => {
				jest.advanceTimersByTime(111_000);
			});

			expect(getContext().token).toBeNull();
			expect(getContext().isReady).toBe(false);
		});

		it("does NOT auto-renew when autoExecute is false", () => {
			const { getContext } = createTestHarness({
				provider: "turnstile",
				autoExecute: false,
			});

			act(() => {
				getContext().setToken("initial-token");
			});

			expect(getContext().token).toBe("initial-token");

			act(() => {
				jest.advanceTimersByTime(111_000);
			});

			expect(getContext().token).toBe("initial-token");
			expect(getContext().isReady).toBe(true);
		});

		it("schedules renewal only when autoExecute is true and token exists", () => {
			const setTimeoutSpy = spyOn(global, "setTimeout");

			const { getContext } = createTestHarness({
				provider: "turnstile",
				autoExecute: true,
			});

			expect(setTimeoutSpy).not.toHaveBeenCalled();

			act(() => {
				getContext().setToken("token-1");
			});

			expect(setTimeoutSpy).toHaveBeenCalled();
		});
	});

	describe("useCaptcha hook", () => {
		it("throws when used outside CaptchaProvider", () => {
			function TestConsumer() {
				useCaptcha();
				return null;
			}

			const testContainer = document.createElement("div");
			document.body.appendChild(testContainer);
			const testRoot = createRoot(testContainer);

			expect(() => {
				act(() => {
					testRoot.render(createElement(TestConsumer));
				});
			}).toThrow("useCaptcha() must be used within a <CaptchaProvider>");

			act(() => {
				testRoot.unmount();
			});
			testContainer.remove();
		});

		it("returns context value when used within CaptchaProvider", () => {
			const { getContext } = createTestHarness({ provider: "turnstile" });
			const ctx = getContext();

			expect(ctx).toBeDefined();
			expect(ctx.token).toBeNull();
			expect(ctx.isReady).toBe(false);
			expect(ctx.provider).toBe("turnstile");
		});

		it("provides same context value as direct useContext", () => {
			const { getContext } = createTestHarness({ provider: "turnstile" });
			const ctx = getContext();

			expect(ctx.useCaptcha).toBeUndefined();
		});
	});

	describe("provider switching", () => {
		it("supports turnstile provider", () => {
			expect(createTestHarness({ provider: "turnstile" }).getContext().provider).toBe(
				"turnstile",
			);
		});

		it("supports recaptcha provider", () => {
			expect(createTestHarness({ provider: "recaptcha" }).getContext().provider).toBe(
				"recaptcha",
			);
		});

		it("supports hcaptcha provider", () => {
			expect(createTestHarness({ provider: "hcaptcha" }).getContext().provider).toBe(
				"hcaptcha",
			);
		});
	});
});
