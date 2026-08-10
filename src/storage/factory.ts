import type {
	IAuthUserStore,
	IBruteForceStore,
	IComplianceStore,
	IMfaStore,
	IRateLimitStore,
	IResetTokenStore,
	IStateStore,
	ITokenRevocationStore,
	IUserStore,
	SessionStore,
	StorageAdapters,
	StorageFactoryOptions,
} from "./interfaces";

function isMemoryBacked<T extends { store: Map<unknown, unknown> }>(
	storage: unknown,
): storage is T {
	return (
		typeof storage === "object" &&
		storage !== null &&
		"store" in storage &&
		(storage as { store: unknown }).store instanceof Map
	);
}

export function createStorageAdapters(
	_options: StorageFactoryOptions,
): StorageAdapters {
	return {
		bruteForce: new MemoryBruteForceStore(),
		rateLimit: new MemoryRateLimitStore(),
		mfa: new MemoryMfaStore(),
		user: new MemoryUserStore(),
		authUser: new MemoryAuthUserStore(),
		state: new MemoryStateAdapter(),
		tokenRevocation: new MemoryTokenRevocationStore(),
		session: new MemorySessionStore(),
		resetToken: new MemoryResetTokenStore(),
		compliance: new MemoryComplianceStore(),
	};
}

export { isMemoryBacked };

class MemoryBruteForceStore implements IBruteForceStore {
	private store = new Map<string, { count: number; blockedUntil?: number }>();
	private cleanupInterval: ReturnType<typeof setInterval> | null = null;

	constructor() {
		this.startCleanup();
	}

	private startCleanup(): void {
		this.cleanupInterval = setInterval(() => {
			const now = Date.now();
			for (const [key, data] of this.store.entries()) {
				if (data.blockedUntil && data.blockedUntil < now) {
					this.store.delete(key);
				}
			}
		}, 60000);
		if (this.cleanupInterval && "unref" in this.cleanupInterval) {
			this.cleanupInterval.unref();
		}
	}

	dispose(): void {
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval);
			this.cleanupInterval = null;
		}
	}

	async increment(key: string, _windowMs: number): Promise<number> {
		const now = Date.now();
		const entry = this.store.get(key);
		if (!entry || now > entry.blockedUntil!) {
			this.store.set(key, { count: 1 });
			return 1;
		}
		entry.count++;
		return entry.count;
	}

	async isBlocked(key: string): Promise<boolean> {
		const entry = this.store.get(key);
		return !!entry?.blockedUntil && entry.blockedUntil > Date.now();
	}

	async reset(key: string): Promise<void> {
		this.store.delete(key);
	}

	async block(key: string, durationMs: number): Promise<void> {
		const entry = this.store.get(key) || { count: 0 };
		entry.blockedUntil = Date.now() + durationMs;
		this.store.set(key, entry);
	}

	async getCount(key: string): Promise<number> {
		return this.store.get(key)?.count ?? 0;
	}

	async getRemainingBlockTime(key: string): Promise<number | undefined> {
		const entry = this.store.get(key);
		if (!entry?.blockedUntil) return undefined;
		const remaining = entry.blockedUntil - Date.now();
		return remaining > 0 ? remaining : undefined;
	}

	async ping(): Promise<boolean> {
		return true;
	}
}

class MemoryRateLimitStore implements IRateLimitStore {
	private store = new Map<string, { count: number; resetAt: number }>();
	private cleanupInterval: ReturnType<typeof setInterval> | null = null;

	constructor() {
		this.startCleanup();
	}

	private startCleanup(): void {
		this.cleanupInterval = setInterval(() => {
			const now = Date.now();
			for (const [key, data] of this.store.entries()) {
				if (data.resetAt < now) {
					this.store.delete(key);
				}
			}
		}, 60000);
		if (this.cleanupInterval && "unref" in this.cleanupInterval) {
			this.cleanupInterval.unref();
		}
	}

	dispose(): void {
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval);
			this.cleanupInterval = null;
		}
	}

	async increment(
		key: string,
		windowMs: number,
	): Promise<{ count: number; resetAt: number }> {
		const now = Date.now();
		const entry = this.store.get(key);
		if (!entry || now > entry.resetAt) {
			this.store.set(key, { count: 1, resetAt: now + windowMs });
			return { count: 1, resetAt: now + windowMs };
		}
		entry.count++;
		return { count: entry.count, resetAt: entry.resetAt };
	}

	async reset(key: string): Promise<void> {
		this.store.delete(key);
	}

	async ping(): Promise<boolean> {
		return true;
	}
}

class MemoryMfaStore implements IMfaStore {
	private secrets = new Map<string, string>();
	private backupCodes = new Map<string, string[]>();
	private pendingTokens = new Map<
		string,
		{ token: string; createdAt: number; expiresAt: number }
	>();
	private counters = new Map<string, number>();

