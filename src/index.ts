export { DiscordClient } from "./core/client";
export {
	generateCodeChallenge,
	generateCodeVerifier,
	generatePKCE,
	processConfig,
} from "./core/config";
export {
	BruteForceBlockedError,
	ConfigurationError,
	DiscordAuthError,
	ExpiredStateError,
	getErrorCode,
	GuildJoinError,
	GuildSyncError,
	InvalidCodeError,
	InvalidScopeError,
	InvalidStateError,
	InvalidTokenError,
	isDiscordAuthError,
	MfaRequiredError,
	NetworkError,
	PKCEError,
	RateLimitError,
	StateBindingError,
	StateReusedError,
	StorageError,
	TokenExpiredError,
	TokenRevokedError,
} from "./core/errors";
export {
	generateState,
	type ValidatedState,
	validateState,
	consumeState,
	type StateStore,
	MemoryStateStore,
} from "./core/state";
export type {
	AddMemberParams,
	AutoRefreshConfig,
	BruteForceConfig,
	BruteForceStorage,
	Callbacks,
	CreateUserData,
	CsrfConfig,
	DiscordAuthConfig,
	DiscordConnection,
	DiscordGuild,
	DiscordGuildMember,
	DiscordScope,
	DiscordTokenResponse,
	DiscordUser,
	GetGuildMemberParams,
	GuildRoleSyncConfig,
	MfaConfig,
	PKCEParams,
	PromptType,
	RoutesConfig,
	SafeStoredUser,
	SessionConfig,
	SessionData,
	SessionType,
	StoredUser,
	UserStorage,
} from "./core/types";
export type {
	AuthHandler,
	EdgeAuthConfig,
	EdgeRoleConfig,
	EdgeSessionConfig,
} from "./standalone";
export {
	auth,
	combine,
	denied,
	getSession,
	isPublicPath,
	middlewareAuth,
	middlewareRole,
	middlewares,
	redirect,
	requiredRole,
} from "./standalone";
export { nextAuth, nextRole } from "./standalone/next";
export type { GuildMember } from "./utils";

// Utility helpers
export {
	autoJoinGuild,
	generateSecureSecret,
	hasAnyRoleInGuild,
	hasRoleInGuild,
	isUserInGuild,
	revokeUserSession,
	syncUserRoles,
	validateConfig,
} from "./utils";
export { createTypedRouteHandlers } from "./core/route-helpers";
export { Discord } from "./wrapper";
