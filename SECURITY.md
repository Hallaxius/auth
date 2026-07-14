# Security Policy

## Reporting Security Vulnerabilities

We take the security of **@hallaxius/auth** seriously. Please submit vulnerabilities privately via email:

📧 **security@hallabs.io**

We will acknowledge reports within **48 hours**, verify, and release fixes with coordinated disclosure.

---

## Supported Versions

| Version | Security Patch Support | End-of-Life |
|---------|------------------------|-------------|
| `>= 2.0.0` | ✅ Yes | --- |
| `>= 1.0.0 < 2.0.0` | ❌ No | 2026-06-24 |
| `< 1.0.0` | ❌ No | 2024-01-01 |

Only the **latest minor version** of each major gets security patches.

---

## Built-in Security Controls

**@hallaxius/auth** provides six security layers out of the box:

### CSRF Protection

HMAC-signed state tokens (`crypto.subtle`) with:
- One-time-use tokens (`singleUse: true`)
- Session binding (`bindToSession`)
- User-agent binding (`bindToUserAgent`)
- Configurable TTL (default: 5 minutes)

### Logout CSRF Protection

Logout endpoints are protected against cross-site request forgery:
- Session cookies use `SameSite=Lax` by default, which blocks cross-origin form submissions from triggering logout
- Logout requires a valid session cookie — unauthenticated requests are rejected
- No additional CSRF token is needed when `sameSite: "lax"` or `"strict"` is configured

> ⚠️ If you set `sameSite: "none"` (e.g., cross-origin SPAs), logout is **not** protected against CSRF. Consider using `sameSite: "lax"` or adding application-level CSRF tokens.

### Brute Force Rate Limiting

IP-based rate limiting without external dependencies:
- Configurable attempt limit & window
- Automatic IP blocking with configurable duration
- Pluggable storage (Redis for production — see [Redis Adapters](#redis-adapters))

### MFA Enforcement

Blocks OAuth callback with **403 Forbidden** if Discord user lacks 2FA:
- Checks `mfa_enabled` field in Discord user object
- Throws `MfaRequiredError` for consistent error handling

### Token Auto-Refresh

Silent preemptive token refresh within configurable threshold:
- Avoids token expiry downtime
- Graceful degradation on transient failures

### Guild Role Sync

Automatic role mapping from Discord guilds to application permissions:
- Cache with configurable TTL to respect Discord rate limits
- Bot-token-based API access (no user token exposure)

### Type-safe Routes

Generic route helpers with compile-time scope inference:
- Strongly typed OAuth2 error codes
- Config-scoped type checking

### Redirect URI Validation

The `redirectUri` is validated against explicit configuration — no header-based auto-detection:
- Prevents spoofing via `X-Forwarded-Proto` / `X-Forwarded-Host` headers
- Must be set explicitly via `config.redirectUri` or `DISCORD_REDIRECT_URI` env var

---

## Redis Adapters

For production deployments, use Redis-backed adapters instead of the default in-memory stores.

> **Peer dependency:** `ioredis >= 5.0.0` (optional)

### Installation

```bash
bun add ioredis
```

### RedisStateStore

Replaces `MemoryStateStore` for CSRF state tokens with Redis TTL-based expiration.

```ts
import Redis from "ioredis"
import { RedisStateStore } from "@hallaxius/auth/adapters/redis"

const redis = new Redis(process.env.REDIS_URL!)

const stateStore = new RedisStateStore({
  client: redis,
  prefix: "auth:state", // optional, default: "auth:state"
})

// Pass to discordAuth or auth config
discordAuth({
  // ...
  csrf: {
    storage: stateStore,
  },
})
```

**Key pattern:** `{prefix}:{id}` — e.g. `auth:state:uuid-here`
**Expiration:** Automatic via Redis TTL (matches `ttlMs` from config)

### RedisBruteForceStore

Replaces `MemoryBruteForceStorage` for rate limiting with Redis-backed persistence.

```ts
import Redis from "ioredis"
import { RedisBruteForceStore } from "@hallaxius/auth/adapters/redis"

const redis = new Redis(process.env.REDIS_URL!)

const bruteForceStore = new RedisBruteForceStore({
  client: redis,
  prefix: "auth:bf", // optional, default: "auth:bf"
})

// Pass to discordAuth or auth config
discordAuth({
  // ...
  bruteForce: {
    storage: bruteForceStore,
  },
})
```

**Key patterns:**
- `{prefix}:count:{key}` — attempt count with TTL
- `{prefix}:block:{key}` — block flag with TTL

### Why Redis?

| Feature | In-Memory | Redis |
|---------|-----------|-------|
| Persistence | ❌ Lost on restart | ✅ Survives restarts |
| Multi-instance | ❌ Per-process state | ✅ Shared across instances |
| TTL | ⚠️ Manual cleanup | ✅ Native Redis TTL |
| Serverless | ❌ Cold start issues | ✅ Persistent connection |

---

## Best Practices

### Secret Generation

```ts
import { generateSecureSecret } from "@hallaxius/auth"
const JWT_SECRET = generateSecureSecret(64)
```

Use environment variables; never commit secrets.

### Session Cookies

```ts
{
  session: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  }
}
```

### OAuth2 Scope Minimization

Request only what you need: `scopes: ["identify"]`.

### Storage

Use managed databases (PostgreSQL, Redis) in production.
In-memory storage is for development only.

---

## License

MIT — Hallabs Overflow Inc. © 2024-2026
