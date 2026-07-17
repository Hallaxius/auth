/**
 * @hallaxius/auth v3 — Single entry point
 *
 * Usage:
 *   import { discord, credentials, middleware, config, utils, errors, types } from '@hallaxius/auth'
 */

export { credentials } from "./credentials";
// ===== MAIN FACTORIES =====
export { discord } from "./discord";

// ===== MIDDLEWARE (object) =====
import {
	combine,
	denied,
	getSession,
	isPublicPath,
	middlewareAuth,
	middlewareRole,
	redirect,
	requiredRole,
} from "./middleware";

export const middleware = {
	auth: middlewareAuth,
	role: middlewareRole,
	combine,
	session: getSession,
	publicPath: isPublicPath,
	required: requiredRole,
	redirect,
	deny: denied,
} as const;

// ===== CONFIG (object) =====
import {
	createTypedRouteHandlers,
	generateCodeChallenge,
	generateCodeVerifier,
	generatePKCE,
	processConfig,
} from "./config";

export const config = {
	normalize: processConfig,
	pkce: {
		verifier: generateCodeVerifier,
		challenge: generateCodeChallenge,
		create: generatePKCE,
	},
	routes: { create: createTypedRouteHandlers },
} as const;

// ===== UTILS (object) =====
import {
	autoJoinGuild,
	generateSecureSecret,
	hasAnyRoleInGuild,
	hasRoleInGuild,
	isUserInGuild,
	revokeUserSession,
	syncUserRoles,
	validateConfig,
} from "./utils";

export const utils = {
	secret: generateSecureSecret,
	validate: validateConfig,
	guild: {
		join: autoJoinGuild,
		hasRole: hasRoleInGuild,
		hasAnyRole: hasAnyRoleInGuild,
		hasMember: isUserInGuild,
		sync: syncUserRoles,
	},
	revoke: revokeUserSession,
} as const;

export type { ErrorCode } from "./errors";
// ===== ERRORS =====
export { AuthError, ErrorCodes, getCode, isAuthError } from "./errors";

// ===== TYPES =====
export type {
	CreateCredentialsInput,
	CredentialsConfig,
	CredentialsStorage,
	DiscordConfig,
	DiscordUser,
	GuildMember,
	PasswordHasher,
	RouteOptions,
	Scope,
	SessionOptions,
	SessionUser,
	StoredUser,
	TokenResponse,
	UserStorage,
} from "./types";