	async getSecret(userId: string): Promise<string | null> {
		return this.secrets.get(userId) ?? null;
	}

	async setSecret(userId: string, encryptedSecret: string): Promise<void> {
		this.secrets.set(userId, encryptedSecret);
	}

	async deleteSecret(userId: string): Promise<void> {
		this.secrets.delete(userId);
	}

	async getBackupCodes(userId: string): Promise<string[] | null> {
		const codes = this.backupCodes.get(userId);
		return codes ?? null;
	}

	async setBackupCodes(userId: string, hashedCodes: string[]): Promise<void> {
		this.backupCodes.set(userId, hashedCodes);
	}

	async consumeBackupCode(userId: string, codeIndex: number): Promise<void> {
		const codes = this.backupCodes.get(userId);
		if (!codes) return;
		codes.splice(codeIndex, 1);
	}

	async getLastUsedCounter(userId: string): Promise<number | null> {
		return this.counters.get(userId) ?? null;
	}

	async setLastUsedCounter(userId: string, counter: number): Promise<void> {
		this.counters.set(userId, counter);
	}

	async getPendingToken(
		userId: string,
	): Promise<{ token: string; createdAt: number; expiresAt: number } | null> {
		return this.pendingTokens.get(userId) ?? null;
	}

	async setPendingToken(
		userId: string,
		entry: { token: string; createdAt: number; expiresAt: number },
	): Promise<void> {
		this.pendingTokens.set(userId, entry);
	}

	async deletePendingToken(userId: string): Promise<void> {
		this.pendingTokens.delete(userId);
	}

	async setSecretIfAbsent(
		userId: string,
		encryptedSecret: string,
	): Promise<boolean> {
		if (this.secrets.has(userId)) return false;
		this.secrets.set(userId, encryptedSecret);
		return true;
	}

	async ping(): Promise<boolean> {
		return true;
	}
}

class MemoryUserStore implements IUserStore {
	private store = new Map<
		string,
		{
			id: string;
			discordId: string;
			username: string;
			globalName: string | null;
			avatar: string | null;
			email: string | null;
			locale: string;
			roles: string[];
			mfaEnabled: boolean;
			accessToken: string;
			refreshToken: string;
			tokenExpiresAt: number;
			createdAt: Date;
			updatedAt: Date;
		}
	>();

	async findByDiscordId(discordId: string): Promise<{
		id: string;
		discordId: string;
		username: string;
		globalName: string | null;
		avatar: string | null;
		email: string | null;
		locale: string;
		roles: string[];
		mfaEnabled: boolean;
		accessToken: string;
		refreshToken: string;
		tokenExpiresAt: number;
		createdAt: Date;
		updatedAt: Date;
	} | null> {
		return this.store.get(discordId) ?? null;
	}

	async create(data: {
		discordId: string;
		username: string;
		globalName: string | null;
		avatar: string | null;
		email: string | null;
		locale: string;
		mfaEnabled?: boolean;
		roles: string[];
		accessToken: string;
		refreshToken: string;
		tokenExpiresAt: number;
	}): Promise<{
		id: string;
		discordId: string;
		username: string;
		globalName: string | null;
		avatar: string | null;
		email: string | null;
		locale: string;
		roles: string[];
		mfaEnabled: boolean;
		accessToken: string;
		refreshToken: string;
		tokenExpiresAt: number;
		createdAt: Date;
		updatedAt: Date;
	}> {
		const id = crypto.randomUUID();
		const user = {
			id,
			...data,
			mfaEnabled: data.mfaEnabled ?? false,
			createdAt: new Date(),
			updatedAt: new Date(),
		};
		this.store.set(data.discordId, user);
		return user;
	}

	async update(
		discordId: string,
		data: Record<string, unknown>,
	): Promise<{
		id: string;
		discordId: string;
		username: string;
		globalName: string | null;
		avatar: string | null;
		email: string | null;
		locale: string;
		roles: string[];
		mfaEnabled: boolean;
		accessToken: string;
		refreshToken: string;
		tokenExpiresAt: number;
		createdAt: Date;
		updatedAt: Date;
	}> {
		const existing = await this.findByDiscordId(discordId);
		if (!existing) throw new Error(`User ${discordId} not found`);
		const updated = { ...existing, ...data, updatedAt: new Date() };
		this.store.set(discordId, updated);
		return updated;
	}

	async delete(discordId: string): Promise<void> {
		this.store.delete(discordId);
	}

	async ping(): Promise<boolean> {
		return true;
	}
}

class MemoryAuthUserStore implements IAuthUserStore {
	private store = new Map<
		string,
		{
			id: string;
			username: string | null;
			email: string | null;
			passwordHash: string;
			roles: string[];
			createdAt: Date;
			updatedAt: Date;
		}
	>();
	private usernameIndex = new Map<string, string>();
	private emailIndex = new Map<string, string>();

