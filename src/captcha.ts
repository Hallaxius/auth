import { ConfigurationError } from "./errors";
import { securityLogger } from "./utils/logger";

export type CaptchaProviderName = "hcaptcha" | "recaptcha" | "turnstile";

export interface CaptchaConfig {
	provider: CaptchaProviderName;

	enabled?: boolean;

	secretKey?: string;

	siteKey?: string;

	minScore?: number;

	expectedAction?: string;

	allowedHostnames?: string[];
}

export interface ResolvedCaptchaConfig extends CaptchaConfig {
	provider: CaptchaProviderName;
	enabled: boolean;
}

interface SiteVerifyResponse {
	success: boolean;
	"error-codes"?: string[];
	hostname?: string;
	action?: string;
	score?: number;
	[key: string]: unknown;
}

const SITEVERIFY_ENDPOINTS: Record<CaptchaProviderName, string> = {
	hcaptcha: "https://api.hcaptcha.com/siteverify",
	recaptcha: "https://www.google.com/recaptcha/api/siteverify",
	turnstile: "https://challenges.cloudflare.com/turnstile/v0/siteverify",
};

const SECRET_ENV_VAR: Record<CaptchaProviderName, string> = {
	hcaptcha: "HCAPTCHA_SECRET_KEY",
	recaptcha: "RECAPTCHA_SECRET_KEY",
	turnstile: "TURNSTILE_SECRET_KEY",
};

const CAPTCHA_VERIFY_TIMEOUT_MS = 10_000;

function buildFormBody(
	token: string,
	secret: string,
	options: {
		remoteip?: string;
		siteKey?: string;
	},
): string {
	const params = new URLSearchParams();
	params.set("secret", secret);
	params.set("response", token);
	if (options.remoteip) params.set("remoteip", options.remoteip);
	if (options.siteKey) params.set("sitekey", options.siteKey);
	return params.toString();
}

export async function verifyCaptcha(
	config: ResolvedCaptchaConfig,
	token: string,
	options: { remoteip?: string } = {},
): Promise<VerificationResult> {
	if (!token || typeof token !== "string") {
		return {
			success: false,
			error: "missing-input-response",
		};
	}

	const endpoint = SITEVERIFY_ENDPOINTS[config.provider];

	const body = buildFormBody(token, config.secretKey!, {
		remoteip: options.remoteip,
		siteKey: config.siteKey,
	});

	const controller = new AbortController();
	const timeout = setTimeout(
		() => controller.abort(),
		CAPTCHA_VERIFY_TIMEOUT_MS,
	);

	let response: Response;
	try {
		response = await fetch(endpoint, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body,
			signal: controller.signal,
		});
	} catch (error) {
		const isTimeout = error instanceof Error && error.name === "AbortError";
		securityLogger.error("Captcha verification request failed", {
			provider: config.provider,
			isTimeout,
			error: error instanceof Error ? error.message : String(error),
		});
		return {
			success: false,
			error: isTimeout ? "timeout-or-duplicate" : "internal-error",
			message: "Captcha verification failed",
		};
	} finally {
		clearTimeout(timeout);
	}

	if (!response.ok) {
		securityLogger.error("Captcha provider returned non-OK status", {
			provider: config.provider,
			status: response.status,
			statusText: response.statusText,
		});
		return {
			success: false,
			error: "bad-request",
			message: "Captcha verification failed",
		};
	}

	const data = (await response.json()) as SiteVerifyResponse;

	if (!data.success) {
		securityLogger.warn("Captcha provider reported failure", {
			provider: config.provider,
			errorCodes: data["error-codes"],
		});
		return {
			success: false,
			error: data["error-codes"]?.[0] ?? "invalid-input-response",
			message: "Captcha verification failed",
		};
	}

	if (
		config.allowedHostnames &&
		config.allowedHostnames.length > 0 &&
		!config.allowedHostnames.includes(data.hostname ?? "")
	) {
		securityLogger.warn("Captcha hostname not allowed", {
			provider: config.provider,
			hostname: data.hostname,
			allowedHostnames: config.allowedHostnames,
		});
		return {
			success: false,
			error: "hostname-not-allowed",
			message: "Captcha verification failed",
		};
	}

	if (config.expectedAction && data.action !== config.expectedAction) {
		securityLogger.warn("Captcha action mismatch", {
			provider: config.provider,
			expectedAction: config.expectedAction,
			actualAction: data.action,
		});
		return {
			success: false,
			error: "action-mismatch",
			message: "Captcha verification failed",
		};
	}

	if (
		config.provider === "recaptcha" &&
		config.minScore !== undefined &&
		typeof data.score === "number" &&
		data.score < config.minScore
	) {
		securityLogger.warn("Captcha score below minimum", {
			provider: config.provider,
			score: data.score,
			minScore: config.minScore,
		});
		return {
			success: false,
			error: "score-too-low",
			message: "Captcha verification failed",
		};
	}

	return {
		success: true,
		provider: config.provider,
		hostname: data.hostname,
		action: data.action,
		score: data.score,
	};
}

export interface VerificationResult {
	success: boolean;
	error?: string;
	message?: string;
	provider?: CaptchaProviderName;
	hostname?: string;
	action?: string;
	score?: number;
}

export function resolveCaptchaConfig(
	config: CaptchaConfig | undefined,
): ResolvedCaptchaConfig | null {
	if (!config || config.provider === undefined) {
		return null;
	}

	const enabled = config.enabled ?? true;
	const secretKey =
		config.secretKey ??
		(() => {
			const envKey = SECRET_ENV_VAR[config.provider];
			return typeof process !== "undefined" ? process.env[envKey] : undefined;
		})();

	if (!secretKey) {
		const envKey = SECRET_ENV_VAR[config.provider];
		throw new ConfigurationError(
			`Missing captcha secret key for provider "${config.provider}". Set ${envKey} env var or provide secretKey in config.`,
		);
	}

	return {
		provider: config.provider,
		enabled,
		secretKey,
		siteKey: config.siteKey,
		minScore: config.minScore,
		expectedAction: config.expectedAction,
		allowedHostnames: config.allowedHostnames,
	};
}
