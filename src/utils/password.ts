import { pbkdf2, randomBytes, timingSafeEqual } from "./pbkdf2";
import { hexEncode, hexDecode } from "./hex";

export interface PasswordHasher {
	hash(password: string): Promise<string>;
	verify(password: string, hash: string): Promise<boolean>;
}

export interface BcryptOptions {
	saltRounds?: number;
}

export interface Pbkdf2Options {
	iterations?: number;
	keyLength?: number;
	digest?: "sha1" | "sha256" | "sha512";
	saltLength?: number;
}

const _DEFAULT_BCRYPT_ROUNDS = 10;
const DEFAULT_PBKDF2_ITERATIONS = 100000;
const DEFAULT_PBKDF2_KEY_LENGTH = 32;
const DEFAULT_PBKDF2_DIGEST = "sha256";
const DEFAULT_PBKDF2_SALT_LENGTH = 32;

/**
 * Password hashing utility using PBKDF2
 *
 * Implements secure password hashing with configurable parameters:
 * - iterations: Number of PBKDF2 iterations (default: 100,000)
 * - keyLength: Derived key length in bytes (default: 32)
 * - digest: Hash digest algorithm (default: "sha256")
 * - saltLength: Random salt length in bytes (default: 32)
 *
 * Hash format: $pbkdf2$<iterations>$<digest>$<salt>$<hash>
 *
 * @example
 * ```typescript
 * const hasher = new Pbkdf2Hasher({ iterations: 100000 });
 * const hash = await hasher.hash("mySecurePassword");
 * const isValid = await hasher.verify("mySecurePassword", hash);
 * ```
 *
 * @security
 * - Uses constant-time comparison to prevent timing attacks
 * - Salt generated with cryptographically secure random bytes
 * - PBKDF2 iterations should be >= 100,000 for production use
 */
export class Pbkdf2Hasher implements PasswordHasher {
	private options: Required<Pbkdf2Options>;

	constructor(options?: Pbkdf2Options) {
		this.options = {
			iterations: options?.iterations ?? DEFAULT_PBKDF2_ITERATIONS,
			keyLength: options?.keyLength ?? DEFAULT_PBKDF2_KEY_LENGTH,
			digest: options?.digest ?? DEFAULT_PBKDF2_DIGEST,
			saltLength: options?.saltLength ?? DEFAULT_PBKDF2_SALT_LENGTH,
		};
	}

	async hash(password: string): Promise<string> {
		const salt = await this.generateSalt();
		const hash = await this.deriveKey(password, salt);
		return `$pbkdf2$${this.options.iterations}$${this.options.digest}$${hexEncode(salt)}$${hexEncode(hash)}`;
	}

	async verify(password: string, hash: string): Promise<boolean> {
		if (!hash.startsWith("$pbkdf2$")) {
			return false;
		}

		const parts = hash.split("$");
		if (parts.length !== 6) {
			return false;
		}

		const iterations = Number.parseInt(parts[2]!, 10);
		const digest = parts[3] as "sha1" | "sha256" | "sha512";
		const salt = hexDecode(parts[4]!);
		const expectedHash = hexDecode(parts[5]!);

		if (!salt || !expectedHash) {
			return false;
		}

		const actualHash = await this.deriveKey(password, salt, {
			iterations,
			digest,
		});

		return this.constantTimeCompare(actualHash, expectedHash);
	}

	private async generateSalt(): Promise<Uint8Array> {
		return randomBytes(this.options.saltLength);
	}

	private async deriveKey(
		password: string,
		salt: Uint8Array,
		overrideOptions?: Partial<Pbkdf2Options>,
	): Promise<Uint8Array> {
		const iterations = overrideOptions?.iterations ?? this.options.iterations;
		const digest = overrideOptions?.digest ?? this.options.digest;
		const keyLength = this.options.keyLength;

		const derivedKey = await pbkdf2(
			password,
			salt,
			iterations,
			keyLength,
			digest,
		);

		return new Uint8Array(derivedKey);
	}

	private constantTimeCompare(a: Uint8Array, b: Uint8Array): boolean {
		if (a.length !== b.length) {
			return false;
		}
		return timingSafeEqual(a, b);
	}
}

/**
 * Benchmarks a password hasher by measuring hash operation times
 *
 * Runs multiple hash operations and returns timing statistics.
 * Useful for tuning PBKDF2 parameters to achieve desired performance.
 *
 * @param hasher - Password hasher instance to benchmark
 * @param password - Test password to hash
 * @param iterations - Number of iterations to run (default: 3)
 * @returns Object with average, min, max times and individual results
 *
 * @example
 * ```typescript
 * const hasher = new Pbkdf2Hasher({ iterations: 100000 });
 * const stats = await benchmarkPasswordHasher(hasher, "testPassword");
 * console.log(`Average: ${stats.averageMs.toFixed(2)}ms`);
 * ```
 */
export async function benchmarkPasswordHasher(
	hasher: PasswordHasher,
	password: string,
	iterations = 3,
): Promise<{
	averageMs: number;
	minMs: number;
	maxMs: number;
	results: number[];
}> {
	const results: number[] = [];

	for (let i = 0; i < iterations; i++) {
		const start = performance.now();
		await hasher.hash(password);
		const end = performance.now();
		results.push(end - start);
	}

	const minMs = Math.min(...results);
	const maxMs = Math.max(...results);
	const averageMs = results.reduce((a, b) => a + b, 0) / results.length;

	return { averageMs, minMs, maxMs, results };
}

/**
 * Creates a password hasher instance with the specified algorithm
 *
 * Currently only supports PBKDF2. Additional algorithms may be added in the future.
 *
 * @param type - Hash algorithm (default: "pbkdf2")
 * @param options - Algorithm-specific options
 * @returns Password hasher instance
 *
 * @example
 * ```typescript
 * const hasher = createPasswordHasher("pbkdf2", { iterations: 150000 });
 * const hash = await hasher.hash("password");
 * ```
 */
export function createPasswordHasher(
	_type: "pbkdf2" = "pbkdf2",
	options?: Pbkdf2Options,
): PasswordHasher {
	return new Pbkdf2Hasher(options as Pbkdf2Options);
}

export { timingSafeEqual } from "./pbkdf2";
