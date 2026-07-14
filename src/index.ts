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
	GuildJoinError,
	GuildSyncError,
	getErrorCode,
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
export { createTypedRouteHandlers } from "./core/route-helpers";
export {
	consumeState,
	generateState,
	MemoryStateStore,
	type StateStore,
	type ValidatedState,
	validateState,
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
export { CredentialsClient } from "./core/credentials/client";
export { AuthStrategy } from "./core/credentials/strategy";
export {
	EmailTakenError,
	InvalidCredentialsError,
	CredentialsAuthError,
	CredentialsValidationError,
	UsernameTakenError,
	UserNotFoundError,
} from "./core/credentials/errors";
export type {
	CreateCredentialsUserData,
	CredentialsAuthResult,
	CredentialsClientConfig,
	AuthUser,
	AuthUserIdentifier,
} from "./core/credentials/types";
export type { PasswordHasher } from "./core/credentials/hasher";
export type { AuthUserStorage } from "./core/credentials/storage";
export type {
	AuthHandler,
	EdgeAuthConfig,
	EdgeRoleConfig,
	EdgeSessionConfig,
} from "./standalone";
export {
	auth,
	combine,
	createCredentialsHandlers,
	denied,
	getSession,
	isPublicPath,
	middlewareAuth,
	middlewareRole,
	middlewares,
	redirect,
	requiredRole,
} from "./standalone";
export type {
	AuthConfig,
	AuthResult,
	CredentialsAuthConfig,
	CredentialsMiddlewareConfig,
	CredentialsRoleMiddlewareConfig,
} from "./standalone";
export { nextAuth, nextRole } from "./standalone/next";
export type { GuildMember } from "./utils";
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
