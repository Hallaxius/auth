import type {
	DiscordTokenResponse,
	DiscordUser,
	SessionAdapter,
	SessionConfig,
	SessionData,
} from "../../core/types";
import { DiscordAuthError } from "../../core/errors";

interface JwtPayload {
	discordId: string;
	username: string;
	globalName: string | null;
	avatar: string | null;
	email: string | null;
	locale: string;
	iat?: number;
	exp?: number;
}

export class JwtSessionAdapter implements SessionAdapter {
	private config: SessionConfig;

	constructor(config: SessionConfig) {
		this.config = {
			cookieName: "discord-auth-session",
			cookiePath: "/",
			httpOnly: true,
			secure: false,
			sameSite: "lax",
			expiresIn: "7d",
			...config,
		};
	}

	async create(
		user: DiscordUser,
		tokens: DiscordTokenResponse,
		roles?: string[],
	): Promise<string> {
		throw new DiscordAuthError(
			"JWT_ADAPTER_CREATE_NOT_SUPPORTED",
			"JwtSessionAdapter.create() is not supported — JWT signing is handled by @elysiajs/jwt. Use signToken() from the Elysia plugin instead.",
			{ statusCode: 500 },
		);
	}

	async verify(session: string): Promise<SessionData | null> {
		throw new DiscordAuthError(
			"JWT_ADAPTER_VERIFY_NOT_SUPPORTED",
			"JwtSessionAdapter.verify() is not supported — JWT verification is handled by @elysiajs/jwt. Use verifyToken() from the Elysia plugin instead.",
			{ statusCode: 500 },
		);
	}

	async destroy(token: string): Promise<void> {
		// JWT is stateless - no server-side state to destroy
		// Cookie clearing is handled by the plugin
	}

	get cookieName(): string {
		return this.config.cookieName ?? "discord-auth-session";
	}

	get cookieOptions() {
		return {
			httpOnly: this.config.httpOnly,
			secure: this.config.secure,
			sameSite: this.config.sameSite,
			path: this.config.cookiePath,
			maxAge: this.config.expiresIn,
		};
	}

	toPayload(user: DiscordUser): JwtPayload {
		return {
			discordId: user.id,
			username: user.username,
			globalName: user.global_name,
			avatar: user.avatar,
			email: user.email,
			locale: user.locale,
		};
	}

	fromPayload(payload: JwtPayload): SessionData {
		return {
			discordId: payload.discordId,
			username: payload.username,
			globalName: payload.globalName,
			avatar: payload.avatar,
			email: payload.email,
			locale: payload.locale,
		};
	}
}