import {
	forwardRef,
	useCallback,
	useContext,
	useEffect,
	useImperativeHandle,
	useRef,
} from "react";
import { getCaptchaContext } from "./CaptchaContext";

const RECAPTCHA_SCRIPT_ID = "recaptcha-script";
const RECAPTCHA_SCRIPT_URL = "https://www.google.com/recaptcha/api.js";

export interface RecaptchaRef {
	execute: (action?: string) => Promise<string | null>;
	reset: (token?: string | null) => void;
	getResponse: () => string;
}

export interface RecaptchaProps {
	siteKey?: string;
	onVerify?: (token: string) => void;
	onExpire?: () => void;
	onError?: () => void;
	size?: "normal" | "compact" | "invisible";
	theme?: "light" | "dark" | "auto";
	action?: string;
	tabIndex?: number;
}

function loadRecaptchaScript(
	siteKey: string,
	size?: RecaptchaProps["size"],
): Promise<void> {
	return new Promise((resolve, reject) => {
		if (typeof window === "undefined") {
			resolve();
			return;
		}

		if (window.grecaptcha) {
			resolve();
			return;
		}

		const existing = document.getElementById(RECAPTCHA_SCRIPT_ID);
		if (existing) {
			const check = setInterval(() => {
				if (window.grecaptcha) {
					clearInterval(check);
					resolve();
				}
			}, 50);
			setTimeout(() => {
				clearInterval(check);
				reject(new Error("reCAPTCHA script failed to load"));
			}, 5000);
			return;
		}

		const script = document.createElement("script");
		script.id = RECAPTCHA_SCRIPT_ID;
		script.src =
			size && size !== "invisible"
				? RECAPTCHA_SCRIPT_URL
				: `${RECAPTCHA_SCRIPT_URL}?render=${siteKey}`;
		script.async = true;
		script.defer = true;
		script.onload = () => resolve();
		script.onerror = () => reject(new Error("Failed to load reCAPTCHA script"));
		document.head.appendChild(script);
	});
}

export const Recaptcha = forwardRef<RecaptchaRef, RecaptchaProps>(
	function Recaptcha(props, ref) {
		const {
			siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY,
			onVerify,
			onExpire,
			onError,
			size = "invisible",
			theme = "auto",
			action,
			tabIndex,
		} = props;

		const ctx = useContext(getCaptchaContext());

		const containerRef = useRef<HTMLDivElement>(null);
		const widgetIdRef = useRef<string | number | null>(null);

		const safeOnVerify = useCallback(
			(token: string) => {
				ctx?.setToken(token);
				onVerify?.(token);
			},
			[ctx, onVerify],
		);
		const safeOnError = useCallback(
			(errMsg?: string) => {
				ctx?.setError(errMsg);
				onError?.();
			},
			[ctx, onError],
		);
		const safeOnExpire = useCallback(() => {
			ctx?.resetToken();
			onExpire?.();
		}, [ctx, onExpire]);

		const renderWidget = useCallback(() => {
			if (!window.grecaptcha || !containerRef.current || !siteKey) return;

			widgetIdRef.current = window.grecaptcha.render(containerRef.current, {
				sitekey: siteKey,
				size,
				theme,
				action,
				tabIndex,
				callback: safeOnVerify,
				"expired-callback": safeOnExpire,
				"error-callback": safeOnError,
			});
		}, [
			siteKey,
			safeOnVerify,
			safeOnExpire,
			safeOnError,
			size,
			theme,
			action,
			tabIndex,
		]);

		useImperativeHandle(
			ref,
			(): RecaptchaRef => ({
				execute: (actionParam?: string) => {
					if (!window.grecaptcha || !widgetIdRef.current) {
						return Promise.resolve(null);
					}
					return window.grecaptcha.execute(
						widgetIdRef.current as string | number,
						{ action: actionParam ?? action },
					);
				},
				reset: (token?: string | null) => {
					if (window.grecaptcha && widgetIdRef.current !== null) {
						window.grecaptcha.reset(
							widgetIdRef.current as string | number,
							token ?? undefined,
						);
					}
				},
				getResponse: () => {
					if (window.grecaptcha && widgetIdRef.current !== null) {
						return window.grecaptcha.getResponse(
							widgetIdRef.current as string | number,
						);
					}
					return "";
				},
			}),
			[action],
		);

		useEffect(() => {
			if (typeof window === "undefined" || !siteKey) return;

			loadRecaptchaScript(siteKey, size)
				.then(() => {
					renderWidget();
				})
				.catch((err) => {
					safeOnError(err.message);
					onError?.();
				});

			return () => {
				if (window.grecaptcha && widgetIdRef.current !== null) {
					window.grecaptcha.reset(widgetIdRef.current as string | number);
				}
			};
		}, [renderWidget, safeOnError, siteKey, size, onError]);

		return <div ref={containerRef} data-testid="recaptcha-container" />;
	},
);

Recaptcha.displayName = "Recaptcha";
