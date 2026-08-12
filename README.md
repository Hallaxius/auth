# @hallaxius/auth

**Secure authentication toolkit for Bun and Next.js 16+ — GDPR-compliant by default. Discord OAuth2, Credentials, MFA/TOTP, password reset flows — backed by CSRF protection, rate limiting, and brute-force protection, captcha support (hCaptcha, reCAPTCHA v3, Turnstile), audit logging, and security headers.**

<p align="center">
  <a href="https://bun.sh"><img src="https://img.shields.io/badge/Bun-%E2%89%A51.0-000?logo=bun" alt="Bun"></a>
  <a href="https://www.npmjs.com/package/@hallaxius/auth"><img src="https://img.shields.io/npm/v/@hallaxius/auth" alt="npm"></a>
  <a href="https://www.npmjs.com/package/@hallaxius/auth"><img src="https://img.shields.io/npm/dm/@hallaxius/auth" alt="npm downloads"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT"></a>
</p>

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Compliance & Utilities](#compliance--utilities)
- [Why not Better Auth / Lucia?](#why-not-better-auth--lucia)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [API Reference](#api-reference)
- [Configuration](#configuration)
- [Storage Implementation](#storage-implementation)
- [Captcha](#captcha-react-components)
- [Security](#security)
- [Performance](#performance)
- [Testing](#testing)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)
- [Architecture Decision Records](#architecture-decision-records)

---

## Overview

Secure authentication toolkit for **Bun** and **Next.js 16+** with Discord OAuth2, Credentials, MFA/TOTP, password reset flows — backed by built-in CSRF protection, rate limiting, and brute-force defense.

**Key Philosophy:**
- ✅ Lightweight - No ORM dependencies
- ✅ Flexible - Bring your own storage (Redis, Database, KV)
- ✅ Secure - Built-in CSRF, rate limiting, brute force protection, security headers
- ✅ Compliant - GDPR utilities, audit logging, consent management
- ✅ Fast - Sub-100µs operations (see [BENCHMARK.md](https://github.com/hallaxius/auth/blob/main/BENCHMARK.md))
- ✅ Serverless-ready - External storage required for all stateful operations

---

## Features

### Authentication Methods

- **Discord OAuth2** - 30-second setup with Discord login
- **Credentials Auth** - Username/email + password with configurable requirements
- **MFA/TOTP** - Time-based one-time passwords (RFC 6238)
- **Password Reset** - Secure password reset flow
- **Captcha** - React components for hCaptcha, reCAPTCHA v2/v3, and Cloudflare Turnstile

### Security Features

- ✅ **JWT Sessions** - HS256 signed tokens
- ✅ **CSRF Protection** - HMAC-SHA256 state parameter
- ✅ **Rate Limiting** - Fixed-window algorithm by default (sliding window, token bucket, and burst limiters also available); `/me` endpoints rate limited when `meRateLimitStorage` is configured
- ✅ **Brute Force Protection** - Account lockout after 5 attempts
- ✅ **Secure Cookies** - HttpOnly, Secure, SameSite (default: lax in development, strict in production; configurable)
- ✅ **Input Validation** - Zod schemas, email format, password strength
- ✅ **Timing Attack Prevention** - Constant-time comparison
- ✅ **Captcha Verification** - Bot protection via hCaptcha, reCAPTCHA, and Cloudflare Turnstile
- ✅ **Security Headers** - CSP, HSTS, X-Frame-Options, Permissions-Policy
- ✅ **Secret Validation** - Min 32 chars, high entropy enforcement

---

## Compliance & Utilities

- ✅ **Compliance Manager** - GDPR utilities (consent management, data export, data deletion, retention policies)
- ✅ **Audit Logging** - Security event logging with pluggable storage adapter
- ✅ **IP Utilities** - Trusted proxy support, IP masking, Cloudflare detection, private IP detection
- ✅ **Password Validation** - Configurable password strength rules (length, character variety)
- ✅ **Hex & Crypto Helpers** - Buffer/hex conversion, base64URL, SHA-256

---

## Why not Better Auth / Lucia?

| | **@hallaxius/auth** | Better Auth | Lucia |
|---|---|---|---|
| Runtime dependencies | 3 (`jose`, `zod`, `cookie`) | ~17 | ~5 (archived) |
| ORM required | No — bring your own storage | Yes — Drizzle adapter bundled | No (standalone, archived) |
| GDPR tooling | Built-in (consent, export, deletion, retention) | Community plugins | None |
| Session revocation | First-class (`sessionRevocationStorage`) | Plugin | Manual |
| Password hashing | Consumer-owned via `verifyPassword` (never stored/compared in plaintext) | Library-managed | Library-managed |
| MFA/TOTP + backup codes | Built-in | Plugin | None |
| Maintenance status | Active | Active | **Archived** (maintenance mode) |

**Better Auth** bundles an ORM (Drizzle) and ships with a large dependency tree — everything it does, this package does with 3 dependencies and your own storage layer. **Lucia** was archived in 2024; the official recommendation is to use a library like this one or `lucia-auth` alternatives. If you need a batteries-included framework, this package is designed to be the middle ground: opinionated security defaults, zero storage lock-in.

---

## Installation

```bash
bun add @hallaxius/auth
```

**Requirements:**
- Bun >= 1.0.0 OR Node.js >= 18.0.0
- Next.js >= 16.0.0 (optional, for Next.js integration)

**Dependencies:**
- `jose` - JWT signing/verification
- `zod` - Schema validation
	- `cookie` - Cookie parsing/serialization

**Zero additional runtime dependencies** — all security primitives (AES-256-GCM, HMAC-SHA256, TOTP/HOTP, PKCE) are built-in using the Web Crypto API.

---

## Quick Start

### Option A: Discord OAuth2 (30 seconds)

**1. Configure Discord**

Visit [Discord Developer Portal](https://discord.com/developers/applications):
1. New Application → OAuth2
2. Add redirect: `http://localhost:3000/auth/discord/callback`
3. Copy Client ID and Client Secret

**2. Environment Variables**

```bash
# .env
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret
DISCORD_REDIRECT_URI=http://localhost:3000/auth/discord/callback
JWT_SECRET=$(openssl rand -base64 32)
AUTH_SALT=$(openssl rand -base64 32)
```

**3. Create Auth Instance**

```typescript
// lib/auth.ts
import { discord } from '@hallaxius/auth'

export const { handleLogin, handleCallback, handleLogout, handleMe } = await discord({
  clientId: process.env.DISCORD_CLIENT_ID!,
  clientSecret: process.env.DISCORD_CLIENT_SECRET!,
  secret: process.env.JWT_SECRET!,
  callbackUrl: process.env.DISCORD_REDIRECT_URI!,
  storage: {
    async findByDiscordId(discordId: string) { /* return StoredUser | null */ },
    async create(data) { /* return StoredUser */ },
    async update(discordId: string, data) { /* return StoredUser */ },
    async delete(discordId: string) { /* required by UserStorage */ },
  },
})
```

**4. Create API Routes**

```typescript
// app/auth/discord/route.ts
import { handleLogin } from '@/lib/auth'
export const GET = handleLogin

// app/auth/discord/callback/route.ts
import { handleCallback } from '@/lib/auth'
export const GET = handleCallback

// app/auth/logout/route.ts
import { handleLogout } from '@/lib/auth'
export const POST = handleLogout
```

**Done!** Users can now log in with Discord.

---

### Option B: Credentials Auth (30 seconds)

**1. Environment Variables**

```bash
JWT_SECRET=$(openssl rand -base64 32)
```

**2. Create Auth Instance**

```typescript
// lib/auth.ts
import { credentials } from '@hallaxius/auth'

const storage = {
  async findById(id: string) { /* return AuthUser | null */ },
  async findByUsername(username: string) { /* return AuthUser | null */ },
  async findByEmail(email: string) { /* return AuthUser | null */ },
  async create(data) { /* return AuthUser */ },
  async update(userId: string, data) { /* return AuthUser — required by AuthUserStorage */ },
  async delete(userId: string) { /* required by AuthUserStorage */ },
  async verifyPassword(userId: string, password: string) {
    /* required by AuthUserStorage — compare against your stored hash (see "Your responsibility: password hashing" below) */
  },
}

export const { handleRegister, handleLogin, handleLogout, handleMe } = credentials({
  emailRequired: true,
  usernameRequired: true,
  storage,
  session: { secret: process.env.JWT_SECRET! },
  validatePassword: true, // Optional password validation
  bruteForce: {
    enabled: true,
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000,
    blockDurationMs: 30 * 60 * 1000,
    storage: myBruteForceStorage,   // Required: your BruteForceStorage implementation
  },
})
```

**Note:** if `bruteForce.storage` is omitted, `BruteForceProtection` falls back to an in-memory store (a warning is logged) — fine for development, but provide a shared `BruteForceStorage` (Redis/KV/database) in production so lockouts work across instances.

**3. Create API Routes**

```typescript
// app/auth/register/route.ts
import { handleRegister } from '@/lib/auth'
export const POST = handleRegister

// app/auth/login/route.ts
import { handleLogin } from '@/lib/auth'
export const POST = handleLogin

// app/auth/logout/route.ts
import { handleLogout } from '@/lib/auth'
export const POST = handleLogout
```

**Done!** Users can now register and login.

---

## API Reference

### Discord OAuth2

#### Endpoints

| Method | Endpoint | Handler | Description |
|--------|----------|---------|-------------|
| GET | `/auth/discord` | `handleLogin` | Redirect to Discord |
| GET | `/auth/discord/callback` | `handleCallback` | Handle callback |
| POST | `/auth/logout` | `handleLogout` | Clear session |
| GET | `/auth/me` | `handleMe` | Get current user |

#### Configuration

```typescript
await discord({
  clientId: string,              // Required
  clientSecret: string,          // Required
  secret: string,                // Required (JWT secret)
  callbackUrl: string,           // Required
  storage: UserStorage,   // Required
  scopes?: DiscordScope[],       // Default: ['identify']
  session?: SessionConfig,       // Cookie configuration
  bruteForce?: BruteForceConfig, // Brute force protection (in-memory fallback if no storage)
  mfa?: MFAConfig,               // MFA settings
})
```

---

### Credentials Auth

#### Endpoints

| Method | Endpoint | Handler | Description |
|--------|----------|---------|-------------|
| POST | `/auth/register` | `handleRegister` | Create account |
| POST | `/auth/login` | `handleLogin` | Authenticate |
| POST | `/auth/logout` | `handleLogout` | Clear session |
| GET | `/auth/me` | `handleMe` | Get current user |

#### Configuration

```typescript
credentials({
  emailRequired?: boolean,     // Require email field
  usernameRequired?: boolean,  // Require username field
  storage: AuthUserStorage,    // Required
  session: { secret: string }, // Required
  validatePassword?: boolean | PasswordValidationConfig, // Optional
  bruteForce?: BruteForceConfig, // Default: enabled (in-memory fallback if no storage)
})
```

**Strategy Combinations:**

| emailRequired | usernameRequired | Auth Method |
|--------------|------------------|-------------|
| `true` | `true` | Email + Username + Password |
| `true` | `false` | Email + Password |
| `false` | `true` | Username + Password (default) |

#### Your responsibility: password hashing

The library treats `password` as an **opaque value**. It never hashes, salts,
or transforms it — `register` stores exactly the string you pass, and `login`
never compares it. Hashing and verification are entirely **your
responsibility**.

`AuthUserStorage.verifyPassword(userId, password)` is **required**.
`credentials()` (and `new CredentialsClient(...)`) throws a `ConfigurationError`
at construction time when the method is missing. There is **no fallback path** —
the package never compares plaintext passwords and never reads the stored
`password` field for verification.

**Recommended — `verifyPassword` hook.** Hash with a memory-hard function
(**Argon2id** preferred) and implement the hook on your `AuthUserStorage`:

```typescript
import { compare, hash, argon2id } from 'argon2'

const storage: AuthUserStorage = {
  // ...
  async create(data) {
    return db.createUser({
      ...data,
      password: await hash(data.password, { type: argon2id }),
    })
  },
  async verifyPassword(userId, password) {
    const user = await db.findUserById(userId)
    if (!user?.password) return false
    return compare(password, user.password) // argon2id compare
  },
}

const auth = new CredentialsClient({ secret: '...' }, storage)

// register with the RAW password — your storage hashes it:
await auth.register({ username: 'alice', password: rawPassword })
// login with the RAW password — your storage compares against the hash:
await auth.login({ username: 'alice' }, rawPassword)
```

`login` always calls `verifyPassword` — you never send pre-hashed values back
and forth.

Guidelines:

- Hash with Argon2id (preferred), or bcrypt/scrypt, with per-user salt. Both
  hashing and comparison live in your storage layer via `verifyPassword`.
- If you pass **raw** passwords (dev / non-sensitive setups), disable
  `validatePassword` (password rules would apply to the opaque value instead of
  the raw secret) and rely on your own transport/confidentiality controls.
- Never keep the plaintext around: only touch the raw password in your
  application code and let the storage hook hash it.

---

### Password Validation

Password validation is **disabled by default**. Enable it:

```typescript
// Enable with defaults (8+ chars, lowercase, uppercase, number, special)
credentials({
  validatePassword: true,
})

// Or customize rules
credentials({
  validatePassword: {
    minLength: 8,
    maxLength: 64,
    requireLowercase: true,
    requireUppercase: true,
    requireNumber: true,
    requireSpecial: true,
  },
})
```

**Validation Rules:**
- `minLength` - Minimum characters (default: 8)
- `maxLength` - Maximum characters (optional)
- `requireLowercase` - At least one lowercase letter
- `requireUppercase` - At least one uppercase letter
- `requireNumber` - At least one number
- `requireSpecial` - At least one special character

---

### Rate Limiting

```typescript
import { rateLimit } from '@hallaxius/auth'

const limiter = rateLimit({
  maxRequests: 100,
  windowMs: 60 * 1000, // 1 minute
  keyBy: (request) => getRequestIP(request),
  storage: myRateLimitStorage,   // Required: your RateLimitStorage implementation
})

// Use as middleware
export async function handler(request: Request) {
  const response = await limiter.middleware(request)
  if (response) return response // 429 Too Many Requests
  return new Response('OK')
}
```

**Note:** `storage` is **required** — `rateLimit()` throws a `ConfigurationError` when no storage is provided. Use the [storage adapters](#storage-adapters) (`createStorageAdapters({ type: 'memory' }).rateLimit`) for development/tests, or implement `RateLimitStorage` backed by Redis/KV/database in production.

**Headers (RFC 6585 / 8683):**
- `RateLimit-Limit` - Maximum requests per window
- `RateLimit-Remaining` - Remaining requests
- `RateLimit-Reset` - Unix timestamp when window resets
- `Retry-After` - Seconds until retry (on 429)

---

### MFA (TOTP)

```typescript
import { mfa } from '@hallaxius/auth'

const mfaHandlers = mfa({
  secret: '...',              // Required: encryption key for TOTP secrets
  storage: MfaStorage,        // Required: TOTP secrets + backup codes
  issuer?: string,            // Default: 'AuthApp'
})

// Wire up the handlers to your routes
mfaHandlers.handleMfaSetup(request)      // Generate TOTP secret + backup codes
mfaHandlers.handleMfaVerify(request)     // Verify TOTP/backup code
mfaHandlers.handleMfaChallenge(request)  // Challenge step during login
mfaHandlers.handleMfaDisable(request)    // Disable MFA for a user
```

**TOTP defaults:** 30-second step, 6 digits, SHA-256 HMAC (configurable via `totpHash`; SHA-1 supported), 10 backup codes (12 chars). Verification is rate limited (5 TOTP / 10 backup code attempts per user per hour, 20 backup code attempts per IP per hour — the per-IP cap is enforced when a `Request` is passed to `verifyBackupCode`). Uses a dedicated `mfa-session` cookie for the challenge flow.

---

### Password Reset

```typescript
import { passwordReset } from '@hallaxius/auth'

const handlers = passwordReset({
  storage: ResetTokenStorage,           // Required
  userLookup: ...,                      // Required: resolve user by email
  notifier: ResetNotifier,              // Required: your email service
  minPasswordLength?: number,           // Default: 8
  tokenExpirationSeconds?: number,      // Default: 3600 (1 hour)
})

handlers.handleForgotPassword(request)   // POST: send reset token
handlers.handleResetPassword(request)    // POST: set new password
```

Reset tokens use a `selector.validator` format; only a SHA-256 hash of the validator is stored. Rate limits: 3 forgot-password attempts / hour per IP, 10 reset attempts / 15 minutes per IP.

---

### Compliance (GDPR / CCPA)

```typescript
import { compliance, createMemoryComplianceStorage } from '@hallaxius/auth'

const manager = compliance({
  exportStorage: DataExportStorage,
  deletionStorage: DeletionStorage,
  consentStorage: ConsentStorage,
  retentionStorage: RetentionStorage,
  retentionPolicies?: RetentionPolicy[],
})
```

**Key methods:**

| Method | Description |
|--------|-------------|
| `requestDataExport(userId, email)` | Create export request (30-day expiry) |
| `processExport(requestId, dataCollector)` | Collect and store user data |
| `getExportData(requestId)` | Fetch completed export |
| `requestDeletion(userId, email, reason?)` | Create deletion request + confirmation code |
| `confirmDeletion(requestId, confirmationCode)` | Confirm and schedule deletion |
| `cancelDeletion(requestId)` | Cancel pending deletion |
| `processDeletion(requestId, deleter)` | Execute the deletion |
| `grantConsent(userId, consentType, version, metadata?)` | Record consent |
| `withdrawConsent(userId, consentType)` | Withdraw consent |
| `getConsents(userId)` | List consents |
| `checkAgeConsent(userId, age, parentalEmail?)` | Age gate (min age: 16) |
| `enforceRetentionPolicy()` | Apply retention policies (delete/anonymize/archive) |

`createMemoryComplianceStorage()` provides an in-memory implementation of all four storage interfaces for development.

---

### Middleware

`middleware` (alias `proxy`) protects any Bun, Node.js, or Next.js route handler — no platform-specific APIs required:

```typescript
import { middleware } from '@hallaxius/auth'

const protect = middleware.auth({
  loginUrl?: string,          // Default: '/auth/discord'
  publicPaths?: string[],     // e.g. ['/login', '/api/*']
  secret?: string,            // JWT secret
  cookieName?: string,        // Default: 'discord-auth-session'
  cookies?: Array<{ name: string; secret: string }>,
})

export default {
  async fetch(request: Request) {
    const response = await protect(request)
    if (response) return response // redirect to login
    return new Response('Protected content')
  },
}
```

| Helper | Signature | Description |
|--------|-----------|-------------|
| `middleware.auth(config)` | `(request) => Promise<Response \| undefined>` | Redirect unauthenticated users to login |
| `middleware.role(config)` | `(request) => Promise<Response \| undefined>` | Enforce role-based access (403 on insufficient permissions) |
| `middleware.session(request, { secret, cookieName?, revocationStorage? })` | `Promise<SessionData \| null>` | Read the session from the cookie |
| `middleware.combine(...middlewares)` | `(request) => Promise<Response \| undefined>` | Run middlewares in order, first response wins |
| `middleware.publicPath(path, patterns)` | `boolean` | Check if a path matches a pattern (`/api/*` wildcards) |
| `middleware.required(path, roleMap)` | `string[] \| null` | Roles required for a path (`{ '/admin/*': ['admin'] }`) |
| `middleware.redirect(url)` | `Response` | 302 redirect; URL must be a relative path starting with `/` |
| `middleware.deny(message?)` | `Response` | 403 with `INSUFFICIENT_PERMISSIONS` code |

---

### Config & PKCE

```typescript
import { config, pkce, deriveStateSecret } from '@hallaxius/auth'

await config.processConfig(discordConfig)   // Validate + apply defaults

const pair = await pkce.create()
// => { verifier, challenge, codeChallengeMethod: 'S256' }
pkce.verifier()               // Generate a code verifier
await pkce.challenge(verifier) // SHA-256 code challenge
validateVerifier(verifier)     // 43-128 chars, [A-Za-z0-9\-._~]
await deriveStateSecret(sessionSecret, salt?)  // HKDF-SHA256
```

`processConfig` requires `clientId`, `clientSecret`, `secret`, and `redirectUri` (or `DISCORD_REDIRECT_URI`). If `stateSecret` is not provided it is derived from the session secret; set `AUTH_SALT` (min 32 chars) to keep it stable across restarts.

---

### Utils

```typescript
import { utils } from '@hallaxius/auth'

utils.secret(32)                        // Random hex string (crypto)
utils.validate(discordAuthConfig)       // Validate config at runtime
utils.revoke(discordId, storage, clientId, clientSecret)  // Delete user + revoke Discord token

// Guild helpers (require a Discord bot token)
utils.guild.join({ guildId, userId, accessToken, botToken, nick?, roles?, clientId, clientSecret })
utils.guild.hasRole(userId, guildId, roleId, botToken, clientId, clientSecret)
utils.guild.hasAnyRole(userId, guildId, roleIds, botToken, clientId, clientSecret)
utils.guild.hasMember(userId, guildId, botToken, clientId, clientSecret)
utils.guild.sync(discordId, guildId, botToken, storage, clientId, clientSecret)  // Sync member roles into storage
const syncer = new utils.guild.GuildRoleSync(config, discordClient)
```

---

### Encryption

```typescript
import { encrypt, decrypt } from '@hallaxius/auth'

const ciphertext = await encrypt(plaintext, secret)
const plaintext = await decrypt(ciphertext, secret)
```

AES-256-GCM with HKDF-SHA256 (16-byte random salt, 16-byte IV). Output format: `salt:iv:tag:ciphertext` (hex).

---

### Security Headers

```typescript
import { securityHeaders, applySecurityHeaders, defaultSecurityHeaders } from '@hallaxius/auth'

const headers = await securityHeaders({
  csp?: CspConfig,                       // Content-Security-Policy
  hsts?: HstsConfig,                     // Strict-Transport-Security
  contentTypeOptions?: boolean,          // X-Content-Type-Options: nosniff
  frameOptions?: 'DENY' | 'SAMEORIGIN',  // X-Frame-Options
  xssProtection?: boolean,               // X-XSS-Protection
  referrerPolicy?: ReferrerPolicy,       // Referrer-Policy
  permissionsPolicy?: PermissionsPolicyConfig,
  crossOriginOpenerPolicy?, crossOriginEmbedderPolicy?,
  crossOriginResourcePolicy?, cacheControl?,
})

applySecurityHeaders(response.headers, await securityHeaders(...))
```

---

### Audit Logging

```typescript
import { auditLogger, createAuditLogger } from '@hallaxius/auth'

auditLogger.log({
  type: 'auth.login',
  severity: 'MEDIUM',   // 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  status: 'SUCCESS',    // 'SUCCESS' | 'FAILURE' | 'BLOCKED' | 'PENDING'
  userId,               // optional actor reference
  action: 'user.login',
})

createAuditLogger({ storage?: AuditLogStorage, redact?: string[] })
// Events: auth.login, auth.register, auth.logout, auth.failedLogin, mfa.*, password.reset.*, etc.
```

---

### Password Validation (standalone)

```typescript
import { validatePassword, validatePasswordOrThrow } from '@hallaxius/auth'

validatePassword('secret123', { minLength: 8, requireSpecial: false })
// => { valid: true } | { valid: false, errorCode, message }
validatePasswordOrThrow('secret') // Throws PasswordTooShortError / PasswordTooLongError / PasswordInvalidFormatError
```

---

### Error Handling

```typescript
import { AuthError, ErrorCodes, isAuthError, getCode } from '@hallaxius/auth'

try { /* ... */ } catch (error) {
  if (isAuthError(error)) {
    error.code        // e.g. ErrorCodes.RATE_LIMITED
    error.statusCode  // HTTP status
    error.retryable   // boolean
    error.retryAfter  // ms (rate limit)
  }
}
```

**Exported error classes:** `AuthError` (base), `ConfigurationError`, `InvalidStateError`, `ExpiredStateError`, `StateReusedError`, `StateBindingError`, `InvalidCodeError`, `InvalidGrantError`, `TokenExchangeError`, `InvalidTokenError`, `TokenExpiredError`, `TokenRefreshError`, `TokenRevokedError`, `MfaRequiredError`, `RateLimitError`, `InteractionRequiredError`, `InvalidCredentialsError`, `CredentialsValidationError`, `EmailTakenError`, `UsernameTakenError`, `PasswordTooShortError`, `PasswordTooLongError`, `PasswordInvalidFormatError`, `PKCEValidationError`, `GuildJoinError`, `GuildSyncError`, `StorageReadError`, `StorageWriteError`, `StorageUnavailableError`, `UserNotFoundError`, `NetworkError`, `UpstreamError`, `BruteForceBlockedError`.

---

### Rate Limit Algorithms

The `rate-limit` export also exposes individual algorithms for custom use:

```typescript
import {
  SlidingWindowLog, SlidingWindowCounter, TokenBucket,
  createSlidingWindowLimiter, createSlidingWindowCounterLimiter,
  createTokenBucketLimiter, createBurstLimiter, BurstRateLimiter,
  createPerUserLimiter, PerUserRateLimiter,
  createEndpointSpecificLimiter, EndpointSpecificLimiter,
  extractIpFromRequest, normalizeIpForRateLimit,
} from '@hallaxius/auth'
```

---

### JWT, Cookies & State

```typescript
import {
  signToken, verifyToken, signRefreshToken, revokeToken,
  parseExpiresIn, expiresInToSeconds, secretToKey,
  parseCookies, createSessionCookie, clearSessionCookie,
  generateState, validateState, consumeState,
  base64URLDecode,
} from '@hallaxius/auth'

parseExpiresIn('7d')   // ISO8601 durations: \d+[smhd] or seconds as number
const cookie = createSessionCookie('auth-session', payload, { expiresIn: '7d' })
```

**State:** `generateState()` creates a random state token; `validateState()` and `consumeState()` detect CSRF state reuse. **JWT:** HS256 via `jose`; `revokeToken()` pairs with `MemoryTokenRevocationStorage` (or your own revocation store).

---

### IP & Validation Helpers

```typescript
import {
  getRequestIP, sanitizeIP, maskIPv4To24, maskIPv6To64,
  isIPv6, isPrivateIP, isCloudflareIP, isTrustedSource, sha256Hex,
  isProduction, validateConfig, validateJwtSecret,
  validateCookieValue, validateSecretEntropy,
} from '@hallaxius/auth'
```

Also exported: `jsonResponse`, `errorResponse`, `htmlResponse`, `redirectResponse` (response helpers); `validatePassword`, `validatePasswordOrThrow`; Zod schemas (`SessionConfigSchema`, `DiscordAuthConfigSchema`, `BruteForceConfigSchema`, `RateLimitConfigSchema`, `CredentialsClientConfigSchema`, `DiscordScopeSchema` + their `validate*` wrappers); crypto helpers (`sha256`, `toBase64URL`, `fromBase64URL`, hex encode/decode, `constantTimeCompare*`); formatting helpers (`parseDuration`, `formatDuration`, `formatBytes`, `formatNumber`, `truncate`); `MemoryCacheAdapter`, `DiscordClient`, `BruteForceProtection`, `CredentialsClient`, `MemoryTokenRevocationStorage`, and `createMemoryComplianceStorage()`.

---

## Configuration

### Environment Variables

**Required (Both Methods):**

| Variable | Description | Generation |
|----------|-------------|------------|
| `JWT_SECRET` | JWT signing secret (min 32 chars) | `openssl rand -base64 32` |

**Required (Discord OAuth2):**

| Variable | Description |
|----------|-------------|
| `DISCORD_CLIENT_ID` | From Discord Developer Portal |
| `DISCORD_CLIENT_SECRET` | From Discord Developer Portal |
| `DISCORD_REDIRECT_URI` | Callback URL (must match exactly) |

**Optional:**

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment | `development` |
| `AUTH_SALT` | Separate secret for the OAuth state HMAC | Derived from `JWT_SECRET` when unset |
| `TRUSTED_PROXY_IPS` | Comma-separated proxy IPs/CIDRs to trust for `X-Forwarded-For` resolution when `trustProxy` is enabled (e.g. behind Cloudflare Tunnel, Vercel, nginx) | Private ranges + Cloudflare |

---

### Production Configuration

**Critical for Proxy/Tunnel Deployments:**

When deploying behind Cloudflare Tunnel, ngrok, Vercel, Railway, etc.:

```bash
# .env.production
NEXT_PUBLIC_SITE_URL=https://app.example.com
DISCORD_REDIRECT_URI=https://app.example.com/auth/discord/callback
```

**Why?** The OAuth callback URL must match `DISCORD_REDIRECT_URI` exactly, so set it to your public HTTPS URL. The library never reads `NEXT_PUBLIC_SITE_URL` — if your app's own middleware needs the public URL (e.g. for client-side redirects), keep it as an app-level variable.

For brute-force protection to work correctly behind a reverse proxy, set `TRUSTED_PROXY_IPS` so the real client IP (from `X-Forwarded-For`) is used as the rate-limit key instead of the proxy's IP.

---

## Storage Implementation

External storage is **REQUIRED** for all production deployments.

### Redis (Upstash) - Recommended for Serverless

```typescript
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

const storage = {
  async findById(id: string) {
    const data = await redis.get(`user:${id}`)
    return data ? JSON.parse(data) : null
  },
  async findByUsername(username: string) {
    const data = await redis.get(`user:username:${username}`)
    return data ? JSON.parse(data) : null
  },
  async findByEmail(email: string) {
    const data = await redis.get(`user:email:${email}`)
    return data ? JSON.parse(data) : null
  },
  async create(data: any) {
    const id = crypto.randomUUID()
    const user = { ...data, id, roles: ['user'] }
    await redis.set(`user:${id}`, JSON.stringify(user))
    await redis.set(`user:username:${user.username}`, id)
    await redis.set(`user:email:${user.email}`, id)
    return user
  },
  async update(userId: string, data: any) {
    const existing = await redis.get(`user:${userId}`)
    const user = { ...JSON.parse(existing!), ...data }
    await redis.set(`user:${userId}`, JSON.stringify(user))
    return user
  },
  async delete(userId: string) {
    const existing = await redis.get(`user:${userId}`)
    await redis.del(`user:${userId}`)
    if (existing) {
      const user = JSON.parse(existing)
      if (user.username) await redis.del(`user:username:${user.username}`)
      if (user.email) await redis.del(`user:email:${user.email}`)
    }
  },
}
```

**Setup (5 minutes):**
1. Visit https://upstash.com
2. Create free Redis database
3. Add to `.env`:
```bash
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxx
```

### Supabase (PostgreSQL)

```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!
)

const storage = {
  async findById(id: string) {
    const { data } = await supabase.from('users').select('*').eq('id', id).single()
    return data
  },
  async findByUsername(username: string) {
    const { data } = await supabase.from('users').select('*').eq('username', username).single()
    return data
  },
  async findByEmail(email: string) {
    const { data } = await supabase.from('users').select('*').eq('email', email).single()
    return data
  },
  async create(data: any) {
    const { data: user } = await supabase.from('users').insert(data).select().single()
    return user
  },
  async update(userId: string, data: any) {
    const { data: user } = await supabase.from('users').update(data).eq('id', userId).select().single()
    return user
  },
  async delete(userId: string) {
    await supabase.from('users').delete().eq('id', userId)
  },
}
```

**Database Schema:**
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE,
  email TEXT UNIQUE,
  password TEXT NOT NULL,
  roles TEXT[] DEFAULT '{user}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Cloudflare KV

```typescript
const storage = {
  async findById(id: string) {
    const data = await AUTH_KV.get(`user:${id}`)
    return data ? JSON.parse(data) : null
  },
  async findByUsername(username: string) {
    const userId = await AUTH_KV.get(`username:${username}`)
    if (!userId) return null
    const data = await AUTH_KV.get(`user:${userId}`)
    return data ? JSON.parse(data) : null
  },
  async findByEmail(email: string) {
    const userId = await AUTH_KV.get(`email:${email}`)
    if (!userId) return null
    const data = await AUTH_KV.get(`user:${userId}`)
    return data ? JSON.parse(data) : null
  },
  async create(data: any) {
    const id = crypto.randomUUID()
    await AUTH_KV.put(`user:${id}`, JSON.stringify(data))
    await AUTH_KV.put(`username:${data.username}`, id)
    await AUTH_KV.put(`email:${data.email}`, id)
    return { id, ...data }
  },
  async update(userId: string, data: any) {
    const existing = await AUTH_KV.get(`user:${userId}`)
    const user = { ...JSON.parse(existing ?? '{}'), ...data }
    await AUTH_KV.put(`user:${userId}`, JSON.stringify(user))
    return user
  },
  async delete(userId: string) {
    const existing = await AUTH_KV.get(`user:${userId}`)
    await AUTH_KV.delete(`user:${userId}`)
    if (existing) {
      const user = JSON.parse(existing)
      if (user.username) await AUTH_KV.delete(`username:${user.username}`)
      if (user.email) await AUTH_KV.delete(`email:${user.email}`)
    }
  },
}
```

---

## Security

### Cryptographic Algorithms

| Feature | Algorithm | Parameters |
|---------|-----------|------------|
| JWT Signing | HS256 | 256-bit key |
| Session Encryption | AES-256-GCM | HKDF-SHA256, 256-bit key, 16-byte IV |
| MFA | TOTP (RFC 6238) | SHA-256 default, 30s period, 6 digits |
| State Parameter | HMAC-SHA256 | OAuth 2.0 CSRF protection |
| Password Hashing | **User Responsibility** | Argon2id preferred; bcrypt, scrypt acceptable |

### Security Headers

**Important:** Security headers are NOT automatically applied. Implement them in your middleware:

```typescript
// middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const response = NextResponse.next()
  
  response.headers.set('Content-Security-Policy', "default-src 'self'")
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  
  return response
}
```

### Cookie Security

Session cookies use:
- `Secure` flag in production (HTTPS only)
- `HttpOnly` flag (no JavaScript access)
- `SameSite` defaults to `lax` in development and `strict` in production (configurable to `none` with `secure`); `Secure` in production
- `Path=/` for all cookies

### Brute Force Protection

- Automatic lockout after 5 failed attempts
- 30-minute lockout duration (configurable)
- Keyed by IP + account identifier (credentials) / IP (Discord)
- Requires external storage for distributed deployments

> **Migration note:** `trustProxy` now defaults to `false` (it was previously
> treated as enabled for brute-force IP resolution). If you deploy behind a
> proxy (Cloudflare, nginx, Vercel), set `trustProxy: true` explicitly on
> `credentials()` so the real client IP is resolved from
> `x-forwarded-for` / `x-real-ip` instead of the proxy's socket address.
> `discord()` always resolves the client IP through trusted proxies.

---

## Performance

Real-world performance (AMD Ryzen 5 5600, Bun 1.3.14):

| Operation | Avg Time | P99 | Memory |
|-----------|----------|-----|--------|
| Login (valid) | 98.14 µs | 1.86 ms | 2.85 KB |
| Login (invalid) | 15.64 µs | 1.20 ms | 2.18 KB |
| Logout | 5.89 µs | 1.15 ms | 547 B |
| JWT Sign | 42.45 µs | 1.67 ms | 954 B |
| JWT Verify | 96.62 µs | 1.96 ms | 1.96 KB |
| Rate Limit Check | 11.03 µs | 1.40 ms | 578 B |
| MFA Setup | 13.68 ms | 17.24 ms | 37.42 KB |
| MFA Verify | 27.40 ms | 30.37 ms | 24.38 KB |

**See [BENCHMARK.md](https://github.com/hallaxius/auth/blob/main/BENCHMARK.md) for detailed benchmarks.**

---

## Testing

```bash
# Run all tests
bun test

# Run unit tests
bun run test:unit

# Run with coverage
bun run test:coverage

# Run benchmarks
bun run benchmarks
```

---

## Deployment

### Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Set environment variables
vercel env add JWT_SECRET
vercel env add NEXT_PUBLIC_SITE_URL
vercel env add DISCORD_CLIENT_ID
vercel env add DISCORD_CLIENT_SECRET
vercel env add DISCORD_REDIRECT_URI
vercel env add UPSTASH_REDIS_REST_URL
vercel env add UPSTASH_REDIS_REST_TOKEN

# Deploy
vercel --prod
```

### Cloudflare Workers

```toml
# wrangler.toml
name = "auth-app"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[kv_namespaces]]
binding = "AUTH_KV"
id = "your-kv-id"

[vars]
JWT_SECRET = "your-secret"
NEXT_PUBLIC_SITE_URL = "https://your-app.workers.dev"
```

```bash
wrangler deploy
```

### Docker

```dockerfile
FROM oven/bun:1
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build
EXPOSE 3000
CMD ["bun", "run", "start"]
```

```bash
docker build -t auth-app .
docker run -p 3000:3000 --env-file .env auth-app
```

---

### Captcha (React Components)

Protect login/register endpoints with hCaptcha, reCAPTCHA v2/v3, or Cloudflare Turnstile.
The library provides self-contained React components plus a `CaptchaProvider` that
manages token lifecycle and a `useCaptcha()` hook for integration with form submissions.

```typescript
import {
  CaptchaProvider,
  Turnstile,
  Hcaptcha,
  Recaptcha,
  useCaptcha,
} from "@hallaxius/auth/components";
```

#### Environment Variables

| Variable | Provider |
|----------|----------|
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Turnstile |
| `NEXT_PUBLIC_HCAPTCHA_SITE_KEY` | hCaptcha |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | reCAPTCHA |
| `TURNSTILE_SECRET_KEY` | Turnstile (server) |
| `HCAPTCHA_SECRET_KEY` | hCaptcha (server) |
| `RECAPTCHA_SECRET_KEY` | reCAPTCHA (server) |

#### Client-side: Render a Widget

```tsx
// components/CaptchaField.tsx
import { Turnstile } from "@hallaxius/auth/components";

export function CaptchaField() {
  return <Turnstile siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!} />;
}
```

```tsx
// reCAPTCHA v2 checkbox (size="normal")
import { Recaptcha } from "@hallaxius/auth/components";

export function CaptchaField() {
  return (
    <Recaptcha
      siteKey={process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY!}
      size="normal"
      theme="dark"
    />
  );
}
```

```tsx
// hCaptcha
import { Hcaptcha } from "@hallaxius/auth/components";

export function CaptchaField() {
  return (
    <Hcaptcha
      siteKey={process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY!}
      size="normal"
      theme="dark"
      action="login"
    />
  );
}
```

#### Using CaptchaProvider + useCaptcha Hook

`CaptchaProvider` wraps your form and exposes token state via `useCaptcha()`.
Use `submitWithCaptcha()` to automatically attach the captcha token to API requests.

```tsx
// app/login/page.tsx
import { CaptchaProvider, useCaptcha, Turnstile } from "@hallaxius/auth/components";

export default function LoginPage() {
  return (
    <CaptchaProvider provider="turnstile" autoExecute={false}>
      <LoginForm />
    </CaptchaProvider>
  );
}

function LoginForm() {
  const { token, isReady, isError, isError: _isError, errorMessage, execute, reset } = useCaptcha();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isReady || !token) return;

    // token is automatically attached via submitWithCaptcha
    // For manual fetch, include token in your request body:
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, captchaToken: token }),
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <Turnstile siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!} />
      {isError && <span>{errorMessage}</span>}
      <button disabled={!isReady}>Log in</button>
    </form>
  );
}
```

#### Server-side: Verify the Token

```typescript
// app/api/login/route.ts
import { verifyCaptcha, resolveCaptchaConfig } from "@hallaxius/auth";
import { getRequestIP } from "@hallaxius/auth";

export async function POST(request: Request) {
  const { captchaToken, ...body } = await request.json();

  const config = resolveCaptchaConfig({
    provider: "turnstile",
    secretKey: process.env.TURNSTILE_SECRET_KEY,
  });

  const ip = getRequestIP(request);
  const result = await verifyCaptcha(config!, captchaToken, { remoteip: ip });

  if (!result.success) {
    return new Response("Captcha verification failed", { status: 403 });
  }

  // ... proceed with login
}
```

#### Captcha Configuration (Credentials)

```typescript
import { credentials } from "@hallaxius/auth";

credentials({
  storage,
  session: { secret: process.env.JWT_SECRET! },
  captcha: {
    provider: "turnstile",           // "hcaptcha" | "recaptcha" | "turnstile"
    secretKey: process.env.TURNSTILE_SECRET_KEY,  // or use env var
    siteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    enabled: true,
    minScore: 0.5,                  // reCAPTCHA v3 score threshold
    expectedAction: "login",        // reCAPTCHA v3 expected action
    allowedHostnames: ["example.com"], // hCaptcha/reCAPTCHA hostname allowlist
  },
});
```

#### Captcha Configuration (Discord)

```typescript
import { discord } from "@hallaxius/auth";

const auth = await discord({
  clientId,
  clientSecret,
  secret,
  callbackUrl,
  storage,
  captcha: {
    provider: "recaptcha",
    secretKey: process.env.RECAPTCHA_SECRET_KEY,
    minScore: 0.5,
    expectedAction: "login",
  },
});
```

---

## Architecture Decision Records

Architecture Decision Records (ADRs) document notable design decisions and are
maintained here in the README.

### ADR-001 — `dispose()` and `ping()` stay optional

**Status:** Accepted (1.0.0 cycle)

**Date:** 2026-08-12

**Context:**

Storage implementations (`IAuthUserStore`, `ITokenRevocationStore`, etc.) declare
optional lifecycle methods `dispose()` and `ping()`. Some consumers asked for them
to become mandatory so resource cleanup and health checks are guaranteed.

**Decision:**

`dispose()` and `ping()` remain **optional** (`dispose?(): void`, `ping?(): Promise<boolean>`)
on all storage interfaces. The package never calls them unconditionally — callers
must guard with `?.`. The factory-created memory stores keep implementing both.

**Consequences:**

- Consumers with stateless stores (e.g. pure HTTP-backed stores) are not forced to
  implement no-op lifecycle methods.
- Health checks (`ping`) remain a consumer-driven feature; the package stays
  storage-agnostic.
- Revisit if a lifecycle contract is needed for serverless multi-instance cleanup.

### ADR-002 — `AuthUserStorage.verifyPassword` is mandatory; hashing is the consumer's responsibility

**Status:** Accepted (1.0.0 cycle)

**Date:** 2026-08-12

**Context:**

`AuthUserStorage.verifyPassword` was optional. When absent, the credentials module
fell back to a constant-time comparison of the plaintext password against the
stored `password` field (`constantTimeCompareStrings`). This meant the package was
one misconfiguration away from comparing plaintext passwords against stored
plaintext — a critical security flaw.

**Decision:**

1. `verifyPassword(userId, password): Promise<boolean>` is now **required** on
   `AuthUserStorage`.
2. The plaintext fallback was **removed**. The package never compares plaintext
   passwords, never hashes them, and never reads the stored `password` field for
   verification.
3. The `CredentialsClient` constructor (and therefore the `credentials()` factory)
   throws `ConfigurationError` when `verifyPassword` is missing.
4. No hashing primitive (e.g. pbkdf2, argon2, bcrypt) was added — hashing and
   verification are entirely the consumer's responsibility, so the choice of KDF
   is the consumer's, not the package's.

**Consequences:**

- Consumer storage must implement `verifyPassword` (compare against their stored
  hash with their chosen KDF).
- Misconfiguration fails fast with `ConfigurationError` instead of silently
  degrading to plaintext comparison.
- Test storages use a dummy plaintext `verifyPassword` helper documented as
  test-only; a real consumer would compare against a stored hash.

### ADR-003 — Role semantics v2 — `hasRole`/`hasAnyRole` on real role IDs, `hasPermission` on the mapped permission

**Status:** Accepted (1.0.0 cycle)

**Date:** 2026-08-12

**Context:**

`GuildRoleSync.hasRole(userId, roleId)` and `hasAnyRole` were ambiguous: some
callers passed real Discord role IDs, others passed mapped application permissions.
The `roleMap` was consulted in an inconsistent way, making the API's contract
unclear and enabling authorization bypasses when callers assumed role-ID semantics.

**Decision:**

Two distinct concepts are now separated explicitly:

- **Roles** — real Discord role IDs present on the guild member:
  `hasRole(userId, roleId)` and `hasAnyRole(userId, roleIds)` check the member's
  raw role list. The `roleMap` is **never** consulted; fetch errors return `false`.
- **Permissions** — application permissions derived from the configured `roleMap`:
  `hasPermission(userId, permission)` maps real role IDs through `roleMap` and
  checks the resulting permission set (previously part of `hasRole`).

`syncUserRoles(userId, accessToken?)` now uses the authenticated user's endpoint
(`/users/@me/guilds/{guild.id}/member`) when an access token is provided, falling
back to the bot endpoint (`/guilds/{guild.id}/members/{userId}`) otherwise.

**Consequences:**

- Breaking change in `1.0.0-beta.8`: callers that passed mapped permissions to
  `hasRole` must switch to `hasPermission`.
- No more role-check vs permission-check ambiguity; each method has a single,
  documented meaning.
- Non-member or failed fetches resolve to `false` (deny-by-default).

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

## Support

- **Documentation:** [README.md](README.md), [BENCHMARK.md](https://github.com/hallaxius/auth/blob/main/BENCHMARK.md), [SECURITY.md](SECURITY.md)
- **Issues:** [GitHub Issues](https://github.com/hallaxius/auth/issues)
- **Email:** support@hallaxi.us
- **Security:** Report vulnerabilities to support@hallaxi.us

---
