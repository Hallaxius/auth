export interface SessionStore {
	get(sessionId: string): Promise<Record<string, unknown> | null>;
	set(
		sessionId: string,
		data: Record<string, unknown>,
		ttlMs?: number,
	): Promise<void>;
	delete(sessionId: string): Promise<void>;
	dispose?(): void;
	ping?(): Promise<boolean>;
}

export interface IBruteForceStore {
	increment(key: string, windowMs: number): Promise<number>;
	isBlocked(key: string): Promise<boolean>;
	reset(key: string): Promise<void>;
	block(key: string, durationMs: number): Promise<void>;
	getCount(key: string): Promise<number>;
	getRemainingBlockTime?(key: string): Promise<number | undefined>;
	dispose?(): void;
	ping?(): Promise<boolean>;
}

export interface IRateLimitStore {
	increment(
		key: string,
		windowMs: number,
	): Promise<{ count: number; resetAt: number }>;
	reset(key: string): Promise<void>;
	dispose?(): void;
	ping?(): Promise<boolean>;
}

export interface IStateStore {
	has(state: string): Promise<boolean>;
	set(
		state: string,
		data?: Record<string, unknown>,
		ttlMs?: number,
	): Promise<void>;
	setIfAbsent(
		state: string,
		data?: Record<string, unknown>,
		ttlMs?: number,
	): Promise<boolean>;
	delete(state: string): Promise<void>;
	consume?(state: string): Promise<Record<string, unknown> | null>;
	dispose?(): void;
	ping?(): Promise<boolean>;
}

export interface ITokenRevocationStore {
	isRevoked(jti: string): Promise<boolean>;
	revoke(jti: string, ttlSeconds: number): Promise<void>;
	revokeIfPresent?(jti: string, ttlSeconds: number): Promise<boolean>;
	getTTL?(jti: string): Promise<number | null>;
	dispose?(): void;
	ping?(): Promise<boolean>;
}

export interface IMfaStore {
	getSecret(userId: string): Promise<string | null>;
	setSecret(userId: string, encryptedSecret: string): Promise<void>;
	deleteSecret(userId: string): Promise<void>;
	getBackupCodes(userId: string): Promise<string[] | null>;
	setBackupCodes(userId: string, hashedCodes: string[]): Promise<void>;
	consumeBackupCode(userId: string, codeIndex: number): Promise<void>;
	getLastUsedCounter(userId: string): Promise<number | null>;
	setLastUsedCounter(userId: string, counter: number): Promise<void>;
	getPendingToken(
		userId: string,
	): Promise<{ token: string; createdAt: number; expiresAt: number } | null>;
	setPendingToken(
		userId: string,
		entry: { token: string; createdAt: number; expiresAt: number },
	): Promise<void>;
	deletePendingToken(userId: string): Promise<void>;
	setSecretIfAbsent?(userId: string, encryptedSecret: string): Promise<boolean>;
	dispose?(): void;
	ping?(): Promise<boolean>;
}

export interface IUserStore {
	findByDiscordId(discordId: string): Promise<{
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
	} | null>;
	create(data: {
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
	}>;
	update(
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
	}>;
	delete(discordId: string): Promise<void>;
	dispose?(): void;
	ping?(): Promise<boolean>;
}

export interface IAuthUserStore {
	findByUsername(username: string): Promise<{
		id: string;
		username: string | null;
		email: string | null;
		password: string;
		roles: string[];
		createdAt: Date;
		updatedAt: Date;
	} | null>;
	findByEmail(email: string): Promise<{
		id: string;
		username: string | null;
		email: string | null;
		password: string;
		roles: string[];
		createdAt: Date;
		updatedAt: Date;
	} | null>;
	findById(id: string): Promise<{
		id: string;
		username: string | null;
		email: string | null;
		password: string;
		roles: string[];
		createdAt: Date;
		updatedAt: Date;
	} | null>;
	create(data: {
		username?: string;
		email?: string;
		password: string;
		roles?: string[];
	}): Promise<{
		id: string;
		username: string | null;
		email: string | null;
		password: string;
		roles: string[];
		createdAt: Date;
		updatedAt: Date;
	}>;
	update(
		userId: string,
		data: Record<string, unknown>,
	): Promise<{
		id: string;
		username: string | null;
		email: string | null;
		password: string;
		roles: string[];
		createdAt: Date;
		updatedAt: Date;
	}>;
	delete(userId: string): Promise<void>;
	dispose?(): void;
	ping?(): Promise<boolean>;
}

export interface IResetTokenStore {
	create(data: {
		selector: string;
		validatorHash: string;
		expiry: number;
		userId: string;
		email: string;
		username: string;
	}): Promise<void>;
	findBySelector(selector: string): Promise<{
		validatorHash: string;
		expiry: number;
		userId: string;
		email: string;
		username: string;
		usedAt?: number;
	} | null>;
	consume(selector: string): Promise<{
		userId: string;
		email: string;
		username: string;
	} | null>;
	delete(selector: string): Promise<void>;
	deleteAllUserTokens?(userId: string): Promise<void>;
	dispose?(): void;
	ping?(): Promise<boolean>;
}

export interface IComplianceStore {
	getDataExportRequest(userId: string): Promise<{
		id: string;
		userId: string;
		status: "pending" | "processing" | "completed" | "failed";
		createdAt: number;
		completedAt?: number;
		exportData?: string;
	} | null>;
	createDataExportRequest(userId: string): Promise<{
		id: string;
		userId: string;
		status: "pending" | "processing" | "completed" | "failed";
		createdAt: number;
	}>;
	updateDataExportRequest(
		id: string,
		data: Record<string, unknown>,
	): Promise<void>;
	getDataDeletionRequest(userId: string): Promise<{
		id: string;
		userId: string;
		status: "pending" | "processing" | "completed" | "failed";
		createdAt: number;
		completedAt?: number;
	} | null>;
	createDataDeletionRequest(userId: string): Promise<{
		id: string;
		userId: string;
		status: "pending" | "processing" | "completed" | "failed";
		createdAt: number;
	}>;
	updateDataDeletionRequest(
		id: string,
		data: Record<string, unknown>,
	): Promise<void>;
	getConsentRecord(
		userId: string,
		consentType: string,
	): Promise<{
		id: string;
		userId: string;
		consentType: string;
		granted: boolean;
		grantedAt: number;
		withdrawnAt?: number;
	} | null>;
	setConsent(
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
	}>;
	getRetentionPolicies(): Promise<
		Array<{
			id: string;
			dataType: string;
			retentionDays: number;
			action: "delete" | "anonymize";
		}>
	>;
	setRetentionPolicy(
		dataType: string,
		retentionDays: number,
		action: "delete" | "anonymize",
	): Promise<void>;
	dispose?(): void;
	ping?(): Promise<boolean>;
}

export interface StorageAdapters {
	session: SessionStore;
	bruteForce: IBruteForceStore;
	rateLimit: IRateLimitStore;
	state: IStateStore;
	tokenRevocation: ITokenRevocationStore;
	mfa: IMfaStore;
	user: IUserStore;
	authUser: IAuthUserStore;
	resetToken: IResetTokenStore;
	compliance: IComplianceStore;
}

export type StorageType = "memory";

export interface StorageFactoryOptions {
	type: StorageType;
	keyPrefix?: string;
}
