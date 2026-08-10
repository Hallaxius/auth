import {
	CaptchaProvider,
	Hcaptcha,
	Recaptcha,
	Turnstile,
	useCaptcha,
} from "@/lib/auth";

export function DebugForm() {
	return (
		<CaptchaProvider provider="turnstile">
			<DebugFormInner />
		</CaptchaProvider>
	);
}

function DebugFormInner() {
	const { submitWithCaptcha, token, isReady, isError, errorMessage } =
		useCaptcha();

	const handleSuccess = (token: string) => {
		console.log("[debug] token received:", token.slice(0, 16) + "...");
	};
	const handleError = (err?: string) => {
		console.error("[debug] captcha error:", err);
	};
	const handleExpire = () => {
		console.warn("[debug] token expired");
	};

	const handleSubmit = async (e) => {
		e.preventDefault();
		await submitWithCaptcha("/api/submit", {
			method: "POST",
			body: new FormData(e.currentTarget),
		});
	};

	return (
		<form onSubmit={handleSubmit}>
			<input name="data" />

			<Turnstile
				onSuccess={handleSuccess}
				onError={handleError}
				onExpire={handleExpire}
			/>

			{isError && <span>Error: {errorMessage}</span>}

			<button type="submit" disabled={!isReady}>
				Submit
			</button>
		</form>
	);
}

export function StandaloneTurnstile() {
	return (
		<Turnstile
			onSuccess={(token) => console.log("Token:", token)}
			siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
		/>
	);
}
