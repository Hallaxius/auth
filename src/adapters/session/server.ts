import type {
	DiscordTokenResponse,
	DiscordUser,
	SessionAdapter,
	SessionConfig,
	SessionData,
} from "../../core/types";
import { parseExpiresIn } from "../../core/utils";

interface SessionEntry {
	data: SessionData;
	expiresAt: number;
}

export class ServerSessionAdapter implements SessionAdapter {
	private sessions = new Map<string, SessionEntry>();
	private readonly ttl: number;

	constructor(config: SessionConfig) {
		this.ttl = parseExpiresIn(config.expiresIn) * 1000;
	}

	async create(
		user: DiscordUser,
		_tokens: DiscordTokenResponse,
		roles?: string[],
	): Promise<string> {
		const sessionId = crypto.randomUUID();
		this.sessions.set(sessionId, {
			data: {
				discordId: user.id,
				username: user.username,
				globalName: user.global_name ?? null,
				avatar: user.avatar ?? null,
				email: user.email ?? null,
				locale: user.locale,
				roles,
			},
			expiresAt: Date.now() + this.ttl,
		});
		return sessionId;
	}

	async verify(token: string): Promise<SessionData | null> {
		const entry = this.sessions.get(token);
		if (!entry) return null;
		if (Date.now() > entry.expiresAt) {
			this.sessions.delete(token);
			return null;
		}
		return entry.data;
	}

	async destroy(token: string): Promise<void> {
		this.sessions.delete(token);
	}
}
