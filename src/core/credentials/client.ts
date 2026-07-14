import { BruteForceProtection } from "../brute-force";
import type { BruteForceConfig } from "../types";
import { signToken, verifyToken } from "../../standalone/jwt";
import {
	InvalidCredentialsError,
	CredentialsValidationError,
	UsernameTakenError,
	EmailTakenError,
	UserNotFoundError,
} from "./errors";
import type { PasswordHasher } from "./hasher";
import type { AuthUserStorage } from "./storage";
import { AuthStrategy } from "./strategy";
import type {
	CreateCredentialsUserData,
	InternalCredentialsConfig,
	CredentialsAuthResult,
	CredentialsClientConfig,
	AuthUser,
	AuthUserIdentifier,
} from "./types";

/**
 * Core credentials authentication client.
 * Handles registration and login logic for username/password auth.
 */
export class CredentialsClient {
	private config: InternalCredentialsConfig;
	private storage: AuthUserStorage;
	private hasher: PasswordHasher;
	private bruteForce: BruteForceProtection;

	constructor(
		config: CredentialsClientConfig,
		storage: AuthUserStorage,
		hasher: PasswordHasher,
		bruteForceConfig?: Partial<BruteForceConfig>,
	) {
		this.config = {
			strategy: config.strategy,
			secret: config.secret,
			expiresIn: config.expiresIn ?? "7d",
			cookieName: config.cookieName ?? "credentials-session",
			cookiePath: config.cookiePath ?? "/",
			httpOnly: config.httpOnly ?? true,
			secure: config.secure ?? false,
			sameSite: config.sameSite ?? "lax",
			defaultRoles: config.defaultRoles ?? ["user"],
		};
		this.storage = storage;
		this.hasher = hasher;
		this.bruteForce = new BruteForceProtection({
			enabled: true,
			maxAttempts: 5,
			windowMs: 15 * 60 * 1000,
			blockDurationMs: 30 * 60 * 1000,
			...bruteForceConfig,
		});
	}

	/**
	 * Register a new user.
	 * Validates fields based on strategy, checks uniqueness, hashes password, creates user.
	 */
	async register(
		data: CreateCredentialsUserData & { password: string },
		request?: Request,
	): Promise<CredentialsAuthResult> {
		// Validate required fields based on strategy
		this.validateRegistrationFields(data);

		// Check uniqueness
		await this.checkUniqueness(data.username, data.email);

		// Hash password
		const passwordHash = await this.hasher.hash(data.password);

		// Create user
		const user = await this.storage.create({
			username: data.username ?? null,
			email: data.email ?? null,
			passwordHash,
			roles: data.roles ?? this.config.defaultRoles,
		});

		// Generate session token
		const token = await this.createSessionToken(user);

		return { user, token };
	}

	/**
	 * Authenticate a user with credentials.
	 * Returns user and session token on success.
	 */
	async login(
		identifier: AuthUserIdentifier,
		password: string,
		request?: Request,
	): Promise<CredentialsAuthResult> {
		// Check brute force
		const bruteForceKey = this.getBruteForceKey(identifier, request);
		if (bruteForceKey) {
			const blocked = await this.bruteForce.isBlocked(bruteForceKey);
			if (blocked) {
				const remaining = await this.bruteForce.getRemainingAttempts(bruteForceKey);
				throw new InvalidCredentialsError(
					`Account temporarily locked. Try again later.`,
				);
			}
		}

		// Find user by identifier
		const user = await this.findUserByIdentifier(identifier);

		// Always verify password even if user not found (timing-safe)
		const dummyHash = user?.passwordHash ?? "$2b$10$dummy";
		const valid = user
			? await this.hasher.verify(password, user.passwordHash)
			: await this.hasher.verify(password, dummyHash);

		if (!user || !valid) {
			// Record failed attempt
			if (bruteForceKey) {
				await this.bruteForce.recordAttempt(bruteForceKey, false);
			}
			throw new InvalidCredentialsError();
		}

		// Record success (resets counter)
		if (bruteForceKey) {
			await this.bruteForce.recordAttempt(bruteForceKey, true);
		}

		// Generate session token
		const token = await this.createSessionToken(user);

		return { user, token };
	}

	/**
	 * Verify a session token and return the user.
	 */
	async verifySession(token: string): Promise<AuthUser | null> {
		const payload = await verifyToken<Record<string, unknown>>(
			token,
			this.config.secret,
		);
		if (!payload) return null;

		const userId = payload.userId as string;
		if (!userId) return null;

		return this.storage.findById(userId);
	}

	/**
	 * Validate registration fields based on strategy.
	 */
	private validateRegistrationFields(
		data: CreateCredentialsUserData & { password: string },
	): void {
		const errors: string[] = [];

		switch (this.config.strategy) {
			case AuthStrategy.UsernameOnly:
				if (!data.username) errors.push("Username is required");
				break;
			case AuthStrategy.EmailOnly:
				if (!data.email) errors.push("Email is required");
				break;
			case AuthStrategy.UsernameEmail:
				if (!data.username) errors.push("Username is required");
				if (!data.email) errors.push("Email is required");
				break;
		}

		if (!data.password || data.password.length < 1) {
			errors.push("Password is required");
		}

		if (errors.length > 0) {
			throw new CredentialsValidationError(errors.join("; "));
		}
	}

	/**
	 * Check uniqueness of username and email.
	 */
	private async checkUniqueness(
		username?: string,
		email?: string,
	): Promise<void> {
		if (username) {
			const existing = await this.storage.findByUsername(username);
			if (existing) throw new UsernameTakenError();
		}

		if (email) {
			const existing = await this.storage.findByEmail(email);
			if (existing) throw new EmailTakenError();
		}
	}

	/**
	 * Find user by identifier based on strategy.
	 */
	private async findUserByIdentifier(
		identifier: AuthUserIdentifier,
	): Promise<AuthUser | null> {
		switch (this.config.strategy) {
			case AuthStrategy.UsernameOnly:
				if (!identifier.username) return null;
				return this.storage.findByUsername(identifier.username);

			case AuthStrategy.EmailOnly:
				if (!identifier.email) return null;
				return this.storage.findByEmail(identifier.email);

			case AuthStrategy.UsernameEmail:
				// Try username first, then email
				if (identifier.username) {
					const user = await this.storage.findByUsername(identifier.username);
					if (user) return user;
				}
				if (identifier.email) {
					return this.storage.findByEmail(identifier.email);
				}
				return null;

			default:
				return null;
		}
	}

	/**
	 * Generate a JWT session token for a user.
	 */
	private async createSessionToken(user: AuthUser): Promise<string> {
		const payload: Record<string, unknown> = {
			userId: user.id,
			roles: user.roles,
		};
		if (user.username) payload.username = user.username;
		if (user.email) payload.email = user.email;

		return signToken(payload, this.config.secret, this.config.expiresIn);
	}

	/**
	 * Build brute force key from identifier and request.
	 */
	private getBruteForceKey(
		identifier: AuthUserIdentifier,
		request?: Request,
	): string | null {
		// Use a fixed key for now since we want per-identifier limiting
		const id = identifier.username ?? identifier.email ?? "unknown";
		return `credentials-login:${id}`;
	}
}
