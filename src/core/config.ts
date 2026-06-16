import type {
	Callbacks,
	DiscordAuthConfig,
	DiscordScope,
	InternalConfig,
	RoutesConfig,
} from "./types";

const DEFAULT_SCOPES = ["identify"] as const;
const DEFAULT_ROUTES: Required<RoutesConfig> = {
	prefix: "/auth/discord",
	callback: "/auth/discord/callback",
	logout: "/auth/discord/logout",
	error: "/auth/discord/error",
};

const DEFAULT_CALLBACKS: Required<Callbacks> = {
	onSuccess: async () => undefined,
	onError: async () => undefined,
};

/**
 * Processes input configuration and returns complete internal configuration.
 * Ensures all optional fields have default values.
 */
export function processConfig(config: DiscordAuthConfig): InternalConfig {
	const routerPrefix = config.routes?.prefix ?? DEFAULT_ROUTES.prefix;

	if (!config.clientId || !config.clientSecret) {
		throw new Error("clientId and clientSecret are required");
	}

	if (!config.session?.secret) {
		throw new Error("session.secret is required");
	}

	const redirectUri =
		config.redirectUri ??
		process.env.DISCORD_REDIRECT_URI ??
		`${routerPrefix}/callback`.replace(/^\/\//, "");

	return {
		clientId: config.clientId,
		clientSecret: config.clientSecret,
		session: config.session,
		scopes: (config.scopes ?? [...DEFAULT_SCOPES]) as DiscordScope[],
		prompt: config.prompt ?? "consent",
		routes: { ...DEFAULT_ROUTES, ...config.routes } as Required<RoutesConfig>,
		callbacks: {
			...DEFAULT_CALLBACKS,
			...config.callbacks,
		} as Required<Callbacks>,
		redirectUri,
		storage: config.storage,
		meRoute: config.meRoute ?? "/auth/me",
		disablePKCE: config.disablePKCE ?? false,
	};
}

/**
 * Generates code_verifier for PKCE (S256)
 * Implementation according to RFC 7636
 */
export function generateCodeVerifier(): string {
	const array = new Uint8Array(32);
	crypto.getRandomValues(array);
	return btoa(String.fromCharCode(...Array.from(array)))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

/**
 * Generates code_challenge from code_verifier using S256
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(verifier);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));

	const hashHex = hashArray
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");

	const hashBytes = new Uint8Array(hashHex.length / 2);
	for (let i = 0; i < hashBytes.length; i++) {
		hashBytes[i] = parseInt(hashHex.slice(i * 2, i * 2 + 2), 16);
	}

	return btoa(String.fromCharCode(...hashBytes))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

/**
 * Generates code_verifier and code_challenge for PKCE
 */
export async function generatePKCE(): Promise<{
	codeVerifier: string;
	codeChallenge: string;
	codeChallengeMethod: "S256";
}> {
	const codeVerifier = generateCodeVerifier();
	const codeChallenge = await generateCodeChallenge(codeVerifier);
	return {
		codeVerifier,
		codeChallenge,
		codeChallengeMethod: "S256",
	};
}

/**
 * Validates if a string is a valid code_verifier (PKCE)
 */
export function isValidCodeVerifier(verifier: string): boolean {
	return (
		verifier.length >= 43 &&
		verifier.length <= 128 &&
		/^[A-Za-z0-9-_]+$/.test(verifier)
	);
}

/**
 * Validates if a string is a valid code_challenge (PKCE)
 */
export function isValidCodeChallenge(challenge: string): boolean {
	return (
		challenge.length >= 43 &&
		challenge.length <= 128 &&
		/^[A-Za-z0-9-_]+$/.test(challenge)
	);
}
