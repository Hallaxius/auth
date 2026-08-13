# Security Policy

> Secure authentication toolkit for Bun and Next.js 16+ with Discord OAuth2, Credentials, MFA/TOTP, password reset flows — backed by built-in CSRF protection, rate limiting, and brute-force defense.

---

## Reporting a Vulnerability

We take security seriously. If you discover a vulnerability, please report it responsibly.

### How to Report

**DO NOT** create public GitHub issues for security vulnerabilities.

**Email:** support@hallaxi.us

Include:
- Type of vulnerability
- Full paths of affected files
- Location (tag/branch/commit or URL)
- Step-by-step reproduction instructions
- Proof-of-concept or exploit code (if possible)
- Impact assessment

### What to Expect

- **Initial Response:** Within 48 hours
- **Status Updates:** Every 7 days during investigation
- **Resolution Timeline:** Critical vulnerabilities within 30 days
- **Disclosure:** Coordinated responsible disclosure

---

## Security Features

### Cryptographic Security

| Feature | Algorithm | Parameters |
|---------|-----------|------------|
| JWT Signing | HS256 | 256-bit key |
| Session Encryption | AES-256-GCM | HKDF-SHA256, 256-bit key, 16-byte IV |
| MFA | TOTP (RFC 6238) | SHA-256 default, 30s period, 6 digits |
| State Parameter | HMAC-SHA256 | OAuth 2.0 CSRF protection |
| Password Hashing | **User Responsibility** | Choose Argon2id (preferred), bcrypt, or scrypt |
| Captcha Verification | Siteverify API | Secret key at config-time, user IP (`remoteip`) sent for risk scoring |

### Session Management

✅ **Secure Cookie Defaults:**
- `HttpOnly` - Prevents JavaScript access
- `Secure` - HTTPS only (production)
- `SameSite` - CSRF protection (defaults to `lax` in development and `strict` in production; configurable to `none` with `secure`)
- `Path=/` - All routes

✅ **Configurable Options:**
- Session TTL: 7 days by default (sessions and refresh tokens share the same default via `DEFAULT_SESSION_TTL_SECONDS`, configurable via `session.expiresIn` / `options.maxAge`)
- Cookie name customization
- Domain/path configuration

### Input Validation & Protection

✅ **Redirect URI Validation:**
- Relative redirects only (no protocol-relative `//`, no backslashes or `%5c`)
- Absolute redirects require an explicit origin allowlist (`allowedOrigins`) and HTTPS
- Unsafe targets fall back to `/`

✅ **Request Validation:**
- Content-Type enforcement (`application/json`)
- Password presence validation
- Email format validation (when enabled)
- Username/email requirement configuration

✅ **Password Validation (Optional):**
- Minimum length (default: 8 chars)
- Maximum length (configurable)
- Character variety requirements:
  - Lowercase letters
  - Uppercase letters
  - Numbers
  - Special characters

### Rate Limiting

✅ **Built-in Protection:**
- `/me` endpoint rate limiting when `meRateLimitStorage` is configured (10 req/min per IP)
- Brute force protection on credentials login (5 attempts max, fixed 30-minute lockout)
- MFA attempt limits (5 TOTP / 10 backup codes per user per hour, 20 backup codes per IP per hour)
- Password reset rate limits (3 forgot-password requests per hour per IP, 10 reset attempts per 15 min per IP)
- Fixed-window algorithm by default (sliding-window and token-bucket algorithms available)
- Distributed rate limiting (requires Redis/KV)

✅ **RFC 6585 / 8683 Headers:**
- `RateLimit-Limit` - Maximum requests
- `RateLimit-Remaining` - Remaining requests
- `RateLimit-Reset` - Window reset timestamp
- `Retry-After` - Seconds until retry (429)

### Brute Force Protection

✅ **Automatic Protection:**
- Account lockout after 5 failed attempts
- Fixed lockout duration: 30 minutes (configurable via `blockDurationMs`) — no exponential backoff
- Keyed by IP + account identifier (credentials) / IP (Discord)
- Requires external storage for distributed deployments

### Audit & Monitoring

✅ **Security Event Logging:**
- Authentication success/failure
- MFA events
- Rate limit triggers
- Brute force attempts
- Token revocation

