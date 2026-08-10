import {
	CaptchaProvider,
	Turnstile,
	useCaptcha,
} from "@/lib/auth";

export function LoginForm() {
	return (
		<CaptchaProvider provider="turnstile">
			<LoginFormInner />
		</CaptchaProvider>
	);
}

function LoginFormInner() {
	const { submitWithCaptcha, isReady, isError, errorMessage, reset } =
		useCaptcha();

	const handleSubmit = async (e) => {
		e.preventDefault();

		if (!isReady) {
			return;
		}

		const formData = new FormData(e.currentTarget);

		await submitWithCaptcha("/api/login", {
			method: "POST",
			body: formData,
		});
	};

	return (
		<form onSubmit={handleSubmit}>
			<input name="email" type="email" placeholder="Email" />
			<input name="password" type="password" placeholder="Password" />

			<Turnstile />

			{isError && <span>Error: {errorMessage}</span>}

			<button type="submit" disabled={!isReady}>
				Login
			</button>
		</form>
	);
}
