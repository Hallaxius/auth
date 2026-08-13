import { BruteForceProtection } from "./credentials";
import { AuthError, ConfigurationError, ErrorCodes } from "./errors";
import { base64URLEncode } from "./internal/state";
import type {
	MagicLinkConfig,
	MagicLinkTokenStorage,
	MagicLinkVerifyResult,
	PendingMagicLink,
} from "./types";
import { constantTimeCompareStrings } from "./utils/constant-time";
import { getRequestIP, sha256Hex } from "./utils/ip";

const DEFAULT_TTL_MINUTES = 10;
const MIN_TTL_MINUTES = 5;
const MAX_TTL_MINUTES = 15;
const GLOBAL_TENANT = "global";

export type MagicLinkHandlers = {
	handleRequest: (request: Request) => Promise<Response>;
	handleVerify: (request: Request) => Promise<Response>;
};

export type MagicLinkResult = {
	/** Identical response for known and unknown recipients (anti-enumeration). */
	processed: true;
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
	return json({ error: "Internal server error" }, 500);
}

async function hashValidator(validator: string): Promise<string> {
	return sha256Hex(validator);
}

function generateLinkToken(): {
	selector: string;
	validator: string;
	token: string;
} {
	const selectorBytes = new Uint8Array(16);
	crypto.getRandomValues(selectorBytes);
	const selector = base64URLEncode(selectorBytes.buffer);

	const validatorBytes = new Uint8Array(32);
	crypto.getRandomValues(validatorBytes);
	const validator = base64URLEncode(validatorBytes.buffer);

	return { selector, validator, token: `${selector}.${validator}` };
}

function generateCode(length: number): string {
	const digits = new Uint8Array(length);
	crypto.getRandomValues(digits);
	let code = "";
	for (const d of digits) code += String(d % 10);
	return code;
}

