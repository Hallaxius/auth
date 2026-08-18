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
- [Multi-Tenancy](#multi-tenancy)
- [Magic Link / Email OTP](#magic-link--email-otp)
- [Login Anomaly Detection](#login-anomaly-detection)
- [Configuration](#configuration)
- [Storage Implementation](#storage-implementation)
- [Captcha](#captcha-react-components)
- [Security](#security)
- [Migration & Breaking Changes](#migration--breaking-changes)
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
- ✅ Fast - Sub-100µs operations (see [BENCHMARK.md](BENCHMARK.md))
- ✅ Serverless-ready - External storage required for all stateful operations

---

## Features

### Authentication Methods

- **Discord OAuth2** - 30-second setup with Discord login
- **Credentials Auth** - Username/email + password with configurable requirements
- **MFA/TOTP** - Time-based one-time passwords (RFC 6238)
- **SMS OTP** - Phone-based passwordless login + MFA enrollment, hashed codes, anti-enumeration + layered rate limits
- **WebAuthn / Passkeys** - FIDO2 registration & authentication (login + MFA), single-use challenges, sign-count tracking
- **OIDC Client** - Authorization code flow with PKCE S256, nonce, strict redirect whitelist, ID-token signature validation, back-channel logout
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
- ✅ **Security Headers** - CSP, HSTS, X-Frame-Options, Permissions-Policy, Cross-Origin-Opener-Policy, Cross-Origin-Embedder-Policy, Cross-Origin-Resource-Policy, Cache-Control, Referrer-Policy
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
  async create(data) { /* hash with Argon2id BEFORE persisting — see "Your responsibility: password hashing" below */ },
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

**Suspended role:** When multi-tenancy is enabled, users with the `suspended` role (exported as `SUSPENDED_ROLE` constant, value: `"suspended"`) are blocked from passwordless flows with `403 TENANT_FORBIDDEN`. This role is set automatically when a tenant is suspended.

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

**Recommended — close the user-enumeration timing channel.** `login()` returns
early when the user does not exist, so a nonexistent user answers in ~ms vs the
KDF cost (100–500 ms) of a real user. Provide `dummyVerifyPassword` to equalize
the cost — it runs your own KDF against a **pre-computed dummy hash** (same
params as your real hashes) and its return value is never used:

```typescript
const dummyHash = await hash('dummy-never-matches', { type: argon2id })

credentials({
  storage,
  session: { secret: process.env.JWT_SECRET! },
  dummyVerifyPassword: async (password) => {
    await verify(password, dummyHash)   // cost parity — return ignored
    return false                        // never allow a nonexistent user
  },
})

// Without the hook, non-existing users answer immediately (documented default);
// with it, found vs not-found logins take the same time.
```

Precompute the dummy hash at startup (never at request time) and use the **same
KDF parameters** (memory, iterations, parallelism) as your real user hashes —
mismatched params defeat the purpose of the parity.

**Public registration?** If you expose an open `register` endpoint, set
`genericRegistrationErrors: true` so taken-usernames/taken-emails return the
same generic 400 as other validation failures (see `checkUniqueness`); by
default they return distinct 409s for developer convenience.

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

**`MAX_USER_LIMITERS`** (exported constant, value: `2000`) — The `PerUserRateLimiter` caps the number of per-user limiter instances held in memory. When the limit is reached, new users are rejected with `RATE_LIMITED` until existing user entries expire or are evicted. This prevents unbounded memory growth in long-running processes with many unique users.

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

### SMS OTP (Phone MFA / Passwordless)

```typescript
import { smsOtp } from '@hallaxius/auth'

const otp = smsOtp({
  notifier: SmsNotifier,               // Required: your SMS provider (send(code, phone, meta))
  getBinding: ...,                     // Required: resolve the user for a phone number
  getOrCreateUser: ...,                // Required: create the user on first passwordless sign-in
  dailyPerPhoneLimit?: number,         // Default: 5 (CURD)
  codeLength?: number,                 // Default: 6 (4-10)
  ttlSeconds?: number,                 // Default: 600, clamped to 60-600
  cooldownMs?: number,                 // Default: 30000 (0 disables)
  smsPasswordless?: boolean,           // Default: true
  verifyPassword: ...,                 // Re-auth hook for re-binding a different phone
  createSessionWithoutPassword: ...,   // Required: mints the session (ADR-002)
})

otp.handleSmsRequest(request)        // POST: send a 6-digit code
otp.handleSmsVerify(request)         // POST: exchange code for a session
otp.handleSmsEnroll(request)         // POST: enroll a phone for MFA
otp.handleVerifyMfa(request)         // POST: verify an MFA code during login
otp.handleResendCode(request)        // POST: resend with cooldown
```

**Security defaults:** only `sha256Hex(code)` is ever stored (ADR-005); dummy-path responses are byte-identical (anti-enumeration, no notifier/storage on unknown phones). Rate limits: 3 codes / 10 min per phone, 5 / hour per IP, 100 / 10 min per tenant, daily cap per phone, 30 s resend cooldown, and verify lockout (max attempt count → `RATE_LIMITED` and the code is destroyed; the correct code afterwards returns `INVALID_CODE`).

---

### WebAuthn / Passkeys

```typescript
import { webauthn } from '@hallaxius/auth'
import { startRegistration, startAuthentication, verifyRegistrationResponse, verifyAuthenticationResponse } from '@simplewebauthn/server'

const passkeys = webauthn({
  rp: { id: 'login.example.com', name: 'Example', origins: ['https://login.example.com'] },
  storage: { credentials: WebAuthnCredentialStorage, challenges: WebAuthnChallengeStorage },
  createSessionWithoutPassword: ...,   // Required: mints the session (ADR-002)
  tenantIdFromRequest?: ...,           // Tenant-scoped keys (global by default)
  trustProxy?: boolean,
})

passkeys.handleRegisterStart(request)      // GET/POST: registration options (challenge, RP)
passkeys.handleRegisterVerify(request)     // POST: verify attestation, persist credential
passkeys.handleAuthenticateStart(request)  // GET/POST: challenge (userless or user-bound)
passkeys.handleAuthenticateVerify(request) // POST: verify assertion, mint session, update sign count
passkeys.handleRemoveCredential(request)   // POST: delete a credential
```

**Security defaults:** challenges are single-use (`getAndConsume`) with `rpId`/origin binding; public keys are stored **base64url** (never raw key material); counter resynchronization on every authentication; user-binding is enforced — a challenge minted for user A cannot be satisfied by user B's credential (`INVALID_TOKEN`).

---

### OIDC Client

```typescript
import { oidc } from '@hallaxius/auth'

const client = oidc({
  discoveryUrl: 'https://accounts.example.com',   // discovery-based
  // ...or static serverMetadata for private OPs / test doubles
  clientId: 'app-client',
  redirectUris: ['https://app.example.com/cb'],   // exact-match whitelist (RFC 9700)
  storage: { state: OidcStateStorage, jwks: OidcJwksCache },  // state is required
  createSessionWithoutPassword: ...,   // Required: mints the session after validation
  mapUser?: ...,                       // claims -> local user; null rejects (401)
  scope?: string,                      // Default: 'openid profile email'
  allowInsecureRequests?: boolean,     // NEVER in production — http:// test doubles only
})

client.handleAuthorizeUrl(request)       // GET/POST: PKCE S256 auth URL (state + nonce)
client.handleCallback(request)           // GET/POST: code exchange + ID-token validation + session
client.handleUserInfo(request)           // GET/POST: userinfo with Bearer / accessToken
client.handleBackchannelLogout(request)  // POST: logout_token validation + jti replay prevention
```

**Security defaults:** PKCE S256 with single-use state records tied to the exact `redirect_uri`; the ID token is **signature-verified against the discovered JWKS** on every code exchange (openid-client's non-repudiation checks are always on), plus iss/aud/exp/nonce claim validation; an optional cross-instance JWKS cache; back-channel logout rejects replayed `jti`s (`STATE_REUSED`) and requires `typ: "logout+jwt"` with the `events` claim.

---

### Multi-Tenancy

```typescript
import { tenancy, subdomainResolver } from '@hallaxius/auth'

const tenantManager = tenancy({
  enabled: true,
  baseDomains: ['example.com'],        // acme.example.com → tenant "acme"
  required: true,                       // throw 403 if no tenant resolved
  storage: {
    tenant: TenantStore,               // ITenantStore — resolve/get tenant records
    tenantMembership: TenantMembershipStore, // ITenantMembershipStore — per-tenant roles
  },
  resolver?: customResolver,           // Optional: override subdomainResolver
  defaultTenantId?: 'default',         // Fallback when resolver returns null
})

// Resolve tenant from request (subdomain-based by default)
const tenantId = await tenantManager.resolveTenantId(request)

// Require a tenant (throws TenantRequiredError if missing)
const tenantId = await tenantManager.requireTenant(request)

// Per-tenant role lookup
const roles = await tenantManager.getRoles(tenantId, userId)

// Membership check
const isMember = await tenantManager.isMember(tenantId, userId)
```

**Tenant identification:** Tenant is derived from the request subdomain (D3). A `x-tenant-id` header is cross-check only — it must match the resolved tenant or `403 TENANT_MISMATCH` is thrown. The package never accepts tenant identity from body/query/header for lookups.

**`subdomainResolver(options?)`** extracts the first label from `Host` / `x-forwarded-host` as the tenant ID. Pass `baseDomains` to restrict which domains are tenant-scoped (e.g. `acme.example.com` → `acme` under `example.com`). Returns `null` for single-label hosts like `localhost`.

---

### Magic Link / Email OTP

```typescript
import { magicLink } from '@hallaxius/auth'

const handlers = magicLink({
  storage: MagicLinkTokenStorage,       // Required: MagicLinkTokenStorage
  notifier: {
    sendEmail: async ({ to, link, code, ttlMinutes, tenantId }) => {
      // Send the magic link or OTP code via your email provider
    },
  },
  mode?: 'link' | 'code',              // Default: 'link'
  ttlMinutes?: number,                  // Default: 10, clamped to 5–15
  codeLength?: number,                  // Default: 6, clamped to 6–8
  linkPath?: string,                    // Default: '/auth/magic-link'
  trustProxy?: boolean,                 // Default: false
  userLookup?: (email) => Promise<{ userId: string } | null>,
  tenantIdFromRequest?: (request) => Promise<string | null>,
  onVerified?: (result) => Promise<Response>,
  requestLimit?: { maxAttempts?, windowMs?, blockDurationMs?, storage? },
  recipientLimit?: { maxAttempts?, windowMs?, blockDurationMs?, storage? },
  verifyLimit?: { maxAttempts?, windowMs?, blockDurationMs?, storage? },
})

handlers.handleRequest(request)    // POST: send magic link or code
handlers.handleVerify(request)     // POST: verify token/code → session
handlers.sendTo(recipient, request) // Programmatic send
handlers.verify({ token?, code?, recipient?, request? }) // Programmatic verify
```

**Modes:** `link` sends a clickable `selector.validator` URL; `code` sends a 6-digit OTP. Both use SHA-256 hashed storage (ADR-005), constant-time comparison, atomic single-use consumption, and anti-enumeration (identical responses for known and unknown recipients). Rate limits: 3 requests/hour per IP, 3 per recipient/10 min, 10 verify attempts/15 min per IP.

---

### Login Anomaly Detection

```typescript
import { AnomalyDetector, LoginAnomalyError } from '@hallaxius/auth'

const detector = new AnomalyDetector({
  enabled: true,
  storage: LoginHistoryStore,            // LoginHistoryStore for login records
  geolocation?: GeolocationProvider,     // Optional: IP → coordinates
  torExitProvider?: TorExitProvider,     // Optional: IP → is Tor exit node

  // Checks (all enabled by default)
  checkNewLocation?: true,
  checkNewDevice?: true,
  checkUnusualHour?: true,              // Default window: 22:00–06:00 UTC
  checkMultipleCountries?: true,        // 2+ countries within 1 hour
  checkImpossibleTravel?: true,         // Speed > 800 km/h between logins
  checkCredentialStuffing?: true,       // 20+ failed attempts in 5 min
  checkTorUsage?: true,

  // Response actions
  onAnomaly?: 'log' | 'challenge_mfa' | 'block' | 'notify',
  onAnomalyDetected?: async (event) => { /* custom handler */ },
})

// Analyze a login attempt — returns anomaly events
const events = await detector.analyze(request, userId, success)
```

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

> **Deprecated:** `compliance()` is deprecated and will be removed in v2. Use `createComplianceManager` instead.

```typescript
import { compliance, createComplianceManager, createMemoryComplianceStorage } from '@hallaxius/auth'

// Recommended (new)
const manager = createComplianceManager({
  exportStorage: DataExportStorage,
  deletionStorage: DeletionStorage,
  consentStorage: ConsentStorage,
  retentionStorage: RetentionStorage,
  retentionPolicies?: RetentionPolicy[],
})

// Deprecated wrapper (kept for backward compatibility)
const manager = compliance({ /* same config */ })
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

**Exported error classes:** `AuthError` (base), `ConfigurationError`, `InvalidStateError`, `ExpiredStateError`, `StateReusedError`, `StateBindingError`, `InvalidCodeError`, `InvalidGrantError`, `TokenExchangeError`, `InvalidTokenError`, `TokenExpiredError`, `TokenRefreshError`, `TokenRevokedError`, `MfaRequiredError`, `RateLimitError`, `InteractionRequiredError`, `InvalidCredentialsError`, `CredentialsValidationError`, `EmailTakenError`, `UsernameTakenError`, `PasswordTooShortError`, `PasswordTooLongError`, `PasswordInvalidFormatError`, `PKCEValidationError`, `GuildJoinError`, `GuildSyncError`, `StorageReadError`, `StorageWriteError`, `StorageUnavailableError`, `UserNotFoundError`, `NetworkError`, `UpstreamError`, `BruteForceBlockedError`, `CaptchaFailedError`, `LoginAnomalyError`, `TenantNotFoundError`, `TenantSuspendedError`, `TenantMismatchError`, `TenantRequiredError`, `TenantForbiddenError`, `MagicLinkInvalidError`, `MagicLinkExpiredError`, `MagicLinkUsedError`.

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
  constantTimeCompare, constantTimeCompareStrings, constantTimeCompareHex,
} from '@hallaxius/auth'
```

**Constant-time comparison helpers** — use these instead of `===` to prevent timing attacks when comparing secrets:

| Function | Signature | Use Case |
|----------|-----------|----------|
| `constantTimeCompare(a, b)` | `(Uint8Array, Uint8Array) => boolean` | Raw byte comparison (e.g. TOTP hashes) |
| `constantTimeCompareStrings(a, b)` | `(string, string) => boolean` | String secrets (e.g. token validators, reset codes) |
| `constantTimeCompareHex(a, b)` | `(string, string) => boolean` | Hex-encoded secrets (e.g. SHA-256 digests) |

```typescript
import { constantTimeCompareStrings } from '@hallaxius/auth'

// Compare a computed hash against a stored hash — constant-time to prevent timing attacks
const isValid = constantTimeCompareStrings(computedHash, storedHash)
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

### Development / Testing

Use `createStorageAdapters` to get a full set of in-memory storage adapters — perfect for local development and tests:

```typescript
import { createStorageAdapters } from '@hallaxius/auth'

const adapters = createStorageAdapters({ type: 'memory' })

// Use individual adapters
const auth = credentials({
  storage: adapters.authUser,
  session: { secret: process.env.JWT_SECRET! },
  bruteForce: { enabled: true, storage: adapters.bruteForce },
  rateLimitStorage: adapters.rateLimit,
})
```

`createStorageAdapters({ type: 'memory' })` returns all required storage implementations (`authUser`, `bruteForce`, `rateLimit`, `mfa`, `state`, `tokenRevocation`, `session`, `resetToken`, `compliance`, `tenant`, `tenantMembership`, `magicLink`, `otp`, `webAuthn`, `oidc`) backed by `Map`-based stores. **Never use in production** — all data is lost on process exit.

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
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin')
  response.headers.set('Cross-Origin-Embedder-Policy', 'require-corp')
  response.headers.set('Cross-Origin-Resource-Policy', 'same-origin')
  response.headers.set('Cache-Control', 'no-store')
  
  return response
}
```

**Default headers** (when using `defaultSecurityHeaders`):

| Header | Default Value |
|--------|---------------|
| `Content-Security-Policy` | Restrictive baseline (no external sources) |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `X-XSS-Protection` | `0` (disabled — modern browsers use CSP) |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | All permissions disabled |
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `Cross-Origin-Embedder-Policy` | `require-corp` |
| `Cross-Origin-Resource-Policy` | `same-origin` |
| `Cache-Control` | `no-store` |

### Cookie Security

Session cookies use:
- `Secure` flag in production (HTTPS only)
- `HttpOnly` flag (no JavaScript access)
- `SameSite` defaults to `lax` in development and `strict` in production (configurable to `none` with `secure`); `Secure` in production
- `Path=/` for all cookies

**Cookie configuration options** (when using `credentials()` or `discord()`):

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `httpOnly` | `boolean` | `true` | Prevents JavaScript access to the cookie |
| `secure` | `boolean` | `true` in production | HTTPS-only transmission |
| `sameSite` | `'lax' \| 'strict' \| 'none'` | `'lax'` (dev) / `'strict'` (prod) | CSRF protection policy |
| `cookiePath` | `string` | `'/'` | Cookie path scope |

**Refresh tokens are server-side only.** Discord refresh tokens (`discordRefreshToken`) are **never included in JWT claims** — they are stored in your `UserStorage` and used only by the server for token refresh. This prevents token leakage if JWTs are intercepted or decoded client-side.

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

**See [BENCHMARK.md](BENCHMARK.md) for detailed benchmarks.**

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
  getCaptchaContext,
} from "@hallaxius/auth/components";
```

`getCaptchaContext()` returns the React context for captcha state. Use it when you need direct context access outside of the `useCaptcha()` hook (e.g. in custom components that need to read captcha state without a hook, or in React Server Components compatibility layers). It lazily creates the context to avoid module-scope `createContext` calls that break React Server Components in Next.js 16+.

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

## Troubleshooting

### Common Issues

| Problem | Cause | Fix |
|---------|-------|-----|
| `JWT_SECRET missing` | Env var not set | Set `JWT_SECRET` (min 32 chars, high entropy) |
| `CSRF token mismatch` | Cookie not sent / cross-origin | Ensure `credentials: "include"` on fetch; check `SameSite` policy |
| `Rate limit exceeded` | Too many requests | Wait for `Retry-After` header value; check `rateLimit()` config |
| `Session not found` | Session expired or revoked | User must re-authenticate; check `sessionRevocationStorage` if configured |
| `Brute force locked` | 5+ failed login attempts | Wait 30 minutes or clear lockout via storage |
| `Captcha verification failed` | Invalid/missing captcha token | Verify site key + secret key; check domain allowlist in provider console |
| `TENANT_MISMATCH` | `x-tenant-id` header doesn't resolve tenant | Header is cross-check only — must match subdomain-resolved tenant |
| `TENANT_SUSPENDED` | Tenant record has `status: "suspended"` | Contact admin to reactivate tenant |
| `WebAuthn challenge mismatch` | Challenge expired or already consumed | Generate a new challenge; challenges are single-use with 60s TTL |
| `INVALID_STATE` (OIDC) | State already consumed or expired | Retry authorization flow; check clock sync if using custom TTL |
| `INVALID_CODE` (SMS OTP) | Wrong code or code expired | Codes expire after configured TTL (default 10 min); max attempts enforced |

### Debug Mode

```bash
# Run tests with verbose output
bun test --verbose

# Run E2E with visible browser
bun run test:e2e:headed

# Check server health
curl http://localhost:3000/auth/health
```

### Storage Connectivity

All storage operations are async and throw on connection failure. Common storage issues:

- **Redis:** Check `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`
- **Database:** Verify connection string and schema migrations
- **KV:** Ensure KV namespace is bound correctly (Cloudflare Workers)

### Cookie Issues

If sessions aren't persisting across requests:

1. Verify `Secure` flag is only set over HTTPS
2. Check `SameSite` policy matches your deployment (lax for dev, strict for prod)
3. Ensure `path` includes your auth routes (default: `/`)
4. For cross-origin: use `SameSite=None; Secure` and set `credentials: "include"` on the client

---

## Migration & Breaking Changes

### v1.x Breaking Changes

| Change | Impact | Migration |
|--------|--------|-----------|
| `discordRefreshToken` removed from JWT claims | Refresh tokens are no longer included in JWT payloads. | Store refresh tokens in your `UserStorage` only. No client-side changes needed — the library handles token refresh server-side. |
| `verifyPassword` is mandatory on `AuthUserStorage` | `ConfigurationError` thrown at construction if missing. | Implement `verifyPassword(userId, password): Promise<boolean>` on your storage. See [password hashing](#your-responsibility-password-hashing). |
| `compliance()` deprecated | `compliance()` wrapper is deprecated, will be removed in v2. | Use `createComplianceManager` directly: `import { createComplianceManager } from '@hallaxius/auth'` |
| `PasswordHasher` interface deprecated | Type retained for backward compatibility only. | Implement password hashing in your storage layer directly. The library never hashes passwords (ADR-002). |
| `trustProxy` defaults to `false` | Was previously treated as enabled for brute-force IP resolution. | If deploying behind a proxy (Cloudflare, nginx, Vercel), set `trustProxy: true` explicitly on `credentials()` so the real client IP is resolved from `x-forwarded-for` / `x-real-ip`. |

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

### ADR-006 — Multi-tenancy v1 — tenant-scoped claims/keys; RLS belongs to the consumer

**Status:** Accepted

**Date:** 2026-08-12

**Context:**

Adds multi-tenant support for B2B/SaaS consumers. The design
space is split between "package-managed isolation" (separate schemas/DBs per tenant)
and "shared schema with consumer-owned row-level security (RLS)". The package is
storage-agnostic and never touches the consumer's database directly (ADR-002 style
division of responsibility), so it cannot enforce RLS.

**Decision:**

- **D2 — Shared schema + consumer-owned RLS.** The package only scopes what it can
  see: session claims and storage keys. Consumers enforce per-tenant row isolation
  via Drizzle `pgPolicy` / Prisma `current_setting` / equivalent.
- **D3 — Tenant identification via subdomain.** `tenancy({ resolver })` derives the
  tenant from the request host (first label, `subdomainResolver` default). A
  `x-tenant-id` header is a **cross-check only** — it must match the resolved tenant
  (or the tenant record id); divergence → `403 TENANT_MISMATCH`. The package never
  accepts tenant identity from body/query/header for lookups.
- **D4 — Global user + per-tenant membership.** Users are unique globally
  (`AuthUserStorage` unchanged); per-tenant roles come from
  `TenantMembershipStorage`. `middleware.role` reads roles per-tenant when
  `tenantIdFromRequest` + `tenantMembership` are configured; the legacy
  session-roles path is unchanged.
- **Keys and claims scoped.** Session tokens carry a `tenantId` claim; brute-force
  keys are per-tenant (`credentials-login:ip:tenantId:accountId`) and rate-limit
  namespaces are per-tenant when tenancy is enabled. For non-tenant flows the legacy
  key format is preserved (additivity).
- **Suspended tenants.** `TenantRecord.status: "suspended"` → `403 TENANT_SUSPENDED`
  on resolution. Suspended users are marked with the `suspended` role
  (`SUSPENDED_ROLE`) → `403 TENANT_FORBIDDEN` in passwordless flows.
- **`createSessionWithoutPassword` prerequisite.** `createSessionWithoutPassword` (used by SMS, magic-link, WebAuthn) mints
  sessions without touching `verifyPassword` (ADR-002 intact), requires the user to
  exist and not be suspended, and is rate-limited per tenant.

**Consequences:**

- Consumers with a single global user base must add their own membership/RLS layer;
  the package never stores tenant data.
- A non-tenant consumer (no `tenancy` config) is unaffected: no tenant resolution,
  no new claims, legacy keys.
- New errors `TENANT_NOT_FOUND` (404), `TENANT_SUSPENDED`, `TENANT_MISMATCH`,
  `TENANT_REQUIRED`, `TENANT_FORBIDDEN` (403) are strictly additive.

---

### ADR-005 — Ephemeral tokens (magic link / email OTP) are hashed in storage and are not passwords

**Status:** Accepted

**Date:** 2026-08-12

**Context:**

Adds magic-link / email-OTP flows. The link or OTP code is a
short-lived bearer secret that the consumer's email provider transports. Storing it
in the clear (or deriving it from a stored secret) would turn the storage layer into
a credential database — and repository reviewers might mistake it for a password
flow. The package's ADR-002 line is drawn at passwords: the package never hashes
passwords because hashing belongs to the consumer's KDF. Ephemeral login tokens are
a different class (short TTL, high entropy, single-use), but they still must never
be persisted raw.

**Decision:**

- **Tokens are `selector.validator` pairs** (blueprint: password-reset). The
  `selector` is a public id; the `validator` carries 256 bits of CSPRNG entropy and
  is the bearer secret. Only `tokenHash = SHA-256(validator)` is stored
  (`MagicLinkTokenStorage`, `PendingMagicLink.tokenHash`).
- **Verification is constant-time** — stored hash vs computed hash compared with
  `constantTimeCompareStrings` (link mode) / hashed-code compare (code mode).
- **Single-use and TTL-bound.** Consumption is atomic (`consume`); resending
  invalidates every previous token of the recipient (`deleteByRecipient`); TTL is
  clamped to 5–15 minutes (default 10).
- **These are NOT passwords under ADR-002.** No consumer KDF is involved, no
  `verifyPassword` exists on this path, and sessions are minted via
  `createSessionWithoutPassword` — ADR-002 remains intact.

**Consequences:**

- A storage leak exposes only SHA-256 digests of 256-bit validadors (plus
  cooldown/attempt counters) — no usable credentials.
- The package never sends clickable secrets in plaintext inside its own storage;
  the notifier (consumer-provided, D6) is the only component that ever sees the raw
  token/code.
- The same "hashed ephemeral secret" pattern is reused by SMS OTP (ADR-009) and
  OIDC state (ADR-008).

---

### ADR-009 — SMS OTP codes are hashed, rate-limited, and never treated as passwords

**Status:** Accepted

**Date:** 2026-08-12

**Context:**

The F2.5 roadmap adds phone-based login and MFA enrollment. The 6-digit code is a
short-lived bearer secret delivered by the consumer's SMS provider. Like magic
links (ADR-005), it must never be persisted raw — a storage leak would otherwise
expose live one-time passwords.

**Decision:**

- **Only `codeHash = SHA-256(code)` is stored** (`OtpCode.codeHash`), alongside
  the phone's own `phoneHash = SHA-256(E.164)`. Raw codes exist only in the
  notifier path and the consumer's SMS provider.
- **Anti-enumeration by default.** Unknown phone numbers get an identical
  response envelope, and neither the notifier nor the storage is touched
  (dummy path). Verification surfaces the same `INVALID_CODE` error for unknown
  phones and wrong codes on known phones.
- **Layered rate limits.** Per-phone 3/10 min, per-IP 5/1 h, per-tenant 100/10 min,
  configurable daily cap per phone, resend cooldown (default 30 s), and a verify
  lockout: after `maxAttempts` failed verifications the code record is destroyed,
  so even the correct code is rejected afterwards.
- **These are NOT passwords under ADR-002.** Sessions are minted via
  `createSessionWithoutPassword`; the optional `verifyPassword` hook is only a
  consumer re-auth check when re-binding a different phone.

**Consequences:**

- A storage leak exposes only SHA-256 digests of 6-digit codes — unusable.
- SMS-only passwordless login costs one unused verification per unknown phone
  (the dummy path drains a small per-IP budget), the standard privacy trade-off
  for enumeration resistance.
- Same hashed-ephemeral pattern as ADR-005/ADR-008.

---

### ADR-008 — OIDC state records are single-use, PKCE-bound, and never contain secrets in the clear

**Status:** Accepted

**Date:** 2026-08-12

**Context:**

The F4 roadmap adds an OIDC client. The authorization-code flow must resist
CSRF/login-confusion (state), replay (single-use state + code), and authorization
code injection (PKCE). The state record also carries the `redirect_uri` so the
token request can never be hijacked to a different redirect target.

**Decision:**

- **State records are single-use** (`getAndConsume`) and TTL-bound (default
  600 s). The record freezes `redirect_uri`, `nonce`, `codeVerifier`, `userId`
  and `tenantId` at authorize time; the callback must re-present the exact state.
- **PKCE S256 always on by default** (`usePkce`, RFC 9700) for public clients;
  `clientSecret` consumers may use `ClientSecretPost`.
- **The ID token is signature-verified on every exchange** — openid-client's
  opt-in non-repudiation checks are always enabled here, over the discovered
  (or static) JWKS — plus iss/aud/exp/nonce claim validation.
- **Back-channel logout validates `typ: "logout+jwt"`, the
  `events` claim, and the signature, and rejects replayed `jti`s**
  (`STATE_REUSED`) via an optional revocation store.
- A `jwks` cache store is optional; if absent the JWKS is fetched per issuer.
- `allowInsecureRequests` exists **only** for `http://` test doubles — it is
  never to be enabled in production.

**Consequences:**

- A storage leak exposes random state strings and PKCE verifiers that expire
  quickly — no reusable credentials.
- Replay of a consumed state returns `401 INVALID_STATE`; a bad code or ID token
  returns `401 INVALID_GRANT`.

---

### ADR-007 — WebAuthn credentials are stored base64url; challenges are single-use

**Status:** Accepted

**Date:** 2026-08-12

**Context:**

The F3 roadmap adds FIDO2/WebAuthn passkeys. Public keys are public by nature,
but the knowledge graph for this package had no WebAuthn surface yet; this ADR
fixes the storage and lifecycle contract.

**Decision:**

- **`publicKey` is stored base64url** (never raw key material) together with
  `signCount`, `transports`, and a `credentialId`; `WebAuthnCredentialStorage`
  keys by `{tenantId}:{credentialId}`.
- **Challenges are single-use** (`getAndConsume`), TTL-bound, and carry
  `rpId`, `origin` expectations (checked against the exact `rp.origins`
  whitelist), the challenge type, and — when known — the owning `userId`.
- **User-binding is enforced**: a registration/authentication challenge minted
  for user A rejects credentials of user B (`INVALID_TOKEN`); userless
  authentication is allowed only when the challenge was created without a user.
- **Sign counter resynchronization** on every authentication
  (`updateSignCount`), with replay detection if the counter goes backwards.
- Verification delegates to `@simplewebauthn/server` with
  `expectedChallenge/expectedOrigin/expectedRPID` always populated.

**Consequences:**

- Credential storage cannot be mistaken for a password store (ADR-002 intact).
- Sessions are minted via `createSessionWithoutPassword` — the package never
  sees plaintext passwords on this path.

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

## Support

- **Documentation:** [README.md](README.md), [BENCHMARK.md](BENCHMARK.md), [SECURITY.md](SECURITY.md)
- **Issues:** [GitHub Issues](https://github.com/hallaxius/auth/issues)
- **Email:** support@hallaxi.us
- **Security:** Report vulnerabilities to support@hallaxi.us

---
