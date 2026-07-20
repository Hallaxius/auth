export { credentials } from "./credentials";
export { discord } from "./discord";
export { mfa } from "./mfa";
export { passwordReset } from "./password-reset";
export { rateLimit } from "./rate-limit";

import {
	auth,
	combine,
	deny,
	publicPath,
	redirect,
	required,
	role,
	session,
} from "./middleware";

export const middleware = {
	auth,
	role,
	combine,
	session,
	publicPath,
	required,
	redirect,
	deny,
} as const;

import { pkce, processConfig, routes } from "./config";

export const config = {
	processConfig,
	pkce,
	routes,
} as const;

import {
	hasAnyRole,
	hasMember,
	hasRole,
	join,
	revoke,
	secret,
	sync,
	validate,
} from "./utils";
import { GuildRoleSync } from "./utils/guild";

export const utils = {
	secret,
	validate,
	guild: {
		join,
		hasRole,
		hasAnyRole,
		hasMember,
		sync,
		GuildRoleSync,
	},
	revoke,
} as const;

export { MemoryBruteForceStorage } from "./credentials";
export type { ErrorCode } from "./errors";
export { AuthError, ErrorCodes, getCode, isAuthError } from "./errors";
// Export storage implementations for testing/customization
export { MemoryStateStore } from "./internal/state";
export { DefaultRateLimitStorage } from "./rate-limit";
export type {
	AuthUserStorage,
	ConsumeResetTokenResult,
	CreateCredentialsUserData as CreateCredentialsInput,
	CredentialsConfig,
	DiscordAuthConfig as DiscordConfig,
	DiscordScope as Scope,
	DiscordTokenResponse as TokenResponse,
	DiscordUser,
	GuildMember,
	MfaChallengeResult,
	MfaFactoryConfig as MfaConfig,
	MfaMethod,
	MfaStorage,
	MfaVerifyResult,
	PasswordHasher,
	PasswordResetConfig,
	RateLimitConfig,
	RateLimitResult,
	RateLimitStorage,
	RequestResetResult,
	ResetNotifier,
	ResetPasswordResult,
	ResetTokenStorage,
	RoutesConfig as RouteOptions,
	SafeStoredUser,
	SessionConfig as SessionOptions,
	SessionData as SessionUser,
	StoredUser,
	TotpSetupResult,
	UserStorage,
} from "./types";
export { AuthStrategy } from "./types";
