import type { AuthUser } from "./types";

/**
 * Storage interface for credentials authentication.
 * Users implement this to persist auth users in their database.
 */
export interface AuthUserStorage {
	/** Find a user by username */
	findByUsername(username: string): Promise<AuthUser | null>;
	/** Find a user by email */
	findByEmail(email: string): Promise<AuthUser | null>;
	/** Find a user by ID */
	findById(id: string): Promise<AuthUser | null>;
	/** Create a new user */
	create(data: Omit<AuthUser, "id" | "createdAt" | "updatedAt">): Promise<AuthUser>;
	/** Update user data */
	update(userId: string, data: Partial<AuthUser>): Promise<AuthUser>;
	/** Delete a user */
	delete(userId: string): Promise<void>;
}
