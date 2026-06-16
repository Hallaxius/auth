import type { SessionData, UserStorage } from "../core/types";

type RoleGuardContext = {
	user: SessionData | null;
	status: (code: number, body?: string) => void;
};

export function createRoleGuard(allowedRoles: string[], storage: UserStorage) {
	return {
		async resolve({ user, status }: RoleGuardContext) {
			if (!user) {
				return status(
					500,
					"requireRole macro requires auth macro to be applied first",
				);
			}

			const stored = await storage.findByDiscordId(user.discordId);
			const hasRole = allowedRoles.some((r) => stored?.roles.includes(r));
			if (!hasRole) {
				return status(403, "Forbidden");
			}
		},
	};
}
