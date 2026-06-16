import { Elysia } from "elysia";
import type { SessionData, UserStorage } from "../core/types";

type MeContext = {
	user?: SessionData | null;
	status: (code: number, body?: string) => void;
};

export function createMeRoute(mePath: string, storage: UserStorage) {
	return new Elysia({ name: "discord-auth-me" }).get(
		mePath,
		async ({ user, status }: MeContext) => {
			if (!user) {
				return status(401, "Unauthorized");
			}

			const stored = await storage.findByDiscordId(user.discordId);
			if (!stored) {
				return status(404, "User not found");
			}

			const { accessToken, refreshToken, ...safe } = stored;
			return safe;
		},
	);
}
