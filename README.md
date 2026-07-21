# @hallaxius/auth

> Complete authentication solution for Bun and Next.js 16+. Supports Discord OAuth2, credentials (username/password), MFA (TOTP + backup codes), password reset, rate limiting, and edge-compatible middleware with security-first design.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/@hallaxius/auth)](https://www.npmjs.com/package/@hallaxius/auth)
[![npm downloads](https://img.shields.io/npm/dm/@hallaxius/auth)](https://www.npmjs.com/package/@hallaxius/auth)
[![Last Commit](https://img.shields.io/github/last-commit/hallaxius/auth)](https://github.com/hallaxius/auth)

## Features

- **Discord OAuth2** — Authorization code flow with PKCE (S256), CSRF protection (HMAC-SHA256)
- **Credentials Auth** — Username/password or email/password with bcrypt/argon2, JWT sessions, role-based access
- **AuthStrategy Enum** — `UsernameOnly` | `EmailOnly` | `UsernameEmail` for flexible credential strategies
- **Password Reset** — Forgot password / reset flow with HMAC tokens, rate limiting, notifier abstraction
- **MFA (TOTP + Backup Codes)** — RFC 6238 TOTP, AES-GCM encrypted secrets, one-time backup codes
- **Rate Limiting** — RFC-compliant headers (`RateLimit`, `RateLimit-Policy`, `Retry-After`), in-memory + custom storage
- **Single Entry Point** — `import { discord, credentials, passwordReset, mfa, rateLimit, middleware, proxy, config, utils, errors, types } from '@hallaxius/auth'`

> 💡 **Recommendation**: Use `proxy` for Next.js 16+ applications. The `middleware` alias is still available for backward compatibility.
- **Edge/Next.js Middleware** — `proxy.auth()`, `proxy.role()`, `proxy.combine()`, multi-provider cookie support
- **User Persistence** — Pluggable `UserStorage` / `AuthUserStorage` interfaces
- **JWT Sessions** — Stateless, edge-compatible (uses `jose`)
- **Auto-Join Guild** — `utils.guild.join()` to add users to your Discord server
- **Guild Role Sync** — `utils.guild.sync()`, `utils.guild.hasRole()`, `utils.guild.hasAnyRole()`, `utils.guild.hasMember()`
- **Edge Compatible** — Web Crypto API, zero Node dependencies
- **Zero Unnecessary Deps** — Only `jose` as runtime dependency

## Security Features

- **LRU Cache** — All in-memory stores use LRU eviction with TTL sweep to prevent memory leaks (max entries: 5,000–50,000 depending on store)
- **Race Condition Protection** — Mutex-based locking (CAS pattern) in `MemoryStateStore`, `DefaultRateLimitStorage`, and internal MFA storage implementations prevents concurrent access issues
- **Timing Attack Protection** — Constant-time comparison for TOTP codes and backup codes (XOR-based), dummy hash for failed credential lookups
- **TOTP Replay Protection** — `lastUsedCounter` tracking prevents reuse of previous TOTP codes
- **TOTP Clock Skew Tolerance** — ±1 step window (90 seconds total) for clock drift compensation
- **IPv6 Validation** — Full IPv6 support with sanitization, masking to /64 for privacy
- **PKCE Validation** — RFC 7636 compliant (S256), enabled by default, optional disable via `disablePKCE: false`
- **RFC-Compliant Rate Limit Headers** — `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After` (RFC 6585 / 8683)
- **Brute Force Protection** — IP + User-Agent + Strategy based rate limiting with exponential backoff
- **CSRF Protection** — HMAC-SHA256 state parameter with single-use enforcement, session binding, User-Agent binding
- **AES-GCM Encryption** — TOTP secrets encrypted at rest with AES-GCM-256
- **HMAC Token Signing** — Password reset tokens use HMAC-SHA256 with separate selector/validator

## Security Best Practices

### Production Configuration

Ensure the following settings for production:
- Set `session.secure: true`
- Use `session.sameSite: 'lax'` or `'strict'`
- Enable PKCE with `disablePKCE: false`
- Configure user storage for session persistence
- Enable rate limiting
- Use JWT secret with minimum 32 characters
- Store environment variables in `.env` (do not commit)

### Brute Force Protection

Automatically enabled with default settings:
- Max attempts: 5 per 15 minutes
- Block duration: 30 minutes
- IP + User-Agent + Strategy based

### CSRF Protection

Enabled by default:
- HMAC-SHA256 state parameter
- Single-use enforcement
- Session + User-Agent binding

### PKCE (RFC 7636)

Enabled by default (S256):
- Prevents authorization code interception
- Do NOT disable in production

## Testing

### Unit Tests

All unit tests are in `src/__tests__/` and run with:

```bash
bun test              # Run all tests
bun run test:unit     # Run unit tests with Vitest
```

### Integration Tests

⚠️ **Note**: Integration tests in `tests/integration/` and `tests/security/` are placeholders and require implementation.

### Performance Tests

```bash
bun run test:baseline  # Run performance baseline
```

### Test Coverage

Target: 85%+ coverage on core modules.

## Installation

```bash
bun add @hallaxius/auth
# npm install @hallaxius/auth
# pnpm add @hallaxius/auth
# yarn add @hallaxius/auth
```

> **Engine requirement:** `bun >= 1.0.0` (or Node 20+, Deno, Cloudflare Workers, any Web Crypto runtime)

## Environment Variables

Create a `.env` file in your project root (do not commit to version control):

```bash
# Required - Discord OAuth2
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret
DISCORD_REDIRECT_URI=http://localhost:3000/auth/discord/callback

# Required - JWT Sessions
JWT_SECRET=your_super_secret_jwt_key_min_32_characters_long

# Optional - Discord Bot (for guild features)
DISCORD_BOT_TOKEN=your_bot_token

# Optional - Application URL (for password reset)
APP_URL=http://localhost:3000
```

> **Security Note:** Never commit `.env` files. Add to `.gitignore`:
> ```
> .env
> .env.local
> .env.production
> ```

### Generating Secure Secrets

#### JWT_SECRET (Required)

Generate a cryptographically secure JWT secret (minimum 32 characters):

```bash
# Using OpenSSL (recommended)
openssl rand -base64 32

# Using Node.js crypto
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Using Bun
bun -e "console.log(crypto.randomBytes(32).toString('base64'))"

# Using OpenSSL (hex format, 64 characters)
openssl rand -hex 32
```

Example output:
```
xK9mP2nQ5vR8wT3yU6zA1bC4dE7fG0hI2jL5mN8oP1qS4tV7xY0zA3bC6dE9fG
```

> **Security Note:** Use different secrets for development and production. Never reuse secrets across projects.

#### DISCORD_BOT_TOKEN (Optional)

Generate from Discord Developer Portal:
1. Go to https://discord.com/developers/applications
2. Create a new application
3. Go to "Bot" section
4. Click "Reset Token" and copy the token

#### State Secret / MFA Secret (Optional - derived from JWT_SECRET)

If you want separate secrets for state signing or MFA encryption:

```bash
# Generate separate state secret
openssl rand -base64 32

# Generate separate MFA encryption key
openssl rand -base64 32
```

#### Password Reset Token Secret (Optional - derived from JWT_SECRET)

```bash
# Generate separate reset token secret
openssl rand -base64 32
```

### Complete .env.example

```bash
# Required - Discord OAuth2
DISCORD_CLIENT_ID=your_client_id_from_discord_portal
DISCORD_CLIENT_SECRET=your_client_secret_from_discord_portal
DISCORD_REDIRECT_URI=http://localhost:3000/auth/discord/callback

# Required - JWT Sessions (generate with: openssl rand -base64 32)
JWT_SECRET=

# Optional - Discord Bot (for guild features)
DISCORD_BOT_TOKEN=

# Optional - Application URL (for password reset)
APP_URL=http://localhost:3000

# Optional - Separate secrets (if not using JWT_SECRET for everything)
# STATE_SECRET=
# MFA_SECRET=
# RESET_TOKEN_SECRET=
```

> **Tip:** Copy `.env.example` to `.env` and fill in the values. Never commit `.env` files to version control.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Production vs Development](#production-vs-development)
- [Security Best Practices](#security-best-practices)
- [Testing](#testing)
- [Discord OAuth2](#discord-oauth2)
- [Credentials Auth](#credentials-auth)
- [Password Reset](#password-reset)
- [MFA (TOTP + Backup Codes)](#mfa-totp--backup-codes)
- [Rate Limiting](#rate-limiting)
- [Middleware](#middleware)
- [Proxy (Next.js 16+)](#proxy-nextjs-16)
- [Config Utilities](#config-utilities)
- [Utils](#utils)
- [Error Handling](#error-handling)
- [Types](#types)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Quick Start

### Single Import (v4)

```ts
import { discord, credentials, passwordReset, mfa, rateLimit, middleware, proxy, config, utils, errors, types } from '@hallaxius/auth'
```

### Discord OAuth2 (Next.js App Router)

```ts
// lib/auth.ts
import { discord } from '@hallaxius/auth'

export const { handleLogin, handleCallback, handleLogout, handleMe } = await discord({
  clientId: process.env.DISCORD_CLIENT_ID!,
  clientSecret: process.env.DISCORD_CLIENT_SECRET!,
  secret: process.env.JWT_SECRET!,
  callbackUrl: process.env.DISCORD_REDIRECT_URI!,
  session: {
    secure: process.env.NODE_ENV === 'production',  // false on localhost (development)
  },
})
```

```ts
// app/auth/discord/route.ts
import { handleLogin } from '@/lib/auth'
export const GET = handleLogin
```

```ts
// app/auth/discord/callback/route.ts
import { handleCallback } from '@/lib/auth'
export const GET = handleCallback
```

### Credentials Auth (Next.js App Router)

```ts
// lib/auth.ts
import { credentials, AuthStrategy } from '@hallaxius/auth'

export const { handleRegister, handleLogin, handleLogout, handleMe } = credentials({
  strategy: AuthStrategy.UsernameEmail,
  session: { secret: process.env.JWT_SECRET!, expiresIn: '7d' },
  storage: myStorage,
  hasher: bcryptHasher,
})
```

```ts
// app/api/auth/register/route.ts
import { handleRegister } from '@/lib/auth'
export const POST = handleRegister
```

```ts
// app/api/auth/login/route.ts
import { handleLogin } from '@/lib/auth'
export const POST = handleLogin
```

### Password Reset (Next.js App Router)

```ts
// lib/auth.ts
import { passwordReset } from '@hallaxius/auth'

export const { handleForgotPassword, handleResetPassword } = passwordReset({
  storage: myResetStorage,
  notifier: myNotifier,
  hasher: bcryptHasher,
})
```

```ts
// app/api/auth/forgot-password/route.ts
import { handleForgotPassword } from '@/lib/auth'
export const POST = handleForgotPassword
```

```ts
// app/api/auth/reset-password/route.ts
import { handleResetPassword } from '@/lib/auth'
export const POST = handleResetPassword
```

### MFA (Next.js App Router)

```ts
// lib/auth.ts
import { mfa } from '@hallaxius/auth'

export const { handleMfaSetup, handleMfaVerify, handleMfaChallenge, handleMfaDisable } = mfa({
  storage: myMfaStorage,
  secret: process.env.JWT_SECRET!,
})
```

### Rate Limiting (Next.js App Router)

```ts
// lib/auth.ts
import { rateLimit } from '@hallaxius/auth'

export const { middleware: rateLimitMiddleware } = rateLimit({
  maxRequests: 100,
  windowMs: 60_000,
})
```

### Middleware (Next.js Edge)

### Next.js Configuration Update

In Next.js 16, the middleware configuration has changed:

* **Before (Next.js 14/15)**: Used `skipMiddlewareUrlNormalize` in `next.config.ts`
* **After (Next.js 16+)**: Use `skipProxyUrlNormalize` in `next.config.ts`

```ts
// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    skipProxyUrlNormalize: true,
  },
};

export default nextConfig;
```

```ts
// middleware.ts
import { proxy } from '@hallaxius/auth'

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*'],
}

export default proxy.combine(
  proxy.auth({
    secret: process.env.JWT_SECRET!,
    loginUrl: '/auth/discord',
    publicPaths: ['/', '/auth/*', '/api/public/*'],
  }),
  proxy.role({
    secret: process.env.JWT_SECRET!,
    loginUrl: '/auth/discord',
    roles: { '/admin/*': ['admin'] },
  }),
)
```

---

## Production vs Development

### Production (Next.js 16+)

```ts
// lib/auth.ts
export const { handleLogin } = await discord({
  session: {
    secure: true, // Required in production
    sameSite: 'lax',
    httpOnly: true,
  },
  disablePKCE: false, // Keep PKCE enabled
  storage: drizzleStorage, // Required persistence
})
```

### Development (localhost)

```ts
// lib/auth.ts
export const { handleLogin } = await discord({
  session: {
    secure: false, // Automatic if NODE_ENV !== 'production'
  },
  disablePKCE: false, // Keep PKCE even in development
})
```

### Next.js 16+ Configuration

```ts
// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    skipProxyUrlNormalize: true, // Required for middleware
  },
};

export default nextConfig;
```

### Middleware Runtime

⚠️ **Important:** Next.js 16+ middleware requires Node.js runtime (Edge runtime not supported):

```ts
// middleware.ts
export const config = {
  matcher: ['/dashboard/:path*'],
  runtime: 'nodejs', // Force Node runtime
}
```

---

## Discord OAuth2

### Factory: `discord(config)`

Creates a Discord OAuth2 handler with login, callback, logout, and `/me` endpoints.

```ts
import { discord } from '@hallaxius/auth'

const { handleLogin, handleCallback, handleLogout, handleMe } = await discord({
  clientId: process.env.DISCORD_CLIENT_ID!,
  clientSecret: process.env.DISCORD_CLIENT_SECRET!,
  secret: process.env.JWT_SECRET!,
  callbackUrl: process.env.DISCORD_REDIRECT_URI!,
  scopes: ['identify', 'email', 'guilds', 'guilds.join'],
  storage: myStorage,           // optional: enables /me, roles, token refresh
  meRoute: '/auth/me',
  redirectUri: process.env.DISCORD_REDIRECT_URI,
  disablePKCE: false,
  publicPaths: ['/', '/auth/*', '/api/auth/*'],
  loginUrl: '/auth/discord',
})
```

### Config Options

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `clientId` | `string` | ✅ | — | Discord OAuth2 Client ID |
| `clientSecret` | `string` | ✅ | — | Discord OAuth2 Client Secret |
| `secret` | `string` | ✅ | — | JWT signing secret (min 32 chars) |
| `callbackUrl` | `string` | ✅ | — | Full callback URL registered in Discord Portal |
| `scopes` | `DiscordScope[]` | ❌ | `['identify']` | OAuth2 scopes |
| `prompt` | `'consent' \| 'none'` | ❌ | — | Discord OAuth2 prompt parameter |
| `storage` | `UserStorage` | ❌ | — | User persistence (enables roles, refresh) |
| `meRoute` | `string` | ❌ | `/auth/me` | Me endpoint path |
| `redirectUri` | `string` | ❌ | `DISCORD_REDIRECT_URI` env → `{prefix}/callback` | Override callback URL |
| `disablePKCE` | `boolean` | ❌ | `false` | Disable PKCE (S256) |
| `publicPaths` | `string[]` | ❌ | `['/', '/auth/*', '/api/auth/*']` | Paths bypassing middleware auth |
| `loginUrl` | `string` | ❌ | `/auth/discord` | Login redirect URL for middleware |
| `stateSecret` | `string` | ❌ | derived from `secret` via HKDF | Separate secret for state HMAC (default: derived from `secret`) |
| `autoRefresh` | `Partial<AutoRefreshConfig>` | ❌ | `{ enabled: true, refreshBeforeExpiryMs: 5min }` | Auto-refresh Discord tokens before expiry |
| `bruteForce` | `Partial<BruteForceConfig>` | ❌ | `{ enabled: true, maxAttempts: 5, windowMs: 15min, blockDurationMs: 30min }` | Brute force protection on login/callback |
| `mfa` | `Partial<DiscordMfaConfig>` | ❌ | `{ enabled: false }` | MFA requirement for Discord login |
| `guildRoleSync` | `Partial<GuildRoleSyncConfig>` | ❌ | `{ enabled: false }` | Auto-sync Discord guild roles to JWT |
| `csrf` | `Partial<CsrfConfig>` | ❌ | `{ enabled: true, sessionBinding: true, userAgentBinding: true }` | CSRF protection settings |
| `callbacks` | `Callbacks` | ❌ | — | Custom callbacks for onSuccess, onError, onTokenRefresh |
| `session` | `SessionConfig` | ❌ | `{ secure: NODE_ENV === 'production', sameSite: 'lax', httpOnly: true, path: '/' }` | Session cookie configuration |

### Returns

| Export | Type | Description |
|--------|------|-------------|
| `handleLogin` | `(Request) => Promise<Response>` | Redirects to Discord OAuth2 consent |
| `handleCallback` | `(Request) => Promise<Response>` | Exchanges code, sets session cookie |
| `handleLogout` | `(Request) => Promise<Response>` | Clears cookie, revokes token if storage |
| `handleMe` | `(Request) => Promise<Response>` | Returns current user (requires storage) |
| `middleware` | `(Request) => Promise<Response \| undefined>` | Edge/Next.js middleware |
| `getSession` | `(Request) => Promise<SessionData \| null>` | Extract session from request |
| `withAuth` | Higher-order function | Protect route handlers (requires auth) |
| `withOptionalAuth` | Higher-order function | Protect route handlers (optional auth) |
| `withRole` | Higher-order function | Protect route handlers (requires specific roles) |
| `dispose` | `() => Promise<void>` | Cleans up resources (state store, timers). Optional, only available when state store is configured |

### Route Handlers (Next.js)

```ts
// app/auth/discord/route.ts
import { handleLogin } from '@/lib/auth'
export const GET = handleLogin

// app/auth/discord/callback/route.ts
import { handleCallback } from '@/lib/auth'
export const GET = handleCallback

// app/auth/discord/logout/route.ts
import { handleLogout } from '@/lib/auth'
export const POST = handleLogout

// app/api/me/route.ts
import { handleMe } from '@/lib/auth'
export const GET = handleMe
```

### With User Storage

```ts
import { discord } from '@hallaxius/auth'
import { drizzleStorage } from './storage'

export const { handleLogin, handleCallback, handleLogout, handleMe } = await discord({
  clientId: process.env.DISCORD_CLIENT_ID!,
  clientSecret: process.env.DISCORD_CLIENT_SECRET!,
  secret: process.env.JWT_SECRET!,
  callbackUrl: process.env.DISCORD_REDIRECT_URI!,
  scopes: ['identify', 'email', 'guilds', 'guilds.join'],
  storage: drizzleStorage,
})
```

When `storage` is provided:
- Users are persisted on first login and updated on return
- `/me` endpoint returns `SafeStoredUser` (no tokens)
- Roles are embedded in JWT and checked by middleware
- Discord tokens are auto-refreshed before expiry

### Security Features

- **PKCE (S256)** — RFC 7636 compliant, enabled by default, prevents authorization code interception
- **CSRF Protection** — HMAC-SHA256 state parameter with single-use enforcement, session binding, User-Agent binding
- **LRU Cache** — State store with automatic eviction (max 10,000 entries, 5 min TTL)
- **Race Condition Protection** — Mutex-based locking prevents state replay attacks

---

## Credentials Auth

### Factory: `credentials(config)`

Creates a credentials (username/password or email/password) handler with register, login, logout, and `/me` endpoints.

```ts
import { credentials, AuthStrategy } from '@hallaxius/auth'
import { drizzleStorage } from './storage'
import { bcryptHasher } from './hasher'

const { handleRegister, handleLogin, handleLogout, handleMe, getSession, withAuth } = credentials({
  strategy: AuthStrategy.UsernameEmail,
  session: { secret: process.env.JWT_SECRET!, expiresIn: '7d' },
  storage: drizzleStorage,
  hasher: bcryptHasher,
  bruteForce: { maxAttempts: 5, windowMs: 15 * 60 * 1000 },
  cookiePath: '/',
  httpOnly: true,
  secure: false,
  sameSite: 'lax',
})
```

### AuthStrategy Enum

```ts
enum AuthStrategy {
  UsernameOnly = 'username-only',    // Registration: username, password | Login: username, password
  EmailOnly = 'email-only',          // Registration: email, password | Login: email, password
  UsernameEmail = 'username-email',  // Registration: username, email, password | Login: username OR email + password
}
```

### Config Options

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `strategy` | `AuthStrategy` | ✅ | — | Authentication strategy |
| `session.secret` | `string` | ✅ | — | JWT signing secret (min 32 chars) |
| `session.expiresIn` | `string \| number` | ❌ | `'7d'` | Session expiration |
| `session.cookieName` | `string` | ❌ | `'credentials-session'` | Session cookie name |
| `storage` | `AuthUserStorage` | ✅ | — | User persistence (required) |
| `hasher` | `PasswordHasher` | ✅ | — | Password hasher (bcrypt/argon2) |
| `bruteForce` | `Partial<BruteForceConfig>` | ❌ | `{ enabled: true, maxAttempts: 5, windowMs: 15min, blockDurationMs: 30min }` | Brute force protection |
| `cookiePath` | `string` | ❌ | `'/'` | Cookie path |
| `httpOnly` | `boolean` | ❌ | `true` | HttpOnly cookie flag |
| `secure` | `boolean` | ❌ | `NODE_ENV === 'production'` | Secure cookie flag |
| `sameSite` | `'lax' \| 'strict' \| 'none'` | ❌ | `'lax'` | SameSite cookie policy |
| `defaultRoles` | `string[]` | ❌ | `['user']` | Default roles assigned to new users |
| `minPasswordLength` | `number` | ❌ | `8` | Minimum password length for registration |

### Returns

| Export | Type | Description |
|--------|------|-------------|
| `handleRegister` | `(Request) => Promise<Response>` | Registers new user (expects JSON: username, email?, password) |
| `handleLogin` | `(Request) => Promise<Response>` | Validates credentials, sets session cookie |
| `handleLogout` | `(Request) => Promise<Response>` | Clears session cookie |
| `handleMe` | `(Request) => Promise<Response>` | Returns current user |
| `getSession` | `(Request) => Promise<AuthUser \| null>` | Extract and verify credentials session |
| `withAuth` | Higher-order function | Protect route handlers |

### Route Handlers (Next.js)

```ts
// app/api/auth/register/route.ts
import { handleRegister } from '@/lib/auth'
export const POST = handleRegister

// app/api/auth/login/route.ts
import { handleLogin } from '@/lib/auth'
export const POST = handleLogin

// app/api/auth/logout/route.ts
import { handleLogout } from '@/lib/auth'
export const POST = handleLogout

// app/api/auth/me/route.ts
import { handleMe } from '@/lib/auth'
export const GET = handleMe
```

### Password Hasher

```ts
// lib/hasher.ts
import type { PasswordHasher } from '@hallaxius/auth'
import bcrypt from 'bcrypt'

export const bcryptHasher: PasswordHasher = {
  async hash(password: string) {
    return bcrypt.hash(password, 12)
  },
  async verify(password: string, hash: string) {
    return bcrypt.compare(password, hash)
  },
}
```

### Credentials Storage

```ts
// lib/storage.ts
import type { AuthUserStorage, CreateCredentialsUserData, AuthUser } from '@hallaxius/auth'

export const drizzleStorage: AuthUserStorage = {
  async findByUsername(username: string) { /* return AuthUser \| null */ },
  async findByEmail(email: string) { /* return AuthUser \| null */ },
  async findById(id: string) { /* return AuthUser \| null */ },
  async create(data: Omit<AuthUser, 'id' | 'createdAt' | 'updatedAt'>) { /* return AuthUser */ },
  async update(userId: string, data: Partial<AuthUser>) { /* return AuthUser */ },
  async delete(userId: string) { /* void */ },
}
```

### Security Features

- **Brute Force Protection** — IP + User-Agent + Strategy based rate limiting (default: 5 attempts / 15 min, 30 min block)
- **Timing Attack Protection** — Constant-time comparison via dummy hash for non-existent users
- **LRU Cache** — Memory leak prevention in `MemoryBruteForceStorage` (max 10,000 entries)

---

## Middleware

### Object: `middleware`

All edge/Next.js middleware functions grouped under a single namespace.

```ts
import { middleware } from '@hallaxius/auth'

// Auth middleware
const auth = middleware.auth({
  secret: process.env.JWT_SECRET!,
  loginUrl: '/auth/discord',
  publicPaths: ['/', '/auth/*', '/api/public/*'],
  cookieName: 'discord-auth-session',
})

// Role middleware
const role = middleware.role({
  secret: process.env.JWT_SECRET!,
  loginUrl: '/auth/discord',
  roles: { '/admin/*': ['admin'], '/mod/*': ['admin', 'moderator'] },
  cookieName: 'discord-auth-session',
})

// Combine multiple middlewares
export default middleware.combine(auth, role)
```

### `middleware.auth(config)`

Protects routes by requiring valid authentication.

```ts
middleware.auth({
  secret: string,                    // JWT secret (required)
  loginUrl: string,                  // Redirect URL for unauthenticated (default: '/auth/discord')
  publicPaths: string[],             // Paths that bypass auth (wildcard * supported)
  cookieName?: string,               // Session cookie name (legacy)
  cookies?: Array<{ name: string; secret: string }>, // Multi-provider cookie configs
})
```

Returns: `(Request) => Promise<Response | undefined>`
- `Response` (302) → Redirect to login with `?redirect=...`
- `undefined` → Allow request through

**Multi-provider support:** Use `cookies` array to support multiple auth providers:

```ts
middleware.auth({
  cookies: [
    { name: 'discord-auth-session', secret: process.env.JWT_SECRET! },
    { name: 'credentials-session', secret: process.env.JWT_SECRET! },
  ],
  publicPaths: ['/', '/auth/*'],
})
```

### `middleware.role(config)`

Protects routes by requiring specific roles.

```ts
middleware.role({
  secret: string,                    // JWT secret (required)
  loginUrl: string,                  // Redirect URL for unauthenticated (default: '/auth/discord')
  roles: Record<string, string[]>,   // Path pattern → required roles (required)
  cookieName: string,                // Session cookie name (default: 'discord-auth-session')
})
```

Returns: `(Request) => Promise<Response | undefined>`
- `Response` (302) → Redirect to login
- `Response` (403) → Forbidden (JSON: `{ error: 'Insufficient permissions' }`)
- `undefined` → Allow request through

**Important:** Roles must be embedded in the JWT token. This happens automatically when `storage` is configured and the user logs in through the callback.

### `middleware.combine(...middlewares)`

Composes multiple middlewares into one. Executes in order; stops at first `Response`.

```ts
export default middleware.combine(
  middleware.auth({ secret: '...', publicPaths: ['/'] }),
  middleware.role({ secret: '...', roles: { '/admin/*': ['admin'] } }),
)
```

### `middleware.session(request, config)`

Extracts session from any Request. Works in middleware, route handlers, or server components.

```ts
import { middleware } from '@hallaxius/auth'

const user = await middleware.session(request, {
  secret: process.env.JWT_SECRET!,
  cookieName: 'discord-auth-session',
})

if (user) {
  console.log(user.discordId, user.username, user.roles)
}
```

Returns: `Promise<SessionData | null>`

### `middleware.publicPath(path, patterns)`

Checks if a path matches any public path pattern.

```ts
import { middleware } from '@hallaxius/auth'

middleware.publicPath('/auth/login', ['/auth/*'])   // true
middleware.publicPath('/dashboard', ['/auth/*'])     // false
```

### `middleware.required(path, roleMap)`

Returns the required roles for a path pattern.

```ts
import { middleware } from '@hallaxius/auth'

middleware.required('/admin/users', { '/admin/*': ['admin'] })  // ['admin']
middleware.required('/dashboard', { '/admin/*': ['admin'] })     // null
```

### `middleware.redirect(url)`

Creates a **302 Response** with the given `Location` header. Only relative URLs allowed (must start with `/`).

```ts
return middleware.redirect('/auth/discord')
// Response { status: 302, headers: { Location: '/auth/discord' } }
```

### `middleware.deny(message?)`

Creates a **403 Response** with JSON body.

```ts
return middleware.deny('Access denied')
// Response { status: 403, body: { error: 'Access denied' } }
```

### Path Pattern Matching

Patterns support `*` wildcard:

| Pattern | Matches |
|---------|---------|
| `/auth/*` | `/auth`, `/auth/login`, `/auth/discord/callback` |
| `/admin/*` | `/admin`, `/admin/users`, `/admin/settings` |
| `/api/public/*` | `/api/public`, `/api/public/data` |
| `/dashboard` | `/dashboard` (exact match only) |

---

## Proxy (Next.js 16+)

The `proxy` export provides the same middleware functions as `middleware` but is the recommended API for Next.js 16+. The `middleware` alias is kept for backward compatibility.

```ts
import { proxy } from '@hallaxius/auth'

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*'],
}

export default proxy.combine(
  proxy.auth({
    secret: process.env.JWT_SECRET!,
    loginUrl: '/auth/discord',
    publicPaths: ['/', '/auth/*', '/api/public/*'],
  }),
  proxy.role({
    secret: process.env.JWT_SECRET!,
    loginUrl: '/auth/discord',
    roles: { '/admin/*': ['admin'] },
  }),
)
```

### `proxy.auth(config)` / `proxy.role(config)` / `proxy.combine(...)` / `proxy.session(request, config)` / `proxy.publicPath(path, patterns)` / `proxy.required(path, roleMap)` / `proxy.redirect(url)` / `proxy.deny(message?)`

Identical to their `middleware.*` counterparts. Use `proxy` for new projects on Next.js 16+.

---

## Password Reset

### Factory: `passwordReset(config)`

Creates handlers for forgot-password and reset-password flows.

```ts
import { passwordReset } from '@hallaxius/auth'

export const { handleForgotPassword, handleResetPassword, requestReset, consumeResetToken } = passwordReset({
  storage: myResetStorage,
  notifier: myNotifier,
  hasher: bcryptHasher,
  minPasswordLength: 8,
  tokenExpirationSeconds: 3600,
  forgotPasswordRateLimit: { maxAttempts: 3, windowMs: 60 * 60 * 1000 },
  resetPasswordRateLimit: { maxAttempts: 10, windowMs: 15 * 60 * 1000 },
})
```

### Config Options

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `storage` | `ResetTokenStorage` | ✅ | — | Token persistence (create, consume, delete) |
| `notifier` | `ResetNotifier` | ✅ | — | Sends reset link to user (email, SMS, etc.) |
| `hasher` | `PasswordHasher` | ✅ | — | Password hashing (bcrypt, argon2) |
| `minPasswordLength` | `number` | ❌ | `8` | Minimum new password length |
| `tokenExpirationSeconds` | `number` | ❌ | `3600` | Reset token TTL (1 hour) |
| `forgotPasswordRateLimit` | `{ maxAttempts, windowMs }` | ❌ | `{ 3, 1h }` | Rate limit for forgot-password |
| `resetPasswordRateLimit` | `{ maxAttempts, windowMs }` | ❌ | `{ 10, 15m }` | Rate limit for reset-password |
| `onPasswordReset` | `(userId: string, newPasswordHash: string) => Promise<void>` | ❌ | — | Callback after successful password reset |
| `userLookup` | `(emailOrUsername: string) => Promise<{userId, email, username} \| null>` | ❌ | — | Custom user lookup function (overrides storage) |

### Returns

| Export | Type | Description |
|--------|------|-------------|
| `handleForgotPassword` | `(Request) => Promise<Response>` | POST `{ emailOrUsername }` → generates token, stores, notifies |
| `handleResetPassword` | `(Request) => Promise<Response>` | POST `{ token, newPassword }` → consumes token, updates password |
| `requestReset` | `(target: string) => Promise<RequestResetResult>` | Non-HTTP helper: lookup user, generate token, notify |
| `consumeResetToken` | `(token: string) => Promise<ConsumeResetTokenResult>` | Non-HTTP helper: verify token, return user info |

### Route Handlers (Next.js)

```ts
// app/api/auth/forgot-password/route.ts
import { handleForgotPassword } from '@/lib/auth'
export const POST = handleForgotPassword
```

```ts
// app/api/auth/reset-password/route.ts
import { handleResetPassword } from '@/lib/auth'
export const POST = handleResetPassword
```

### Storage Interface

```ts
import type { ResetTokenStorage } from '@hallaxius/auth'

export const myResetStorage: ResetTokenStorage = {
  async create(token, userId) { /* store selector, validatorHash, expiry, userId */ },
  async consume(token) { /* verify hash, check expiry, delete, return { userId, email, username } */ },
  async delete(token) { /* remove token */ },
}
```

### Notifier Interface

```ts
import type { ResetNotifier } from '@hallaxius/auth'

export const myNotifier: ResetNotifier = {
  async send(token, userId, email, username) {
    // Send email with reset link: `${process.env.APP_URL}/auth/reset-password?token=${token.selector}.${token.validator}`
  },
}
```

### Security Features

- **HMAC Token Signing** — Separate selector (public) and validator (hashed with SHA-256)
- **Rate Limiting** — Per-IP rate limits for forgot-password (3/hour) and reset-password (10/15min)
- **IPv6 Support** — Full IPv6 validation and sanitization (/64 masking planned)
- **Single-Use Tokens** — Tokens are consumed (deleted) after first use
- **Time-Bound Expiry** — Default 1-hour TTL with automatic cleanup via LRU cache

### Error Codes

- `RESET_TOKEN_EXPIRED` — Token has expired
- `RESET_TOKEN_INVALID` — Token is invalid or malformed
- `RESET_TOKEN_USED` — Token has already been consumed
- `RESET_PASSWORD_WEAK` — New password doesn't meet minimum length

---

## MFA (TOTP + Backup Codes)

### Factory: `mfa(config)`

Creates handlers for TOTP setup, verification, challenge (during login), and disable.

```ts
import { mfa } from '@hallaxius/auth'

export const { handleMfaSetup, handleMfaVerify, handleMfaChallenge, handleMfaDisable } = mfa({
  storage: myMfaStorage,
  secret: process.env.JWT_SECRET!,
  issuer: 'MyApp',
  allowedMethods: ['totp', 'backup_codes'],
})
```

### Security Features

- **TOTP Replay Protection** — Tracks `lastUsedCounter` to prevent reuse of previous codes
- **Clock Skew Tolerance** — ±1 step (90 seconds) window for clock drift
- **Constant-Time Comparison** — XOR-based comparison prevents timing attacks on backup codes
- **AES-GCM-256 Encryption** — TOTP secrets encrypted at rest
- **One-Time Backup Codes** — 10 codes, hashed with SHA-256, consumed on use
- **Race Condition Protection** — Mutex-based locking on `lastUsedCounter` prevents concurrent TOTP code reuse

### Config Options

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `storage` | `MfaStorage` | ✅ | — | Encrypted secret + backup codes persistence |
| `secret` | `string` | ✅ | — | Encryption key (AES-GCM-256, min 32 chars) |
| `issuer` | `string` | ❌ | `'MyApp'` | TOTP URI issuer (shown in authenticator apps) |
| `allowedMethods` | `('totp' \| 'backup_codes')[]` | ❌ | `['totp', 'backup_codes']` | Enabled MFA methods |
| `verifyPassword` | `(userId: string, password: string) => Promise<boolean>` | ❌ | — | Password verification for MFA disable (required for handleMfaDisable) |

### Returns

| Export | Type | Description |
|--------|------|-------------|
| `handleMfaSetup` | `(Request) => Promise<Response>` | POST (requires session) → generates secret + JWT "pending-setup" (10 min), returns `TotpSetupResult` (secret, QR URI, backup codes) |
| `handleMfaVerify` | `(Request) => Promise<Response>` | POST `{ code }` → verifies TOTP against temp secret, persists encrypted secret + generates backup codes (once) |
| `handleMfaChallenge` | `(Request) => Promise<Response>` | POST `{ userId, method, code }` → used during login when `mfa.requireMfa=true` |
| `handleMfaDisable` | `(Request) => Promise<Response>` | POST `{ userId, password }` → verifies password, removes secret + backup codes |
| `setup` | `(userId: string) => Promise<TotpSetupResult>` | Generates TOTP secret and QR URI (internal, non-HTTP) |
| `verify` | `(userId: string, code: string) => Promise<MfaVerifyResult>` | Verifies TOTP code and persists secret (internal, non-HTTP) |
| `challenge` | `(userId: string, method: MfaMethod, code: string) => Promise<MfaChallengeResult>` | Verifies MFA during login challenge (internal, non-HTTP) |
| `isEnabled` | `(userId: string) => Promise<boolean>` | Checks if MFA is enabled for user (internal, non-HTTP) |
| `disable` | `(userId: string) => Promise<void>` | Disables MFA for user (internal, non-HTTP) |
| `generateTotpUri` | `(userId: string, secret: string) => string` | Generates TOTP URI for QR code (internal, non-HTTP) |
| `verifyBackupCode` | `(userId: string, code: string) => Promise<boolean>` | Verifies backup code without consuming (internal, non-HTTP) |

### Route Handlers (Next.js)

```ts
// app/api/auth/mfa/setup/route.ts
import { handleMfaSetup } from '@/lib/auth'
export const POST = handleMfaSetup
```

```ts
// app/api/auth/mfa/verify/route.ts
import { handleMfaVerify } from '@/lib/auth'
export const POST = handleMfaVerify
```

```ts
// app/api/auth/mfa/challenge/route.ts
import { handleMfaChallenge } from '@/lib/auth'
export const POST = handleMfaChallenge
```

```ts
// app/api/auth/mfa/disable/route.ts
import { handleMfaDisable } from '@/lib/auth'
export const POST = handleMfaDisable
```

### Storage Interface

```ts
import type { MfaStorage } from '@hallaxius/auth'

export const myMfaStorage: MfaStorage = {
  async getSecret(userId) { /* return decrypted TOTP secret or null */ },
  async setSecret(userId, encryptedSecret) { /* store encrypted secret */ },
  async deleteSecret(userId) { /* remove secret */ },
  async getBackupCodes(userId) { /* return hashed backup codes */ },
  async setBackupCodes(userId, hashedCodes) { /* store hashed backup codes */ },
  async consumeBackupCode(userId, codeIndex) { /* mark backup code as used */ },
}
```

### Error Codes

- `MFA_REQUIRED` — MFA required during login
- `MFA_SETUP_REQUIRED` — MFA setup is required before verifying
- `MFA_INVALID_CODE` — Invalid TOTP or backup code
- `MFA_INVALID_BACKUP` — Invalid backup code
- `MFA_NOT_SETUP` — MFA not set up for user
- `MFA_ALREADY_SETUP` — MFA already set up
- `MFA_BACKUP_EXHAUSTED` — All backup codes used

---

## Rate Limiting

### Factory: `rateLimit(config)`

Creates a middleware factory for rate-limiting your own routes with RFC-compliant headers.

```ts
import { rateLimit } from '@hallaxius/auth'

export const { middleware: rateLimitMiddleware, check } = rateLimit({
  maxRequests: 100,
  windowMs: 60_000,
  keyBy: (request) => `${request.url}:${getClientIP(request)}`,
})
```

### Security Features

- **LRU Cache** — Prevents memory leaks with automatic eviction (max 50,000 entries)
- **Race Condition Protection** — Mutex-based locking (CAS pattern) prevents concurrent increment issues
- **IPv6 Support** — Full IPv6 validation and sanitization with /64 masking for privacy
- **RFC-Compliant Headers** — `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After`

### Config Options

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `maxRequests` | `number` | ✅ | — | Max requests per window |
| `windowMs` | `number` | ✅ | — | Time window in milliseconds |
| `keyBy` | `(Request) => string` | ❌ | IP-based | Custom key function |
| `storage` | `RateLimitStorage` | ❌ | InMemory | Custom storage interface |

### Returns

| Export | Type | Description |
|--------|------|-------------|
| `middleware` | `(Request) => Promise<Response \| undefined>` | Rate limit middleware (returns 429 with headers if exceeded) |
| `check` | `(Request) => Promise<RateLimitResult>` | Manual check without middleware |
| `reset` | `(Request) => Promise<void>` | Reset rate limit counter for a request |

### Headers (RFC 6585 / 8683)

On every response:
- `RateLimit` — `limit=100, remaining=99, reset=60`
- `RateLimit-Policy` — `100;w=60`
- `Retry-After` — seconds until window resets (on 429)

### Storage Interface

```ts
import type { RateLimitStorage } from '@hallaxius/auth'

export const myRateLimitStorage: RateLimitStorage = {
  async increment(key, windowMs) { /* return { count, resetAt } */ },
  async reset(key) { /* clear key */ },
}
```

### Built-in Integration (Optional)

When `config.rateLimit` is provided, factories automatically apply rate limiting:

```ts
// credentials()
credentials({
  // ...other config
  rateLimit: { handleLogin: { maxRequests: 10, windowMs: 60_000 } },
})

// discord()
discord({
  // ...other config
  rateLimit: { handleLogin: { maxRequests: 5, windowMs: 60_000 }, handleCallback: { maxRequests: 30, windowMs: 60_000 } },
})

// passwordReset()
passwordReset({
  // ...other config
  rateLimit: { handleForgotPassword: { maxRequests: 5, windowMs: 60_000 } },
})
```

### Error Codes

- `RATE_LIMITED_ROUTE` — Custom route rate limit exceeded (distinct from upstream Discord `RATE_LIMITED`)

---

## Config Utilities

### Object: `config`

Configuration normalization and PKCE/route helpers.

```ts
import { config } from '@hallaxius/auth'
```

### `config.processConfig(config)` (async)

Processes and validates Discord OAuth2 config, returning internal config with defaults applied.

```ts
const internalConfig = await config.processConfig({
  clientId: '...',
  clientSecret: '...',
  secret: '...',
  callbackUrl: '...',
  scopes: ['identify', 'email'],
})
```

### `config.pkce`

PKCE (Proof Key for Code Exchange) utilities.

```ts
// Generate code_verifier (43-char base64url)
const verifier = config.pkce.verifier()

// Generate code_challenge (S256) from verifier
const challenge = await config.pkce.challenge(verifier)

// Generate both as a pair
const { verifier, challenge } = await config.pkce.create()
```

---

## Utils

### Object: `utils`

Utility functions for secrets, validation, guild operations, and session revocation.

```ts
import { utils } from '@hallaxius/auth'
```

### `utils.secret(length?)`

Generates a cryptographically secure, URL-safe random string using Web Crypto API.

```ts
const secret = utils.secret(32) // e.g. "xK8...base64url..."
```

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `length` | `number` | `32` | Number of random bytes (output is base64url encoded) |

### `utils.validate(config)`

Validates Discord OAuth2 config for common errors. Throws `ConfigurationError` on invalid fields.

```ts
import { utils, errors } from '@hallaxius/auth'

try {
  utils.validate({ clientId: '', clientSecret: '' })
} catch (e) {
  if (e instanceof errors.AuthError) {
    console.error(e.message)
  }
}
```

### Password Hashing Utilities

```ts
import { utils } from '@hallaxius/auth'

// Create a password hasher
const hasher = utils.createPasswordHasher('bcrypt') // or 'pbkdf2', 'argon2'

// Hash a password
const hash = await hasher.hash('SecurePassword123!')

// Verify a password
const isValid = await hasher.verify('SecurePassword123!', hash)

// Benchmark hasher performance
const stats = await utils.benchmarkPasswordHasher(hasher)
console.log(`Hash: ${stats.hashTimeMs}ms, Verify: ${stats.verifyTimeMs}ms`)
```

### Constant-Time Comparison

```ts
import { utils } from '@hallaxius/auth'

// Compare strings (prevents timing attacks)
const match = utils.constantTimeCompareStrings('abc', 'abc') // true

// Compare byte arrays
const bytesMatch = utils.constantTimeCompare(new Uint8Array([1,2,3]), new Uint8Array([1,2,3])) // true

// Compare hex strings
const hexMatch = utils.constantTimeCompareHex('a1b2c3', 'a1b2c3') // true
```

> **Note:** Password hashing utilities (`createPasswordHasher`, `benchmarkPasswordHasher`) and constant-time comparison functions (`constantTimeCompare`, `constantTimeCompareStrings`, `constantTimeCompareHex`) are available in the source code. If not exported from your installed version, import directly from source files or use alternative implementations.

### IP Utilities

```ts
import { utils } from '@hallaxius/auth'

// Check if IP is IPv6
const isV6 = utils.isIPv6('2001:db8::1') // true

// Mask IPv6 to /64 (for privacy in logs)
const masked = utils.maskIPv6To64('2001:db8:1234:5678:abcd:ef01:2345:6789')
// Returns: '2001:db8:1234:5678::'

// Sanitize IP (remove brackets, normalize)
const clean = utils.sanitizeIP('[2001:db8::1]') // '2001:db8::1'
```

### `utils.guild`

Guild (Discord server) operations.

#### `utils.guild.join(params)`

Adds a user to a Discord guild after authentication. Requires `guilds.join` scope and a bot token.

```ts
await utils.guild.join({
  guildId: 'guild-id',
  userId: 'user-id',
  accessToken: 'user-oauth-token',
  botToken: process.env.DISCORD_BOT_TOKEN!,
  nick: 'New Member',
  roles: ['role-id'],
  clientId: 'client-id',
  clientSecret: 'client-secret',
})
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `guildId` | `string` | ✅ | Discord server ID |
| `userId` | `string` | ✅ | User's Discord ID |
| `accessToken` | `string` | ✅ | OAuth2 access token |
| `botToken` | `string` | ✅ | Discord bot token |
| `nick` | `string` | ❌ | Nickname for the member |
| `roles` | `string[]` | ❌ | Role IDs to assign |
| `clientId` | `string` | ✅ | Discord OAuth2 Client ID |
| `clientSecret` | `string` | ✅ | Discord OAuth2 Client Secret |

#### `utils.guild.hasRole(userId, guildId, roleId, botToken, clientId, clientSecret)`

Checks whether a Discord user has a specific role in a guild. Returns `false` on any error.

```ts
const isAdmin = await utils.guild.hasRole(
  'discord-user-id',
  'guild-id',
  'admin-role-id',
  process.env.DISCORD_BOT_TOKEN!,
  process.env.DISCORD_CLIENT_ID!,
  process.env.DISCORD_CLIENT_SECRET!,
)
```

#### `utils.guild.hasAnyRole(userId, guildId, roleIds, botToken, clientId, clientSecret)`

Checks whether a Discord user has at least one of the given roles. Returns `false` on any error.

```ts
const isStaff = await utils.guild.hasAnyRole(
  'user-id', 'guild-id',
  ['admin-role', 'mod-role'],
  botToken, clientId, clientSecret,
)
```

#### `utils.guild.hasMember(userId, guildId, botToken, clientId, clientSecret)`

Returns `true` if the user is a member of the specified guild, `false` otherwise.

```ts
const isMember = await utils.guild.hasMember('user-id', 'guild-id', botToken, clientId, clientSecret)
```

#### `utils.guild.sync(discordId, guildId, botToken, storage, clientId, clientSecret)`

Fetches the latest Discord guild roles for a user and updates their stored roles. Returns the updated roles array.

```ts
const roles = await utils.guild.sync('discord-id', 'guild-id', botToken, myStorage, clientId, clientSecret)
```

### `utils.revoke(discordId, storage, clientId, clientSecret)`

Deletes a user's session from storage and revokes their Discord access token.

```ts
await utils.revoke('discord-id', myStorage, clientId, clientSecret)
```

> **Note:** `utils.revoke` is also available as `utils.guild.revoke` (same function, two aliases).

#### `utils.guild.GuildRoleSync`

Class for advanced guild role synchronization with custom strategies.

```ts
import { utils, DiscordClient } from '@hallaxius/auth'
import { MemoryCacheAdapter } from '@hallaxius/auth'

// Requires DiscordClient and CacheAdapter instances
const client = new DiscordClient({ botToken: process.env.DISCORD_BOT_TOKEN! })
const cache = new MemoryCacheAdapter()

const sync = new utils.guild.GuildRoleSync(
  {
    guildId: 'guild-id',
    roleMap: { admin: ['admin-role-id'], moderator: ['mod-role-id'] },
    cacheTtlMs: 300_000, // 5 minutes
    syncOnLogin: true,
  },
  client,
  cache
)

// Sync roles for a user
await sync.syncRoles('discord-user-id')

// Check if user has role
const hasRole = await sync.hasRole('discord-user-id', 'admin-role-id')

// Check if user has any role
const hasAny = await sync.hasAnyRole('discord-user-id', ['admin', 'mod'])

// Check if user is guild member
const isMember = await sync.hasMember('discord-user-id')
```

> **Note:** `GuildRoleSync` requires a `DiscordClient` instance and `MemoryCacheAdapter`. For simpler use cases, prefer `utils.guild.sync()`, `utils.guild.hasRole()`, etc.

### Direct Access (aliases)

The `utils` namespace also exposes these aliases:

- `utils.secret()` — same as `utils.secret`
- `utils.validate()` — same as `utils.validate`
- `utils.revoke()` — same as `utils.guild.revoke`

---

## Error Handling

### Exports

```ts
import { errors } from '@hallaxius/auth'
// or
import { AuthError, ErrorCodes, isAuthError, getCode } from '@hallaxius/auth'
```

### `AuthError` (Base Class)

All auth errors extend `AuthError` (extends `Error`) with a machine-readable `code`.

```ts
class AuthError extends Error {
  constructor(
    code: string,
    message: string,
    options?: { cause?: Error; statusCode?: number; retryAfter?: number },
  )
}
```

Properties:
- `code: string` — Stable error code
- `statusCode?: number` — HTTP status code (default 500)
- `retryAfter?: number` — Seconds until retry for rate-limited errors
- `cause?: Error` — Original error

### `ErrorCodes`

Stable error codes for programmatic handling.

```ts
const ErrorCodes = {
  // Configuration
  CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',

  // CSRF / State
  INVALID_STATE: 'INVALID_STATE',
  EXPIRED_STATE: 'EXPIRED_STATE',
  STATE_REUSED: 'STATE_REUSED',
  STATE_BINDING_FAILED: 'STATE_BINDING_FAILED',

// PKCE
  PKCE_VALIDATION_FAILED: 'PKCE_VALIDATION_FAILED',
  INVALID_CODE_VERIFIER: 'INVALID_CODE_VERIFIER',

  // OAuth2 Flow
  INVALID_CODE: 'INVALID_CODE',
  INVALID_GRANT: 'INVALID_GRANT',
  TOKEN_EXCHANGE_FAILED: 'TOKEN_EXCHANGE_FAILED',

// Tokens
  INVALID_TOKEN: 'INVALID_TOKEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_REFRESH_FAILED: 'TOKEN_REFRESH_FAILED',
  TOKEN_REVOKED: 'TOKEN_REVOKED',
  INTERACTION_REQUIRED: 'INTERACTION_REQUIRED',

  // MFA
  MFA_REQUIRED: 'MFA_REQUIRED',
  MFA_SETUP_REQUIRED: 'MFA_SETUP_REQUIRED',
  MFA_INVALID_CODE: 'MFA_INVALID_CODE',
  MFA_INVALID_BACKUP: 'MFA_INVALID_BACKUP',
  MFA_BACKUP_EXHAUSTED: 'MFA_BACKUP_EXHAUSTED',
  MFA_NOT_SETUP: 'MFA_NOT_SETUP',
  MFA_ALREADY_SETUP: 'MFA_ALREADY_SETUP',
  MFA_CHALLENGE_FAILED: 'MFA_CHALLENGE_FAILED',

  // Password Reset
  RESET_TOKEN_EXPIRED: 'RESET_TOKEN_EXPIRED',
  RESET_TOKEN_INVALID: 'RESET_TOKEN_INVALID',
  RESET_TOKEN_USED: 'RESET_TOKEN_USED',
  RESET_TOKEN_CONSUMED: 'RESET_TOKEN_CONSUMED',
  RESET_PASSWORD_WEAK: 'RESET_PASSWORD_WEAK',

  // Rate Limiting
  RATE_LIMITED: 'RATE_LIMITED',
  RATE_LIMITED_ROUTE: 'RATE_LIMITED_ROUTE',

  // Upstream / Network
  UPSTREAM_ERROR: 'UPSTREAM_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',

  // Storage
  STORAGE_READ_ERROR: 'STORAGE_READ_ERROR',
  STORAGE_WRITE_ERROR: 'STORAGE_WRITE_ERROR',
  STORAGE_UNAVAILABLE: 'STORAGE_UNAVAILABLE',

  // Credentials
  USERNAME_TAKEN: 'USERNAME_TAKEN',
  EMAIL_TAKEN: 'EMAIL_TAKEN',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  CREDENTIALS_VALIDATION_ERROR: 'CREDENTIALS_VALIDATION_ERROR',

  // Guild
  GUILD_JOIN_ERROR: 'GUILD_JOIN_ERROR',
  GUILD_SYNC_ERROR: 'GUILD_SYNC_ERROR',

  // Brute Force
  BRUTE_FORCE_BLOCKED: 'BRUTE_FORCE_BLOCKED',
} as const
```

### `isAuthError(error)`

Type guard for `AuthError` hierarchy.

```ts
import { errors } from '@hallaxius/auth'

try {
  await handleCallback(request)
} catch (e) {
  if (errors.isAuthError(e)) {
    console.log(e.code, e.statusCode, e.retryAfter)
  }
}
```

### `getCode(error)`

Extracts error code string from any error.

```ts
import { errors } from '@hallaxius/auth'

const code = errors.getCode(e) // 'TOKEN_EXPIRED' | undefined
```

### Handling Errors in Callbacks

```ts
import { discord, errors } from '@hallaxius/auth'

const { handleCallback } = await discord({ /* config */ })

export async function GET(request: Request) {
  try {
    return await handleCallback(request)
  } catch (e) {
    if (errors.isAuthError(e)) {
      switch (e.code) {
        case errors.ErrorCodes.STATE_REUSED:
        case errors.ErrorCodes.STATE_BINDING_FAILED:
        case errors.ErrorCodes.INVALID_STATE:
          return Response.redirect(new URL('/login?error=invalid_session', request.url))
        case errors.ErrorCodes.PKCE_VALIDATION_FAILED:
          return Response.redirect(new URL('/login?error=pkce_failed', request.url))
        case errors.ErrorCodes.MFA_REQUIRED:
          return Response.redirect(new URL('/mfa-required', request.url))
        case errors.ErrorCodes.TOKEN_EXCHANGE_FAILED:
        case errors.ErrorCodes.INVALID_GRANT:
          return Response.redirect(new URL('/login?error=auth_failed', request.url))
        case errors.ErrorCodes.RATE_LIMITED:
          return Response.redirect(new URL(`/login?retry_after=${e.retryAfter ?? 60}`, request.url))
        case errors.ErrorCodes.TOKEN_EXPIRED:
        case errors.ErrorCodes.TOKEN_REFRESH_FAILED:
          return Response.redirect(new URL('/login?error=session_expired', request.url))
        case errors.ErrorCodes.TOKEN_REVOKED:
          return Response.redirect(new URL('/login?error=revoked', request.url))
        case errors.ErrorCodes.UPSTREAM_ERROR:
          return Response.redirect(new URL('/login?error=service_unavailable', request.url))
        default:
          console.error('Auth error:', e.code, e.message)
          return Response.redirect(new URL('/login?error=unknown', request.url))
      }
    }
    throw e
  }
}
```

---

## Types

Over 40 TypeScript types exported from `types` namespace:

```ts
import { types } from '@hallaxius/auth'
// or
import type { SessionData, DiscordConfig, UserStorage, ... } from '@hallaxius/auth'
```

### Core Session Types

| Type | Description |
|------|-------------|
| `SessionData` | JWT session payload (`discordId`, `username`, `roles`, `email`, etc.) |
| `SessionUser` | Alias for `SessionData` |
| `StoredUser` | Full persisted user with tokens (`accessToken`, `refreshToken`, `expiresAt`) |
| `SafeStoredUser` | `StoredUser` without sensitive fields (no `accessToken`/`refreshToken`) |
| `SessionType` | `'discord' \| 'credentials'` — Session type discriminator |
| `SessionConfig` | Session cookie and JWT configuration |
| `SessionCookieOptions` | Cookie options for sessions (`secure`, `httpOnly`, `sameSite`, `path`) |

### Config Types

| Type | Description |
|------|-------------|
| `DiscordConfig` | Discord OAuth2 factory config (alias: `DiscordAuthConfig`) |
| `CredentialsConfig` | Credentials auth factory config |
| `PasswordResetConfig` | Password reset factory config |
| `MfaConfig` | MFA factory config (alias: `MfaFactoryConfig`) |
| `RateLimitConfig` | Rate limiting factory config |
| `AutoRefreshConfig` | Auto-refresh configuration for Discord tokens |
| `BruteForceConfig` | Brute force protection configuration |
| `DiscordMfaConfig` | MFA configuration for Discord OAuth2 |
| `GuildRoleSyncConfig` | Guild role synchronization configuration |
| `CsrfConfig` | CSRF protection configuration |
| `Callbacks` | Custom callbacks (`onSuccess`, `onError`, `onTokenRefresh`) |
| `RouteOptions` | Route configuration (alias: `RoutesConfig`) |
| `EdgeAuthConfig` | Edge middleware auth configuration |
| `EdgeRoleConfig` | Edge middleware role configuration |
| `MiddlewareAuthConfig` | Middleware auth configuration |
| `MiddlewareRoleConfig` | Middleware role configuration |

### Storage Types

| Type | Description |
|------|-------------|
| `UserStorage` | Interface for Discord user persistence |
| `AuthUserStorage` | Interface for credentials user persistence |
| `ResetTokenStorage` | Interface for password reset token storage |
| `MfaStorage` | Interface for MFA secret and backup codes storage |
| `RateLimitStorage` | Interface for rate limit counter storage |
| `BruteForceStorage` | Interface for brute force attempt tracking |

### Credential Types

| Type | Description |
|------|-------------|
| `AuthStrategy` | `'username-only' \| 'email-only' \| 'username-email'` |
| `AuthUser` | Credentials user object (`id`, `username`, `email`, `passwordHash`, `roles`) |
| `CreateCredentialsUserData` | Input for creating credentials user |
| `AuthUserIdentifier` | Username or email identifier |
| `CredentialsAuthResult` | Result of credentials authentication |
| `CredentialsClientConfig` | Internal credentials client configuration |
| `InternalCredentialsConfig` | Resolved credentials config with defaults |
| `CredentialsResult` | Credentials factory result |
| `PasswordHasher` | Interface for password hashing (`hash`, `verify`) |
| `IPassworder` | Interface for password hashing (alias) |

### Discord API Types

| Type | Description |
|------|-------------|
| `DiscordUser` | Raw Discord API user object (snake_case) |
| `DiscordGuildMember` | Discord guild member object |
| `GuildMember` | Discord guild member (camelCase alias) |
| `DiscordGuild` | Discord guild/server object |
| `DiscordConnection` | Discord OAuth2 connection object |
| `DiscordScope` | Discord OAuth2 scope (`'identify' \| 'email' \| 'guilds' \| ...`) |
| `Scope` | Alias for `DiscordScope` |
| `DiscordTokenResponse` | OAuth2 token response from Discord |
| `TokenResponse` | Alias for `DiscordTokenResponse` |
| `PromptType` | Discord OAuth2 prompt (`'consent' \| 'none'`) |
| `OAuth2UrlParams` | Parameters for building OAuth2 URL |
| `TokenRequestParams` | Parameters for token exchange request |
| `PKCEParams` | PKCE code verifier and challenge |
| `RefreshTokenParams` | Parameters for token refresh |
| `RevokeTokenParams` | Parameters for token revocation |
| `AddMemberParams` | Parameters for adding member to guild |
| `GetGuildMemberParams` | Parameters for getting guild member |
| `DiscordClientInterface` | Discord API client interface |
| `OAuth2ErrorCode` | Discord OAuth2 error codes |
| `TypedCallbackQuery` | Typed OAuth2 callback query |
| `TypedErrorQuery` | Typed OAuth2 error query |

### Password Reset Types

| Type | Description |
|------|-------------|
| `ResetNotifier` | Interface for sending reset notifications |
| `RequestResetResult` | Result of password reset request |
| `ConsumeResetTokenResult` | Result of consuming reset token |
| `ResetPasswordResult` | Result of password reset |

### MFA Types

| Type | Description |
|------|-------------|
| `MfaMethod` | `'totp' \| 'backup_codes'` — MFA method type |
| `TotpSetupResult` | TOTP setup result (`secret`, `qrUri`, `backupCodes`) |
| `MfaVerifyResult` | TOTP verification result |
| `MfaChallengeResult` | MFA challenge result |

### Rate Limiting Types

| Type | Description |
|------|-------------|
| `RateLimitResult` | Rate limit check result (`limited`, `remaining`, `resetAt`) |

### Error Types

| Type | Description |
|------|-------------|
| `ErrorCode` | Union of all error code strings |
| `AuthError` | Base class for all auth errors |

### Utility Types

| Type | Description |
|------|-------------|
| `CreateUserData` | Data for creating a new user |
| `CookieOptions` | Cookie configuration options |
| `InternalConfig` | Internal resolved configuration with all defaults |

---

## Troubleshooting

### Authentication Flow Issues

#### "Invalid state parameter - possible CSRF attack"

**Cause:** State parameter expired (5 min TTL) or tampered with.

**Solutions:**
1. User took too long to authenticate — ask them to try again
2. Multiple tabs open — each login generates new state
3. State not passed correctly — verify callback URL includes `state` parameter

#### "Missing authorization code"

**Cause:** Discord did not return `code` parameter.

**Solutions:**
1. User denied authorization — check if they clicked "Cancel"
2. Incorrect redirect URI — verify `callbackUrl` matches Discord Portal exactly
3. Missing scopes — ensure at least `"identify"` scope

#### "Invalid authorization code"

**Cause:** Code invalid, expired, or already used.

**Solutions:**
1. Code already used — codes are single-use
2. Code expired — Discord codes expire after 10 minutes
3. PKCE mismatch — ensure `code_verifier` matches `code_challenge`
4. Incorrect client secret — verify `clientSecret`
5. Incorrect redirect URI — must match the one used to generate auth URL

### Token Issues

#### "Token has expired"

**Cause:** Access token expired and could not be refreshed.

**Solutions:**
1. With `storage` configured, tokens auto-refresh 5 min before expiry
2. Without storage, tokens cannot auto-refresh — user must log in again
3. Refresh token expired — user must log in again

#### "Invalid token"

**Cause:** Access token invalid or revoked.

**Solutions:**
1. Token was revoked — check if `revokeToken()` called manually or on logout
2. Token not stored correctly — verify storage implementation
3. User logged out elsewhere — logging out in one tab revokes token

### Configuration Issues

#### "clientId and clientSecret are required"

**Solution:** Provide both in `discord()` config.

#### "secret is required"

**Solution:** Provide JWT secret (min 32 chars) in factory config.

#### "storage is required for credentials"

**Solution:** Credentials auth requires an `AuthUserStorage` implementation.

### Cookie Issues

#### "Cookie not set"

**Solutions:**
1. `sameSite: 'none'` requires `secure: true`
2. Development on `http://localhost` needs `secure: false`
3. Domain mismatch — cookies only sent to domain that set them

```ts
// Development
cookies: { secure: false, sameSite: 'lax' }

// Production
cookies: { secure: true, sameSite: 'lax' }
```

#### "Redirect loop after login" (localhost/development)

**Symptom:** User authenticates successfully, but is redirected back to `/auth/discord?redirect=%2Fdashboard` in a loop.

**Cause:** Cookie `Secure` flag prevents browser from sending cookie on localhost during development.

**Solution:** Set `secure: false` in development:

```ts
// lib/auth.ts
export const { handleLogin, handleCallback, handleLogout, handleMe } = await discord({
  clientId: process.env.DISCORD_CLIENT_ID!,
  clientSecret: process.env.DISCORD_CLIENT_SECRET!,
  secret: process.env.JWT_SECRET!,
  callbackUrl: process.env.DISCORD_REDIRECT_URI!,
  session: {
    secure: process.env.NODE_ENV === 'production',  // ← false on localhost
  },
})
```

**Note:** The package now defaults to `secure: false` in development (when `NODE_ENV !== 'production'`), but explicit configuration is recommended.

### Discord Developer Portal Issues

#### "Invalid redirect URI"

**Solution:** Go to Discord Developer Portal → OAuth2 → Redirects. Ensure `callbackUrl` matches **exactly** (protocol, port, trailing slash).

#### "Invalid client ID or client secret"

**Solution:** Copy Client ID and Client Secret from Discord Portal → OAuth2 section. Regenerate secret if compromised.

---

## Edge Runtime

`@hallaxius/auth` is fully compatible with all Web Crypto runtimes. No Node.js built-in modules are required.

| Runtime | Support | Notes |
|---------|---------|-------|
| **Bun** | ✅ Full | Native `Bun.file`, `Bun.password` |
| **Node.js 20+** | ✅ Full | Web Crypto available natively |
| **Deno** | ✅ Full | Web Crypto + `jose` compatible |
| **Cloudflare Workers** | ✅ Full | Use custom storage adapters (KV, D1) |
| **Vercel Edge** | ✅ Full | No `setTimeout` in edge functions; avoid `DefaultRateLimitStorage` timers |
| **Next.js 16+** | ✅ Full | Use `proxy` export for middleware |

### Edge Constraints

| Constraint | Impact | Workaround |
|------------|--------|------------|
| No `setTimeout` / `setInterval` (Vercel Edge) | `DefaultRateLimitStorage` uses timer for TTL sweep | Provide custom `RateLimitStorage` without timers |
| No file system | `MemoryStateStore` is in-memory only | Use external state storage (KV, Redis) |
| 1 MB response body limit | Large guild lists may hit limit | Paginate `getUserGuilds` results |
| No `crypto.randomUUID` (older runtimes) | `jti` generation falls back | Minimum runtime: Bun 1.0, Node 20, Deno 2 |

### Example: Bun HTTP Server

```ts
// server.ts
import { discord } from '@hallaxius/auth'

const { handleLogin, handleCallback, handleLogout, handleMe } = await discord({
  clientId: process.env.DISCORD_CLIENT_ID!,
  clientSecret: process.env.DISCORD_CLIENT_SECRET!,
  secret: process.env.JWT_SECRET!,
  callbackUrl: process.env.DISCORD_REDIRECT_URI!,
})

Bun.serve({
  port: 3000,
  async fetch(request) {
    const url = new URL(request.url)
    if (url.pathname === '/auth/discord') return handleLogin(request)
    if (url.pathname === '/auth/discord/callback') return handleCallback(request)
    if (url.pathname === '/auth/logout') return handleLogout(request)
    if (url.pathname === '/auth/me') return handleMe(request)
    return new Response('Not found', { status: 404 })
  },
})
```

---

## License

MIT

