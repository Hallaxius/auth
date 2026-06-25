import { describe, expectTypeOf, it } from "bun:test";
import type {
	CallbackContext,
	InferScopes,
	LoginContext,
	TypedCallbackQuery,
	TypedErrorQuery,
	TypedRouteHandlers,
} from "../route-helpers";
import type {
	CallbackQuery,
	DiscordAuthConfig,
	DiscordScope,
	ErrorQuery,
	InternalConfig,
	LoginQuery,
	SessionConfig,
} from "../types";

describe("route-helpers type tests", () => {
	it("should infer scopes from config", () => {
		type Config = DiscordAuthConfig & {
			scopes: ["identify", "email", "guilds"];
		};

		type Scopes = InferScopes<Config>;
		expectTypeOf<Scopes>().toEqualTypeOf<["identify", "email", "guilds"]>();
	});

	it("should infer scopes as DiscordScope[] when not specified", () => {
		type Config = DiscordAuthConfig & {
			scopes?: DiscordScope[];
		};

		type Scopes = InferScopes<Config>;
		expectTypeOf<Scopes>().toEqualTypeOf<DiscordScope[]>();
	});

	it("should provide typed callback context with config-inferred scopes", () => {
		type Config = DiscordAuthConfig & {
			scopes: ["identify", "email"];
		};

		type Ctx = CallbackContext<Config>;
		expectTypeOf<Ctx["scopes"]>().toEqualTypeOf<["identify", "email"]>();
		expectTypeOf<Ctx["config"]>().toEqualTypeOf<InternalConfig>();
		expectTypeOf<Ctx["client"]>().not.toBeNever();
		expectTypeOf<Ctx["sessionAdapter"]>().not.toBeNever();
		expectTypeOf<Ctx["storage"]>().not.toBeNever();
	});

	it("should provide typed login context with config-inferred scopes", () => {
		type Config = DiscordAuthConfig & {
			scopes: ["identify", "guilds", "connections"];
		};

		type Ctx = LoginContext<Config>;
		expectTypeOf<Ctx["scopes"]>().toEqualTypeOf<
			["identify", "guilds", "connections"]
		>();
		expectTypeOf<Ctx["config"]>().toEqualTypeOf<InternalConfig>();
		expectTypeOf<Ctx["client"]>().not.toBeNever();
	});

	it("should type callback query with OAuth2 error codes", () => {
		type Query = TypedCallbackQuery;
		expectTypeOf<Query["code"]>().toEqualTypeOf<string | undefined>();
		expectTypeOf<Query["state"]>().toEqualTypeOf<string | undefined>();
		expectTypeOf<Query["error"]>().toEqualTypeOf<
			| "invalid_request"
			| "unauthorized_client"
			| "access_denied"
			| "unsupported_response_type"
			| "invalid_scope"
			| "server_error"
			| "temporarily_unavailable"
			| "invalid_grant"
			| "invalid_token"
			| (string & {})
			| undefined
		>();
		expectTypeOf<Query["error_description"]>().toEqualTypeOf<
			string | undefined
		>();
	});

	it("should type error query with required OAuth2 error code", () => {
		type Query = TypedErrorQuery;
		expectTypeOf<Query["error"]>().toEqualTypeOf<
			| "invalid_request"
			| "unauthorized_client"
			| "access_denied"
			| "unsupported_response_type"
			| "invalid_scope"
			| "server_error"
			| "temporarily_unavailable"
			| "invalid_grant"
			| "invalid_token"
			| (string & {})
		>();
		expectTypeOf<Query["error_description"]>().toEqualTypeOf<
			string | undefined
		>();
	});

	it("should type callback route handler signature", () => {
		type Config = DiscordAuthConfig & {
			scopes: ["identify", "email"];
		};

		type Handler = (
			query: TypedCallbackQuery,
			ctx: CallbackContext<Config>,
		) => Promise<Response>;
		type Expected = (
			query: CallbackQuery,
			ctx: CallbackContext<Config>,
		) => Promise<Response>;
		expectTypeOf<Handler>().toEqualTypeOf<Expected>();
	});

	it("should type login route handler signature", () => {
		type Config = DiscordAuthConfig & {
			scopes: ["identify", "guilds"];
		};

		type Handler = (
			query: LoginQuery,
			ctx: LoginContext<Config>,
		) => Promise<Response>;
		type Expected = (
			query: LoginQuery,
			ctx: LoginContext<Config>,
		) => Promise<Response>;
		expectTypeOf<Handler>().toEqualTypeOf<Expected>();
	});

	it("should type error route handler signature", () => {
		type Config = DiscordAuthConfig & {
			scopes: ["identify"];
		};

		type Handler = (
			query: TypedErrorQuery,
			ctx: { config: InternalConfig },
		) => Promise<Response>;
		type Expected = (
			query: ErrorQuery,
			ctx: { config: InternalConfig },
		) => Promise<Response>;
		expectTypeOf<Handler>().toEqualTypeOf<Expected>();
	});

	it("should type route handlers object", () => {
		type Config = DiscordAuthConfig & {
			scopes: ["identify", "email", "guilds"];
		};

		type Handlers = TypedRouteHandlers<Config>;
		expectTypeOf<Handlers["callback"]>().toEqualTypeOf<
			(query: CallbackQuery, ctx: CallbackContext<Config>) => Promise<Response>
		>();
		expectTypeOf<Handlers["login"]>().toEqualTypeOf<
			(query: LoginQuery, ctx: LoginContext<Config>) => Promise<Response>
		>();
		expectTypeOf<Handlers["error"]>().toEqualTypeOf<
			(query: ErrorQuery, ctx: { config: InternalConfig }) => Promise<Response>
		>();
	});

	it("should provide autocomplete for DiscordScope", () => {
		type Scope = DiscordScope;
		const scope: Scope = "identify";
		const scope2: Scope = "email";
		const scope3: Scope = "guilds";
		const scope4: Scope = "connections";
		const scope5: Scope = "guilds.join";
		const scope6: Scope = "guilds.members.read";
		const scope7: Scope = "role_connections.write";
		const scope8: Scope = "rpc";
		const scope9: Scope = "activities.read";
		const scope10: Scope = "webhook.incoming";
		const scope11: Scope = "applications.commands";
		const scope12: Scope = "voice";
		const scope13: Scope = "dm_channels.read";

		expectTypeOf<typeof scope>().toEqualTypeOf<DiscordScope>();
		expectTypeOf<typeof scope2>().toEqualTypeOf<DiscordScope>();
		expectTypeOf<typeof scope3>().toEqualTypeOf<DiscordScope>();
		expectTypeOf<typeof scope4>().toEqualTypeOf<DiscordScope>();
		expectTypeOf<typeof scope5>().toEqualTypeOf<DiscordScope>();
		expectTypeOf<typeof scope6>().toEqualTypeOf<DiscordScope>();
		expectTypeOf<typeof scope7>().toEqualTypeOf<DiscordScope>();
		expectTypeOf<typeof scope8>().toEqualTypeOf<DiscordScope>();
		expectTypeOf<typeof scope9>().toEqualTypeOf<DiscordScope>();
		expectTypeOf<typeof scope10>().toEqualTypeOf<DiscordScope>();
		expectTypeOf<typeof scope11>().toEqualTypeOf<DiscordScope>();
		expectTypeOf<typeof scope12>().toEqualTypeOf<DiscordScope>();
		expectTypeOf<typeof scope13>().toEqualTypeOf<DiscordScope>();
	});

	it("should allow extending DiscordAuthConfig with custom scopes", () => {
		type CustomConfig = {
			clientId: string;
			clientSecret: string;
			session: SessionConfig;
			scopes: ["identify", "email", "guilds", "connections"];
			redirectUri?: string;
		};

		type Scopes = InferScopes<CustomConfig>;
		expectTypeOf<Scopes>().toEqualTypeOf<
			["identify", "email", "guilds", "connections"]
		>();
	});

	it("should export all query types", () => {
		expectTypeOf<CallbackQuery>().not.toBeNever();
		expectTypeOf<LoginQuery>().not.toBeNever();
		expectTypeOf<ErrorQuery>().not.toBeNever();
	});
});

describe("typed route handlers integration", () => {
	it("should work with discordAuth generic", () => {
		const config = {
			clientId: "test",
			clientSecret: "test",
			session: {
				type: "jwt" as const,
				secret: "test-secret",
			},
			scopes: ["identify", "email", "guilds"] as const,
		} satisfies DiscordAuthConfig;

		type Config = typeof config;
		type Scopes = InferScopes<Config>;
		expectTypeOf<Scopes>().toEqualTypeOf<["identify", "email", "guilds"]>();

		type Handlers = TypedRouteHandlers<Config>;
		expectTypeOf<Handlers["callback"]>().toEqualTypeOf<
			(query: CallbackQuery, ctx: CallbackContext<Config>) => Promise<Response>
		>();
		expectTypeOf<Handlers["login"]>().toEqualTypeOf<
			(query: LoginQuery, ctx: LoginContext<Config>) => Promise<Response>
		>();
		expectTypeOf<Handlers["error"]>().toEqualTypeOf<
			(query: ErrorQuery, ctx: { config: InternalConfig }) => Promise<Response>
		>();
	});
});
