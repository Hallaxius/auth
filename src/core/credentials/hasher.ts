/**
 * Password hashing interface for credentials authentication.
 * Users implement this to use their preferred hashing algorithm.
 */
export interface PasswordHasher {
	/** Hash a plain-text password */
	hash(password: string): Promise<string>;
	/** Verify a password against a hash */
	verify(password: string, hash: string): Promise<boolean>;
}