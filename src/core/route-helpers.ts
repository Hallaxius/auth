import type { DiscordClient } from "./client";
import type {
	CallbackQuery,
	DiscordAuthConfig,
	DiscordScope,
	ErrorQuery,
	InternalConfig,
	LoginQuery,
	SessionAdapter,
	UserStorage,
} from "./types";

export type InferScopes<Config extends DiscordAuthConfig> =
	Config["scopes"] extends readonly DiscordScope[]
		? Config["scopes"]
		: DiscordScope[];

export type CallbackContext<Config extends DiscordAuthConfig> = {
	config: InternalConfig;
	client: DiscordClient;
	sessionAdapter: SessionAdapter;
	storage?: UserStorage;
	scopes: Config["scopes"] extends readonly DiscordScope[]
		? Config["scopes"]
		: DiscordScope[];
};

export type LoginContext<Config extends DiscordAuthConfig> = {
	config: InternalConfig;
	client: DiscordClient;
	scopes: Config["scopes"] extends readonly DiscordScope[]
		? Config["scopes"]
		: DiscordScope[];
};

export type OAuth2ErrorCode =
	| "invalid_request"
	| "unauthorized_client"
	| "access_denied"
	| "unsupported_response_type"
	| "invalid_scope"
	| "server_error"
	| "temporarily_unavailable"
	| "invalid_grant"
	| "invalid_token"
	| (string & {});

export type TypedCallbackQuery = CallbackQuery & {
	error?: OAuth2ErrorCode;
};

export type TypedErrorQuery = ErrorQuery & {
	error: OAuth2ErrorCode;
};

export interface TypedRouteHandlers<Config extends DiscordAuthConfig> {
	callback: (
		query: TypedCallbackQuery,
		ctx: CallbackContext<Config>,
	) => Promise<Response>;
	login: (query: LoginQuery, ctx: LoginContext<Config>) => Promise<Response>;
	error: (
		query: TypedErrorQuery,
		ctx: { config: InternalConfig },
	) => Promise<Response>;
}

export function createTypedCallbackRoute<Config extends DiscordAuthConfig>(
	handler: (
		query: TypedCallbackQuery,
		ctx: CallbackContext<Config>,
	) => Promise<Response>,
) {
	return async (
		query: CallbackQuery,
		ctx: CallbackContext<Config>,
	): Promise<Response> => {
		const typedQuery: TypedCallbackQuery = {
			code: query.code,
			state: query.state,
			error: query.error as OAuth2ErrorCode | undefined,
			error_description: query.error_description,
		};
		return handler(typedQuery, ctx);
	};
}

export function createTypedLoginRoute<Config extends DiscordAuthConfig>(
	handler: (query: LoginQuery, ctx: LoginContext<Config>) => Promise<Response>,
) {
	return async (
		query: LoginQuery,
		ctx: LoginContext<Config>,
	): Promise<Response> => {
		return handler(query, ctx);
	};
}

export function createTypedErrorRoute<_Config extends DiscordAuthConfig>(
	handler: (
		query: TypedErrorQuery,
		ctx: { config: InternalConfig },
	) => Promise<Response>,
) {
	return async (
		query: ErrorQuery,
		ctx: { config: InternalConfig },
	): Promise<Response> => {
		const typedQuery: TypedErrorQuery = {
			error: query.error as OAuth2ErrorCode,
			error_description: query.error_description,
		};
		return handler(typedQuery, ctx);
	};
}

export function createTypedRouteHandlers<Config extends DiscordAuthConfig>(
	callbackHandler: (
		query: TypedCallbackQuery,
		ctx: CallbackContext<Config>,
	) => Promise<Response>,
	loginHandler: (
		query: LoginQuery,
		ctx: LoginContext<Config>,
	) => Promise<Response>,
	errorHandler: (
		query: TypedErrorQuery,
		ctx: { config: InternalConfig },
	) => Promise<Response>,
): TypedRouteHandlers<Config> {
	return {
		callback: createTypedCallbackRoute(callbackHandler),
		login: createTypedLoginRoute(loginHandler),
		error: createTypedErrorRoute(errorHandler),
	};
}

export type { CallbackQuery, ErrorQuery, LoginQuery } from "./types";
