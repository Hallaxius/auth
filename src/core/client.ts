import { RateLimitError, TokenExpiredError } from "./errors";
import type {
	AddMemberParams,
	DiscordConnection,
	DiscordGuild,
	DiscordGuildMember,
	DiscordTokenResponse,
	DiscordUser,
	OAuth2UrlParams,
	RefreshTokenParams,
	RevokeTokenParams,
	TokenRequestParams,
} from "./types";

const DISCORD_API = "https://discord.com/api/v10";
const DISCORD_AUTH = "https://discord.com/oauth2/authorize";

const DEFAULT_TIMEOUT = 5000;
const RATE_LIMIT_RETRY_AFTER_HEADER = "Retry-After";
const RATE_LIMIT_REMAINING_HEADER = "X-RateLimit-Remaining";
const RATE_LIMIT_RESET_HEADER = "X-RateLimit-Reset";
const RATE_LIMIT_GLOBAL_HEADER = "X-RateLimit-Global";

export class DiscordClient {
	private clientId: string;
	private clientSecret: string;

	constructor(clientId: string, clientSecret: string) {
		this.clientId = clientId;
		this.clientSecret = clientSecret;
	}

	/**
	 * Generates Discord OAuth2 authorization URL with PKCE (S256) always enabled
	 */
	generateAuthUrl(
		params: OAuth2UrlParams & {
			codeChallenge?: string;
			codeChallengeMethod?: string;
		},
	): string {
		const url = new URL(DISCORD_AUTH);
		url.searchParams.set("client_id", params.clientId);
		url.searchParams.set("redirect_uri", params.redirectUri);
		url.searchParams.set("response_type", params.responseType ?? "code");
		url.searchParams.set("scope", params.scopes.join(" "));
		url.searchParams.set("state", params.state);

		if (params.codeChallenge && params.codeChallengeMethod) {
			url.searchParams.set("code_challenge", params.codeChallenge);
			url.searchParams.set("code_challenge_method", params.codeChallengeMethod);
		}

		if (params.prompt) {
			url.searchParams.set("prompt", params.prompt);
		}

		return url.toString();
	}