	async findById(id: string): Promise<{
		id: string;
		username: string | null;
		email: string | null;
		passwordHash: string;
		roles: string[];
		createdAt: Date;
		updatedAt: Date;
	} | null> {
		return this.store.get(id) ?? null;
	}

	async findByUsername(username: string): Promise<{
		id: string;
		username: string | null;
		email: string | null;
		passwordHash: string;
		roles: string[];
		createdAt: Date;
		updatedAt: Date;
	} | null> {
		const id = this.usernameIndex.get(username);
		if (!id) return null;
		return this.findById(id);
	}

	async findByEmail(email: string): Promise<{
		id: string;
		username: string | null;
		email: string | null;
		passwordHash: string;
		roles: string[];
		createdAt: Date;
		updatedAt: Date;
	} | null> {
		const id = this.emailIndex.get(email);
		if (!id) return null;
		return this.findById(id);
	}

	async create(data: {
		username?: string;
		email?: string;
		passwordHash: string;
		roles?: string[];
	}): Promise<{
		id: string;
		username: string | null;
		email: string | null;
		passwordHash: string;
		roles: string[];
		createdAt: Date;
		updatedAt: Date;
	}> {
		const id = crypto.randomUUID();
		const user = {
			id,
			username: data.username ?? null,
			email: data.email ?? null,
			passwordHash: data.passwordHash,
			roles: data.roles ?? [],
			createdAt: new Date(),
			updatedAt: new Date(),
		};
		this.store.set(id, user);
		if (data.username) this.usernameIndex.set(data.username, id);
		if (data.email) this.emailIndex.set(data.email, id);
		return user;
	}

	async update(
		userId: string,
		data: Record<string, unknown>,
	): Promise<{
		id: string;
		username: string | null;
		email: string | null;
		passwordHash: string;
		roles: string[];
		createdAt: Date;
		updatedAt: Date;
	}> {
		const existing = await this.findById(userId);
		if (!existing) throw new Error(`User ${userId} not found`);
		const updated = { ...existing, ...data, updatedAt: new Date() };
		this.store.set(userId, updated);
		return updated;
	}

	async delete(userId: string): Promise<void> {
		const user = await this.findById(userId);
		if (user) {
			if (user.username) this.usernameIndex.delete(user.username);
			if (user.email) this.emailIndex.delete(user.email);
		}
		this.store.delete(userId);
	}

	async ping(): Promise<boolean> {
		return true;
	}
}

class MemoryStateAdapter implements IStateStore {
	private store = new Map<
		string,
		{ data?: Record<string, unknown>; expiresAt?: number }
	>();

	async has(state: string): Promise<boolean> {
		const entry = this.store.get(state);
		return !!entry && (!entry.expiresAt || Date.now() <= entry.expiresAt);
	}

	async set(
		state: string,
		data?: Record<string, unknown>,
		ttlMs?: number,
	): Promise<void> {
		this.store.set(state, {
			data,
			expiresAt: ttlMs ? Date.now() + ttlMs : undefined,
		});
	}

	async setIfAbsent(
		state: string,
		data?: Record<string, unknown>,
		ttlMs?: number,
	): Promise<boolean> {
		const exists = await this.has(state);
		if (exists) return false;
		await this.set(state, data, ttlMs);
		return true;
	}

	async delete(state: string): Promise<void> {
		this.store.delete(state);
	}
	async ping(): Promise<boolean> {
		return true;
	}
}

class MemoryTokenRevocationStore implements ITokenRevocationStore {
	private store = new Map<string, { expiresAt: number }>();

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
		this.store.set(jti, { expiresAt: Date.now() + ttlSeconds * 1000 });
	}

	async ping(): Promise<boolean> {
		return true;
	}
}

class MemorySessionStore implements SessionStore {
	private store = new Map<
		string,
		{ data: Record<string, unknown>; expiresAt?: number }
	>();

	async get(sessionId: string): Promise<Record<string, unknown> | null> {
		const entry = this.store.get(sessionId);
		if (!entry || (entry.expiresAt && Date.now() > entry.expiresAt)) {
			this.store.delete(sessionId);
			return null;
		}
		return entry.data;
	}

	async set(
		sessionId: string,
		data: Record<string, unknown>,
		ttlMs?: number,
	): Promise<void> {
		this.store.set(sessionId, {
			data,
			expiresAt: ttlMs ? Date.now() + ttlMs : undefined,
		});
	}

	async delete(sessionId: string): Promise<void> {
		this.store.delete(sessionId);
	}
	async ping(): Promise<boolean> {
		return true;
	}
}

