import type {
	RegistrationResponseJSON,
	WebAuthnCredential as ServerWebAuthnCredential,
	verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { AuthError, ConfigurationError, ErrorCodes } from "./errors";
import { parseCookies } from "./internal/cookies";
import { verifyToken } from "./internal/jwt";
import { base64URLEncode } from "./internal/state";
import type {
	WebAuthnChallengeStorage,
	WebAuthnConfig,
	WebAuthnCredentialStorage,
} from "./types";
import { fromBase64URL, toBase64URL } from "./utils/crypto-helpers";
import { getRequestIP } from "./utils/ip";

const GLOBAL_TENANT = "global";
const DEFAULT_TIMEOUT_MS = 60_000;
const CHALLENGE_TTL_BUFFER_MS = 60_000;

export type WebAuthnHandlers = {
	/** Post-auth: start a passkey registration (returns challengeId + options). */
	handleRegisterStart: (request: Request) => Promise<Response>;
	/** Post-auth: verify + persist the new credential. */
	handleRegisterVerify: (request: Request) => Promise<Response>;
	/** Ante-auth: start a passkey authentication (userId optional → discovery mode). */
	handleAuthenticateStart: (request: Request) => Promise<Response>;
	/** Ante-auth: verify the assertion — mints a session via `createSessionWithoutPassword` (ADR-002). */
	handleAuthenticateVerify: (request: Request) => Promise<Response>;
	/** Post-auth: remove a registered credential (owner-only). */
	handleRemoveCredential: (request: Request) => Promise<Response>;
};

function json(data: Record<string, unknown>, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "Content-Type": "application/json; charset=utf-8" },
	});
}

function errorResponse(error: unknown): Response {
	if (error instanceof AuthError) {
		return json(
			{ error: error.message, code: error.code },
			error.statusCode ?? 500,
		);
	}
	throw error;
}

function randomId(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return base64URLEncode(bytes.buffer as ArrayBuffer);
}

function u8ToBase64URL(bytes: Uint8Array): string {
	return toBase64URL(
		(bytes.buffer as ArrayBuffer).slice(
			bytes.byteOffset,
			bytes.byteOffset + bytes.byteLength,
		),
	);
}

