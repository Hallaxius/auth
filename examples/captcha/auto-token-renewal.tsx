import {
	CaptchaProvider,
	Turnstile,
	useCaptcha,
} from "@/lib/auth";

export function CommentForm() {
	return (
		<CaptchaProvider provider="hcaptcha" autoExecute={true}>
			<CommentFormInner />
		</CaptchaProvider>
	);
}

function CommentFormInner() {
	const {
		token,
		isReady,
		isLoading,
		isError,
		errorMessage,
		submitWithCaptcha,
	} = useCaptcha();

	const handleSubmit = async (e) => {
		e.preventDefault();

		if (!isReady) {
			alert("Please wait for the captcha to load...");
			return;
		}

		const formData = new FormData(e.currentTarget);

		await submitWithCaptcha("/api/comment", {
			method: "POST",
			body: formData,
		});
	};

	return (
		<div>
			<form onSubmit={handleSubmit}>
				<textarea name="text" placeholder="Your comment..." />

				<Turnstile />

				<button type="submit" disabled={!isReady}>
					Comment
				</button>
			</form>

			{isLoading && <p>Validating captcha...</p>}
			{isError && <p>Error: {errorMessage}</p>}
		</div>
	);
}