class MemoryResetTokenStore implements IResetTokenStore {
	private store = new Map<
		string,
		{
			selector: string;
			validatorHash: string;
			expiry: number;
			userId: string;
			email: string;
			username: string;
			usedAt?: number;
		}
	>();

	async create(data: {
		selector: string;
		validatorHash: string;
		expiry: number;
		userId: string;
		email: string;
		username: string;
	}): Promise<void> {
		this.store.set(data.selector, data);
	}

	async findBySelector(selector: string): Promise<{
		validatorHash: string;
		expiry: number;
		userId: string;
		email: string;
		username: string;
		usedAt?: number;
	} | null> {
		return this.store.get(selector) ?? null;
	}

	async consume(selector: string): Promise<{
		userId: string;
		email: string;
		username: string;
	} | null> {
		const token = this.store.get(selector);
		if (token) {
			this.store.delete(selector);
			return {
				userId: token.userId,
				email: token.email,
				username: token.username,
			};
		}
		return null;
	}

	async delete(selector: string): Promise<void> {
		this.store.delete(selector);
	}
	async ping(): Promise<boolean> {
		return true;
	}
}

class MemoryComplianceStore implements IComplianceStore {
	private exportRequests = new Map<
		string,
		{
			id: string;
			userId: string;
			status: "pending" | "processing" | "completed" | "failed";
			createdAt: number;
			completedAt?: number;
			exportData?: string;
		}
	>();
	private deletionRequests = new Map<
		string,
		{
			id: string;
			userId: string;
			status: "pending" | "processing" | "completed" | "failed";
			createdAt: number;
			completedAt?: number;
		}
	>();
	private consents = new Map<
		string,
		{
			id: string;
			userId: string;
			consentType: string;
			granted: boolean;
			grantedAt: number;
			withdrawnAt?: number;
		}
	>();

	async getDataExportRequest(userId: string): Promise<{
		id: string;
		userId: string;
		status: "pending" | "processing" | "completed" | "failed";
		createdAt: number;
		completedAt?: number;
		exportData?: string;
	} | null> {
		for (const req of this.exportRequests.values()) {
			if (req.userId === userId) return req;
		}
		return null;
	}

	async createDataExportRequest(userId: string): Promise<{
		id: string;
		userId: string;
		status: "pending" | "processing" | "completed" | "failed";
		createdAt: number;
	}> {
		const req = {
			id: crypto.randomUUID(),
			userId,
			status: "pending" as const,
			createdAt: Date.now(),
		};
		this.exportRequests.set(req.id, req);
		return req;
	}

	async updateDataExportRequest(
		id: string,
		data: Record<string, unknown>,
	): Promise<void> {
		const req = this.exportRequests.get(id);
		if (req) this.exportRequests.set(id, { ...req, ...data });
	}

	async getDataDeletionRequest(userId: string): Promise<{
		id: string;
		userId: string;
		status: "pending" | "processing" | "completed" | "failed";
		createdAt: number;
		completedAt?: number;
	} | null> {
		for (const req of this.deletionRequests.values()) {
			if (req.userId === userId) return req;
		}
		return null;
	}

	async createDataDeletionRequest(userId: string): Promise<{
		id: string;
		userId: string;
		status: "pending" | "processing" | "completed" | "failed";
		createdAt: number;
	}> {
		const req = {
			id: crypto.randomUUID(),
			userId,
			status: "pending" as const,
			createdAt: Date.now(),
		};
		this.deletionRequests.set(req.id, req);
		return req;
	}

	async updateDataDeletionRequest(
		id: string,
		data: Record<string, unknown>,
	): Promise<void> {
		const req = this.deletionRequests.get(id);
		if (req) this.deletionRequests.set(id, { ...req, ...data });
	}

	async getConsentRecord(
		userId: string,
		consentType: string,
	): Promise<{
		id: string;
		userId: string;
		consentType: string;
		granted: boolean;
		grantedAt: number;
		withdrawnAt?: number;
	} | null> {
		return this.consents.get(`${userId}:${consentType}`) ?? null;
	}

	async setConsent(
		userId: string,
		consentType: string,
		granted: boolean,
	): Promise<{
		id: string;
		userId: string;
		consentType: string;
		granted: boolean;
		grantedAt: number;
		withdrawnAt?: number;
	}> {
		const record = {
			id: crypto.randomUUID(),
			userId,
			consentType,
			granted,
			grantedAt: Date.now(),
		};
		this.consents.set(`${userId}:${consentType}`, record);
		return record;
	}

	async getRetentionPolicies(): Promise<
		Array<{
			id: string;
			dataType: string;
			retentionDays: number;
			action: "delete" | "anonymize";
		}>
	> {
		return [];
	}

	async setRetentionPolicy(
		_dataType: string,
		_retentionDays: number,
		_action: "delete" | "anonymize",
	): Promise<void> {}

	async ping(): Promise<boolean> {
		return true;
	}
}
