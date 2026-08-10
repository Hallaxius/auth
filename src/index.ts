export { compliance } from "./compliance-wrapper";
export {
	type CaptchaContextValue,
	CaptchaProvider,
	type CaptchaProviderProps,
	type CaptchaProviderType,
	Hcaptcha,
	type HcaptchaProps,
	type HcaptchaRef,
	Recaptcha,
	type RecaptchaProps,
	type RecaptchaRef,
	Turnstile,
	type TurnstileProps,
	type TurnstileRef,
	useCaptcha,
} from "./components";
export { credentials } from "./credentials";
export { discord } from "./discord";
export { type MfaHandlers, mfa } from "./mfa";
export { type PasswordResetHandlers, passwordReset } from "./password-reset";
export { rateLimit } from "./rate-limit";

import {
	auth,
	combine,
	deny,
	publicPath,
	redirect,
	required,
	role,
	session,
} from "./middleware";

export const middleware = {
	auth,
	role,
	combine,
	session,
	publicPath,
	required,
	redirect,
	deny,
} as const;

export const proxy = middleware;

import { processConfig as _processConfig } from "./config";

export const config = {
	processConfig: _processConfig,
} as const;

import {
	hasAnyRole,
	hasMember,
	hasRole,
	join,
	revoke,
	secret,
	sync,
	validate,
} from "./utils";
import { GuildRoleSync } from "./utils/guild";

export const utils = {
	secret,
	validate,
	guild: {
		join,
		hasRole,
		hasAnyRole,
		hasMember,
		sync,
		GuildRoleSync,
	},
	revoke,
} as const;

