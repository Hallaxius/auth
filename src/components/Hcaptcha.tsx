import {
	forwardRef,
	useCallback,
	useContext,
	useEffect,
	useImperativeHandle,
	useRef,
} from "react";
import { CaptchaContext } from "./CaptchaContext";

const HCAPTCHA_SCRIPT_ID = "hcaptcha-script";
const HCAPTCHA_SCRIPT_URL = "https://js.hcaptcha.com/1.js";

export interface HcaptchaRef {
	execute: (options?: {
		action?: string;
	}) => Promise<{ response?: string } | null>;
	reset: (token?: string) => void;
	getResponse: () => string;
}

export interface HcaptchaProps {
	siteKey?: string;
	onVerify?: (token: string) => void;
	onExpire?: () => void;
	onError?: (error?: string) => void;
	size?: "normal" | "compact" | "invisible";
	theme?: "light" | "dark" | "auto";
	action?: string;
	cookieDomain?: string;
	report?: boolean;
}

function loadHcaptchaScript(): Promise<void> {
	return new Promise((resolve, reject) => {
		if (typeof window === "undefined") {
			resolve();
			return;
		}

		if (window.hcaptcha) {
			resolve();
			return;
		}

		const existing = document.getElementById(HCAPTCHA_SCRIPT_ID);
		if (existing) {
			const check = setInterval(() => {
				if (window.hcaptcha) {
					clearInterval(check);
					resolve();
				}
			}, 50);
			setTimeout(() => {
				clearInterval(check);
				reject(new Error("hCaptcha script failed to load"));
			}, 5000);
			return;
		}

		const script = document.createElement("script");
		script.id = HCAPTCHA_SCRIPT_ID;
		script.src = HCAPTCHA_SCRIPT_URL;
		script.async = true;
		script.defer = true;
		script.onload = () => resolve();
		script.onerror = () => reject(new Error("Failed to load hCaptcha script"));
		document.head.appendChild(script);
	});
}

export const Hcaptcha = forwardRef<HcaptchaRef, HcaptchaProps>(
	function Hcaptcha(props, ref) {
		const {
			siteKey = process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY,
			onVerify,
			onExpire,
			onError,
			size = "normal",
			theme = "auto",
			action,
			cookieDomain,
			report = true,
		} = props;

		const ctx = useContext(CaptchaContext);

		const containerRef = useRef<HTMLDivElement>(null);
		const captchaIdRef = useRef<string | null>(null);

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
				onError?.(errMsg);
			},
			[ctx, onError],
		);
		const safeOnExpire = useCallback(() => {
			ctx?.resetToken();
			onExpire?.();
		}, [ctx, onExpire]);

		const renderWidget = useCallback(() => {
			if (!window.hcaptcha || !containerRef.current) return;

			captchaIdRef.current = window.hcaptcha.render(containerRef.current, {
				sitekey: siteKey,
				callback: safeOnVerify,
				"expired-callback": safeOnExpire,
				"error-callback": safeOnError,
				size,
				theme,
				action,
				cookiedomain: cookieDomain,
				report,
			});
		}, [
			siteKey,
			safeOnVerify,
			safeOnExpire,
			safeOnError,
			size,
			theme,
			action,
			cookieDomain,
			report,
		]);

		useImperativeHandle(
			ref,
			(): HcaptchaRef => ({
				execute: (options?: { action?: string }) => {
					if (!window.hcaptcha || !captchaIdRef.current) {
						return Promise.resolve(null);
					}
					return window.hcaptcha.execute(captchaIdRef.current, {
						action: options?.action ?? action,
					}) as Promise<{ response?: string } | null>;
				},
				reset: (token?: string) => {
					if (window.hcaptcha && captchaIdRef.current) {
						window.hcaptcha.reset(captchaIdRef.current, token);
					}
				},
				getResponse: () => {
					if (window.hcaptcha && captchaIdRef.current) {
						return window.hcaptcha.getResponse(captchaIdRef.current) ?? "";
					}
					return "";
				},
			}),
			[action],
		);

		useEffect(() => {
			if (typeof window === "undefined") return;

			loadHcaptchaScript()
				.then(() => {
					renderWidget();
				})
				.catch((err) => {
					safeOnError(err.message);
				});

			return () => {
				if (window.hcaptcha && captchaIdRef.current) {
					window.hcaptcha.reset(captchaIdRef.current);
				}
			};
		}, [renderWidget, safeOnError]);

		return <div ref={containerRef} data-testid="hcaptcha-container" />;
	},
);

Hcaptcha.displayName = "Hcaptcha";