export async function webauthn(
	config: WebAuthnConfig,
): Promise<WebAuthnHandlers> {
	if (!config.rp?.id || !config.rp?.name || !config.rp?.origins?.length) {
		throw new ConfigurationError(
			"webauthn() requires `rp` with id, name and at least one origin.",
		);
	}
	if (
		!config.storage?.credentials ||
		!config.storage?.challenges ||
		typeof config.storage.credentials.findById !== "function" ||
		typeof config.storage.challenges.set !== "function"
	) {
		throw new ConfigurationError(
			"webauthn() requires a `storage` with credentials + challenges stores (D6 — consumer brings the storage).",
		);
	}

	let webAuthnServer: typeof import("@simplewebauthn/server") | undefined;
	try {
		webAuthnServer = await import("@simplewebauthn/server");
	} catch {
		throw new ConfigurationError(
			"webauthn() requires the optional peer dependency `@simplewebauthn/server` to be installed. Run `npm install @simplewebauthn/server`.",
		);
	}
	const {
		generateAuthenticationOptions,
		generateRegistrationOptions,
		verifyAuthenticationResponse,
		verifyRegistrationResponse,
	} = webAuthnServer;

	const rpId = config.rp.id;
	const rpName = config.rp.name;
	const origins = config.rp.origins;
	const stores = config.storage as {
		credentials: WebAuthnCredentialStorage;
		challenges: WebAuthnChallengeStorage;
	};
	const requireUserVerification = config.requireUserVerification ?? true;
	const attestationType = config.attestationType ?? "none";
	const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const challengeTtlMs = timeoutMs + CHALLENGE_TTL_BUFFER_MS;
	const sessionCookieName = config.sessionCookieName ?? "session";
	const trustProxy = config.trustProxy ?? false;

	function challengeInvalid(message: string): AuthError {
		return new AuthError(ErrorCodes.CHALLENGE_INVALID, message, {
			statusCode: 400,
		});
	}

	async function extractUserId(request: Request): Promise<string | null> {
		if (!config.secret) {
			throw new ConfigurationError(
				"webauthn(): `secret` is required for authenticated operations (register / remove).",
			);
		}
		const cookies = parseCookies(request);
		const sessionCookie = cookies[sessionCookieName];
		if (!sessionCookie) return null;
		try {
			const payload = await verifyToken<{ userId: string }>(
				sessionCookie,
				config.secret,
			);
			return payload?.userId ?? null;
		} catch {
			return null;
		}
	}

	async function ensureAuthenticated(request: Request): Promise<string> {
		const userId = await extractUserId(request);
		if (!userId) {
			throw new AuthError(ErrorCodes.INVALID_TOKEN, "Unauthorized", {
				statusCode: 401,
			});
		}
		return userId;
	}

	async function tenantOf(
		request: Request,
	): Promise<{ tenantIdValue: string | null; tenantKey: string }> {
		const tenantIdValue = (await config.tenantIdFromRequest?.(request)) ?? null;
		return { tenantIdValue, tenantKey: tenantIdValue ?? GLOBAL_TENANT };
	}

	async function handleRegisterStart(request: Request): Promise<Response> {
		if (request.method !== "POST") {
			return json({ error: "Method not allowed" }, 405);
		}
		try {
			const userId = await ensureAuthenticated(request);
			const { tenantKey } = await tenantOf(request);

			const user = (await config.getUser?.(userId)) ?? null;
			const existing = await stores.credentials.listByUser(tenantKey, userId);

			const options = await generateRegistrationOptions({
				rpName,
				rpID: rpId,
				userID: new TextEncoder().encode(userId),
				userName: user?.username ?? userId,
				userDisplayName: user?.displayName ?? undefined,
				timeout: timeoutMs,
				attestationType,
				excludeCredentials: existing.map((c) => ({
					id: c.credentialId,
					transports: c.transports as ServerWebAuthnCredential["transports"],
				})),
			});

			const challengeId = randomId();
			await stores.challenges.set(tenantKey, challengeId, {
				userId,
				type: "registration",
				challenge: options.challenge,
				rpId,
				expiresAt: Date.now() + challengeTtlMs,
				createdAt: Date.now(),
			});
			return json({ challengeId, options });
		} catch (error) {
			return errorResponse(error);
		}
	}

	async function handleRegisterVerify(request: Request): Promise<Response> {
		if (request.method !== "POST") {
			return json({ error: "Method not allowed" }, 405);
		}
		try {
			const userId = await ensureAuthenticated(request);
			const { tenantKey } = await tenantOf(request);
			const { challengeId, response } = (await request.json()) as {
				challengeId?: string;
				response?: unknown;
			};
			if (typeof challengeId !== "string" || !response) {
				return json({ error: "challengeId and response are required" }, 400);
			}
			const challenge = await stores.challenges.getAndConsume(
				tenantKey,
				challengeId,
			);
			if (!challenge || challenge.expiresAt < Date.now()) {
				throw challengeInvalid("Invalid or expired challenge");
			}
			if (challenge.type !== "registration") {
				throw challengeInvalid("Challenge is not a registration challenge");
			}
			if (challenge.userId !== userId) {
				throw new AuthError(ErrorCodes.INVALID_TOKEN, "Unauthorized", {
					statusCode: 401,
				});
			}

			const verification = await verifyRegistrationResponse({
				response: response as RegistrationResponseJSON,
				expectedChallenge: challenge.challenge,
				expectedOrigin: origins,
				expectedRPID: rpId,
				requireUserVerification,
			});
			if (!verification.verified || !verification.registrationInfo) {
				throw new AuthError(
					ErrorCodes.VERIFICATION_FAILED,
					"Registration verification failed",
					{ statusCode: 400 },
				);
			}
			const info = verification.registrationInfo;
			const now = Date.now();
			await stores.credentials.create({
				tenantId: tenantKey,
				userId,
				credentialId: info.credential.id,
				publicKey: u8ToBase64URL(info.credential.publicKey),
				signCount: info.credential.counter,
				transports: info.credential.transports,
				aaguid: info.aaguid,
				createdAt: now,
				lastUsedAt: now,
			});
			return json({ credentialId: info.credential.id });
		} catch (error) {
			return errorResponse(error);
		}
	}

	async function handleAuthenticateStart(request: Request): Promise<Response> {
		if (request.method !== "POST") {
			return json({ error: "Method not allowed" }, 405);
		}
		try {
			const { userId } = (await request.json()) as { userId?: string };
			const { tenantKey } = await tenantOf(request);

			const allowCredentials = userId
				? (await stores.credentials.listByUser(tenantKey, userId)).map((c) => ({
						id: c.credentialId,
						transports: c.transports as ServerWebAuthnCredential["transports"],
					}))
				: undefined;

			const options = await generateAuthenticationOptions({
				rpID: rpId,
				allowCredentials,
				userVerification: requireUserVerification ? "required" : "preferred",
				timeout: timeoutMs,
			});

			const challengeId = randomId();
			await stores.challenges.set(tenantKey, challengeId, {
				userId: userId ?? null,
				type: "authentication",
				challenge: options.challenge,
				rpId,
				allowCredentials: allowCredentials?.map((c) => c.id),
				expiresAt: Date.now() + challengeTtlMs,
				createdAt: Date.now(),
			});
			return json({ challengeId, options });
		} catch (error) {
			return errorResponse(error);
		}
	}

	async function handleAuthenticateVerify(request: Request): Promise<Response> {
		if (request.method !== "POST") {
			return json({ error: "Method not allowed" }, 405);
		}
		try {
			const { challengeId, response } = (await request.json()) as {
				challengeId?: string;
				response?: unknown;
			};
			if (typeof challengeId !== "string" || !response) {
				return json({ error: "challengeId and response are required" }, 400);
			}
			const { tenantIdValue, tenantKey } = await tenantOf(request);
			const challenge = await stores.challenges.getAndConsume(
				tenantKey,
				challengeId,
			);
			if (!challenge || challenge.expiresAt < Date.now()) {
				throw challengeInvalid("Invalid or expired challenge");
			}
			if (challenge.type !== "authentication") {
				throw challengeInvalid("Challenge is not an authentication challenge");
			}
			const presentationId = (response as { id?: string }).id;
			if (typeof presentationId !== "string") {
				throw challengeInvalid("Invalid credential id");
			}
			const stored = await stores.credentials.findById(
				tenantKey,
				presentationId,
			);
			if (!stored) {
				throw challengeInvalid("Unknown credential");
			}
			if (challenge.userId && stored.userId !== challenge.userId) {
				throw new AuthError(ErrorCodes.INVALID_TOKEN, "Unauthorized", {
					statusCode: 401,
				});
			}
			if (
				challenge.allowCredentials &&
				!challenge.allowCredentials.includes(presentationId)
			) {
				throw challengeInvalid("Credential is not allowed for this challenge");
			}

			const verification = await verifyAuthenticationResponse({
				response: response as Parameters<
					typeof verifyAuthenticationResponse
				>[0]["response"],
				expectedChallenge: challenge.challenge,
				expectedOrigin: origins,
				expectedRPID: rpId,
				credential: {
					id: stored.credentialId,
					publicKey: fromBase64URL(
						stored.publicKey,
					) as unknown as ServerWebAuthnCredential["publicKey"],
					counter: stored.signCount,
					transports:
						stored.transports as ServerWebAuthnCredential["transports"],
				},
				requireUserVerification,
			});
			if (!verification.verified || !verification.authenticationInfo) {
				throw new AuthError(
					ErrorCodes.VERIFICATION_FAILED,
					"Authentication verification failed",
					{ statusCode: 400 },
				);
			}
			await stores.credentials.updateSignCount(
				tenantKey,
				stored.credentialId,
				verification.authenticationInfo.newCounter,
			);

			const ip = await getRequestIP(request, { trustProxy });
			if (config.createSessionWithoutPassword) {
				const session = await config.createSessionWithoutPassword({
					userId: stored.userId,
					tenantId: tenantIdValue ?? undefined,
					ip,
					userAgent: request.headers.get("user-agent") ?? undefined,
				});
				return json({
					sessionToken: session.sessionToken,
					idToken: session.idToken,
				});
			}
			return json({
				success: true,
				credentialId: stored.credentialId,
				userId: stored.userId,
			});
		} catch (error) {
			return errorResponse(error);
		}
	}

	async function handleRemoveCredential(request: Request): Promise<Response> {
		if (request.method !== "POST") {
			return json({ error: "Method not allowed" }, 405);
		}
		try {
			const userId = await ensureAuthenticated(request);
			const { tenantKey } = await tenantOf(request);
			const { credentialId } = (await request.json()) as {
				credentialId?: string;
			};
			if (typeof credentialId !== "string" || credentialId.length === 0) {
				return json({ error: "credentialId is required" }, 400);
			}
			const stored = await stores.credentials.findById(tenantKey, credentialId);
			if (!stored) {
				throw new AuthError(
					ErrorCodes.CREDENTIALS_VALIDATION_ERROR,
					"Credential not found",
					{ statusCode: 404 },
				);
			}
			if (stored.userId !== userId) {
				throw new AuthError(
					ErrorCodes.FORBIDDEN,
					"Credential belongs to another user",
					{ statusCode: 403 },
				);
			}
			await stores.credentials.delete(tenantKey, credentialId);
			return json({ success: true });
		} catch (error) {
			return errorResponse(error);
		}
	}

	return {
		handleRegisterStart,
		handleRegisterVerify,
		handleAuthenticateStart,
		handleAuthenticateVerify,
		handleRemoveCredential,
	};
}
