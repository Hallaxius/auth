export { DiscordClient } from "./core/client";
export {
	generateCodeChallenge,
	generateCodeVerifier,
	generatePKCE,
	processConfig,
} from "./core/config";
export {
	ConfigurationError,
	DiscordAuthError,
	ExpiredStateError,
	GuildJoinError,
	getErrorCode,
	InvalidCodeError,
	InvalidScopeError,
	InvalidStateError,
	InvalidTokenError,
	isDiscordAuthError,
	NetworkError,
	PKCEError,
	RateLimitError,
	StorageError,
	TokenExpiredError,
	TokenRevokedError,
} from "./core/errors";
export {
	generateState,
	type ValidatedState,
	validateState,
} from "./core/state";
export type {
	AddMemberParams,
	Callbacks,
	CreateUserData,
	DiscordAuthConfig,
	DiscordConnection,
	DiscordGuild,
	DiscordGuildMember,
	DiscordScope,
	DiscordTokenResponse,
	DiscordUser,
	GetGuildMemberParams,
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
	EdgePresetOpts,
	InferSession,
	InferStoredUser,
	InferUser,
	NextjsPresetOpts,
	ServerPresetOpts,
	SpaPresetOpts,
} from "./elysia/plugin";
export { discordAuth, from, presets } from "./elysia/plugin";
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
export { Discord } from "./wrapper";