export type { CacheAdapter, CacheEntry } from "./adapters/cache/memory";
export { MemoryCacheAdapter } from "./adapters/cache/memory";
export type { CaptchaConfig as CaptchaConfigType } from "./captcha";
export {
	type CaptchaConfig,
	type CaptchaProviderName,
	type ResolvedCaptchaConfig,
	resolveCaptchaConfig,
	type VerificationResult,
	verifyCaptcha,
} from "./captcha";
export {
	challenge,
	create,
	deriveStateSecret,
	pkce,
	processConfig,
	validateVerifier,
	verifier,
} from "./config";
export {
	BruteForceConfigSchema,
	CaptchaConfigSchema,
	CredentialsClientConfigSchema,
	DiscordAuthConfigSchema,
	DiscordScopeSchema,
	RateLimitConfigSchema,
	SessionConfigSchema,
	validateCredentialsConfig,
	validateDiscordAuthConfig,
	validateRateLimitConfig,
} from "./config/schema";
export {
	BruteForceProtection,
	CredentialsClient,
} from "./credentials";
export type { ErrorCode } from "./errors";
export {
	AuthError,
	BruteForceBlockedError,
	ConfigurationError,
	CredentialsValidationError,
	EmailTakenError,
	ErrorCodes,
	ExpiredStateError,
	GuildJoinError,
	GuildSyncError,
	getCode,
	InteractionRequiredError,
	InvalidCodeError,
	InvalidCredentialsError,
	InvalidGrantError,
	InvalidStateError,
	InvalidTokenError,
	isAuthError,
	MfaRequiredError,
	NetworkError,
	PasswordInvalidFormatError,
	PasswordTooLongError,
	PasswordTooShortError,
	PKCEValidationError,
	RateLimitError,
	StateBindingError,
	StateReusedError,
	StorageReadError,
	StorageUnavailableError,
	StorageWriteError,
	TokenExchangeError,
	TokenExpiredError,
	TokenRefreshError,
	TokenRevokedError,
	UpstreamError,
	UserNotFoundError,
	UsernameTakenError,
} from "./errors";
export { DiscordClient } from "./internal/client";
export {
	clearSessionCookie,
	createSessionCookie,
	defaultSameSite,
	defaultSecureCookie,
	parseCookies,
} from "./internal/cookies";
export { decrypt, encrypt } from "./internal/crypto-aes";
export {
	expiresInToSeconds,
	parseExpiresIn,
	revokeToken,
	secretToKey,
	signRefreshToken,
	signToken,
	verifyToken,
} from "./internal/jwt";
export { MemoryTokenRevocationStorage } from "./internal/jwt-revocation";
export {
	base64URLDecode,
	consumeState,
	generateState,
	type StateStore,
	validateState,
} from "./internal/state";
export {
	auth,
	combine,
	deny,
	publicPath,
	redirect,
	required,
	role,
	session,
} from "./middleware";
export {
	extractIpFromRequest,
	normalizeIpForRateLimit,
} from "./rate-limit";
export {
	BurstRateLimiter,
	createBurstLimiter,
	createSlidingWindowCounterLimiter,
	createSlidingWindowLimiter,
	createTokenBucketLimiter,
	SlidingWindowCounter,
	SlidingWindowLog,
	TokenBucket,
} from "./rate-limit/algorithms";
export {
	createEndpointSpecificLimiter,
	createPerUserLimiter,
	EndpointSpecificLimiter,
	PerUserRateLimiter,
} from "./rate-limit/per-user";
export {
	createStorageAdapters,
	isMemoryBacked,
} from "./storage/factory";
export type {
	AuthUserIdentifier,
	AuthUserStorage,
	ConsumeResetTokenResult,
	CreateCredentialsUserData as CreateCredentialsInput,
	CredentialsConfig,
	DiscordAuthConfig,
	DiscordAuthConfig as DiscordConfig,
	DiscordGuildMember,
	DiscordScope as Scope,
	DiscordTokenResponse as TokenResponse,
	DiscordUser,
	EdgeAuthConfig,
	EdgeRoleConfig,
	GuildMember,
	MfaChallengeResult,
	MfaFactoryConfig as MfaConfig,
	MfaMethod,
	MfaStorage,
	MfaVerifyResult,
	PasswordResetConfig,
	RateLimitConfig,
	RateLimitResult,
	RateLimitStorage,
	RequestResetResult,
	ResetNotifier,
	ResetPasswordResult,
	ResetTokenStorage,
	RoutesConfig as RouteOptions,
	SafeStoredUser,
	SessionConfig as SessionOptions,
	SessionData as SessionUser,
	StoredUser,
	TokenRevocationStorage,
	TotpSetupResult,
	UserStorage,
} from "./types";
export {
	hasAnyRole,
	hasMember,
	hasRole,
	join,
	revoke,
	secret,
	sync,
	validate,
} from "./utils";
export {
	type AuditEvent,
	type AuditEventType,
	type AuditLogFilter,
	type AuditLogger,
	type AuditLogQueryResult,
	type AuditLogStorage,
	auditLogger,
	createAuditLogger,
} from "./utils/audit-logger";
export {
	type ComplianceConfig,
	ComplianceManager,
	type ConsentRecord,
	createComplianceManager,
	type DataDeletionRequest,
	type DataExportRequest,
	type PrivacySettings,
	type RetentionPolicy,
	type UserDataExport,
} from "./utils/compliance";
export {
	constantTimeCompare,
	constantTimeCompareHex,
	constantTimeCompareStrings,
} from "./utils/constant-time";
export {
	fromBase64URL,
	sha256,
	toBase64URL,
} from "./utils/crypto-helpers";
export {
	formatBytes,
	formatDuration,
	formatNumber,
	parseDuration,
	truncate,
} from "./utils/formatting";
export {
	bufferToHex,
	hexDecode,
	hexEncode,
	hexToBuffer,
} from "./utils/hex";
export {
	getRequestIP,
	isCloudflareIP,
	isIPv6,
	isPrivateIP,
	isTrustedSource,
	maskIPv4To24,
	maskIPv6To64,
	sanitizeIP,
	sha256Hex,
} from "./utils/ip";
export { createMemoryComplianceStorage } from "./utils/memory-compliance";
export {
	type PasswordValidationOptions,
	type PasswordValidationResult,
	validatePassword,
	validatePasswordOrThrow,
} from "./utils/password-validation";
export {
	errorResponse,
	htmlResponse,
	jsonResponse,
	redirectResponse,
} from "./utils/response";
export {
	applySecurityHeaders,
	type CspConfig,
	defaultSecurityHeaders,
	type HstsConfig,
	type PermissionsPolicyConfig,
	type SecurityHeadersConfig,
	securityHeaders,
} from "./utils/security-headers";
export {
	isProduction,
	validateConfig,
	validateCookieValue,
	validateJwtSecret,
	validateSecretEntropy,
} from "./utils/validation";
