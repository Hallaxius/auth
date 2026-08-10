import {
	CaptchaProvider,
	Recaptcha,
	useCaptcha,
} from "@/lib/auth";

export function PasswordResetForm() {
	return (
		<CaptchaProvider provider="recaptcha" autoExecute={false}>
			<PasswordResetInner />
		</CaptchaProvider>
	);
}

function PasswordResetInner() {
	const { execute, token, isReady, isError, errorMessage, submitWithCaptcha } =
		useCaptcha();

	const handleSubmit = async (e) => {
		e.preventDefault();

		const action = "password_reset";

		const result = execute(action);
		if (result instanceof Promise) {
			await result;
		}

		if (!token) return;

		const formData = new FormData(e.currentTarget);
		formData.append("captcha_token", token);

		const res = await submitWithCaptcha("/api/reset-password", {
			method: "POST",
			body: formData,
		});

		if (res.ok) {
			console.log("Password reset successfully");
		}
	};

	return (
		<form onSubmit={handleSubmit}>
			<input name="email" type="email" placeholder="Email" />

			<Recaptcha size="invisible" />

			{isError && <span>Error: {errorMessage}</span>}

			<button type="submit">Send recovery link</button>
		</form>
	);
}
