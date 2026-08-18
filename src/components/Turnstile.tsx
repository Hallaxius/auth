import {
	forwardRef,
	useCallback,
	useContext,
	useEffect,
	useImperativeHandle,
	useRef,
} from "react";
import { getCaptchaContext } from "./CaptchaContext";

const TURNSTILE_SCRIPT_ID = "turnstile-script";
const TURNSTILE_SCRIPT_URL =
	"https://challenges.cloudflare.com/turnstile/v0/api.js";

export interface TurnstileRef {
	reset: () => void;
	execute: (options?: { action?: string }) => void;
}

export interface TurnstileProps {
	siteKey?: string;
	onSuccess?: (token: string) => void;
	onError?: (error?: string) => void;
	onExpire?: () => void;
	action?: string;
	cData?: string;
	appearance?: "opaque" | "transparent";
	theme?: "light" | "dark" | "auto";
	size?: "normal" | "compact" | "flexible" | "invisible";
	tabIndex?: number;
	retry?: "auto" | "never" | "always";
	refreshExpired?: string;
	customLanguages?: Record<string, string>;
}

function loadTurnstileScript(): Promise<void> {
	return new Promise((resolve, reject) => {
		if (typeof window === "undefined") {
			resolve();
			return;
		}

		const existing = document.getElementById(TURNSTILE_SCRIPT_ID);
		if (existing) {
			if ((window as { turnstile?: unknown }).turnstile) {
				resolve();
			} else {
				const check = setInterval(() => {
					if ((window as { turnstile?: unknown }).turnstile) {
						clearInterval(check);
						resolve();
					}
				}, 50);
				setTimeout(() => {
					clearInterval(check);
					reject(new Error("Turnstile script failed to load"));
				}, 5000);
			}
			return;
		}

		const script = document.createElement("script");
		script.id = TURNSTILE_SCRIPT_ID;
		script.src = TURNSTILE_SCRIPT_URL;
		script.async = true;
		script.defer = true;
		script.onload = () => resolve();
		script.onerror = () => reject(new Error("Failed to load Turnstile script"));
		document.head.appendChild(script);
	});
}

export const Turnstile = forwardRef<TurnstileRef, TurnstileProps>(
	function Turnstile(props, ref) {
		const {
			siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
			onSuccess,
			onError,
			onExpire,
			action,
			cData,
			appearance,
			theme,
			size = "normal",
			tabIndex,
			retry = "auto",
			refreshExpired,
			customLanguages,
		} = props;

		const ctx = useContext(getCaptchaContext());

		const containerRef = useRef<HTMLDivElement>(null);
		const widgetIdRef = useRef<string | number | null>(null);

		const safeOnSuccess = useCallback(
			(token: string) => {
				ctx?.setToken(token);
				onSuccess?.(token);
			},
			[ctx, onSuccess],
		);
		const safeOnError = useCallback(
			(err?: string) => {
				ctx?.setError(err);
				onError?.(err);
			},
			[ctx, onError],
		);
		const safeOnExpire = useCallback(() => {
			ctx?.resetToken();
			onExpire?.();
		}, [ctx, onExpire]);

		const renderWidget = useCallback(() => {
			const turnstile = (
				window as {
					turnstile?: {
						render: (
							el: HTMLElement,
							opts: Record<string, unknown>,
						) => string | number;
					};
				}
			).turnstile;
			if (!turnstile || !containerRef.current || !siteKey) return;

			widgetIdRef.current = turnstile.render(containerRef.current, {
				sitekey: siteKey,
				callback: safeOnSuccess,
				"error-callback": safeOnError,
				"expired-callback": safeOnExpire,
				action,
				cdata: cData,
				appearance,
				theme,
				size,
				tabIndex,
				retry,
				"refresh-expired": refreshExpired,
				"custom-languages": customLanguages,
			});
		}, [
			siteKey,
			safeOnSuccess,
			safeOnError,
			safeOnExpire,
			action,
			cData,
			appearance,
			theme,
			size,
			tabIndex,
			retry,
			refreshExpired,
			customLanguages,
		]);

		useImperativeHandle(
			ref,
			(): TurnstileRef => ({
				reset: () => {
					const turnstile = (
						window as { turnstile?: { reset: (id?: unknown) => void } }
					).turnstile;
					if (turnstile && widgetIdRef.current !== null) {
						turnstile.reset(widgetIdRef.current);
					}
				},
				execute: (options?: { action?: string }) => {
					const turnstile = (
						window as {
							turnstile?: {
								execute: (id?: unknown, opts?: unknown) => void;
							};
						}
					).turnstile;
					if (turnstile && widgetIdRef.current !== null) {
						turnstile.execute(widgetIdRef.current, options);
					}
				},
			}),
			[],
		);

		useEffect(() => {
			if (typeof window === "undefined") return;

			loadTurnstileScript()
				.then(() => {
					renderWidget();
				})
				.catch((err) => {
					safeOnError(err.message);
				});

			return () => {
				const turnstile = (
					window as { turnstile?: { reset: (id?: unknown) => void } }
				).turnstile;
				if (turnstile && widgetIdRef.current !== null) {
					turnstile.reset(widgetIdRef.current);
				}
			};
		}, [renderWidget, safeOnError]);

		return (
			<div
				ref={containerRef}
				data-testid="turnstile-container"
				data-captcha-provider="turnstile"
			/>
		);
	},
);

Turnstile.displayName = "Turnstile";
