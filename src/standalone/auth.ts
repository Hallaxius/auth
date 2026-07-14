import { DiscordClient } from "../core/client";
import { processConfig } from "../core/config";
import { CredentialsClient } from "../core/credentials/client";
import type { PasswordHasher } from "../core/credentials/hasher";
import type { AuthUserStorage } from "../core/credentials/storage";
import type { CredentialsClientConfig } from "../core/credentials/types";
import type { BruteForceConfig, DiscordAuthConfig } from "../core/types";
import { createHandlers } from "./handler";
import { createCredentialsHandlers } from "./credentials";
import { createMiddlewares } from "./middleware";

/**
 * Credentials authentication configuration
 */
export interface CredentialsAuthConfig {
	/** Credentials auth strategy: usernameOnly, username+password, email+password, email+username+password */
	strategy: CredentialsClientConfig["strategy"];
	/** Session configuration */
	session: {
		type: "jwt";
		secret: string;
		expiresIn?: string | number;
		cookieName?: string;
	};
	/** User storage implementation */
	storage: AuthUserStorage;
	/** Password hasher implementation (use bcryptHasher from @hallaxius/auth) */
	hasher: PasswordHasher;
	/** Optional brute force protection */
	bruteForce?: Partial<BruteForceConfig>;
}

/**
 * Unified auth configuration — supports Discord, Credentials, or both
 */
export interface AuthConfig {
	/** Provider selection: 'discord', 'credentials', or 'both' (default: 'discord') */
	provider?: "discord" | "credentials" | "both";

	// Discord config (required if provider is 'discord' or 'both')
	clientId?: string;
	clientSecret?: string;
	session?: DiscordAuthConfig["session"];
	scopes?: DiscordAuthConfig["scopes"];
	prompt?: DiscordAuthConfig["prompt"];
	routes?: DiscordAuthConfig["routes"];
	callbacks?: DiscordAuthConfig["callbacks"];
	storage?: DiscordAuthConfig["storage"];
	meRoute?: DiscordAuthConfig["meRoute"];
	redirectUri?: DiscordAuthConfig["redirectUri"];
	disablePKCE?: DiscordAuthConfig["disablePKCE"];

	// Credentials config (required if provider is 'credentials' or 'both')
	credentials?: {
		strategy: CredentialsAuthConfig["strategy"];
		session: CredentialsAuthConfig["session"];
		storage: CredentialsAuthConfig["storage"];
		hasher: CredentialsAuthConfig["hasher"];
		bruteForce?: CredentialsAuthConfig["bruteForce"];
	};
}

export type AuthResult = {
	handleLogin: (request: Request) => Promise<Response>;
	handleCallback?: (request: Request) => Promise<Response>;
	handleRegister?: (request: Request) => Promise<Response>;
	handleLogout: (request: Request) => Promise<Response>;
	handleMe: (request: Request) => Promise<Response>;
	withAuth: ReturnType<typeof createMiddlewares>["withAuth"];
	withOptionalAuth: ReturnType<typeof createMiddlewares>["withOptionalAuth"];
	withRole: ReturnType<typeof createMiddlewares>["withRole"];
};

/**
 * Unified auth factory — supports Discord, Credentials, or both providers
 *
 * @example
 * // Discord only
 * const auth = auth({
 *   provider: "discord",
 *   clientId: "...",
 *   clientSecret: "...",
 *   session: { type: "jwt", secret: "..." },
 * });
 *
 * @example
 * // Credentials only (username+password)
 * const auth = auth({
 *   provider: "credentials",
 *   credentials: {
 *     strategy: "username+password",
 *     session: { type: "jwt", secret: "..." },
 *     storage: myStorage,
 *     hasher: bcryptHasher,
 *   },
 * });
 *
 * @example
 * // Both providers
 * const auth = auth({
 *   provider: "both",
 *   clientId: "...",
 *   clientSecret: "...",
 *   session: { type: "jwt", secret: "..." },
 *   credentials: {
 *     strategy: "email+password",
 *     session: { type: "jwt", secret: "..." },
 *     storage: myStorage,
 *     hasher: bcryptHasher,
 *   },
 * });
 */