✅ **Timing Attack Prevention:**
- Constant-time string comparison
- Uniform error responses
- Consistent validation timing **when `dummyVerifyPassword` is configured** (`credentials({ dummyVerifyPassword })`): logins for non-existing users run the same dummy KDF cost as real users, closing the user-enumeration-by-timing channel. Without the hook, non-existing users answer faster (early return) — the default is documented behavior, and public deployments SHOULD provide the hook (see P2-B for registration enumeration).

---

## Security Configuration Requirements

### Production Requirements (Mandatory)

| Requirement | Status | Description |
|-------------|--------|-------------|
| HTTPS | ✅ Required | All redirect URIs must use HTTPS |
| Secure Cookies | ✅ Required | `Secure` flag enabled in production |
| Secret Entropy | ✅ Required | Min 32 chars, high entropy validation |
| `AUTH_SALT` (State Salt) | 🔶 Recommended | Separate secret used with HKDF-SHA256 to derive the OAuth state HMAC; optional — when unset it falls back to a derivation from the JWT secret |
| External Storage | ✅ Required | Redis/Database/KV for stateful operations |
| Password Hashing | ✅ Required | Hash with Argon2id/bcrypt in your storage layer before persisting |
| `TRUSTED_PROXY_IPS` | ✅ Required (behind proxy) | Comma-separated proxy IPs/CIDRs to trust for real-client-IP resolution when `trustProxy` is enabled |

### Recommended for Production

| Feature | Status | Description |
|---------|--------|-------------|
| Audit Logging | 🔶 Recommended | Log security events |
| Monitoring | 🔶 Recommended | Alert on suspicious activity |
| Short JWT Expiry | 🔶 Recommended | 15-30 minutes |
| MFA | 🔶 Recommended | For sensitive applications |
| Rate Limiting | 🔶 Recommended | With external storage |

---

## Known Limitations

### Current Security Limitations

1. **JWT Revocation**
   - Requires external storage (Redis/Database)
   - Tokens cannot be revoked without storage

2. **Rate Limiting**
   - Requires external storage (Redis/KV)
   - In-memory storage incompatible with serverless

3. **Password Reset**
   - Requires an external email service (implement `ResetNotifier`)
   - `passwordReset()` and its handlers are exported by default from the package root

4. **MFA**
   - Requires external storage for persistence (`MfaStorage`)
   - `mfa()` and its handlers are exported by default from the package root

### Compliance Considerations

- **Session Management:** OWASP guidelines followed
- **Password Storage:** User's responsibility (hash in storage layer)
- **OAuth 2.0:** RFC 6749 compliant
- **Data Protection:** `getPrivacySettings()` is async and reports recorded consents plus any pending data-deletion request for the user (GDPR/CCPA-style erasure flows)

---

## Security Testing

### Automated Security Tests

```bash
# Run all security tests
bun test tests/security/

# Run penetration tests
bun test tests/security/penetration-tests.test.ts

# Run CSRF protection tests
bun test tests/unit/csp.test.ts

# Run rate limiting tests
bun test tests/unit/rate-limit/

# Run integration tests (requires a previous build for the dist artifact)
bun run build && bun test tests/integration/
```

### Manual Security Testing Checklist

1. **Redirect Validation**
   - Test with malicious redirect URLs
   - Verify rejection of non-HTTPS URLs in production
   - Test path traversal attempts

2. **Rate Limiting**
   - Attempt >10 requests to `/auth/me` per minute (requires `meRateLimitStorage`)
   - Verify 429 response with Retry-After header

3. **Cookie Security**
   - Verify Secure flag in production browser dev tools
   - Verify HttpOnly flag (not accessible via JavaScript)
   - Verify SameSite (lax in development, strict in production)

4. **Secret Validation**
   - Attempt to start with weak secrets (< 32 chars)
   - Verify error is thrown

5. **Password Validation**
   - Test with weak passwords when `validatePassword` enabled
   - Verify appropriate error messages

6. **Brute Force Protection**
   - Attempt 6+ failed logins
   - Verify account lockout after 5 attempts
   - Verify 30-minute lockout duration

---

## Security Best Practices

### Deployment

