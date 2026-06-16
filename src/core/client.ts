import {
	generateCodeChallenge,
	generateCodeVerifier,
	isValidCodeVerifier,
} from "./config";
import { RateLimitError } from "./errors";
import type {
	AddMemberParams,
	DiscordConnection,
	DiscordGuild,
	DiscordGuildMember,
	DiscordTokenResponse,
	DiscordUser,
	OAuth2UrlParams,
	PKCEParams,
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
	 * Generates a code_verifier for PKCE (S256)
	 * Implementation according to RFC 7636
	 */
	generateCodeVerifier(): string {
		return generateCodeVerifier();
	}

	/**
	 * Generates a code_challenge from code_verifier using S256
	 */
	async generateCodeChallenge(verifier: string): Promise<string> {
		if (!isValidCodeVerifier(verifier)) {
			throw new Error("Invalid code verifier");
		}
		return generateCodeChallenge(verifier);
	}

	/**
	 * Generates code_verifier and code_challenge for PKCE
	 */
	async generatePKCE(): Promise<PKCEParams> {
		const codeVerifier = this.generateCodeVerifier();
		const codeChallenge = await this.generateCodeChallenge(codeVerifier);
		return {
			codeVerifier,
			codeChallenge,
			codeChallengeMethod: "S256",
		};
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
				retryAfter ? Math.ceil(retryAfter / 1000) : undefined,
			);
		}

		if (!res.ok && !isGlobalRateLimit) {
			const _url =
				typeof input === "string"
					? input
					: input instanceof URL
						? input.toString()
						: "unknown";
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
}
