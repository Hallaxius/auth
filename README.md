# @hallaxius/auth

> Complete authenticati on solution for Bun and Next.js 16+. Supports  Discord OAuth2, credentials (username/passwo rd), MFA (TOTP + backup codes), password rese t, rate limiting, and edge-compatible middlew are with security-first design.

[![License:  MIT](https://img.shields.io/badge/license-MIT -blue.svg)](LICENSE)
[![npm version](https:// img.shields.io/npm/v/@hallaxius/auth)](https: //www.npmjs.com/package/@hallaxius/auth)
[![n pm downloads](https://img.shields.io/npm/dm/@ hallaxius/auth)](https://www.npmjs.com/packag e/@hallaxius/auth)

## Features

> **Status:* * Production Ready ✅ | **Version:** v5.0.0  | **Redis Support:** Available (optional)

-  **Discord OAuth2** — Authorization code flo w with PKCE (S256), CSRF protection (HMAC-SHA 256)
- **Credentials Auth** — Username/pass word or email/password with bcrypt/argon2, JW T sessions, role-based access
- **AuthStrateg y Enum** — `UsernameOnly` | `EmailOnly` | ` UsernameEmail` for flexible credential strate gies
- **Password Reset** — Forgot password  / reset flow with HMAC tokens, rate limiting , notifier abstraction
- **MFA (TOTP + Backup  Codes)** — RFC 6238 TOTP, AES-GCM encrypte d secrets, one-time backup codes
- **Rate Lim iting** — RFC-compliant headers (`RateLimit `, `RateLimit-Policy`, `Retry-After`), in-mem ory + Redis storage
- **Single Entry Point**  — `import { discord, credentials, passwordR eset, mfa, rateLimit, middleware, proxy, conf ig, utils, errors, types } from '@hallaxius/a uth'`

> 💡 **Note**: `proxy` and `middlewa re` are aliases for the same functionality. U se whichever naming you prefer - both work id entically in all Next.js versions.
- **Edge/N ext.js Middleware** — `proxy.auth()`, `prox y.role()`, `proxy.combine()`, multi-provider  cookie support
- **User Persistence** — Plu ggable `UserStorage` / `AuthUserStorage` inte rfaces
- **JWT Sessions** — Stateless, edge -compatible (uses `jose`)
- **Auto-Join Guild ** — `utils.guild.join()` to add users to y our Discord server
- **Guild Role Sync** —  `utils.guild.sync()`, `utils.guild.hasRole()` , `utils.guild.hasAnyRole()`, `utils.guild.ha sMember()`
- **Redis Integration** — `Redis StateStore` and `ResilientRedisStateStore` wi th circuit breaker for production (optional,  recommended for multi-worker)
- **Edge Compat ible** — Web Crypto API, zero Node dependen cies (Redis is optional dependency)
- **Multi -Worker Support** — Redis-backed state stor es enable horizontal scaling
- **Zero Unneces sary Deps** — Only `jose` as runtime depend ency (Redis is optional)

## Security Feature s

- **LRU Cache** — All in-memory stores u se LRU eviction with TTL sweep to prevent mem ory leaks (max entries: 5,000–50,000 depend ing on store)
- **Race Condition Protection**  — Mutex-based locking (CAS pattern) in `Me moryStateStore`, `DefaultRateLimitStorage`, a nd internal MFA storage implementations preve nts concurrent access issues
- **Timing Attac k Protection** — Constant-time comparison f or TOTP codes and backup codes (XOR-based), d ummy hash for failed credential lookups
- **T OTP Replay Protection** — `lastUsedCounter`  tracking prevents reuse of previous TOTP cod es
- **TOTP Clock Skew Tolerance** — ±1 st ep window (90 seconds total) for clock drift  compensation
- **IPv6 Validation** — Full I Pv6 support with sanitization, masking to /64  for privacy (implemented)
- **PKCE Validatio n** — RFC 7636 compliant (S256), **REQUIRED ** in production, do NOT disable
- **RFC-Comp liant Rate Limit Headers** — `X-RateLimit-L imit`, `X-RateLimit-Remaining`, `X-RateLimit- Reset`, `Retry-After` (RFC 6585 / 8683)
- **B rute Force Protection** — IP + User-Agent +  Strategy based rate limiting with exponentia l backoff
- **CSRF Protection** — HMAC-SHA2 56 state parameter with single-use enforcemen t, session binding, User-Agent binding
- **AE S-GCM Encryption** — TOTP secrets encrypted  at rest with AES-GCM-256
- **HMAC Token Sign ing** — Password reset tokens use HMAC-SHA2 56 with separate selector/validator

## Secur ity Limitations

> ⚠️ **Critical Producti on Warnings:**
>
> - **JWT tokens cannot be r evoked** before expiry - use short expiry tim es (15-30 min)
> - **Memory stores don't work  in multi-worker** deployments - use Redis fo r production
> - **PKCE is MANDATORY** - neve r set `disablePKCE: true` in production
> - * *Rate limiting requires Redis** for multi-wor ker/load-balanced environments
>
> For detail ed security documentation, see [Security Guid e](docs/security.md).

## Production Configur ation

### Production Checklist ✅

```ts
ex port const { handleLogin } = await discord({
   session: {
    secure: true,      // Requir ed in production
    sameSite: 'lax',
    htt pOnly: true,
  },
  disablePKCE: false,  // R EQUIRED - do NOT disable
  storage: drizzleSt orage, // Required for persistence
  stateSec ret: process.env.AUTH_STATE_SALT!,
})
```

** Requirements:**
- ✅ `session.secure: true`
 - ✅ PKCE enabled (`disablePKCE: false`)
- � �� User storage configured
- ✅ Redis-backed  stores for multi-worker
- ✅ `AUTH_STATE_SA LT` environment variable
- ✅ Secrets manage r (not just .env)

### Development (localhost )

```ts
export const { handleLogin } = await  discord({
  session: { secure: false }, // O K for localhost
  disablePKCE: false,          // Keep PKCE enabled
  // Memory stores OK f or single-worker dev
})
```

**Note:** Test w ith Redis before deploying to production.

##  Testing

### Unit Tests

All unit tests are  in `src/__tests__/` and run with:

```bash
bu n test              # Run all tests
bun run t est:unit     # Run unit tests with Vitest
``` 

### Integration Tests

⚠️ **Note**: Int egration tests in `tests/integration/` and `t ests/security/` are placeholders and require  implementation.

### Performance Tests

```ba sh
bun run test:baseline  # Run performance b aseline
```

### Test Coverage

Target: 85%+  coverage on core modules.

## Installation

` ``bash
bun add @hallaxius/auth
# npm install  @hallaxius/auth
# pnpm add @hallaxius/auth
#  yarn add @hallaxius/auth
```

### Optional: R edis Integration (Recommended for Production) 

```bash
bun add ioredis
# npm install iored is
# pnpm add ioredis
# yarn add ioredis
```
 
> **Engine requirement:** `bun >= 1.0.0` (or  Node 20+, Deno, Cloudflare Workers, any Web  Crypto runtime)
> 
> **Redis:** Optional for  development, **required** for multi-worker/cl uster deployments.

## Environment Variables
 
Create a `.env` file in your project root (d o not commit to version control):

```bash
#  Required - Discord OAuth2
DISCORD_CLIENT_ID=y our_client_id
DISCORD_CLIENT_SECRET=your_clie nt_secret
DISCORD_REDIRECT_URI=http://localho st:3000/auth/discord/callback

# Required - J WT Sessions
JWT_SECRET=your_super_secret_jwt_ key_min_32_characters_long

# Required - Stat e Signing (HMAC-SHA256)
AUTH_STATE_SALT=your_ state_signing_secret_min_32_chars

# Optional  - Discord Bot (for guild features)
DISCORD_B OT_TOKEN=your_bot_token

# Optional - Applica tion URL (for password reset)
APP_URL=http:// localhost:3000

# Optional - Redis (for produ ction/multi-worker)
REDIS_URL=redis://localho st:6379
```

> ⚠️ **Security Warning:** ` AUTH_STATE_SALT` is **REQUIRED** for producti on. Never use default or empty values. Genera te with `openssl rand -base64 32`.

### Gener ating Secure Secrets

#### JWT_SECRET (Requir ed)

Generate a cryptographically secure JWT  secret (minimum 32 characters):

```bash
# Us ing OpenSSL (recommended)
openssl rand -base6 4 32

# Using Node.js crypto
node -e "console .log(require('crypto').randomBytes(32).toStri ng('base64'))"

# Using Bun
bun -e "console.l og(crypto.randomBytes(32).toString('base64')) "

# Using OpenSSL (hex format, 64 characters )
openssl rand -hex 32
```

Example output:
` ``
xK9mP2nQ5vR8wT3yU6zA1bC4dE7fG0hI2jL5mN8oP1 qS4tV7xY0zA3bC6dE9fG
```

#### DISCORD_BOT_TO KEN (Optional)

Generate from Discord Develop er Portal:
1. Go to https://discord.com/devel opers/applications
2. Create a new applicatio n
3. Go to "Bot" section
4. Click "Reset Toke n" and copy the token

#### AUTH_STATE_SALT ( Required for Production)

Generate a separate  secret for HMAC state parameter signing (REQ UIRED for production):

```bash
# Using OpenS SL (recommended)
openssl rand -base64 32

# U sing Node.js crypto
node -e "console.log(requ ire('crypto').randomBytes(32).toString('base6 4'))"

# Using Bun
bun -e "console.log(crypto .randomBytes(32).toString('base64'))"
```

>  ⚠️ **Security Warning:** Never use the sa me value for `JWT_SECRET` and `AUTH_STATE_SAL T`. Always generate separate secrets.

#### D ISCORD_BOT_TOKEN (Optional)

Generate from Di scord Developer Portal:
1. Go to https://disc ord.com/developers/applications
2. Create a n ew application
3. Go to "Bot" section
4. Clic k "Reset Token" and copy the token

#### MFA  Secret (Optional - derived from JWT_SECRET)

 If you want a separate encryption key for MFA  secrets:

```bash
# Generate separate MFA en cryption key
openssl rand -base64 32
```

### # Password Reset Token Secret (Optional - der ived from JWT_SECRET)

```bash
# Generate sep arate reset token secret
openssl rand -base64  32
```

### Complete .env.example

```bash
#  Required - Discord OAuth2
DISCORD_CLIENT_ID= your_client_id_from_discord_portal
DISCORD_CL IENT_SECRET=your_client_secret_from_discord_p ortal
DISCORD_REDIRECT_URI=http://localhost:3 000/auth/discord/callback

# Required - JWT S essions (generate with: openssl rand -base64  32)
JWT_SECRET=

# Required - State Signing ( generate with: openssl rand -base64 32)
AUTH_ STATE_SALT=

# Optional - Discord Bot (for gu ild features)
DISCORD_BOT_TOKEN=

# Optional  - Application URL (for password reset)
APP_UR L=http://localhost:3000

# Optional - Redis ( for production/multi-worker)
REDIS_URL=redis: //localhost:6379

# Optional - Separate secre ts (if not using JWT_SECRET for everything)
#  MFA_SECRET=
# RESET_TOKEN_SECRET=
```

---

 ## Table of Contents

- [Quick Start](#quick- start)
  - [Discord OAuth2](#discord-oauth2-q uick-start)
  - [Credentials Auth](#credentia ls-auth-quick-start)
  - [Password Reset](#pa ssword-reset-quick-start)
  - [MFA](#mfa-quic k-start)
  - [Rate Limiting](#rate-limiting-q uick-start)
  - [Middleware](#middleware-quic k-start)
- [Redis Integration](#redis-integra tion)
- [Adapters](#adapters)
- [Production v s Development](#production-vs-development)
-  [Security Features](#security-features)
- [Se curity Limitations](#security-limitations)
-  [Testing](#testing)
- [Discord OAuth2](#disco rd-oauth2)
- [Credentials Auth](#credentials- auth)
- [Password Reset](#password-reset)
- [ MFA (TOTP + Backup Codes)](#mfa-totp--backup- codes)
- [Rate Limiting](#rate-limiting)
- [M iddleware / Proxy](#middleware--proxy)
- [Con fig Utilities](#config-utilities)
- [Utils](# utils)
- [Error Handling](#error-handling)
-  [Troubleshooting](#troubleshooting)
- [Edge R untime](#edge-runtime)
- [License](#license)
 
---

## Quick Start

### Single Import

```t s
import { discord, credentials, passwordRese t, mfa, rateLimit, middleware, proxy, config,  utils, errors, types } from '@hallaxius/auth '
```

### Discord OAuth2 (Next.js App Router )

```ts
// lib/auth.ts
import { discord } fr om '@hallaxius/auth'

export const { handleLo gin, handleCallback, handleLogout, handleMe }  = await discord({
  clientId: process.env.DI SCORD_CLIENT_ID!,
  clientSecret: process.env .DISCORD_CLIENT_SECRET!,
  secret: process.en v.JWT_SECRET!,
  callbackUrl: process.env.DIS CORD_REDIRECT_URI!,
  session: {
    secure:  process.env.NODE_ENV === 'production',  // fa lse on localhost (development)
  },
})
```

` ``ts
// app/auth/discord/route.ts
import { ha ndleLogin } from '@/lib/auth'
export const GE T = handleLogin
```

```ts
// app/auth/discor d/callback/route.ts
import { handleCallback }  from '@/lib/auth'
export const GET = handleC allback
```

### Credentials Auth (Next.js Ap p Router)

```ts
// lib/auth.ts
import { cred entials, AuthStrategy } from '@hallaxius/auth '

export const { handleRegister, handleLogin , handleLogout, handleMe } = credentials({
   strategy: AuthStrategy.UsernameEmail,
  sessi on: { secret: process.env.JWT_SECRET!, expire sIn: '7d' },
  storage: myStorage,
  hasher:  bcryptHasher,
})
```

```ts
// app/api/auth/r egister/route.ts
import { handleRegister } fr om '@/lib/auth'
export const POST = handleReg ister
```

```ts
// app/api/auth/login/route. ts
import { handleLogin } from '@/lib/auth'
e xport const POST = handleLogin
```

### Passw ord Reset (Next.js App Router)

```ts
// lib/ auth.ts
import { passwordReset } from '@halla xius/auth'

export const { handleForgotPasswo rd, handleResetPassword } = passwordReset({
   storage: myResetStorage,
  notifier: myNotif ier,
  hasher: bcryptHasher,
})
```

```ts
//  app/api/auth/forgot-password/route.ts
import  { handleForgotPassword } from '@/lib/auth'
e xport const POST = handleForgotPassword
```

 ```ts
// app/api/auth/reset-password/route.ts 
import { handleResetPassword } from '@/lib/a uth'
export const POST = handleResetPassword
 ```

### MFA (Next.js App Router)

```ts
// l ib/auth.ts
import { mfa } from '@hallaxius/au th'

export const { handleMfaSetup, handleMfa Verify, handleMfaChallenge, handleMfaDisable  } = mfa({
  storage: myMfaStorage,
  secret:  process.env.JWT_SECRET!,
})
```

### Rate Lim iting (Next.js App Router)

```ts
// lib/auth .ts
import { rateLimit } from '@hallaxius/aut h'

export const { middleware: rateLimitMiddl eware } = rateLimit({
  maxRequests: 100,
  w indowMs: 60_000,
})
```

---

## Redis Integr ation

> **Redis** is optional for developmen t but **required** for production with multip le workers.

### Quick Example

```ts
import  { discord, ResilientRedisStateStore, MemorySt ateStore } from '@hallaxius/auth'

const stat eStore = new ResilientRedisStateStore({
  red isUrl: process.env.REDIS_URL!,
  ttl: 300,
   prefix: 'auth:state:',
  circuitBreaker: {
     failureThreshold: 5,
    resetTimeout: 3000 0,
  },
  fallback: new MemoryStateStore(), / / Graceful degradation
})

export const { han dleLogin, handleCallback } = await discord({  stateStore })
```

### Why Redis?

- ✅ Mult i-worker support (shared state)
- ✅ Persist ence across restarts
- ✅ Accurate rate limi ting
- ✅ Brute force protection

### Fallba ck Pattern

Always use `ResilientRedisStateSt ore` with fallback for production:

```ts
con st stateStore = new ResilientRedisStateStore( {
  redisUrl: process.env.REDIS_URL!,
  fallb ack: new MemoryStateStore(),
  circuitBreaker : { failureThreshold: 5, resetTimeout: 30000  },
})
```

For detailed Redis documentation,  see [Redis Guide](docs/redis.md).

---

## Ad apters

State stores and storage adapters det ermine where authentication data is persisted .

### Memory Adapters (Development Only)

** Use ONLY for development and testing. NOT sui table for production.**

| Adapter | Purpose  | Max Entries | TTL | Multi-Worker |
|------- --|---------|-------------|-----|------------ --|
| `MemoryStateStore` | OAuth2 state stora ge | 10,000 | 5 min | ❌ No |
| `MemoryBrute ForceStorage` | Brute force counters | 10,000  | 30 min | ❌ No |
| `DefaultRateLimitStora ge` | Rate limit counters | 50,000 | 60 min |  ❌ No |

### Redis Adapters (Production)

* *REQUIRED for production with multiple worker s or horizontal scaling.**

| Adapter | Purpo se | Persistence | Multi-Worker | Circuit Bre aker |
|---------|---------|-------------|--- -----------|-----------------|
| `RedisStateS tore` | OAuth2 state storage | ✅ Yes | ✅  Yes | ❌ No |
| `ResilientRedisStateStore` |  OAuth2 state storage | ✅ Yes | ✅ Yes | � �� Yes |
| `RedisBruteForceStorage` | Brute f orce counters | ✅ Yes | ✅ Yes | ❌ No |
 | `RedisRateLimitStorage` | Rate limit counte rs | ✅ Yes | ✅ Yes | ❌ No |

### User S torage (Required for Credentials Auth)

User  storage adapters persist user accounts and se ssions.

| Adapter | Purpose | Multi-Worker |  Example |
|---------|---------|------------- |---------|
| `DrizzleStorage` | Drizzle ORM  adapter | ✅ Yes | PostgreSQL, MySQL, SQLite  |
| `PrismaStorage` | Prisma ORM adapter | � �� Yes | PostgreSQL, MySQL, MongoDB |
| Custo m | Implement `AuthUserStorage` | ✅ Yes | A ny database |

### Choosing the Right Adapter 

| Scenario | State Store | Brute Force | Ra te Limit |
|----------|-------------|-------- -----|------------|
| **Local Development** |  MemoryStateStore | MemoryBruteForce | Defaul tRateLimit |
| **Production (Single Worker)**  | RedisStateStore | RedisBruteForce | RedisR ateLimit |
| **Production (Multi-Worker)** |  ResilientRedisStateStore | RedisBruteForce |  RedisRateLimit |
| **High Availability** | Re silientRedisStateStore + fallback | RedisBrut eForce | RedisRateLimit + fallback |

---

##  Discord OAuth2

### Factory: `discord(config )`

Creates a Discord OAuth2 handler with log in, callback, logout, and `/me` endpoints.

` ``ts
import { discord } from '@hallaxius/auth '

const { handleLogin, handleCallback, handl eLogout, handleMe } = await discord({
  clien tId: process.env.DISCORD_CLIENT_ID!,
  client Secret: process.env.DISCORD_CLIENT_SECRET!,
   secret: process.env.JWT_SECRET!,
  callbackU rl: process.env.DISCORD_REDIRECT_URI!,
  scop es: ['identify', 'email', 'guilds', 'guilds.j oin'],
  storage: myStorage,           // opt ional: enables /me, roles, token refresh
  me Route: '/auth/me',
  redirectUri: process.env .DISCORD_REDIRECT_URI,
  disablePKCE: false,
   publicPaths: ['/', '/auth/*', '/api/auth/*' ],
  loginUrl: '/auth/discord',
})
```

### C onfig Options

| Option | Type | Required | D efault | Description |
|--------|------|----- -----|---------|-------------|
| `clientId` |  `string` | ✅ | — | Discord OAuth2 Client  ID |
| `clientSecret` | `string` | ✅ | —  | Discord OAuth2 Client Secret |
| `secret`  | `string` | ✅ | — | JWT signing secret ( min 32 chars) |
| `callbackUrl` | `string` |  ✅ | — | Full callback URL registered in D iscord Portal |
| `scopes` | `DiscordScope[]`  | ❌ | `['identify']` | OAuth2 scopes |
| ` prompt` | `'consent' \| 'none'` | ❌ | — |  Discord OAuth2 prompt parameter |
| `storage ` | `UserStorage` | ❌ | — | User persiste nce (enables roles, refresh) |
| `meRoute` |  `string` | ❌ | `/auth/me` | Me endpoint pat h |
| `redirectUri` | `string` | ❌ | `DISCO RD_REDIRECT_URI` env → `{prefix}/callback`  | Override callback URL |
| `disablePKCE` | ` boolean` | ❌ | `false` | Disable PKCE (S256 ) |
| `publicPaths` | `string[]` | ❌ | `['/ ', '/auth/*', '/api/auth/*']` | Paths bypassi ng middleware auth |
| `loginUrl` | `string`  | ❌ | `/auth/discord` | Login redirect URL  for middleware |
| `stateSecret` | `string` |  ❌ | derived from `secret` via HKDF | Separ ate secret for state HMAC (default: derived f rom `secret`) |
| `autoRefresh` | `Partial<Au toRefreshConfig>` | ❌ | `{ enabled: true, r efreshBeforeExpiryMs: 5min }` | Auto-refresh  Discord tokens before expiry |
| `bruteForce`  | `Partial<BruteForceConfig>` | ❌ | `{ ena bled: true, maxAttempts: 5, windowMs: 15min,  blockDurationMs: 30min }` | Brute force prote ction on login/callback |
| `mfa` | `Partial< DiscordMfaConfig>` | ❌ | `{ enabled: false  }` | MFA requirement for Discord login |
| `g uildRoleSync` | `Partial<GuildRoleSyncConfig> ` | ❌ | `{ enabled: false }` | Auto-sync Di scord guild roles to JWT |
| `csrf` | `Partia l<CsrfConfig>` | ❌ | `{ enabled: true, sess ionBinding: true, userAgentBinding: true }` |  CSRF protection settings |
| `callbacks` | ` Callbacks` | ❌ | — | Custom callbacks for  onSuccess, onError, onTokenRefresh |
| `sess ion` | `SessionConfig` | ❌ | `{ secure: NOD E_ENV === 'production', sameSite: 'lax', http Only: true, path: '/' }` | Session cookie con figuration |

### Returns

| Export | Type |  Description |
|--------|------|-------------| 
| `handleLogin` | `(Request) => Promise<Resp onse>` | Redirects to Discord OAuth2 consent  |
| `handleCallback` | `(Request) => Promise< Response>` | Exchanges code, sets session coo kie |
| `handleLogout` | `(Request) => Promis e<Response>` | Clears cookie, revokes token i f storage |
| `handleMe` | `(Request) => Prom ise<Response>` | Returns current user (requir es storage) |
| `middleware` | `(Request) =>  Promise<Response \| undefined>` | Edge/Next.j s middleware |
| `getSession` | `(Request) =>  Promise<SessionData \| null>` | Extract sess ion from request |
| `withAuth` | Higher-orde r function | Protect route handlers (requires  auth) |
| `withOptionalAuth` | Higher-order  function | Protect route handlers (optional a uth) |
| `withRole` | Higher-order function |  Protect route handlers (requires specific ro les) |
| `dispose` | `() => Promise<void>` |  Cleans up resources (state store, timers). Op tional, only available when state store is co nfigured |

### Route Handlers (Next.js)

``` ts
// app/auth/discord/route.ts
import { hand leLogin } from '@/lib/auth'
export const GET  = handleLogin

// app/auth/discord/callback/r oute.ts
import { handleCallback } from '@/lib /auth'
export const GET = handleCallback

//  app/auth/discord/logout/route.ts
import { han dleLogout } from '@/lib/auth'
export const PO ST = handleLogout

// app/api/me/route.ts
imp ort { handleMe } from '@/lib/auth'
export con st GET = handleMe
```

### With User Storage
 
```ts
import { discord } from '@hallaxius/au th'
import { drizzleStorage } from './storage '

export const { handleLogin, handleCallback , handleLogout, handleMe } = await discord({
   clientId: process.env.DISCORD_CLIENT_ID!,
   clientSecret: process.env.DISCORD_CLIENT_SEC RET!,
  secret: process.env.JWT_SECRET!,
  ca llbackUrl: process.env.DISCORD_REDIRECT_URI!, 
  scopes: ['identify', 'email', 'guilds', 'g uilds.join'],
  storage: drizzleStorage,
})
` ``

When `storage` is provided:
- Users are p ersisted on first login and updated on return 
- `/me` endpoint returns `SafeStoredUser` (n o tokens)
- Roles are embedded in JWT and che cked by middleware
- Discord tokens are auto- refreshed before expiry

---

## Credentials  Auth

### Factory: `credentials(config)`

Cre ates a credentials (username/password or emai l/password) handler with register, login, log out, and `/me` endpoints.

```ts
import { cre dentials, AuthStrategy } from '@hallaxius/aut h'
import { drizzleStorage } from './storage' 
import { bcryptHasher } from './hasher'

con st { handleRegister, handleLogin, handleLogou t, handleMe, getSession, withAuth } = credent ials({
  strategy: AuthStrategy.UsernameEmail ,
  session: { secret: process.env.JWT_SECRET !, expiresIn: '7d' },
  storage: drizzleStora ge,
  hasher: bcryptHasher,
  bruteForce: { m axAttempts: 5, windowMs: 15 * 60 * 1000 },
   cookiePath: '/',
  httpOnly: true,
  secure:  false,
  sameSite: 'lax',
})
```

### AuthStr ategy Enum

```ts
enum AuthStrategy {
  Usern ameOnly = 'username-only',    // Registration : username, password | Login: username, passw ord
  EmailOnly = 'email-only',          // R egistration: email, password | Login: email,  password
  UsernameEmail = 'username-email',   // Registration: username, email, password |  Login: username OR email + password
}
```

# ## Config Options

| Option | Type | Required  | Default | Description |
|--------|------|- ---------|---------|-------------|
| `strateg y` | `AuthStrategy` | ✅ | — | Authenticat ion strategy |
| `session.secret` | `string`  | ✅ | — | JWT signing secret (min 32 char s) |
| `session.expiresIn` | `string \| numbe r` | ❌ | `'7d'` | Session expiration |
| `s ession.cookieName` | `string` | ❌ | `'crede ntials-session'` | Session cookie name |
| `s torage` | `AuthUserStorage` | ✅ | — | Use r persistence (required) |
| `hasher` | `Pass wordHasher` | ✅ | — | Password hasher (bc rypt/argon2) |
| `bruteForce` | `Partial<Brut eForceConfig>` | ❌ | `{ enabled: true, maxA ttempts: 5, windowMs: 15min, blockDurationMs:  30min }` | Brute force protection |
| `cooki ePath` | `string` | ❌ | `'/'` | Cookie path  |
| `httpOnly` | `boolean` | ❌ | `true` |  HttpOnly cookie flag |
| `secure` | `boolean`  | ❌ | `NODE_ENV === 'production'` | Secure  cookie flag |
| `sameSite` | `'lax' \| 'stri ct' \| 'none'` | ❌ | `'lax'` | SameSite coo kie policy |
| `defaultRoles` | `string[]` |  ❌ | `['user']` | Default roles assigned to  new users |
| `minPasswordLength` | `number`  | ❌ | `8` | Minimum password length for reg istration |

### Returns

| Export | Type | D escription |
|--------|------|-------------|
 | `handleRegister` | `(Request) => Promise<Re sponse>` | Registers new user (expects JSON:  username, email?, password) |
| `handleLogin`  | `(Request) => Promise<Response>` | Validat es credentials, sets session cookie |
| `hand leLogout` | `(Request) => Promise<Response>`  | Clears session cookie |
| `handleMe` | `(Re quest) => Promise<Response>` | Returns curren t user |
| `getSession` | `(Request) => Promi se<AuthUser \| null>` | Extract and verify cr edentials session |
| `withAuth` | Higher-ord er function | Protect route handlers |

### R oute Handlers (Next.js)

```ts
// app/api/aut h/register/route.ts
import { handleRegister }  from '@/lib/auth'
export const POST = handle Register

// app/api/auth/login/route.ts
impo rt { handleLogin } from '@/lib/auth'
export c onst POST = handleLogin

// app/api/auth/logo ut/route.ts
import { handleLogout } from '@/l ib/auth'
export const POST = handleLogout

//  app/api/auth/me/route.ts
import { handleMe }  from '@/lib/auth'
export const GET = handleM e
```

### Password Hasher

```ts
// lib/hash er.ts
import type { PasswordHasher } from '@h allaxius/auth'
import bcrypt from 'bcrypt'

e xport const bcryptHasher: PasswordHasher = {
   async hash(password: string) {
    return b crypt.hash(password, 12)
  },
  async verify( password: string, hash: string) {
    return  bcrypt.compare(password, hash)
  },
}
```

## # Credentials Storage

```ts
// lib/storage.t s
import type { AuthUserStorage, CreateCreden tialsUserData, AuthUser } from '@hallaxius/au th'

export const drizzleStorage: AuthUserSto rage = {
  async findByUsername(username: str ing) { /* return AuthUser \| null */ },
  asy nc findByEmail(email: string) { /* return Aut hUser \| null */ },
  async findById(id: stri ng) { /* return AuthUser \| null */ },
  asyn c create(data: Omit<AuthUser, 'id' | 'created At' | 'updatedAt'>) { /* return AuthUser */ } ,
  async update(userId: string, data: Partia l<AuthUser>) { /* return AuthUser */ },
  asy nc delete(userId: string) { /* void */ },
}
` ``

---

## Middleware / Proxy

### Middlewar e / Proxy

All edge/Next.js middleware functi ons grouped under a single namespace. The `pr oxy` export is an alias for `middleware` - bo th work identically.

```ts
import { middlewa re } from '@hallaxius/auth'
// or
import { pr oxy } from '@hallaxius/auth' // alias for mid dleware

// Auth middleware
const auth = midd leware.auth({
  secret: process.env.JWT_SECRE T!,
  loginUrl: '/auth/discord',
  publicPath s: ['/', '/auth/*', '/api/public/*'],
  cooki eName: 'discord-auth-session',
})

// Role mi ddleware
const role = middleware.role({
  sec ret: process.env.JWT_SECRET!,
  loginUrl: '/a uth/discord',
  roles: { '/admin/*': ['admin' ], '/mod/*': ['admin', 'moderator'] },
  cook ieName: 'discord-auth-session',
})

// Combin e multiple middlewares
export default middlew are.combine(auth, role)
```

### `middleware. auth(config)`

Protects routes by requiring v alid authentication.

```ts
middleware.auth({ 
  secret: string,                    // JWT  secret (required)
  loginUrl: string,                   // Redirect URL for unauthenticated  (default: '/auth/discord')
  publicPaths: st ring[],             // Paths that bypass auth  (wildcard * supported)
  cookieName?: string ,               // Session cookie name (legac y)
  cookies?: Array<{ name: string; secret:  string }>, // Multi-provider cookie configs
} )
```

Returns: `(Request) => Promise<Respons e | undefined>`
- `Response` (302) → Redire ct to login with `?redirect=...`
- `undefined ` → Allow request through

**Multi-provider  support:** Use `cookies` array to support mu ltiple auth providers:

```ts
middleware.auth ({
  cookies: [
    { name: 'discord-auth-ses sion', secret: process.env.JWT_SECRET! },
     { name: 'credentials-session', secret: proce ss.env.JWT_SECRET! },
  ],
  publicPaths: ['/ ', '/auth/*'],
})
```

### `middleware.role(c onfig)`

Protects routes by requiring specifi c roles.

```ts
middleware.role({
  secret: s tring,                    // JWT secret (requ ired)
  loginUrl: string,                  //  Redirect URL for unauthenticated (default: ' /auth/discord')
  roles: Record<string, strin g[]>,   // Path pattern → required roles (r equired)
  cookieName: string,                 // Session cookie name (default: 'discord-au th-session')
})
```

Returns: `(Request) => P romise<Response | undefined>`
- `Response` (3 02) → Redirect to login
- `Response` (403)  → Forbidden (JSON: `{ error: 'Insufficient  permissions' }`)
- `undefined` → Allow requ est through

**Important:** Roles must be emb edded in the JWT token. This happens automati cally when `storage` is configured and the us er logs in through the callback.

### `middle ware.combine(...middlewares)`

Composes multi ple middlewares into one. Executes in order;  stops at first `Response`.

```ts
export defa ult middleware.combine(
  middleware.auth({ s ecret: '...', publicPaths: ['/'] }),
  middle ware.role({ secret: '...', roles: { '/admin/* ': ['admin'] } }),
)
```

### `middleware.ses sion(request, config)`

Extracts session from  any Request. Works in middleware, route hand lers, or server components.

```ts
import { m iddleware } from '@hallaxius/auth'

const use r = await middleware.session(request, {
  sec ret: process.env.JWT_SECRET!,
  cookieName: ' discord-auth-session',
})

if (user) {
  cons ole.log(user.discordId, user.username, user.r oles)
}
```

Returns: `Promise<SessionData |  null>`

### `middleware.publicPath(path, patt erns)`

Checks if a path matches any public p ath pattern.

```ts
import { middleware } fro m '@hallaxius/auth'

middleware.publicPath('/ auth/login', ['/auth/*'])   // true
middlewar e.publicPath('/dashboard', ['/auth/*'])     / / false
```

### `middleware.required(path, r oleMap)`

Returns the required roles for a pa th pattern.

```ts
import { middleware } from  '@hallaxius/auth'

middleware.required('/adm in/users', { '/admin/*': ['admin'] })  // ['a dmin']
middleware.required('/dashboard', { '/ admin/*': ['admin'] })     // null
```

### ` middleware.redirect(url)`

Creates a **302 Re sponse** with the given `Location` header. On ly relative URLs allowed (must start with `/` ).

```ts
return middleware.redirect('/auth/d iscord')
// Response { status: 302, headers:  { Location: '/auth/discord' } }
```

### `mid dleware.deny(message?)`

Creates a **403 Resp onse** with JSON body.

```ts
return middlewa re.deny('Access denied')
// Response { status : 403, body: { error: 'Access denied' } }
``` 

### Path Pattern Matching

Patterns support  `*` wildcard:

| Pattern | Matches |
|------ ---|---------|
| `/auth/*` | `/auth`, `/auth/ login`, `/auth/discord/callback` |
| `/admin/ *` | `/admin`, `/admin/users`, `/admin/settin gs` |
| `/api/public/*` | `/api/public`, `/ap i/public/data` |
| `/dashboard` | `/dashboard ` (exact match only) |

---

## Password Rese t

### Factory: `passwordReset(config)`

Crea tes handlers for forgot-password and reset-pa ssword flows.

```ts
import { passwordReset }  from '@hallaxius/auth'

export const { handl eForgotPassword, handleResetPassword, request Reset, consumeResetToken } = passwordReset({
   storage: myResetStorage,
  notifier: myNoti fier,
  hasher: bcryptHasher,
  minPasswordLe ngth: 8,
  tokenExpirationSeconds: 3600,
  fo rgotPasswordRateLimit: { maxAttempts: 3, wind owMs: 60 * 60 * 1000 },
  resetPasswordRateLi mit: { maxAttempts: 10, windowMs: 15 * 60 * 1 000 },
})
```

### Config Options

| Option |  Type | Required | Default | Description |
|- -------|------|----------|---------|--------- ----|
| `storage` | `ResetTokenStorage` | ✅  | — | Token persistence (create, consume,  delete) |
| `notifier` | `ResetNotifier` | � � | — | Sends reset link to user (email, SM S, etc.) |
| `hasher` | `PasswordHasher` | � � | — | Password hashing (bcrypt, argon2) | 
| `minPasswordLength` | `number` | ❌ | `8`  | Minimum new password length |
| `tokenExpi rationSeconds` | `number` | ❌ | `3600` | Re set token TTL (1 hour) |
| `forgotPasswordRat eLimit` | `{ maxAttempts, windowMs }` | ❌ |  `{ 3, 1h }` | Rate limit for forgot-password  |
| `resetPasswordRateLimit` | `{ maxAttempt s, windowMs }` | ❌ | `{ 10, 15m }` | Rate l imit for reset-password |
| `onPasswordReset`  | `(userId: string, newPasswordHash: string)  => Promise<void>` | ❌ | — | Callback aft er successful password reset |
| `userLookup`  | `(emailOrUsername: string) => Promise<{use rId, email, username} \| null>` | ❌ | — |  Custom user lookup function (overrides stora ge) |

### Returns

| Export | Type | Descrip tion |
|--------|------|-------------|
| `han dleForgotPassword` | `(Request) => Promise<Re sponse>` | POST `{ emailOrUsername }` → gen erates token, stores, notifies |
| `handleRes etPassword` | `(Request) => Promise<Response> ` | POST `{ token, newPassword }` → consume s token, updates password |
| `requestReset`  | `(target: string) => Promise<RequestResetRe sult>` | Non-HTTP helper: lookup user, genera te token, notify |
| `consumeResetToken` | `( token: string) => Promise<ConsumeResetTokenRe sult>` | Non-HTTP helper: verify token, retur n user info |

### Route Handlers (Next.js)

 ```ts
// app/api/auth/forgot-password/route.t s
import { handleForgotPassword } from '@/lib /auth'
export const POST = handleForgotPasswo rd
```

```ts
// app/api/auth/reset-password/ route.ts
import { handleResetPassword } from  '@/lib/auth'
export const POST = handleResetP assword
```

### Storage Interface

```ts
imp ort type { ResetTokenStorage } from '@hallaxi us/auth'

export const myResetStorage: ResetT okenStorage = {
  async create(token, userId)  { /* store selector, validatorHash, expiry,  userId */ },
  async consume(token) { /* veri fy hash, check expiry, delete, return { userI d, email, username } */ },
  async delete(tok en) { /* remove token */ },
}
```

### Notifi er Interface

```ts
import type { ResetNotifi er } from '@hallaxius/auth'

export const myN otifier: ResetNotifier = {
  async send(token , userId, email, username) {
    // Send emai l with reset link: `${process.env.APP_URL}/au th/reset-password?token=${token.selector}.${t oken.validator}`
  },
}
```

### Error Codes
 
- `RESET_TOKEN_EXPIRED` — Token has expire d
- `RESET_TOKEN_INVALID` — Token is invali d or malformed
- `RESET_TOKEN_USED` — Token  has already been consumed (alias: `RESET_TOK EN_CONSUMED`)
- `RESET_PASSWORD_WEAK` — New  password doesn't meet minimum length

---

# # MFA (TOTP + Backup Codes)

### Factory: `mf a(config)`

Creates handlers for TOTP setup,  verification, challenge (during login), and d isable.

```ts
import { mfa } from '@hallaxiu s/auth'

export const { handleMfaSetup, handl eMfaVerify, handleMfaChallenge, handleMfaDisa ble } = mfa({
  storage: myMfaStorage,
  secr et: process.env.JWT_SECRET!,
  issuer: 'MyApp ',
  allowedMethods: ['totp', 'backup_codes'] ,
})
```

### Config Options

| Option | Type  | Required | Default | Description |
|------ --|------|----------|---------|-------------| 
| `storage` | `MfaStorage` | ✅ | — | Enc rypted secret + backup codes persistence |
|  `secret` | `string` | ✅ | — | Encryption  key (AES-GCM-256, min 32 chars) |
| `issuer`  | `string` | ❌ | `'MyApp'` | TOTP URI issue r (shown in authenticator apps) |
| `allowedM ethods` | `('totp' \| 'backup_codes')[]` | � � | `['totp', 'backup_codes']` | Enabled MFA  methods |
| `verifyPassword` | `(userId: stri ng, password: string) => Promise<boolean>` |  ❌ | — | Password verification for MFA dis able (required for handleMfaDisable) |

### R eturns

| Export | Type | Description |
|---- ----|------|-------------|
| `handleMfaSetup`  | `(Request) => Promise<Response>` | POST (r equires session) → generates secret + JWT " pending-setup" (10 min), returns `TotpSetupRe sult` (secret, QR URI, backup codes) |
| `han dleMfaVerify` | `(Request) => Promise<Respons e>` | POST `{ code }` → verifies TOTP again st temp secret, persists encrypted secret + g enerates backup codes (once) |
| `handleMfaCh allenge` | `(Request) => Promise<Response>` |  POST `{ userId, method, code }` → used dur ing login when `mfa.requireMfa=true` |
| `han dleMfaDisable` | `(Request) => Promise<Respon se>` | POST `{ userId, password }` → verifi es password, removes secret + backup codes |
 | `setup` | `(userId: string) => Promise<Totp SetupResult>` | Generates TOTP secret and QR  URI (internal, non-HTTP) |
| `verify` | `(use rId: string, code: string) => Promise<MfaVeri fyResult>` | Verifies TOTP code and persists  secret (internal, non-HTTP) |
| `challenge` |  `(userId: string, method: MfaMethod, code: s tring) => Promise<MfaChallengeResult>` | Veri fies MFA during login challenge (internal, no n-HTTP) |
| `isEnabled` | `(userId: string) = > Promise<boolean>` | Checks if MFA is enable d for user (internal, non-HTTP) |
| `disable`  | `(userId: string) => Promise<void>` | Disa bles MFA for user (internal, non-HTTP) |
| `g enerateTotpUri` | `(userId: string, secret: s tring) => string` | Generates TOTP URI for QR  code (internal, non-HTTP) |
| `verifyBackupC ode` | `(userId: string, code: string) => Pro mise<boolean>` | Verifies backup code without  consuming (internal, non-HTTP) |

### Route  Handlers (Next.js)

```ts
// app/api/auth/mfa /setup/route.ts
import { handleMfaSetup } fro m '@/lib/auth'
export const POST = handleMfaS etup
```

```ts
// app/api/auth/mfa/verify/ro ute.ts
import { handleMfaVerify } from '@/lib /auth'
export const POST = handleMfaVerify
`` `

```ts
// app/api/auth/mfa/challenge/route. ts
import { handleMfaChallenge } from '@/lib/ auth'
export const POST = handleMfaChallenge
 ```

```ts
// app/api/auth/mfa/disable/route. ts
import { handleMfaDisable } from '@/lib/au th'
export const POST = handleMfaDisable
```
 
### Storage Interface

```ts
import type { M faStorage } from '@hallaxius/auth'

export co nst myMfaStorage: MfaStorage = {
  async getS ecret(userId) { /* return decrypted TOTP secr et or null */ },
  async setSecret(userId, en cryptedSecret) { /* store encrypted secret */  },
  async deleteSecret(userId) { /* remove  secret */ },
  async getBackupCodes(userId) {  /* return hashed backup codes */ },
  async  setBackupCodes(userId, hashedCodes) { /* stor e hashed backup codes */ },
  async consumeBa ckupCode(userId, codeIndex) { /* mark backup  code as used */ },
}
```

### Error Codes

-  `MFA_REQUIRED` — MFA required during login
 - `MFA_SETUP_REQUIRED` — MFA setup is requi red before verifying
- `MFA_INVALID_CODE` —  Invalid TOTP or backup code
- `MFA_INVALID_B ACKUP` — Invalid backup code
- `MFA_NOT_SET UP` — MFA not set up for user
- `MFA_ALREAD Y_SETUP` — MFA already set up
- `MFA_BACKUP _EXHAUSTED` — All backup codes used

---

# # Rate Limiting

### Factory: `rateLimit(conf ig)`

Creates a middleware factory for rate-l imiting your own routes with RFC-compliant he aders.

```ts
import { rateLimit } from '@hal laxius/auth'

export const { middleware: rate LimitMiddleware, check } = rateLimit({
  maxR equests: 100,
  windowMs: 60_000,
  keyBy: (r equest) => `${request.url}:${getClientIP(requ est)}`,
})
```

### Config Options

| Option  | Type | Required | Default | Description |
| --------|------|----------|---------|-------- -----|
| `maxRequests` | `number` | ✅ | —  | Max requests per window |
| `windowMs` | ` number` | ✅ | — | Time window in millisec onds |
| `keyBy` | `(Request) => string` | � � | IP-based | Custom key function |
| `stora ge` | `RateLimitStorage` | ❌ | InMemory | C ustom storage interface |

### Returns

| Exp ort | Type | Description |
|--------|------|- ------------|
| `middleware` | `(Request) =>  Promise<Response \| undefined>` | Rate limit  middleware (returns 429 with headers if excee ded) |
| `check` | `(Request) => Promise<Rate LimitResult>` | Manual check without middlewa re |
| `reset` | `(Request) => Promise<void>`  | Reset rate limit counter for a request |

 ### Headers (RFC 6585 / 8683)

On every respo nse:
- `RateLimit` — `limit=100, remaining= 99, reset=60`
- `RateLimit-Policy` — `100;w =60`
- `Retry-After` — seconds until window  resets (on 429)

### Storage Interface

```t s
import type { RateLimitStorage } from '@hal laxius/auth'

export const myRateLimitStorage : RateLimitStorage = {
  async increment(key,  windowMs) { /* return { count, resetAt } */  },
  async reset(key) { /* clear key */ },
}
 ```

### Built-in Integration (Optional)

Whe n `config.rateLimit` is provided, factories a utomatically apply rate limiting:

```ts
// c redentials()
credentials({
  // ...other conf ig
  rateLimit: { handleLogin: { maxRequests:  10, windowMs: 60_000 } },
})

// discord()
d iscord({
  // ...other config
  rateLimit: {  handleLogin: { maxRequests: 5, windowMs: 60_0 00 }, handleCallback: { maxRequests: 30, wind owMs: 60_000 } },
})

// passwordReset()
pass wordReset({
  // ...other config
  rateLimit:  { handleForgotPassword: { maxRequests: 5, wi ndowMs: 60_000 } },
})
```

### Error Codes

 - `RATE_LIMITED` — General rate limit excee ded
- `RATE_LIMITED_ROUTE` — Specific route  rate limit exceeded (used for custom routes) 

**Note:** `RATE_LIMITED` is used for genera l rate limiting, while `RATE_LIMITED_ROUTE` i s used for custom route-specific limits.

--- 

## Config Utilities

```ts
import { config  } from '@hallaxius/auth'

// Process config w ith defaults
const internalConfig = await con fig.processConfig(userConfig)

// PKCE utilit ies
const { verifier, challenge } = await con fig.pkce.create()
```

For advanced configura tion, see [Config Guide](docs/config.md).

-- -

## Utils

### Object: `utils`

Utility fun ctions for secrets, validation, guild operati ons, and session revocation.

```ts
import {  utils } from '@hallaxius/auth'
```

### `util s.secret(length?)`

Generates a cryptographic ally secure, URL-safe random string using Web  Crypto API.

```ts
const secret = utils.secr et(32) // e.g. "xK8...base64url..."
```

| Pa ram | Type | Default | Description |
|------- |------|---------|-------------|
| `length` |  `number` | `32` | Number of random bytes (ou tput is base64url encoded) |

### `utils.vali date(config)`

Validates Discord OAuth2 confi g for common errors. Throws `ConfigurationErr or` on invalid fields.

```ts
import { utils,  errors } from '@hallaxius/auth'

try {
  uti ls.validate({ clientId: '', clientSecret: ''  })
} catch (e) {
  if (e instanceof errors.Au thError) {
    console.error(e.message)
  }
} 
```

### Password Hashing Utilities

```ts
i mport { utils } from '@hallaxius/auth'

// Cr eate a password hasher
const hasher = utils.c reatePasswordHasher('bcrypt') // or 'pbkdf2',  'argon2'

// Hash a password
const hash = aw ait hasher.hash('SecurePassword123!')

// Ver ify a password
const isValid = await hasher.v erify('SecurePassword123!', hash)

// Benchma rk hasher performance
const stats = await uti ls.benchmarkPasswordHasher(hasher)
console.lo g(`Hash: ${stats.hashTimeMs}ms, Verify: ${sta ts.verifyTimeMs}ms`)
```

### Constant-Time C omparison

```ts
import { utils } from '@hall axius/auth'

// Compare strings (prevents tim ing attacks)
const match = utils.constantTime CompareStrings('abc', 'abc') // true

// Comp are byte arrays
const bytesMatch = utils.cons tantTimeCompare(new Uint8Array([1,2,3]), new  Uint8Array([1,2,3])) // true

// Compare hex  strings
const hexMatch = utils.constantTimeCo mpareHex('a1b2c3', 'a1b2c3') // true
```

###  IP Utilities

```ts
import { utils } from '@ hallaxius/auth'

// Check if IP is IPv6
const  isV6 = utils.isIPv6('2001:db8::1') // true

 // Mask IPv6 to /64 (for privacy in logs)
con st masked = utils.maskIPv6To64('2001:db8:1234 :5678:abcd:ef01:2345:6789')
// Returns: '2001 :db8:1234:5678::'

// Sanitize IP (remove bra ckets, normalize)
const clean = utils.sanitiz eIP('[2001:db8::1]') // '2001:db8::1'
```

## # `utils.guild`

Guild (Discord server) opera tions.

```ts
import { utils } from '@hallaxi us/auth'

// Add user to guild
await utils.gu ild.join({
  guildId: 'guild-id',
  userId: ' user-id',
  accessToken: 'user-token',
  botT oken: process.env.DISCORD_BOT_TOKEN!,
})

//  Check if user has role
const isAdmin = await  utils.guild.hasRole(
  'user-id', 'guild-id',  'admin-role-id',
  process.env.DISCORD_BOT_T OKEN!
)

// Sync roles
const roles = await ut ils.guild.sync(
  'discord-id', 'guild-id',
   process.env.DISCORD_BOT_TOKEN!,
  storage
)
 ```

For advanced guild operations, see [Guil d Guide](docs/guild.md).

---

## Error Handl ing

### Exports

```ts
import { errors } fro m '@hallaxius/auth'
// or
import { AuthError,  ErrorCodes, isAuthError, getCode } from '@ha llaxius/auth'
```

### `AuthError` (Base Clas s)

All auth errors extend `AuthError` (exten ds `Error`) with a machine-readable `code`.

 ```ts
class AuthError extends Error {
  const ructor(
    code: string,
    message: string ,
    options?: { cause?: Error; statusCode?:  number; retryAfter?: number },
  )
}
```

Pr operties:
- `code: string` — Stable error c ode
- `statusCode?: number` — HTTP status c ode (default 500)
- `retryAfter?: number` —  Seconds until retry for rate-limited errors
 - `cause?: Error` — Original error

### `Er rorCodes`

Stable error codes for programmati c handling.

```ts
const ErrorCodes = {
  //  Configuration
  CONFIGURATION_ERROR: 'CONFIGU RATION_ERROR',

  // CSRF / State
  INVALID_S TATE: 'INVALID_STATE',
  EXPIRED_STATE: 'EXPI RED_STATE',
  STATE_REUSED: 'STATE_REUSED',
   STATE_BINDING_FAILED: 'STATE_BINDING_FAILED' ,

// PKCE
  PKCE_VALIDATION_FAILED: 'PKCE_VA LIDATION_FAILED',
  INVALID_CODE_VERIFIER: 'I NVALID_CODE_VERIFIER',

  // OAuth2 Flow
  IN VALID_CODE: 'INVALID_CODE',
  INVALID_GRANT:  'INVALID_GRANT',
  TOKEN_EXCHANGE_FAILED: 'TO KEN_EXCHANGE_FAILED',

// Tokens
  INVALID_TO KEN: 'INVALID_TOKEN',
  TOKEN_EXPIRED: 'TOKEN _EXPIRED',
  TOKEN_REFRESH_FAILED: 'TOKEN_REF RESH_FAILED',
  TOKEN_REVOKED: 'TOKEN_REVOKED ',
  INTERACTION_REQUIRED: 'INTERACTION_REQUI RED',

  // MFA
  MFA_REQUIRED: 'MFA_REQUIRED ',
  MFA_SETUP_REQUIRED: 'MFA_SETUP_REQUIRED' ,
  MFA_INVALID_CODE: 'MFA_INVALID_CODE',
  M FA_INVALID_BACKUP: 'MFA_INVALID_BACKUP',
  MF A_BACKUP_EXHAUSTED: 'MFA_BACKUP_EXHAUSTED',
   MFA_NOT_SETUP: 'MFA_NOT_SETUP',
  MFA_ALREAD Y_SETUP: 'MFA_ALREADY_SETUP',
  MFA_CHALLENGE _FAILED: 'MFA_CHALLENGE_FAILED',

  // Passwo rd Reset
  RESET_TOKEN_EXPIRED: 'RESET_TOKEN_ EXPIRED',
  RESET_TOKEN_INVALID: 'RESET_TOKEN _INVALID',
  RESET_TOKEN_USED: 'RESET_TOKEN_U SED',
  RESET_TOKEN_CONSUMED: 'RESET_TOKEN_CO NSUMED',
  RESET_PASSWORD_WEAK: 'RESET_PASSWO RD_WEAK',

  // Rate Limiting
  RATE_LIMITED:  'RATE_LIMITED',
  RATE_LIMITED_ROUTE: 'RATE_ LIMITED_ROUTE',

  // Upstream / Network
  UP STREAM_ERROR: 'UPSTREAM_ERROR',
  NETWORK_ERR OR: 'NETWORK_ERROR',

  // Storage
  STORAGE_ READ_ERROR: 'STORAGE_READ_ERROR',
  STORAGE_W RITE_ERROR: 'STORAGE_WRITE_ERROR',
  STORAGE_ UNAVAILABLE: 'STORAGE_UNAVAILABLE',

  // Cre dentials
  USERNAME_TAKEN: 'USERNAME_TAKEN',
   EMAIL_TAKEN: 'EMAIL_TAKEN',
  INVALID_CREDE NTIALS: 'INVALID_CREDENTIALS',
  USER_NOT_FOU ND: 'USER_NOT_FOUND',
  CREDENTIALS_VALIDATIO N_ERROR: 'CREDENTIALS_VALIDATION_ERROR',

  / / Guild
  GUILD_JOIN_ERROR: 'GUILD_JOIN_ERROR ',
  GUILD_SYNC_ERROR: 'GUILD_SYNC_ERROR',

   // Brute Force
  BRUTE_FORCE_BLOCKED: 'BRUTE _FORCE_BLOCKED',
} as const
```

### `isAuthE rror(error)`

Type guard for `AuthError` hier archy.

```ts
import { errors } from '@hallax ius/auth'

try {
  await handleCallback(reque st)
} catch (e) {
  if (errors.isAuthError(e) ) {
    console.log(e.code, e.statusCode, e.r etryAfter)
  }
}
```

### `getCode(error)`

E xtracts error code string from any error.

`` `ts
import { errors } from '@hallaxius/auth'
 
const code = errors.getCode(e) // 'TOKEN_EXP IRED' | undefined
```

### Handling Errors in  Callbacks

```ts
import { discord, errors }  from '@hallaxius/auth'

const { handleCallbac k } = await discord({ /* config */ })

export  async function GET(request: Request) {
  try  {
    return await handleCallback(request)
   } catch (e) {
    if (errors.isAuthError(e))  {
      switch (e.code) {
        case error s.ErrorCodes.STATE_REUSED:
        case error s.ErrorCodes.STATE_BINDING_FAILED:
        ca se errors.ErrorCodes.INVALID_STATE:
           return Response.redirect(new URL('/login?err or=invalid_session', request.url))
        ca se errors.ErrorCodes.PKCE_VALIDATION_FAILED:
           return Response.redirect(new URL('/ login?error=pkce_failed', request.url))
         case errors.ErrorCodes.MFA_REQUIRED:
           return Response.redirect(new URL('/mfa-r equired', request.url))
        case errors.E rrorCodes.TOKEN_EXCHANGE_FAILED:
        case  errors.ErrorCodes.INVALID_GRANT:
          r eturn Response.redirect(new URL('/login?error =auth_failed', request.url))
        case err ors.ErrorCodes.RATE_LIMITED:
          return  Response.redirect(new URL(`/login?retry_afte r=${e.retryAfter ?? 60}`, request.url))
         case errors.ErrorCodes.TOKEN_EXPIRED:
         case errors.ErrorCodes.TOKEN_REFRESH_FAIL ED:
          return Response.redirect(new UR L('/login?error=session_expired', request.url ))
        case errors.ErrorCodes.TOKEN_REVOK ED:
          return Response.redirect(new UR L('/login?error=revoked', request.url))
         case errors.ErrorCodes.UPSTREAM_ERROR:
           return Response.redirect(new URL('/log in?error=service_unavailable', request.url))
         default:
          console.error('Aut h error:', e.code, e.message)
          retur n Response.redirect(new URL('/login?error=unk nown', request.url))
      }
    }
    throw  e
  }
}
```

---

## Types

TypeScript types  are fully documented in our [TypeDoc](https:/ /hallaxius.github.io/auth/typedoc/).

### Com monly Used Types

```ts
import type { Session Data, AuthError, DiscordConfig } from '@halla xius/auth'
```

- `SessionData` - User sessio n from JWT
- `AuthError` - Base error class w ith error codes
- `DiscordConfig` - Configura tion options
- `AuthUser` - User object from  credentials auth

For complete type definitio ns, see the [TypeDoc](https://hallaxius.githu b.io/auth/typedoc/).

---

## Troubleshooting 

### Authentication Flow Issues

#### "Inval id state parameter - possible CSRF attack"

* *Cause:** State parameter expired (5 min TTL)  or tampered with.

**Solutions:**
1. User to ok too long to authenticate — ask them to t ry again
2. Multiple tabs open — each login  generates new state
3. State not passed corr ectly — verify callback URL includes `state ` parameter

#### "Missing authorization code "

**Cause:** Discord did not return `code` p arameter.

**Solutions:**
1. User denied auth orization — check if they clicked "Cancel"
 2. Incorrect redirect URI — verify `callbac kUrl` matches Discord Portal exactly
3. Missi ng scopes — ensure at least `"identify"` sc ope

#### "Invalid authorization code"

**Cau se:** Code invalid, expired, or already used. 

**Solutions:**
1. Code already used — cod es are single-use
2. Code expired — Discord  codes expire after 10 minutes
3. PKCE mismat ch — ensure `code_verifier` matches `code_c hallenge`
4. Incorrect client secret — veri fy `clientSecret`
5. Incorrect redirect URI � �� must match the one used to generate auth U RL

### Token Issues

#### "Token has expired "

**Cause:** Access token expired and could  not be refreshed.

**Solutions:**
1. With `st orage` configured, tokens auto-refresh 5 min  before expiry
2. Without storage, tokens cann ot auto-refresh — user must log in again
3.  Refresh token expired — user must log in a gain

#### "Invalid token"

**Cause:** Access  token invalid or revoked.

**Solutions:**
1.  Token was revoked — check if `revokeToken( )` called manually or on logout
2. Token not  stored correctly — verify storage implement ation
3. User logged out elsewhere — loggin g out in one tab revokes token

### Configura tion Issues

#### "clientId and clientSecret  are required"

**Solution:** Provide both in  `discord()` config.

#### "secret is required "

**Solution:** Provide JWT secret (min 32 c hars) in factory config.

#### "storage is re quired for credentials"

**Solution:** Creden tials auth requires an `AuthUserStorage` impl ementation.

### Cookie Issues

#### "Cookie  not set"

**Solutions:**
1. `sameSite: 'none' ` requires `secure: true`
2. Development on ` http://localhost` needs `secure: false`
3. Do main mismatch — cookies only sent to domain  that set them

```ts
// Development
cookies:  { secure: false, sameSite: 'lax' }

// Produ ction
cookies: { secure: true, sameSite: 'lax ' }
```

#### "Redirect loop after login" (lo calhost/development)

**Symptom:** User authe nticates successfully, but is redirected back  to `/auth/discord?redirect=%2Fdashboard` in  a loop.

**Cause:** Cookie `Secure` flag prev ents browser from sending cookie on localhost  during development.

**Solution:** Set `secu re: false` in development:

```ts
// lib/auth .ts
export const { handleLogin, handleCallbac k, handleLogout, handleMe } = await discord({ 
  clientId: process.env.DISCORD_CLIENT_ID!,
   clientSecret: process.env.DISCORD_CLIENT_SE CRET!,
  secret: process.env.JWT_SECRET!,
  c allbackUrl: process.env.DISCORD_REDIRECT_URI! ,
  session: {
    secure: process.env.NODE_E NV === 'production',  // ← false on localho st
  },
})
```

**Note:** The package now def aults to `secure: false` in development (when  `NODE_ENV !== 'production'`), but explicit c onfiguration is recommended.

### Discord Dev eloper Portal Issues

#### "Invalid redirect  URI"

**Solution:** Go to Discord Developer P ortal → OAuth2 → Redirects. Ensure `callb ackUrl` matches **exactly** (protocol, port,  trailing slash).

#### "Invalid client ID or  client secret"

**Solution:** Copy Client ID  and Client Secret from Discord Portal → OAu th2 section. Regenerate secret if compromised .

---

## Edge Runtime

@hallaxius/auth is f ully compatible with Edge runtimes:

| Runtim e | Support | Notes |
|---------|---------|-- -----|
| Next.js Edge | ✅ Full | Default fo r middleware |
| Cloudflare Workers | ✅ Ful l | Web Crypto API required |
| Deno | ✅ Fu ll | Web Crypto API required |
| Node.js 20+  | ✅ Full | Native Web Crypto |
| Bun | ✅  Full | Recommended runtime |

### Constraints 

- Maximum 1MB bundle size (Cloudflare)
- No  `setTimeout` > 30s (some platforms)
- Web Cr ypto API required (polyfilled in Node.js)

Fo r platform-specific guides, see [Edge Guide]( docs/edge.md).

---

## License

MIT

 