	/**
	 * Exchanges authorization code for OAuth2 tokens
	 * Includes PKCE support via codeVerifier
	 */
	async exchangeCode(
		params: TokenRequestParams,
	): Promise<DiscordTokenResponse> {
		const body = new URLSearchParams({
			client_id: params.clientId,
			client_secret: params.clientSecret,
			grant_type: params.grantType ?? "authorization_code",
			code: params.code,
			redirect_uri: params.redirectUri,
		});

		if (params.codeVerifier) {
			body.set("code_verifier", params.codeVerifier);
		}

		const res = await this.fetchWithRateLimitHandling(
			`${DISCORD_API}/oauth2/token`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
				},
				body,
			},
		);

		if (!res.ok) {
			const err = await res.text();
			throw new Error(`Failed to exchange code: ${res.status} ${err}`);
		}

		return res.json() as Promise<DiscordTokenResponse>;
	}

	/**
	 * Makes a fetch request with rate limiting handling
	 * Throws RateLimitError if rate limit is hit
	 */
	private async fetchWithRateLimitHandling(
		input: RequestInfo | URL,
		init?: RequestInit,
	): Promise<Response> {
		const res = await fetch(input, {
			...init,
			signal: AbortSignal.timeout(DEFAULT_TIMEOUT),
		});

		const retryAfterHeader = res.headers.get(RATE_LIMIT_RETRY_AFTER_HEADER);
		const rateLimitRemaining = res.headers.get(RATE_LIMIT_REMAINING_HEADER);
		const rateLimitReset = res.headers.get(RATE_LIMIT_RESET_HEADER);
		const isGlobalRateLimit =
			res.headers.get(RATE_LIMIT_GLOBAL_HEADER) === "true";

		if (
			res.status === 429 ||
			(rateLimitRemaining !== null && parseInt(rateLimitRemaining, 10) === 0)
		) {
			const retryAfter = retryAfterHeader
				? parseInt(retryAfterHeader, 10)
				: rateLimitReset
					? parseInt(rateLimitReset, 10) * 1000
					: undefined;

			throw new RateLimitError(
				`Discord API rate limit exceeded${retryAfter ? `, retry after ${retryAfter}ms` : ""}`,
				{ retryAfter: retryAfter ? Math.ceil(retryAfter / 1000) : undefined },
			);
		}

		if (!res.ok && !isGlobalRateLimit) {
			const errorText = await res.text().catch(() => "Unknown error");
			throw new Error(`Discord API request failed: ${res.status} ${errorText}`);
		}

		return res;
	}

	/**
	 * Refreshes token using refresh token
	 */
	async refreshToken(
		params: RefreshTokenParams,
	): Promise<DiscordTokenResponse> {
		const body = new URLSearchParams({
			client_id: params.clientId,
			client_secret: params.clientSecret,
			grant_type: "refresh_token",
			refresh_token: params.refreshToken,
		});

		if (params.scopes) {
			body.set("scope", params.scopes.join(" "));
		}

		const res = await this.fetchWithRateLimitHandling(
			`${DISCORD_API}/oauth2/token`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
				},
				body,
			},
		);

		if (!res.ok) {
			const err = await res.text();
			throw new Error(`Failed to refresh token: ${res.status} ${err}`);
		}

		return res.json() as Promise<DiscordTokenResponse>;
	}

	/**
	 * Executes a request with automatic token refresh on 401/403 (expired token)
	 * @param accessToken Current access token
	 * @param refreshToken Refresh token
	 * @param requestFn Function that makes the request with the access token
	 * @param options Optional configuration for retry behavior
	 * @returns The response from requestFn
	 * @throws TokenExpiredError if token is expired and refresh fails
	 */
	async fetchWithAutoRefresh<T>(
		accessToken: string,
		refreshToken: string,
		requestFn: (token: string) => Promise<T>,
		options?: { maxRetries?: number },
	): Promise<T> {
		const maxRetries = options?.maxRetries ?? 1;
		let lastError: Error | undefined;

		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			try {
				return await requestFn(accessToken);
			} catch (error) {
				lastError = error as Error;

				const status = this.getErrorStatus(error);
				const isExpiredError = await this.isExpiredError(error);

				if ((status === 401 || status === 403) && isExpiredError) {
					try {
						const newTokens = await this.refreshToken({
							clientId: this.clientId,
							clientSecret: this.clientSecret,
							refreshToken,
						});
						accessToken = newTokens.access_token;
						continue;
					} catch {
						if (attempt >= maxRetries) {
							throw new TokenExpiredError(
								"Token has expired and could not be refreshed",
								{ cause: lastError },
							);
						}
						continue;
					}
				}

				throw error;
			}
		}

		throw (
			lastError ??
			new TokenExpiredError("Token has expired and max retries exceeded")
		);
	}

	private async isExpiredError(error: unknown): Promise<boolean> {
		if (!error || typeof error !== "object") return false;

		const obj = error as Record<string, unknown>;

		if (
			typeof obj.code === "string" &&
			obj.code.toLowerCase().includes("expired")
		)
			return true;
		if (
			typeof obj.message === "string" &&
			obj.message.toLowerCase().includes("expired")
		)
			return true;

		if (obj.response && typeof obj.response === "object") {
			const resp = obj.response as Record<string, unknown>;
			if (typeof resp.json === "function") {
				try {
					const body = await resp.json();
					if (body && typeof body === "object") {
						const data = body as Record<string, unknown>;
						if (typeof data.code === "number" && data.code === 50001)
							return true;
						if (
							typeof data.message === "string" &&
							data.message.toLowerCase().includes("expired")
						)
							return true;
					}
				} catch {
					/* ignore */
				}
			}
			if (
				typeof resp.code === "string" &&
				resp.code.toLowerCase().includes("expired")
			)
				return true;
			if (
				typeof resp.message === "string" &&
				resp.message.toLowerCase().includes("expired")
			)
				return true;
		}

		if (obj.error && typeof obj.error === "object") {
			const data = obj.error as Record<string, unknown>;
			if (typeof data.code === "number" && data.code === 50001) return true;
			if (
				typeof data.message === "string" &&
				data.message.toLowerCase().includes("expired")
			)
				return true;
		}

		return false;
	}

	/**
	 * Extracts HTTP status code from an error
	 */
	private getErrorStatus(error: unknown): number | undefined {
		if (error && typeof error === "object" && "status" in error) {
			const status = (error as { status: unknown }).status;
			return typeof status === "number" ? status : undefined;
		}
		if (error && typeof error === "object" && "response" in error) {
			const response = (error as { response: unknown }).response;
			if (response && typeof response === "object" && "status" in response) {
				const status = (response as { status: unknown }).status;
				return typeof status === "number" ? status : undefined;
			}
		}
		return undefined;
	}

	/**
	 * Revokes an access token
	 */
	async revokeToken(params: RevokeTokenParams): Promise<void> {
		const body = new URLSearchParams({
			client_id: params.clientId,
			client_secret: params.clientSecret,
			token: params.accessToken,
		});

		const res = await this.fetchWithRateLimitHandling(
			`${DISCORD_API}/oauth2/token/revoke`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
				},
				body,
			},
		);

		if (!res.ok) {
			const err = await res.text();
			throw new Error(`Failed to revoke token: ${res.status} ${err}`);
		}
	}

	/**
	 * Adds a user to a guild
	 */
	async addMember(params: AddMemberParams): Promise<void> {
		const body: Record<string, unknown> = {
			access_token: params.accessToken,
		};
		if (params.nick) body.nick = params.nick;
		if (params.roles) body.roles = params.roles;

		const res = await this.fetchWithRateLimitHandling(
			`${DISCORD_API}/guilds/${params.guildId}/members/${params.userId}`,
			{
				method: "PUT",
				headers: {
					Authorization: `Bot ${params.botToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(body),
			},
		);

		if (!res.ok && res.status !== 201 && res.status !== 204) {
			const err = await res.text();
			throw new Error(`Failed to add guild member: ${res.status} ${err}`);
		}
	}

	/**
	 * Gets authenticated user data
	 */
	async getUser(accessToken: string): Promise<DiscordUser> {
		const res = await this.fetchWithRateLimitHandling(
			`${DISCORD_API}/users/@me`,
			{
				headers: {
					Authorization: `Bearer ${accessToken}`,
				},
			},
		);

		if (!res.ok) {
			const err = await res.text();
			throw new Error(`Failed to get user: ${res.status} ${err}`);
		}

		return res.json() as Promise<DiscordUser>;
	}

	/**
	 * Gets authenticated user guilds
	 */
	async getUserGuilds(accessToken: string): Promise<DiscordGuild[]> {
		const res = await this.fetchWithRateLimitHandling(
			`${DISCORD_API}/users/@me/guilds`,
			{
				headers: {
					Authorization: `Bearer ${accessToken}`,
				},
			},
		);

		if (!res.ok) {
			const err = await res.text();
			throw new Error(`Failed to get guilds: ${res.status} ${err}`);
		}

		return res.json() as Promise<DiscordGuild[]>;
	}

	/**
	 * Gets authenticated user connections
	 */
	async getUserConnections(accessToken: string): Promise<DiscordConnection[]> {
		const res = await this.fetchWithRateLimitHandling(
			`${DISCORD_API}/users/@me/connections`,
			{
				headers: {
					Authorization: `Bearer ${accessToken}`,
				},
			},
		);

		if (!res.ok) {
			const err = await res.text();
			throw new Error(`Failed to get connections: ${res.status} ${err}`);
		}

		return res.json() as Promise<DiscordConnection[]>;
	}

	/**
	 * Gets a guild member by user ID and guild ID
	 * Requires bot token with appropriate permissions
	 */
	async getGuildMember(
		guildId: string,
		userId: string,
		botToken: string,
	): Promise<DiscordGuildMember> {
		const res = await this.fetchWithRateLimitHandling(
			`${DISCORD_API}/guilds/${guildId}/members/${userId}`,
			{
				headers: {
					Authorization: `Bot ${botToken}`,
				},
			},
		);

		if (!res.ok) {
			const err = await res.text();
			throw new Error(`Failed to get guild member: ${res.status} ${err}`);
		}

		return res.json() as Promise<DiscordGuildMember>;
	}

	async getGuildMemberRoles(
		guildId: string,
		userId: string,
		botToken: string,
	): Promise<string[]> {
		const member = await this.getGuildMember(guildId, userId, botToken);
		return member.roles;
	}
}