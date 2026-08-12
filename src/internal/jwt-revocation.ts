import type { TokenRevocationStorage } from "../types";
import { createSecurityLogger } from "../utils/logger";

const _logger = createSecurityLogger("jwt-revocation");

interface FamilyMemberEntry {
	userId: string;
	jtis: Set<string>;
	expiresAt: number;
}

export class MemoryTokenRevocationStorage implements TokenRevocationStorage {
	private store = new Map<string, { expiresAt: number }>();
	private familyRevocations = new Map<string, { expiresAt: number }>();
	private familyMembers = new Map<string, FamilyMemberEntry>();
	private userFamilies = new Map<string, Map<string, number>>();
	private cleanupInterval: ReturnType<typeof setInterval> | null = null;

	constructor() {
		if (typeof setInterval !== "undefined") {
			this.startCleanup();
		}
	}

	private startCleanup(): void {
		this.cleanupInterval = setInterval(() => {
			const now = Date.now();
			for (const [jti, data] of this.store.entries()) {
				if (data.expiresAt < now) {
					this.store.delete(jti);
				}
			}
			for (const [familyId, data] of this.familyRevocations.entries()) {
				if (data.expiresAt < now) {
					this.familyRevocations.delete(familyId);
				}
			}
			for (const [familyId, member] of this.familyMembers.entries()) {
				if (member.expiresAt < now) {
					this.familyMembers.delete(familyId);
					this.userFamilies.get(member.userId)?.delete(familyId);
				}
			}
		}, 60000);

		if (this.cleanupInterval.unref) {
			this.cleanupInterval.unref();
		}
	}

	async isRevoked(jti: string): Promise<boolean> {
		const entry = this.store.get(jti);
		if (!entry) return false;
		if (Date.now() > entry.expiresAt) {
			this.store.delete(jti);
			return false;
		}
		return true;
	}

	async revoke(jti: string, ttlSeconds: number): Promise<void> {
		const expiresAt = Date.now() + ttlSeconds * 1000;
		this.store.set(jti, { expiresAt });
	}

	async revokeIfPresent(jti: string, ttlSeconds: number): Promise<boolean> {
		if (await this.isRevoked(jti)) {
			return false;
		}
		const expiresAt = Date.now() + ttlSeconds * 1000;
		this.store.set(jti, { expiresAt });
		return true;
	}

	async revokeFamily(familyId: string, ttlSeconds: number): Promise<void> {
		const expiresAt = Date.now() + ttlSeconds * 1000;
		this.familyRevocations.set(familyId, { expiresAt });

		const member = this.familyMembers.get(familyId);
		if (member) {
			const now = Date.now();
			for (const jti of member.jtis) {
				this.store.set(jti, { expiresAt: now + ttlSeconds * 1000 });
			}
		}
	}

	async isFamilyRevoked(familyId: string): Promise<boolean> {
		const entry = this.familyRevocations.get(familyId);
		if (!entry) return false;
		if (Date.now() > entry.expiresAt) {
			this.familyRevocations.delete(familyId);
			return false;
		}
		return true;
	}

	async registerFamilyMember(
		familyId: string,
		jti: string,
		userId: string,
		ttlSeconds: number,
	): Promise<void> {
		const expiresAt = Date.now() + ttlSeconds * 1000;

		const existing = this.familyMembers.get(familyId);
		if (existing) {
			existing.jtis.add(jti);
			existing.expiresAt = Math.max(existing.expiresAt, expiresAt);
		} else {
			this.familyMembers.set(familyId, {
				userId,
				jtis: new Set([jti]),
				expiresAt,
			});
		}

		const userMap = this.userFamilies.get(userId) ?? new Map<string, number>();
		userMap.set(familyId, expiresAt);
		this.userFamilies.set(userId, userMap);
	}

	async revokeAllForUser(userId: string, ttlSeconds: number): Promise<void> {
		const userMap = this.userFamilies.get(userId);
		if (!userMap) return;

		for (const familyId of userMap.keys()) {
			await this.revokeFamily(familyId, ttlSeconds);
		}

		for (const [familyId, member] of this.familyMembers.entries()) {
			if (member.userId === userId) {
				this.familyMembers.delete(familyId);
			}
		}
		this.userFamilies.delete(userId);
	}

	dispose(): void {
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval);
			this.cleanupInterval = null;
		}
	}
}
