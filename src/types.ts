/**
 * v3 Types — Essential exports only (~15 types)
 *
 * Re-exports from the self-contained factory modules.
 */

// From credentials.ts
export type {
	AuthUserStorage as CredentialsStorage,
	CreateCredentialsUserData as CreateCredentialsInput,
	CredentialsConfig,
	PasswordHasher,
} from "./credentials";
// From discord.ts
export type {
	DiscordAuthConfig as DiscordConfig,
	DiscordScope as Scope,
	DiscordTokenResponse as TokenResponse,
	DiscordUser,
	RoutesConfig as RouteOptions,
	SessionConfig as SessionOptions,
	SessionData as SessionUser,
	StoredUser,
	UserStorage,
} from "./discord";

// From utils.ts
export type { GuildMember } from "./utils";
