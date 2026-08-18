import React, { useCallback, useEffect, useRef, useState } from "react";

export type CaptchaProviderType = "turnstile" | "recaptcha" | "hcaptcha";

export interface CaptchaContextValue {
	token: string | null;
	isReady: boolean;
	isLoading: boolean;
	isError: boolean;
	errorMessage?: string;
	provider: CaptchaProviderType;
	execute: (action?: string) => Promise<string | null> | undefined;
	reset: () => void;
	submitWithCaptcha: (
		input: RequestInfo,
		init?: RequestInit,
	) => Promise<Response>;
}

interface InternalContextValue extends CaptchaContextValue {
	setToken: (token: string) => void;
	setError: (err?: string) => void;
	resetToken: () => void;
}

let _CaptchaContext:
	| React.Context<InternalContextValue | undefined>
	| undefined;

export function getCaptchaContext(): React.Context<
	InternalContextValue | undefined
> {
	if (!_CaptchaContext) {
		_CaptchaContext = React.createContext<InternalContextValue | undefined>(
			undefined,
		);
	}
	return _CaptchaContext;
}

/**
 * Lazy context access — avoids module-scope `createContext` call that breaks
 * React Server Components in Next.js 16+. Use `getCaptchaContext()` directly
 * for React contexts; this export preserves backward-compatible named access.
 */
export function CaptchaContextConsumer(): React.Context<
	InternalContextValue | undefined
> {
	return getCaptchaContext();
}

const TOKEN_TTL_MS = 110_000;

export interface CaptchaProviderProps {
	children: React.ReactNode;
	provider?: CaptchaProviderType;
	autoExecute?: boolean;
	headerName?: string;
}

export function CaptchaProvider({
	children,
	provider = "turnstile",
	autoExecute = true,
	headerName = "x-captcha-response",
}: CaptchaProviderProps) {
	const [token, setToken] = useState<string | null>(null);
	const [isReady, setReady] = useState(false);
	const [isLoading, setLoading] = useState(false);
	const [error, setError] = useState<string | undefined>();
	const [isError, setErrorFlag] = useState(false);

	const tokenExpiryRef = useRef<number>(0);
	const lastActionRef = useRef<string | undefined>(undefined);

	const handleToken = useCallback((newToken: string) => {
		setToken(newToken);
		setReady(true);
		setLoading(false);
		setError(undefined);
		setErrorFlag(false);
		tokenExpiryRef.current = Date.now() + TOKEN_TTL_MS;
	}, []);

	const handleExpiry = useCallback(() => {
		setToken(null);
		setReady(false);
		tokenExpiryRef.current = 0;
	}, []);

	const handleError = useCallback((err?: string) => {
		setError(err);
		setErrorFlag(true);
		setLoading(false);
	}, []);

	const reset = useCallback(() => {
		setToken(null);
		setReady(false);
		setError(undefined);
		setErrorFlag(false);
		tokenExpiryRef.current = 0;
	}, []);

	const execute = useCallback(
		(action?: string): Promise<string | null> | undefined => {
			setLoading(true);
			lastActionRef.current = action;

			if (provider === "turnstile") {
				const turnstile = (
					window as unknown as {
						turnstile?: {
							execute?: (id?: unknown, opts?: Record<string, unknown>) => void;
						};
					}
				).turnstile;
				turnstile?.execute?.(undefined, { action });
			} else if (provider === "recaptcha") {
				const grecaptcha = (
					window as unknown as {
						grecaptcha?: {
							execute?: (
								id?: unknown,
								opts?: Record<string, unknown>,
							) => Promise<string>;
						};
					}
				).grecaptcha;
				if (grecaptcha?.execute) {
					const result = grecaptcha.execute(undefined, { action });
					result
						.then((tok) => {
							if (tok) handleToken(tok);
						})
						.catch((err) => {
							setError(err?.message ?? String(err));
							setErrorFlag(true);
						});
					return result as Promise<string | null>;
				}
			} else if (provider === "hcaptcha") {
				const hcaptcha = (
					window as unknown as {
						hcaptcha?: {
							execute?: (
								id?: unknown,
								opts?: Record<string, unknown>,
							) => Promise<{ response?: string }>;
						};
					}
				).hcaptcha;
				if (hcaptcha?.execute) {
					const result = hcaptcha.execute(undefined, { action });
					result
						.then((resp) => {
							const tok = resp?.response;
							if (tok) handleToken(tok);
						})
						.catch((err) => {
							setError(err?.message ?? String(err));
							setErrorFlag(true);
						});
					return result as unknown as Promise<string | null>;
				}
			}
		},
		[provider, handleToken],
	);

	useEffect(() => {
		if (!autoExecute || !token) return;

		const remaining = tokenExpiryRef.current - Date.now();
		if (remaining <= 0) {
			handleExpiry();
			execute(lastActionRef.current);
			return;
		}

		const timer = setTimeout(() => {
			handleExpiry();
			execute(lastActionRef.current);
		}, remaining);

		return () => clearTimeout(timer);
	}, [token, execute, handleExpiry, autoExecute]);

	const submitWithCaptcha = useCallback(
		async (input: RequestInfo, init?: RequestInit) => {
			const headers = new Headers(init?.headers);
			if (token) headers.set(headerName, token);

			return fetch(input, { ...init, headers });
		},
		[token, headerName],
	);

	const value: InternalContextValue = {
		token,
		isReady,
		isLoading,
		isError,
		errorMessage: error,
		provider,
		execute,
		reset,
		submitWithCaptcha,
		setToken: handleToken,
		setError: handleError,
		resetToken: handleExpiry,
	};

	const Context = getCaptchaContext();

	return <Context.Provider value={value}>{children}</Context.Provider>;
}

export const useCaptcha = () => {
	const ctx = React.useContext(getCaptchaContext());
	if (!ctx) {
		throw new Error("useCaptcha() must be used within a <CaptchaProvider>");
	}
	return ctx;
};