1. ✅ **Always use HTTPS** in production
2. ✅ **Use external storage** (Redis, Database, KV)
3. ✅ **Keep secrets secure** - Never commit .env files
4. ✅ **Use strong secrets** - Min 256 bits entropy
5. ✅ **Enable rate limiting** with external storage
6. ✅ **Monitor logs** for suspicious activity
7. ✅ **Use MFA** for sensitive applications
8. ✅ **Implement proper password hashing** - Use Argon2id or bcrypt

### Configuration

```bash
# Required environment variables
JWT_SECRET=$(openssl rand -base64 32)  # Min 32 chars, high entropy
AUTH_SALT=$(openssl rand -base64 32)  # Different from JWT_SECRET
NEXT_PUBLIC_SITE_URL=https://your-domain.com  # Production HTTPS URL
```

### Monitoring

Monitor these security events:
- Multiple failed login attempts
- Rate limit triggers
- Token revocation requests
- MFA verification failures
- Unusual IP addresses or User-Agents

---

## Cryptographic Recommendations

### Password Hashing

**User's Responsibility** - Hash passwords in your storage layer using:

| Algorithm | Recommendation | Parameters |
|-----------|---------------|------------|
| Argon2id | ✅ Preferred | Memory: 64MB, Iterations: 3, Parallelism: 4 |
| bcrypt | ✅ Good | Cost: 12-14 |
| scrypt | ✅ Good | N: 2^14, r: 8, p: 1 |

### Cookie Security

Session cookies use:
- `Secure` flag in production (HTTPS only)
- `HttpOnly` flag (no JavaScript access)
- `SameSite` defaults to `lax` in development and `strict` in production (configurable to `none` with `secure`); `Secure` in production

### Token Security

All JWTs include:
- `jti` (unique ID) for revocation tracking
- `iss` (issuer) claim
- `exp` (expiration) claim
- `iat` (issued at) claim

✅ **Refresh Token Rotation:**
- Every refresh token use issues a new token and revokes the previous one (single-use semantics)
- Under concurrent rotation exactly one rotation wins; losing rotations return no token
- Family tracking (opt-out via `familyTracking: false`): replaying a rotated token revokes the entire token family, invalidating all descendants

✅ **Session Revocation:**
- `session()` accepts an optional `revocationStorage`; revoked `jti`s are rejected with a `null` session (e.g. after logout)

✅ **OAuth Provider Failure Handling:**
- Failed Discord token exchanges (e.g. `invalid_grant`) map to `401` and increment the brute-force counter for the caller's IP

---

## E2E Browser Testing

E2E test suite against `tests/next-app` (Next.js 16 + lib), using **Playwright + Firefox**.

### Commands

| Command | Description |
|---------|-------------|
| `bun run test:e2e:setup` | Builds lib, installs deps, installs Playwright Firefox |
| `bun run test:e2e` | Runs the full Playwright test suite |
| `bun run test:e2e:headed` | Same, with visible browser window (debug) |
| `bun run test:e2e:run` | Smart runner: builds, starts server, runs tests, tears down |

### Port

The runner uses `$env:E2E_PORT` (default `3100`). If the port is already responding, the runner reuses the existing server.

### Architecture

- `fixtures.ts` — Playwright `test` fixture extending base with `api` (fresh `APIRequestContext` per call, unique UA) and `page` fixtures
- API tests: `Api` class wrapping `APIRequestContext` (fetch-style, no UI)
- UI flows: `test_ui_flow.ts` navigates real pages via Playwright
- Rate limit `/me`: isolated `acme` namespace; `/login` not configured (shared IP)
- Magic link / SMS: fake notifiers with debug routes

### Limitations

- Real WebAuthn: requires platform authenticator (covered by unit tests + manual validation)
- Captcha: no credentials configured
- OIDC/Discord: external providers required

### User Seed

| Email | Password | Phone |
|-------|----------|-------|
| `e2e-user@example.com` | `E2E-Pass-1234!` | — |
| `alice@example.com` | `Password123!` | `+5511999990001` |
| `bob@example.com` | `Password123!` | `+5511999990002` |
| `carol@example.com` | `Password123!` | `+5511999990003` |
| `dave@example.com` | `Password123!` | — |
| `eve@example.com` | `Password123!` | `+5511999990004` |

