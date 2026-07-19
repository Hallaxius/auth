# @hallaxius/auth

> Plug-and-play Discord OAuth2 and credentials authentication for Bun, Next.js, and any Node/edge runtime.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/@hallaxius/auth)](https://www.npmjs.com/package/@hallaxius/auth)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/@hallaxius/auth)](https://bundlephobia.com/package/@hallaxius/auth@latest)
[![npm downloads](https://img.shields.io/npm/dm/@hallaxius/auth)](https://www.npmjs.com/package/@hallaxius/auth)
[![Last Commit](https://img.shields.io/github/last-commit/hallaxius/auth)](https://github.com/hallaxius/auth)

## Features

- **Discord OAuth2** — Authorization code flow with PKCE (S256), CSRF protection (HMAC-SHA256)
- **Credentials Auth** — Username/password or email/password with bcrypt/argon2, JWT sessions, role-based access
- **AuthStrategy Enum** — `UsernameOnly` | `EmailOnly` | `UsernameEmail` for flexible credential strategies
- **Single Entry Point** — `import { discord, credentials, middleware, config, utils, errors, types } from '@hallaxius/auth'`
- **Edge/Next.js Middleware** — `middleware.auth()`, `middleware.role()`, `middleware.combine()`, multi-provider cookie support
- **User Persistence** — Pluggable `UserStorage` / `AuthUserStorage` interfaces
- **JWT Sessions** — Stateless, edge-compatible (uses `jose`)
- **Auto-Join Guild** — `utils.guild.join()` to add users to your Discord server
- **Guild Role Sync** — `utils.guild.sync()`, `utils.guild.hasRole()`, `utils.guild.hasAnyRole()`, `utils.guild.hasMember()`
- **Edge Compatible** — Web Crypto API, zero Node dependencies
- **Zero Unnecessary Deps** — Only `jose`

## Installation

```bash
bun add @hallaxius/auth
# npm install @hallaxius/auth
# pnpm add @hallaxius/auth
# yarn add @hallaxius/auth
```

> **Engine requirement:** `bun >= 1.0.0` (or Node 20+, Deno, Cloudflare Workers, any Web Crypto runtime)

---

## Table of Contents

- [Quick Start](#quick-start)
- [Discord OAuth2](#discord-oauth2)
- [Credentials Auth](#credentials-auth)
- [Middleware](#middleware)
- [Config Utilities](#config-utilities)
- [Utils](#utils)
- [Error Handling](#error-handling)
- [Types](#types)
- [Migration Guide (v2 → v3)](#migration-guide-v2--v3)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Quick Start

### Single Import (v3)

```ts
import { discord, credentials, middleware, config, utils, errors, types } from '@hallaxius/auth'
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

### Middleware (Next.js Edge)

```ts
// middleware.ts
import { middleware } from '@hallaxius/auth'

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*'],
}

export default middleware.combine(
  middleware.auth({
    secret: process.env.JWT_SECRET!,
    loginUrl: '/auth/discord',
    publicPaths: ['/', '/auth/*', '/api/public/*'],
  }),
  middleware.role({
    secret: process.env.JWT_SECRET!,
    loginUrl: '/auth/discord',
    roles: { '/admin/*': ['admin'] },
  }),
)
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

## Config Utilities

### Object: `config`

Configuration normalization and PKCE/route helpers.

```ts
import { config } from '@hallaxius/auth'
```

### `config.normalize(config)` (async)

Processes and validates Discord OAuth2 config, returning internal config with defaults applied.

```ts
const internalConfig = await config.normalize({
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

### `config.routes.create(config)` (deprecated)

> **Deprecated:** Returns 501 Not Implemented. Will be removed in v4 — use route handlers from `discord()` factory directly.

```ts
// ❌ Deprecated — use discord() factory instead
const handlers = config.routes.create()
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

  // OAuth2 Flow
  INVALID_CODE: 'INVALID_CODE',
  INVALID_GRANT: 'INVALID_GRANT',
  TOKEN_EXCHANGE_FAILED: 'TOKEN_EXCHANGE_FAILED',

  // Tokens
  INVALID_TOKEN: 'INVALID_TOKEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_REFRESH_FAILED: 'TOKEN_REFRESH_FAILED',
  TOKEN_REVOKED: 'TOKEN_REVOKED',

  // MFA
  MFA_REQUIRED: 'MFA_REQUIRED',

  // Rate Limiting
  RATE_LIMITED: 'RATE_LIMITED',

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

~15 essential types exported from `types` namespace:

```ts
import { types } from '@hallaxius/auth'
// or
import type { DiscordConfig, CredentialsConfig, SessionUser, StoredUser, UserStorage, ... } from '@hallaxius/auth'
```

| Type | Description |
|------|-------------|
| `DiscordConfig` | Discord OAuth2 factory config (`DiscordFactoryConfig`) |
| `CredentialsConfig` | Credentials factory config |
| `AuthStrategy` | `UsernameOnly \| EmailOnly \| UsernameEmail` |
| `SessionUser` | JWT session payload (`discordId`, `username`, `roles`, etc.) |
| `StoredUser` | Full persisted user with tokens |
| `SafeStoredUser` | `StoredUser` without `accessToken`/`refreshToken` |
| `UserStorage` | Interface for Discord user persistence |
| `AuthUserStorage` | Interface for credentials user persistence |
| `CreateCredentialsInput` | Input for creating credentials user |
| `PasswordHasher` | Interface for password hashing (`hash`, `verify`) |
| `DiscordUser` | Raw Discord user object (snake_case) |
| `TokenResponse` | OAuth2 token response |
| `Scope` | Discord OAuth2 scope union |
| `GuildMember` | Discord guild member (camelCase) |
| `SessionOptions` | Session cookie options |
| `RouteOptions` | Route configuration options |

---

## Migration Guide (v2 → v3)

### Breaking Changes Summary

| v2 Pattern | v3 Replacement |
|------------|----------------|
| `import { auth } from '@hallaxius/auth'` | `import { discord, credentials } from '@hallaxius/auth'` |
| `auth({ provider: 'discord', ... })` | `discord({ clientId, clientSecret, secret, callbackUrl })` |
| `auth({ provider: 'credentials', ... })` | `credentials({ strategy, secret, storage, hasher })` |
| `auth({ provider: 'both', ... })` | Use separate `discord()` + `credentials()` factories |
| `import { nextAuth, nextRole, combine } from '@hallaxius/auth'` | `import { middleware } from '@hallaxius/auth'` → `middleware.auth()`, `middleware.role()`, `middleware.combine()` |
| `middlewareAuth()`, `middlewareRole()` | `middleware.auth()`, `middleware.role()` |
| `getSession()`, `isPublicPath()`, `requiredRole()` | `middleware.session()`, `middleware.publicPath()`, `middleware.required()` |
| `redirect()`, `denied()` | `middleware.redirect()`, `middleware.deny()` |
| `generateSecureSecret()` | `utils.secret()` |
| `validateConfig()` | `utils.validate()` |
| `autoJoinGuild()` | `utils.guild.join()` |
| `hasRoleInGuild()`, `hasAnyRoleInGuild()`, `isUserInGuild()` | `utils.guild.hasRole()`, `utils.guild.hasAnyRole()`, `utils.guild.hasMember()` |
| `revokeUserSession()` | `utils.revoke()` |
| `syncUserRoles()` | `utils.guild.sync()` |
| `processConfig()` | `config.normalize()` |
| `generateCodeVerifier()`, `generateCodeChallenge()`, `generatePKCE()` | `config.pkce.verifier()`, `config.pkce.challenge()`, `config.pkce.create()` |
| `createTypedRouteHandlers()` | `config.routes.create()` |
| `InvalidStateError`, `TokenExpiredError`, etc. | `AuthError` with `ErrorCodes` |
| `isDiscordAuthError()`, `getErrorCode()` | `errors.isAuthError()`, `errors.getCode()` |
| `credentials({ strategy: 'jwt', ... })` | `credentials({ strategy: AuthStrategy.UsernameEmail, session: { secret, ... }, ... })` |

### Before/After Examples

#### Discord OAuth2 Factory

**v2 (Old):**
```ts
import { auth } from '@hallaxius/auth'

const { handleLogin, handleCallback, handleLogout, handleMe } = auth({
  clientId: process.env.DISCORD_CLIENT_ID!,
  clientSecret: process.env.DISCORD_CLIENT_SECRET!,
  session: { type: 'jwt', secret: process.env.JWT_SECRET! },
  redirectUri: process.env.DISCORD_REDIRECT_URI!,
})
```

**v3 (New):**
```ts
import { discord } from '@hallaxius/auth'

const { handleLogin, handleCallback, handleLogout, handleMe } = await discord({
  clientId: process.env.DISCORD_CLIENT_ID!,
  clientSecret: process.env.DISCORD_CLIENT_SECRET!,
  secret: process.env.JWT_SECRET!,
  callbackUrl: process.env.DISCORD_REDIRECT_URI!,
})
```

#### Credentials Factory

**v2 (Old):**
```ts
import { auth } from '@hallaxius/auth'

const { handleRegister, handleLogin, handleLogout, handleMe } = auth({
  provider: 'credentials',
  credentials: {
    strategy: 'jwt',
    secret: process.env.JWT_SECRET!,
    cookieName: 'credentials-session',
  },
})
```

**v3 (New):**
```ts
import { credentials, AuthStrategy } from '@hallaxius/auth'

const { handleRegister, handleLogin, handleLogout, handleMe, getSession, withAuth } = credentials({
  strategy: AuthStrategy.UsernameEmail,
  session: { secret: process.env.JWT_SECRET!, expiresIn: '7d' },
  storage: myStorage,
  hasher: bcryptHasher,
  secure: true,
  sameSite: 'lax',
})
```

#### Middleware (Next.js)

**v2 (Old):**
```ts
// middleware.ts
import { nextAuth, nextRole, combine } from '@hallaxius/auth'

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*'],
}

export default combine(
  nextAuth({
    secret: process.env.JWT_SECRET!,
    loginUrl: '/auth/discord',
    publicPaths: ['/', '/auth/*'],
  }),
  nextRole({
    secret: process.env.JWT_SECRET!,
    loginUrl: '/auth/discord',
    roles: { '/admin/*': ['admin'] },
  }),
)
```

**v3 (New):**
```ts
// middleware.ts
import { middleware } from '@hallaxius/auth'

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*'],
}

export default middleware.combine(
  middleware.auth({
    secret: process.env.JWT_SECRET!,
    loginUrl: '/auth/discord',
    publicPaths: ['/', '/auth/*', '/api/public/*'],
  }),
  middleware.role({
    secret: process.env.JWT_SECRET!,
    loginUrl: '/auth/discord',
    roles: { '/admin/*': ['admin'] },
  }),
)
```

#### Error Handling

**v2 (Old):**
```ts
import { InvalidStateError, TokenExpiredError, isDiscordAuthError, getErrorCode } from '@hallaxius/auth'

try {
  await handleCallback(request)
} catch (e) {
  if (isDiscordAuthError(e)) {
    const code = getErrorCode(e)
    if (code === 'INVALID_STATE') { /* ... */ }
  }
}
```

**v3 (New):**
```ts
import { errors } from '@hallaxius/auth'

try {
  await handleCallback(request)
} catch (e) {
  if (errors.isAuthError(e)) {
    if (e.code === errors.ErrorCodes.INVALID_STATE) { /* ... */ }
  }
}
```

#### Utils

**v2 (Old):**
```ts
import { generateSecureSecret, validateConfig, autoJoinGuild, hasRoleInGuild, revokeUserSession } from '@hallaxius/auth'

const secret = generateSecureSecret(32)
validateConfig(config)
await autoJoinGuild({ guildId, userId, accessToken, botToken, clientId, clientSecret })
const isAdmin = await hasRoleInGuild(userId, guildId, roleId, botToken, clientId, clientSecret)
await revokeUserSession(discordId, storage, clientId, clientSecret)
```

**v3 (New):**
```ts
import { utils } from '@hallaxius/auth'

const secret = utils.secret(32)
utils.validate(config)
await utils.guild.join({ guildId, userId, accessToken, botToken, clientId, clientSecret })
const isAdmin = await utils.guild.hasRole(userId, guildId, roleId, botToken, clientId, clientSecret)
await utils.revoke(discordId, storage, clientId, clientSecret)
```

#### Config Helpers

**v2 (Old):**
```ts
import { processConfig, generateCodeVerifier, generateCodeChallenge, generatePKCE, createTypedRouteHandlers } from '@hallaxius/auth'

const internal = processConfig(config)
const verifier = generateCodeVerifier()
const challenge = await generateCodeChallenge(verifier)
const pkce = await generatePKCE()
const handlers = createTypedRouteHandlers<MyConfig>()({ ... })
```

**v3 (New):**
```ts
import { config } from '@hallaxius/auth'

const internal = await config.normalize(config)
const verifier = config.pkce.verifier()
const challenge = await config.pkce.challenge(verifier)
const pkce = await config.pkce.create()
```

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

### Discord Developer Portal Issues

#### "Invalid redirect URI"

**Solution:** Go to Discord Developer Portal → OAuth2 → Redirects. Ensure `callbackUrl` matches **exactly** (protocol, port, trailing slash).

#### "Invalid client ID or client secret"

**Solution:** Copy Client ID and Client Secret from Discord Portal → OAuth2 section. Regenerate secret if compromised.

---

## License

MIT