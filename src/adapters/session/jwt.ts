import type {
	DiscordTokenResponse,
	DiscordUser,
	SessionAdapter,
	SessionConfig,
	SessionData,
} from "../../core/types";

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
		_user: DiscordUser,
		_tokens: DiscordTokenResponse,
		_roles?: string[],
	): Promise<string> {
		return ""; // JWT signing is handled by @elysiajs/jwt plugin
	}

	async verify(_token: string): Promise<SessionData | null> {
		return null; // JWT verification is handled by @elysiajs/jwt plugin
	}

	async destroy(_token: string): Promise<void> {
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
