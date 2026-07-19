export { credentials } from "./credentials";
export { discord } from "./discord";

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

export type {
	AuthStrategy,
	AuthUserStorage,
	CreateCredentialsUserData as CreateCredentialsInput,
	CredentialsConfig,
	PasswordHasher,
} from "./credentials";
export type { ErrorCode } from "./errors";
export { AuthError, ErrorCodes, getCode, isAuthError } from "./errors";
export type {
	DiscordAuthConfig as DiscordConfig,
	DiscordScope as Scope,
	DiscordTokenResponse as TokenResponse,
	DiscordUser,
	GuildMember,
	RoutesConfig as RouteOptions,
	SafeStoredUser,
	SessionConfig as SessionOptions,
	SessionData as SessionUser,
	StoredUser,
	UserStorage,
} from "./types";