### Test Tenancy

| Host | Tenant |
|------|--------|
| `localhost:{E2E_PORT}` | global |
| `acme.localhost:{E2E_PORT}` | `acme` (active) |
| `suspended.localhost:{E2E_PORT}` | `suspended` → 403 |
| `ghost.localhost:{E2E_PORT}` | unknown → 404 |

---

## Performance Benchmarks

> Powered by [mitata](https://github.com/evanwashere/mitata). Hardware: AMD Ryzen 5 5600, Bun 1.3.14, Windows 11.

### Commands

```bash
bun run benchmarks              # all
bun run benchmarks/auth.ts      # auth ops
bun run benchmarks/jwt.ts       # JWT
bun run benchmarks/rate-limit.ts
bun run benchmarks/mfa.ts       # MFA/TOTP
```

### Auth Operations

| Operation | Avg Time | P75 | P99 Range | Memory |
|-----------|----------|-----|-----------|--------|
| Login (valid credentials) | 98.14 µs | 94.20 µs | 56.80 µs–1.86 ms | 2.85 KB |
| Login (invalid password) | 15.64 µs | 17.20 µs | 7.20 µs–1.20 ms | 2.18 KB |
| Logout | 5.89 µs | 6.30 µs | 2.70 µs–1.15 ms | 547 B |

### JWT Operations

| Operation | Avg Time | P75 | P99 Range | Memory |
|-----------|----------|-----|-----------|--------|
| JWT Sign (HS256) | 42.45 µs | 41.90 µs | 23.00 µs–1.67 ms | 954 B |
| JWT Verify (valid) | 96.62 µs | 93.40 µs | 54.10 µs–1.96 ms | 1.96 KB |
| JWT Verify (expired) | 104.28 µs | 100.40 µs | 60.10 µs–2.29 ms | 1.33 KB |
| JWT Parse (no verify) | 37.87 µs | 38.20 µs | 20.90 µs–4.42 ms | 700 B |

### Rate Limiting

| Operation | Avg Time | P75 | P99 Range | Memory |
|-----------|----------|-----|-----------|--------|
| Check (allowed) | 11.03 µs | 12.10 µs | 5.30 µs–1.40 ms | 578 B |
| Check (different IPs) | 111.93 µs | 127.50 µs | 62.60 µs–2.04 ms | 1.75 KB |

### MFA (TOTP)

| Operation | Avg Time | P75 | P99 Range | Memory |
|-----------|----------|-----|-----------|--------|
| Setup (generate secret) | 13.68 ms | 14.42 ms | 11.35–17.24 ms | 37.42 KB |
| Verify (valid TOTP) | 27.40 ms | 28.66 ms | 24.58–30.37 ms | 24.38 KB |
| Verify (invalid TOTP) | 4.94 µs | 5.17 µs | 4.27–6.23 µs | 462 B |
| Backup codes | 83.13 µs | 91.90 µs | 44.00 µs–2.74 ms | 4.09 KB |

### Summary

- **< 100 µs:** MFA reject (4.94 µs), logout (5.89 µs), rate limit (11.03 µs), invalid login (15.64 µs), JWT sign (42.45 µs)
- **100 µs–1 ms:** valid login (98.14 µs), JWT verify (96.62–104.28 µs)
- **> 1 ms:** MFA setup (13.68 ms), valid MFA verify (27.40 ms)

---

## Vulnerability Disclosure Policy

We follow a coordinated disclosure process:

1. **Report Received** - Acknowledge within 48 hours
2. **Investigation** - Assess impact and severity
3. **Fix Development** - Develop and test patch
4. **Release** - Publish security update
5. **Disclosure** - Public advisory after 30 days

### Severity Levels

| Level | Response Time | Description |
|-------|--------------|-------------|
| Critical | 24 hours | Remote code execution, data breach |
| High | 24 hours | Authentication bypass, privilege escalation |
| Medium | 24 hours | XSS, CSRF, information disclosure |
| Low | 24 hours | Minor security improvements |

---

## Security Contact

**Email:** support@hallaxi.us  
**GitHub:** https://github.com/hallaxius/auth/issues  
**Documentation:** https://github.com/hallaxius/auth

---