export function magicLink(config: MagicLinkConfig) {
	if (!config.storage) {
		throw new ConfigurationError(
			"magicLink() requires a `storage` implementing MagicLinkTokenStorage.",
		);
	}
	if (!config.notifier || typeof config.notifier.sendEmail !== "function") {
		throw new ConfigurationError(
			"magicLink() requires a `notifier` with sendEmail() (D6 — consumer brings the provider).",
		);
	}
	const mode = config.mode ?? "link";
	const ttlMinutes = Math.min(
		MAX_TTL_MINUTES,
		Math.max(MIN_TTL_MINUTES, config.ttlMinutes ?? DEFAULT_TTL_MINUTES),
	);
	const codeLength = Math.min(8, Math.max(6, config.codeLength ?? 6));
	const linkPath = config.linkPath ?? "/auth/magic-link";
	const trustProxy = config.trustProxy ?? false;
	const storage: MagicLinkTokenStorage = config.storage;

	const requestLimiter = new BruteForceProtection(
		{
			enabled: true,
			maxAttempts: config.requestLimit?.maxAttempts ?? 3,
			windowMs: config.requestLimit?.windowMs ?? 60 * 60 * 1000,
			blockDurationMs: config.requestLimit?.blockDurationMs ?? 60 * 60 * 1000,
			storage: config.requestLimit?.storage,
		},
		config.requestLimit?.storage,
	);
	const recipientLimiter = new BruteForceProtection(
		{
			enabled: true,
			maxAttempts: config.recipientLimit?.maxAttempts ?? 3,
			windowMs: config.recipientLimit?.windowMs ?? 10 * 60 * 1000,
			blockDurationMs: config.recipientLimit?.blockDurationMs ?? 10 * 60 * 1000,
			storage: config.recipientLimit?.storage,
		},
		config.recipientLimit?.storage,
	);
	const verifyLimiter = new BruteForceProtection(
		{
			enabled: true,
			maxAttempts: config.verifyLimit?.maxAttempts ?? 10,
			windowMs: config.verifyLimit?.windowMs ?? 15 * 60 * 1000,
			blockDurationMs: config.verifyLimit?.blockDurationMs ?? 15 * 60 * 1000,
			storage: config.verifyLimit?.storage,
		},
		config.verifyLimit?.storage,
	);

	async function getRequestIPSafe(request: Request): Promise<string> {
		const ip = await getRequestIP(request, { trustProxy });
		return ip || "unknown";
	}

	async function resolveTenant(request?: Request): Promise<string> {
		if (request && config.tenantIdFromRequest) {
			const tenantId = await config.tenantIdFromRequest(request);
			if (tenantId) return tenantId;
		}
		return GLOBAL_TENANT;
	}

	async function issueToken(input: {
		tenantId: string;
		recipient: string;
		userId: string | null;
		purpose: "login" | "verify-email";
	}): Promise<void> {
		const expiry = Date.now() + ttlMinutes * 60 * 1000;

		if (mode === "code") {
			const code = generateCode(codeLength);
			const tokenHash = await hashValidator(code);
			const selector = `code-${await sha256Hex(
				`${input.recipient}:${input.tenantId}`,
			).then((h) => h.slice(0, 24))}`;
			const record: PendingMagicLink = {
				tenantId: input.tenantId,
				selector,
				tokenHash,
				recipient: input.recipient,
				userId: input.userId,
				purpose: input.purpose,
				expiresAt: expiry,
				createdAt: Date.now(),
			};
			await storage.deleteByRecipient(input.tenantId, input.recipient);
			await storage.create(record);
			await config.notifier.sendEmail({
				tenantId: input.tenantId,
				to: input.recipient,
				code,
				ttlMinutes,
			});
			return;
		}

		const { selector, validator } = generateLinkToken();
		const tokenHash = await hashValidator(validator);
		const record: PendingMagicLink = {
			tenantId: input.tenantId,
			selector,
			tokenHash,
			recipient: input.recipient,
			userId: input.userId,
			purpose: input.purpose,
			expiresAt: expiry,
			createdAt: Date.now(),
		};
		await storage.deleteByRecipient(input.tenantId, input.recipient);
		await storage.create(record);
		await config.notifier.sendEmail({
			tenantId: input.tenantId,
			to: input.recipient,
			link: `${linkPath}?t=${selector}.${validator}`,
			ttlMinutes,
		});
	}

	async function sendTo(
		recipient: string,
		request?: Request,
	): Promise<MagicLinkResult> {
		const tenantId = await resolveTenant(request);
		const ip = request ? await getRequestIPSafe(request) : "unknown";

		const requestResult = await requestLimiter.recordAttempt(
			`magiclink:request:${tenantId}:${ip}`,
		);
		if (requestResult && !requestResult.allowed) {
			throw new AuthError(
				ErrorCodes.RATE_LIMITED,
				"Too many requests, please try again later",
				{ statusCode: 429, retryAfter: requestResult.retryAfter },
			);
		}

		// Anti-enumeration: both paths hit the per-recipient limiter (dummy
		// work for unknown recipients keeps cost and response identical).
		const recipientKey = `magiclink:recipient:${tenantId}:${await sha256Hex(recipient)}`;
		const recipientResult = await recipientLimiter.recordAttempt(recipientKey);
		if (recipientResult && !recipientResult.allowed) {
			throw new AuthError(
				ErrorCodes.RATE_LIMITED,
				"Too many requests, please try again later",
				{ statusCode: 429, retryAfter: recipientResult.retryAfter },
			);
		}

		const lookup = config.userLookup
			? await config.userLookup(recipient)
			: null;
		const userId = lookup?.userId ?? null;

		if (userId === null) {
			// Identical response; nothing stored, nothing sent.
			return { processed: true as const };
		}

		await issueToken({
			tenantId,
			recipient,
			userId,
			purpose: "login",
		});

		return { processed: true as const };
	}

	async function verify(input: {
		token?: string;
		code?: string;
		recipient?: string;
		request?: Request;
	}): Promise<MagicLinkVerifyResult> {
		const tenantId = await resolveTenant(input.request);
		const ip = input.request
			? await getRequestIPSafe(input.request)
			: "unknown";
		const secret = mode === "code" ? input.code : input.token;

		if (!secret || typeof secret !== "string") {
			throw new AuthError(ErrorCodes.MAGIC_LINK_INVALID, "Invalid link", {
				statusCode: 400,
			});
		}
		if (
			mode === "code" &&
			(!input.recipient || typeof input.recipient !== "string")
		) {
			throw new AuthError(
				ErrorCodes.MAGIC_LINK_INVALID,
				"recipient is required with code mode",
				{ statusCode: 400 },
			);
		}

		const attemptKey = `magiclink:verify:${tenantId}:${ip}`;
		const blocked = await verifyLimiter.isBlocked(attemptKey);
		if (blocked) {
			throw new AuthError(
				ErrorCodes.RATE_LIMITED,
				"Too many attempts, please try again later",
				{ statusCode: 429 },
			);
		}

		try {
			let selector: string;
			let validator: string;
			if (mode === "code") {
				selector = `code-${(await sha256Hex(`${input.recipient}:${tenantId}`)).slice(0, 24)}`;
				validator = secret;
			} else {
				const parts = secret.split(".");
				if (parts.length !== 2) {
					throw new AuthError(ErrorCodes.MAGIC_LINK_INVALID, "Invalid link", {
						statusCode: 400,
					});
				}
				selector = parts[0] as string;
				validator = parts[1] as string;
			}

			const stored = await storage.findBySelector(tenantId, selector);
			if (!stored) {
				throw new AuthError(
					ErrorCodes.MAGIC_LINK_INVALID,
					"Invalid or expired link",
					{ statusCode: 400 },
				);
			}

			if (Date.now() > stored.expiresAt) {
				await storage.consume(tenantId, selector);
				throw new AuthError(ErrorCodes.MAGIC_LINK_EXPIRED, "Link has expired", {
					statusCode: 400,
				});
			}

			const computedHash = await hashValidator(validator);
			if (!constantTimeCompareStrings(computedHash, stored.tokenHash)) {
				throw new AuthError(
					ErrorCodes.MAGIC_LINK_INVALID,
					"Invalid or expired link",
					{ statusCode: 400 },
				);
			}

			// Atomic single-use: the storage must guarantee the last consumer wins.
			const consumed = await storage.consume(tenantId, selector);
			if (!consumed) {
				throw new AuthError(
					ErrorCodes.MAGIC_LINK_USED,
					"This link has already been used",
					{ statusCode: 400 },
				);
			}

			return {
				userId: consumed.userId,
				recipient: consumed.recipient,
				tenantId: consumed.tenantId,
				purpose: consumed.purpose,
			};
		} catch (error) {
			if (
				error instanceof AuthError &&
				error.code === ErrorCodes.RATE_LIMITED
			) {
				throw error;
			}
			const result = await verifyLimiter.recordAttempt(attemptKey);
			if (result && !result.allowed) {
				throw new AuthError(
					ErrorCodes.RATE_LIMITED,
					"Too many attempts, please try again later",
					{ statusCode: 429, retryAfter: result.retryAfter },
				);
			}
			throw error;
		}
	}

	async function handleRequest(request: Request): Promise<Response> {
		if (request.method !== "POST") {
			return json({ error: "Method not allowed" }, 405);
		}
		try {
			const { recipient } = (await request.json()) as { recipient?: string };
			if (typeof recipient !== "string" || recipient.length === 0) {
				return json({ error: "recipient is required" }, 400);
			}
			await sendTo(recipient, request);
			return json({ success: true });
		} catch (error) {
			if (error instanceof AuthError) return errorResponse(error);
			if (error instanceof SyntaxError) {
				return json({ error: "Invalid JSON body" }, 400);
			}
			throw error;
		}
	}

	async function handleVerify(request: Request): Promise<Response> {
		if (request.method !== "POST") {
			return json({ error: "Method not allowed" }, 405);
		}
		try {
			const { token, code, recipient } = (await request.json()) as {
				token?: string;
				code?: string;
				recipient?: string;
			};
			const result = await verify({ token, code, recipient, request });
			if (config.onVerified) {
				return await config.onVerified(result);
			}
			return json({ success: true });
		} catch (error) {
			if (error instanceof AuthError) return errorResponse(error);
			if (error instanceof SyntaxError) {
				return json({ error: "Invalid JSON body" }, 400);
			}
			throw error;
		}
	}

	return {
		handleRequest,
		handleVerify,
		sendTo,
		verify,
		dispose: () => {
			storage.dispose?.();
			config.dispose?.();
		},
	};
}
