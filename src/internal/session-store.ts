export interface SessionStore {
	get(sessionId: string): Promise<Record<string, unknown> | null>;
	set(
		sessionId: string,
		data: Record<string, unknown>,
		ttlSeconds?: number,
	): Promise<void>;
	delete(sessionId: string): Promise<void>;
	extend(sessionId: string, ttlSeconds: number): Promise<void>;
}

export class MemorySessionStore implements SessionStore {
	private store = new Map<
		string,
		{ data: Record<string, unknown>; expiresAt: number }
	>();
	private sweepInterval: ReturnType<typeof setInterval> | null = null;

	constructor(sweepIntervalMs?: number) {
		if (sweepIntervalMs && typeof setInterval !== "undefined") {
			this.sweepInterval = setInterval(() => this.sweep(), sweepIntervalMs);
		}
	}

	private sweep(): void {
		const now = Date.now();
		for (const [key, value] of this.store.entries()) {
			if (value.expiresAt < now) {
				this.store.delete(key);
			}
		}
	}

	async get(sessionId: string): Promise<Record<string, unknown> | null> {
		const entry = this.store.get(sessionId);
		if (!entry) return null;
		if (entry.expiresAt < Date.now()) {
			this.store.delete(sessionId);
			return null;
		}
		return entry.data;
	}

	async set(
		sessionId: string,
		data: Record<string, unknown>,
		ttlSeconds?: number,
	): Promise<void> {
		const ttl = ttlSeconds ?? 1209600;
		this.store.set(sessionId, {
			data,
			expiresAt: Date.now() + ttl * 1000,
		});
	}

	async delete(sessionId: string): Promise<void> {
		this.store.delete(sessionId);
	}

	async extend(sessionId: string, ttlSeconds: number): Promise<void> {
		const entry = this.store.get(sessionId);
		if (entry) {
			entry.expiresAt = Date.now() + ttlSeconds * 1000;
		}
	}

	dispose(): void {
		if (this.sweepInterval) {
			clearInterval(this.sweepInterval);
			this.sweepInterval = null;
		}
		this.store.clear();
	}
}