export function auth(config: AuthConfig): AuthResult {
	const provider = config.provider ?? "discord";
	const enableDiscord = provider === "discord" || provider === "both";
	const enableCredentials = provider === "credentials" || provider === "both";

	// Validate config
	if (enableDiscord && (!config.clientId || !config.clientSecret)) {
		throw new Error("Discord provider requires clientId and clientSecret");
	}
	if (enableCredentials && !config.credentials) {
		throw new Error("Credentials provider requires credentials config");
	}

	const result: Partial<AuthResult> = {};

	// Discord handlers
	if (enableDiscord && config.clientId && config.clientSecret && config.session) {
		const internalConfig = processConfig({
			clientId: config.clientId,
			clientSecret: config.clientSecret,
			session: config.session,
			scopes: config.scopes,
			prompt: config.prompt,
			routes: config.routes,
			callbacks: config.callbacks,
			storage: config.storage,
			meRoute: config.meRoute,
			redirectUri: config.redirectUri,
			disablePKCE: config.disablePKCE,
		});

		const client = new DiscordClient(config.clientId, config.clientSecret);
		const storage = internalConfig.storage;
		const cookieName = config.session.cookieName ?? "discord-auth-session";

		const ctx = { config: internalConfig, client, storage };
		const handlers = createHandlers(ctx);
		const middlewares = createMiddlewares({
			secret: config.session.secret,
			sessionType: config.session.type,
			cookieName,
			storage,
			client,
			clientId: config.clientId,
			clientSecret: config.clientSecret,
			autoRefresh: internalConfig.autoRefresh,
		});

		result.handleLogin = handlers.handleLogin;
		result.handleCallback = handlers.handleCallback;
		result.handleLogout = handlers.handleLogout;
		result.handleMe = handlers.handleMe;
		result.withAuth = middlewares.withAuth;
		result.withOptionalAuth = middlewares.withOptionalAuth;
		result.withRole = middlewares.withRole;
	}

	// Credentials handlers
	if (enableCredentials && config.credentials) {
		const credentialsClient = new CredentialsClient(
			{
				strategy: config.credentials.strategy,
				secret: config.credentials.session.secret,
				expiresIn: config.credentials.session.expiresIn,
				cookieName: config.credentials.session.cookieName,
			},
			config.credentials.storage,
			config.credentials.hasher,
			config.credentials.bruteForce,
		);

		const credentialsHandlers = createCredentialsHandlers({ client: credentialsClient });

		// Use generic names if Discord is not enabled (credentials-only mode)
		if (!enableDiscord) {
			result.handleLogin = credentialsHandlers.handleLogin;
			result.handleRegister = credentialsHandlers.handleRegister;
			result.handleLogout = credentialsHandlers.handleLogout;
			result.handleMe = credentialsHandlers.handleMe;
		} else {
			// Both providers — expose credentials handlers with specific names
			(result as any).handleCredentialsRegister = credentialsHandlers.handleRegister;
			(result as any).handleCredentialsLogin = credentialsHandlers.handleLogin;
			(result as any).handleCredentialsLogout = credentialsHandlers.handleLogout;
			(result as any).handleCredentialsMe = credentialsHandlers.handleMe;
		}

		// Credentials middleware uses the same middlewareAuth/middlewareRole from edge
		// User can pass credentialsClient to middlewareAuth for session verification
	}

	return result as AuthResult;
}

/**
 * @deprecated Use `auth({ provider: "credentials", credentials: {...} })` instead
 * This function will be removed in the next major version
 */
export function authCredentials(credentialsConfig: CredentialsAuthConfig) {
	console.warn(
		"authCredentials() is deprecated. Use auth({ provider: 'credentials', credentials: {...} }) instead.",
	);

	const credentialsClient = new CredentialsClient(
		{
			strategy: credentialsConfig.strategy,
			secret: credentialsConfig.session.secret,
			expiresIn: credentialsConfig.session.expiresIn,
			cookieName: credentialsConfig.session.cookieName,
		},
		credentialsConfig.storage,
		credentialsConfig.hasher,
		credentialsConfig.bruteForce,
	);

	return createCredentialsHandlers({ client: credentialsClient });
}
