# Security Policy

## Reporting a Vulnerability

We take the security of @hallaxius/auth seriously. If you discover a security vulnerability, please follow these steps:

1. **DO NOT** create a public GitHub issue
2. Email your findings to: security@hallaxius.dev
3. Include detailed steps to reproduce the vulnerability
4. Allow us 72 hours to respond with a remediation plan

We will acknowledge your report within 72 hours and provide updates every 5 business days.

### Security Considerations

This project implements several security measures:

- **Password Hashing**: PBKDF2 with SHA-256, 100,000 iterations, 32-byte salt
- **Session Tokens**: AES-256-GCM encryption with JWT
- **MFA**: TOTP (RFC 6238) with 30-second windows
- **Rate Limiting**: Sliding window algorithm (in-memory or Redis-backed)
- **IP Validation**: X-Forwarded-For header validation with trusted proxy support

### Cryptographic Algorithms

| Feature | Algorithm | Parameters |
|---------|-----------|------------|
| Password Hashing | PBKDF2-SHA256 | 100,000 iterations, 32-byte salt |
| Session Encryption | AES-256-GCM | 256-bit key, 12-byte IV |
| JWT Signing | HS256 | 32+ character secret |
| MFA | TOTP (RFC 6238) | SHA-1, 30s period, 6 digits |
| Random Generation | crypto.randomBytes | 32 bytes minimum |

### Production Configuration Recommendations

#### Required Environment Variables

```bash
# JWT secret must be at least 32 characters with high entropy
JWT_SECRET=your-32-char-min-cryptographically-secure-random-string

# State salt for OAuth2 state parameter generation
AUTH_STATE_SALT=your-32-char-random-salt

# Production environment
NODE_ENV=production
```

#### HTTPS Requirements

- **Always use HTTPS** in production
- Set `trustProxy: true` in Express when behind a reverse proxy
- Configure `TRUSTED_PROXIES` with your load balancer IPs
- Enable HSTS headers in your reverse proxy

#### Rate Limiting

For production deployments with multiple workers:

```bash
# Use Redis for distributed rate limiting
REDIS_URL=redis://localhost:6379
```

Default limits (adjust based on your needs):
- Login attempts: 5 per 15 minutes per IP
- Token refresh: 10 per minute per user
- Password reset: 3 per hour per email

#### Session Security

- Set `cookie.secure: true` in production
- Set `cookie.httpOnly: true` (default)
- Set `cookie.sameSite: 'lax'` or `'strict'`
- Use short JWT expiry (15 minutes for access tokens)
- Implement token revocation for logout

#### Additional Hardening

1. **Helmet.js**: Use security headers middleware
2. **CORS**: Configure strict origin whitelist
3. **Input Validation**: All inputs are validated with Zod
4. **SQL Injection**: Using parameterized queries (if using DB adapter)
5. **XSS Prevention**: Output encoding in templates

### Known Security Limitations

1. **In-Memory Rate Limiting**: Not suitable for multi-worker deployments (use Redis)
2. **Session Revocation**: Requires Redis for distributed token blacklisting
3. **Brute Force Protection**: IP-based only; implement account lockout for production

### Security Audit

Run security audits regularly:

```bash
# Audit npm dependencies
bun audit

# Check for known vulnerabilities
npm audit --production
```

### Dependencies

We monitor security advisories for:
- `jsonwebtoken` - JWT implementation
- `bcrypt` / `pbkdf2` - Password hashing
- `crypto` - Node.js built-in cryptography
- `express` - Web framework
- `redis` - Distributed state store

### Compliance

This library helps with:
- **OWASP Top 10**: Addresses A01 (Broken Access Control), A02 (Cryptographic Failures), A07 (Identification Failures)
- **GDPR**: Supports data deletion and export via adapter pattern
- **PCI DSS**: Passwords never stored in plaintext; secure transmission required

### Version Support

Only the latest major version receives security updates. Update regularly:

```bash
bun update @hallaxius/auth
```

### Changelog

Security-related changes are documented in [CHANGELOG.md](../CHANGELOG.md) with the `[Security]` tag.