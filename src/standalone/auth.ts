import { DiscordClient } from "../core/client";
import { processConfig } from "../core/config";
import type { DiscordAuthConfig } from "../core/types";
import { createHandlers } from "./handler";
import { createMiddlewares } from "./middleware";

export function auth(config: DiscordAuthConfig) {
	const internalConfig = processConfig(config);
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
	});

	return {
		handleLogin: handlers.handleLogin,
		handleCallback: handlers.handleCallback,
		handleLogout: handlers.handleLogout,
		handleMe: handlers.handleMe,
		withAuth: middlewares.withAuth,
		withOptionalAuth: middlewares.withOptionalAuth,
		withRole: middlewares.withRole,
	};
}
