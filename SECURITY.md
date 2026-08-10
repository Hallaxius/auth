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
| MFA | TOTP (RFC 6238) | SHA-1, 30s period, 6 digits |
| State Parameter | HMAC-SHA256 | OAuth 2.0 CSRF protection |
| Password Hashing | **User Responsibility** | Choose Argon2id (preferred), bcrypt, or scrypt |
| Captcha Verification | Siteverify API | Secret key at config-time, user IP (`remoteip`) sent for risk scoring |

### Session Management

✅ **Secure Cookie Defaults:**
- `HttpOnly` - Prevents JavaScript access
- `Secure` - HTTPS only (production)
- `SameSite=Lax` - CSRF protection (configurable: `lax` default, `strict`, or `none` with `secure`)
- `Path=/` - All routes

✅ **Configurable Options:**
- Session TTL: 7 days for Discord OAuth sessions, 15 minutes for Credentials sessions (configurable via `session.expiresIn`)
- Cookie name customization
- Domain/path configuration

### Input Validation & Protection

✅ **Redirect URI Validation:**
- Uses `NEXT_PUBLIC_SITE_URL` for validation
- HTTPS enforcement in production
- Path traversal protection
- Subdomain validation

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
- `/me` endpoint rate limiting (10 req/min per IP)
- Brute force protection on credentials login (5 attempts max, fixed 30-minute lockout)
- MFA attempt limits (5 TOTP / 10 backup codes per user per hour, 20 backup codes per IP per hour)
- Password reset rate limits (3 forgot-password requests per hour per IP, 10 reset attempts per 15 min per IP)
- Sliding window algorithm
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
- IP + User-Agent + Strategy tracking
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
- Consistent validation timing

---

## Security Configuration Requirements

### Production Requirements (Mandatory)

| Requirement | Status | Description |
|-------------|--------|-------------|
| HTTPS | ✅ Required | All redirect URIs must use HTTPS |
| Secure Cookies | ✅ Required | `Secure` flag enabled in production |
| Secret Entropy | ✅ Required | Min 32 chars, high entropy validation |
| `AUTH_SALT` (State Salt) | ✅ Required | Separate secret used with HKDF-SHA256 to derive the OAuth state HMAC; must differ from JWT secret |
| External Storage | ✅ Required | Redis/Database/KV for stateful operations |
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
```

### Manual Security Testing Checklist

1. **Redirect Validation**
   - Test with malicious redirect URLs
   - Verify rejection of non-HTTPS URLs in production
   - Test path traversal attempts

2. **Rate Limiting**
   - Attempt >10 requests to `/auth/me` per minute
   - Verify 429 response with Retry-After header

3. **Cookie Security**
   - Verify Secure flag in production browser dev tools
   - Verify HttpOnly flag (not accessible via JavaScript)
    - Verify SameSite defaults to lax (configurable to strict/none)

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
- `SameSite` defaults to `lax` (configurable to `strict` or `none`); `Secure` in production

### Token Security

All JWTs include:
- `jti` (unique ID) for revocation tracking
- `iss` (issuer) claim
- `exp` (expiration) claim
- `iat` (issued at) claim

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