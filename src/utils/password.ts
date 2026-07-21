import { pbkdf2, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const pbkdf2Async = promisify(pbkdf2);

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

const DEFAULT_BCRYPT_ROUNDS = 10;
const DEFAULT_PBKDF2_ITERATIONS = 100000;
const DEFAULT_PBKDF2_KEY_LENGTH = 32;
const DEFAULT_PBKDF2_DIGEST = "sha256";
const DEFAULT_PBKDF2_SALT_LENGTH = 16;

export class BcryptHasher implements PasswordHasher {
	private saltRounds: number;

	constructor(options?: BcryptOptions) {
		this.saltRounds = options?.saltRounds ?? DEFAULT_BCRYPT_ROUNDS;
	}

	async hash(password: string): Promise<string> {
		const salt = await this.generateSalt();
		const hash = await this.pbkdf2(password, salt, {
			iterations: this.saltRounds * 10000,
			keyLength: 32,
			digest: "sha256",
		});
		return `$bcrypt$${this.saltRounds}$${this.bufferToHex(salt)}$${this.bufferToHex(hash)}`;
	}

	async verify(password: string, hash: string): Promise<boolean> {
		if (!hash.startsWith("$bcrypt$")) {
			return false;
		}

		const parts = hash.split("$");
		if (parts.length !== 5) {
			return false;
		}

		const saltRounds = Number.parseInt(parts[2]!, 10);
		const salt = this.hexToBuffer(parts[3]!);
		const expectedHash = this.hexToBuffer(parts[4]!);

		const actualHash = await this.pbkdf2(password, salt, {
			iterations: saltRounds * 10000,
			keyLength: 32,
			digest: "sha256",
		});

		return this.constantTimeCompare(actualHash, expectedHash);
	}

	private async generateSalt(): Promise<Uint8Array> {
		return randomBytes(16);
	}

	private async pbkdf2(
		password: string,
		salt: Uint8Array,
		options: Pbkdf2Options,
	): Promise<Uint8Array> {
		const keyLength = options.keyLength ?? DEFAULT_PBKDF2_KEY_LENGTH;
		const iterations = options.iterations ?? DEFAULT_PBKDF2_ITERATIONS;
		const digest = options.digest ?? DEFAULT_PBKDF2_DIGEST;

		const derivedKey = await pbkdf2Async(
			password,
			salt,
			iterations,
			keyLength,
			digest,
		);

		return new Uint8Array(derivedKey);
	}

	private bufferToHex(buffer: Uint8Array): string {
		return Array.from(buffer)
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("");
	}

	private hexToBuffer(hex: string): Uint8Array {
		const bytes = new Uint8Array(hex.length / 2);
		for (let i = 0; i < hex.length; i += 2) {
			bytes[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16);
		}
		return bytes;
	}

	private constantTimeCompare(a: Uint8Array, b: Uint8Array): boolean {
		if (a.length !== b.length) {
			return false;
		}
		return timingSafeEqual(a, b);
	}
}

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
		return `$pbkdf2$${this.options.iterations}$${this.options.digest}$${this.bufferToHex(salt)}$${this.bufferToHex(hash)}`;
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
		const salt = this.hexToBuffer(parts[4]!);
		const expectedHash = this.hexToBuffer(parts[5]!);

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

		const derivedKey = await pbkdf2Async(
			password,
			salt,
			iterations,
			keyLength,
			digest,
		);

		return new Uint8Array(derivedKey);
	}

	private bufferToHex(buffer: Uint8Array): string {
		return Array.from(buffer)
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("");
	}

	private hexToBuffer(hex: string): Uint8Array {
		const bytes = new Uint8Array(hex.length / 2);
		for (let i = 0; i < hex.length; i += 2) {
			bytes[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16);
		}
		return bytes;
	}

	private constantTimeCompare(a: Uint8Array, b: Uint8Array): boolean {
		if (a.length !== b.length) {
			return false;
		}
		return timingSafeEqual(a, b);
	}
}

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

export function createPasswordHasher(
	type: "bcrypt" | "pbkdf2" = "pbkdf2",
	options?: BcryptOptions | Pbkdf2Options,
): PasswordHasher {
	if (type === "bcrypt") {
		return new BcryptHasher(options as BcryptOptions);
	}
	return new Pbkdf2Hasher(options as Pbkdf2Options);
}
