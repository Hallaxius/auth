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

### Brute Force Rate Limiting

IP-based rate limiting without external dependencies:
- Configurable attempt limit & window
- Automatic IP blocking with configurable duration
- Pluggable storage (Redis for production)

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
