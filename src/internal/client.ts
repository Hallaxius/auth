import { AuthError, ErrorCodes } from "../errors";
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
	UserStorage,
} from "../types";

const DISCORD_API = "https://discord.com/api/v10";
const DISCORD_AUTH = "https://discord.com/oauth2/authorize";
const DEFAULT_TIMEOUT = 5000;

export class DiscordClient {
	private clientId: string;
	private clientSecret: string;

	constructor(clientId: string, clientSecret: string) {
		this.clientId = clientId;
		this.clientSecret = clientSecret;
	}

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
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body,
			},
		);
		if (!res.ok) {
			const err = await res.text();
			throw new Error(`Failed to exchange code: ${res.status} ${err}`);
		}
		return res.json() as Promise<DiscordTokenResponse>;
	}

	async fetchWithRateLimitHandling(
		input: RequestInfo | URL,
		init?: RequestInit,
	): Promise<Response> {
		let res: Response;
		try {
			res = await fetch(input, {
				...init,
				signal: AbortSignal.timeout(DEFAULT_TIMEOUT),
			});
		} catch (error) {
			if (error instanceof Error && error.name === "AbortError") {
				throw new AuthError(
					ErrorCodes.NETWORK_ERROR,
					"Discord API request timed out",
					{ cause: error },
				);
			}
			throw new AuthError(
				ErrorCodes.UPSTREAM_ERROR,
				"Discord API request failed",
				{
					cause: error as Error,
				},
			);
		}

		const retryAfterHeader = res.headers.get("Retry-After");
		const rateLimitRemaining = res.headers.get("X-RateLimit-Remaining");
		const rateLimitReset = res.headers.get("X-RateLimit-Reset");
		const isGlobalRateLimit = res.headers.get("X-RateLimit-Global") === "true";

		if (res.status === 429 || isGlobalRateLimit) {
			const retryAfter = retryAfterHeader
				? Number.parseInt(retryAfterHeader, 10)
				: rateLimitReset
					? Number.parseInt(rateLimitReset, 10) * 1000
					: undefined;
			throw new AuthError(
				ErrorCodes.RATE_LIMITED,
				`Discord API rate limit exceeded${retryAfter ? `, retry after ${retryAfter}ms` : ""}`,
				{ retryAfter: retryAfter ? Math.ceil(retryAfter / 1000) : undefined },
			);
		}

		if (
			!res.ok &&
			rateLimitRemaining !== null &&
			Number.parseInt(rateLimitRemaining, 10) === 0
		) {
			const retryAfter = retryAfterHeader
				? Number.parseInt(retryAfterHeader, 10)
				: rateLimitReset
					? Number.parseInt(rateLimitReset, 10) * 1000
					: undefined;
			throw new AuthError(
				ErrorCodes.RATE_LIMITED,
				`Discord API rate limit exceeded${retryAfter ? `, retry after ${retryAfter}ms` : ""}`,
				{ retryAfter: retryAfter ? Math.ceil(retryAfter / 1000) : undefined },
			);
		}

		if (!res.ok) {
			const errorText = await res.text().catch(() => "Unknown error");
			throw new Error(`Discord API request failed: ${res.status} ${errorText}`);
		}

		return res;
	}

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
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body,
			},
		);
		if (!res.ok) {
			const err = await res.text();
			throw new Error(`Failed to refresh token: ${res.status} ${err}`);
		}
		return res.json() as Promise<DiscordTokenResponse>;
	}

	async fetchWithAutoRefresh<T>(
		accessToken: string,
		refreshToken: string,
		requestFn: (token: string) => Promise<T>,
		options?: {
			maxRetries?: number;
			storage?: UserStorage;
			userId?: string;
		},
	): Promise<T> {
		const maxRetries = options?.maxRetries ?? 1;
		let currentAccessToken = accessToken;
		let currentRefreshToken = refreshToken;
		let lastError: Error | undefined;

		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			try {
				return await requestFn(currentAccessToken);
			} catch (error) {
				lastError = error as Error;
				const status = this.getErrorStatus(error);
				const isExpired = this.isExpiredError(error);

				if ((status === 401 || status === 403) && isExpired) {
					try {
						const newTokens = await this.refreshToken({
							clientId: this.clientId,
							clientSecret: this.clientSecret,
							refreshToken: currentRefreshToken,
						});
						currentAccessToken = newTokens.access_token;
						currentRefreshToken = newTokens.refresh_token;
						if (options?.storage && options?.userId) {
							const expiresAt =
								Math.floor(Date.now() / 1000) + newTokens.expires_in;
							await options.storage.update(options.userId, {
								accessToken: currentAccessToken,
								refreshToken: currentRefreshToken,
								tokenExpiresAt: expiresAt,
							});
						}
						continue;
					} catch {
						if (attempt >= maxRetries) {
							throw new AuthError(
								ErrorCodes.TOKEN_EXPIRED,
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
			new AuthError(
				ErrorCodes.TOKEN_EXPIRED,
				"Token has expired and max retries exceeded",
			)
		);
	}

	private isExpiredError(error: unknown): boolean {
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
		return false;
	}

	private getErrorStatus(error: unknown): number | undefined {
		if (error && typeof error === "object" && "status" in error) {
			const status = (error as { status: unknown }).status;
			return typeof status === "number" ? status : undefined;
		}
		return undefined;
	}

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
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body,
			},
		);
		if (!res.ok) {
			const err = await res.text();
			throw new Error(`Failed to revoke token: ${res.status} ${err}`);
		}
	}

	async addMember(params: AddMemberParams): Promise<void> {
		const body: Record<string, unknown> = { access_token: params.accessToken };
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

	async getUser(accessToken: string): Promise<DiscordUser> {
		const res = await this.fetchWithRateLimitHandling(
			`${DISCORD_API}/users/@me`,
			{
				headers: { Authorization: `Bearer ${accessToken}` },
			},
		);
		if (!res.ok) {
			const err = await res.text();
			throw new Error(`Failed to get user: ${res.status} ${err}`);
		}
		return res.json() as Promise<DiscordUser>;
	}

	async getUserGuilds(accessToken: string): Promise<DiscordGuild[]> {
		const res = await this.fetchWithRateLimitHandling(
			`${DISCORD_API}/users/@me/guilds`,
			{
				headers: { Authorization: `Bearer ${accessToken}` },
			},
		);
		if (!res.ok) {
			const err = await res.text();
			throw new Error(`Failed to get guilds: ${res.status} ${err}`);
		}
		return res.json() as Promise<DiscordGuild[]>;
	}

	async getUserConnections(accessToken: string): Promise<DiscordConnection[]> {
		const res = await this.fetchWithRateLimitHandling(
			`${DISCORD_API}/users/@me/connections`,
			{
				headers: { Authorization: `Bearer ${accessToken}` },
			},
		);
		if (!res.ok) {
			const err = await res.text();
			throw new Error(`Failed to get connections: ${res.status} ${err}`);
		}
		return res.json() as Promise<DiscordConnection[]>;
	}

	async getGuildMember(
		guildId: string,
		userId: string,
		botToken: string,
	): Promise<DiscordGuildMember> {
		const res = await this.fetchWithRateLimitHandling(
			`${DISCORD_API}/guilds/${guildId}/members/${userId}`,
			{ headers: { Authorization: `Bot ${botToken}` } },
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
