# Environment Variables Reference - v5.3.0

Complete reference for all environment variables used by @hallaxius/auth.

## Required Variables

### Core Authentication

| Variable | Type | Description | Example |
|----------|------|-------------|---------|
| `JWT_SECRET` | String | Secret key for JWT signing. **Must be at least 32 characters** with high entropy. | `your-32-char-cryptographically-secure-random-string` |
| `AUTH_STATE_SALT` | String | Salt for OAuth2 state parameter generation. **Must be at least 32 characters**. | `your-32-char-random-salt` |
| `NODE_ENV` | String | Environment mode. Values: `development`, `production`, `test` | `production` |

### Discord OAuth2 (if using)

| Variable | Type | Description | Example |
|----------|------|-------------|---------|
| `DISCORD_CLIENT_ID` | String | Discord application client ID | `123456789012345678` |
| `DISCORD_CLIENT_SECRET` | String | Discord application client secret | `your-client-secret` |
| `DISCORD_REDIRECT_URI` | String | OAuth2 callback URL (must match Discord dev portal) | `https://your-domain.com/auth/discord/callback` |

### Redis (Required for Multi-Worker)

| Variable | Type | Description | Example |
|----------|------|-------------|---------|
| `REDIS_URL` | String | Redis connection URL | `redis://localhost:6379` |
| `REDIS_URL` | String | Redis with authentication | `redis://:password@localhost:6379` |
| `REDIS_URL` | String | Redis Cluster | `redis://node1:6379,node2:6379,node3:6379` |

## Optional Variables

### Security Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `TRUSTED_PROXIES` | String | `[]` | Comma-separated list of trusted proxy IPs/CIDR ranges | `127.0.0.1,10.0.0.0/8,172.16.0.0/12` |
| `AUTH_COOKIE_DOMAIN` | String | `undefined` | Cookie domain for cross-subdomain sessions | `.your-domain.com` |
| `AUTH_COOKIE_PATH` | String | `/` | Cookie path | `/auth` |
| `AUTH_COOKIE_SECURE` | String | `true` (prod) | Force secure cookies | `true` |
| `AUTH_COOKIE_SAMESITE` | String | `lax` | SameSite attribute | `strict`, `lax`, `none` |

### Rate Limiting

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `RATE_LIMIT_LOGIN_MAX` | Number | `5` | Max login attempts per window | `10` |
| `RATE_LIMIT_LOGIN_WINDOW` | Number | `900000` (15m) | Login rate limit window (ms) | `600000` |
| `RATE_LIMIT_TOKEN_MAX` | Number | `10` | Max token refresh requests per window | `20` |
| `RATE_LIMIT_TOKEN_WINDOW` | Number | `60000` (1m) | Token refresh rate limit window (ms) | `120000` |
| `RATE_LIMIT_PASSWORD_MAX` | Number | `3` | Max password reset requests per window | `5` |
| `RATE_LIMIT_PASSWORD_WINDOW` | Number | `3600000` (1h) | Password reset rate limit window (ms) | `3600000` |
| `RATE_LIMIT_MFA_MAX` | Number | `5` | Max MFA verification attempts per window | `10` |
| `RATE_LIMIT_MFA_WINDOW` | Number | `900000` (15m) | MFA rate limit window (ms) | `600000` |
| `RATE_LIMIT_REGISTER_MAX` | Number | `5` | Max registration requests per window | `10` |
| `RATE_LIMIT_REGISTER_WINDOW` | Number | `3600000` (1h) | Registration rate limit window (ms) | `3600000` |

### JWT Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `JWT_EXPIRES_IN` | String | `15m` | Access token expiry | `1h`, `30m`, `7d` |
| `JWT_REFRESH_EXPIRES_IN` | String | `7d` | Refresh token expiry | `30d`, `14d` |
| `JWT_ISSUER` | String | `hallaxius-auth` | JWT issuer claim | `auth.your-domain.com` |
| `JWT_AUDIENCE` | String | `hallaxius-auth` | JWT audience claim | `api.your-domain.com` |

### Session Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `SESSION_MAX_AGE` | Number | `1209600000` (14d) | Session max age in milliseconds | `604800000` (7d) |
| `SESSION_UPDATE_AGE` | Boolean | `true` | Update session age on activity | `false` |
| `SESSION_ROLLING` | Boolean | `true` | Rolling session expiry | `false` |

### Logging & Monitoring

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `LOG_LEVEL` | String | `info` | Logging level | `debug`, `info`, `warn`, `error` |
| `LOG_FORMAT` | String | `json` | Log format | `pretty`, `json` |
| `AUDIT_LOG_ENABLED` | Boolean | `true` | Enable audit logging | `false` |
| `AUDIT_LOG_FILE` | String | `audit.log` | Audit log file path | `/var/log/auth/audit.log` |

### Email (Password Reset)

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `SMTP_HOST` | String | `undefined` | SMTP server host | `smtp.gmail.com` |
| `SMTP_PORT` | Number | `587` | SMTP server port | `465` |
| `SMTP_USER` | String | `undefined` | SMTP username | `your-email@gmail.com` |
| `SMTP_PASSWORD` | String | `undefined` | SMTP password or app password | `your-app-password` |
| `SMTP_FROM` | String | `undefined` | From address for emails | `noreply@your-domain.com` |
| `EMAIL_PROVIDER` | String | `smtp` | Email provider | `sendgrid`, `ses`, `smtp` |

### Discord Guild Integration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `DISCORD_BOT_TOKEN` | String | `undefined` | Discord bot token for guild operations | `bot-token` |
| `DISCORD_GUILD_ID` | String | `undefined` | Discord server ID for auto-join | `123456789012345678` |
| `DISCORD_AUTO_JOIN_ROLE_ID` | String | `undefined` | Role ID to assign on join | `987654321098765432` |

### Database (if using persistent storage)

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `DATABASE_URL` | String | `undefined` | Database connection string | `postgresql://user:pass@localhost:5432/auth` |
| `DATABASE_POOL_SIZE` | Number | `10` | Database connection pool size | `20` |
| `DATABASE_POOL_TIMEOUT` | Number | `5000` | Pool acquisition timeout (ms) | `10000` |

### Advanced Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `PBKDF2_ITERATIONS` | Number | `100000` | PBKDF2 iterations for password hashing | `150000` |
| `PBKDF2_DIGEST` | String | `sha256` | PBKDF2 digest algorithm | `sha512` |
| `MFA_WINDOW` | Number | `1` | TOTP window tolerance (steps) | `2` |
| `MFA_DIGITS` | Number | `6` | TOTP code digits | `8` |
| `MFA_PERIOD` | Number | `30` | TOTP period (seconds) | `60` |
| `BACKUP_CODE_COUNT` | Number | `10` | Number of backup codes to generate | `16` |
| `CORS_ORIGINS` | String | `[]` | Allowed CORS origins (comma-separated) | `https://app.com,https://admin.com` |
| `CORS_METHODS` | String | `GET,POST,PUT,DELETE` | Allowed CORS methods | `GET,POST,OPTIONS` |
| `CORS_CREDENTIALS` | Boolean | `true` | Allow credentials in CORS | `false` |

## Environment-Specific Configurations

### Development

```bash
# .env.development
NODE_ENV=development
JWT_SECRET=dev-secret-key-at-least-32-characters-long
AUTH_STATE_SALT=dev-state-salt-at-least-32-chars-long
DISCORD_CLIENT_ID=your-dev-client-id
DISCORD_CLIENT_SECRET=your-dev-client-secret
DISCORD_REDIRECT_URI=http://localhost:3000/auth/discord/callback
REDIS_URL=redis://localhost:6379
LOG_LEVEL=debug
LOG_FORMAT=pretty
```

### Production

```bash
# .env.production
NODE_ENV=production
JWT_SECRET=<generate-with-openssl-rand-base64-32>
AUTH_STATE_SALT=<generate-with-openssl-rand-base64-32>
DISCORD_CLIENT_ID=<your-production-client-id>
DISCORD_CLIENT_SECRET=<your-production-client-secret>
DISCORD_REDIRECT_URI=https://your-domain.com/auth/discord/callback
REDIS_URL=redis://redis-cluster.internal:6379
TRUSTED_PROXIES=127.0.0.1,10.0.0.0/8,172.16.0.0/12
LOG_LEVEL=info
LOG_FORMAT=json
AUDIT_LOG_ENABLED=true
```

### Testing

```bash
# .env.test
NODE_ENV=test
JWT_SECRET=test-secret-key-for-testing-only-32chars
AUTH_STATE_SALT=test-state-salt-for-testing-32chars
REDIS_URL=redis://localhost:6379/1  # Use different DB
LOG_LEVEL=error
LOG_FORMAT=pretty
```

## Generating Secure Secrets

### JWT Secret

```bash
# Using OpenSSL
openssl rand -base64 32

# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Using Bun
bun -e "console.log(crypto.randomBytes(32).toString('base64'))"
```

### State Salt

```bash
# Same as JWT secret
openssl rand -base64 32
```

### Password for Redis

```bash
# Generate strong password
openssl rand -base64 24 | tr -d '/+=' | head -c 24
```

## Validation

The package validates environment variables on startup:

```typescript
import { config } from '@hallaxius/auth';

try {
  const validated = config.validateEnv();
  console.log('Environment is valid');
} catch (error) {
  console.error('Invalid environment configuration:', error);
  process.exit(1);
}
```

### Validation Errors

Common validation errors:

| Error | Cause | Solution |
|-------|-------|----------|
| `JWT_SECRET is required` | Missing JWT_SECRET | Set JWT_SECRET environment variable |
| `JWT_SECRET must be at least 32 characters` | Secret too short | Generate longer secret (32+ chars) |
| `AUTH_STATE_SALT is required` | Missing salt | Set AUTH_STATE_SALT environment variable |
| `Invalid REDIS_URL format` | Malformed URL | Use format: `redis://host:port` |
| `Invalid TRUSTED_PROXIES format` | Bad CIDR notation | Use valid CIDR: `10.0.0.0/8` |

## Secrets Management

### Best Practices

1. **Never commit secrets to version control**
   - Add `.env` to `.gitignore`
   - Use `.env.example` for templates

2. **Use secrets management in production**
   - AWS Secrets Manager
   - HashiCorp Vault
   - Azure Key Vault
   - Google Secret Manager

3. **Rotate secrets regularly**
   - JWT_SECRET: Every 90 days
   - AUTH_STATE_SALT: Every 90 days
   - Database passwords: Every 90 days

4. **Use different secrets per environment**
   - Never share secrets between dev/staging/prod
   - Generate unique secrets for each environment

### AWS Secrets Manager Example

```typescript
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

async function loadSecrets() {
  const client = new SecretsManagerClient({});
  const response = await client.send(new GetSecretValueCommand({
    SecretId: 'prod/auth/secrets'
  }));
  
  const secrets = JSON.parse(response.SecretString);
  
  process.env.JWT_SECRET = secrets.JWT_SECRET;
  process.env.AUTH_STATE_SALT = secrets.AUTH_STATE_SALT;
  process.env.DISCORD_CLIENT_SECRET = secrets.DISCORD_CLIENT_SECRET;
}

loadSecrets();
```

### Docker Secrets Example

```yaml
# docker-compose.yml
version: '3.8'

services:
  auth:
    image: hallaxius/auth:5.3.0
    secrets:
      - jwt_secret
      - auth_state_salt
      - discord_client_secret

secrets:
  jwt_secret:
    external: true
  auth_state_salt:
    external: true
  discord_client_secret:
    external: true
```

## Troubleshooting

### Common Issues

**Issue**: "JWT_SECRET validation failed"
- **Cause**: Secret is missing or too short
- **Solution**: Generate new 32+ character secret

**Issue**: "Cannot connect to Redis"
- **Cause**: REDIS_URL is incorrect or Redis is down
- **Solution**: Verify Redis is running and URL is correct

**Issue**: "OAuth2 state validation failed"
- **Cause**: AUTH_STATE_SALT not configured or changed
- **Solution**: Set consistent AUTH_STATE_SALT across instances

**Issue**: "Cookies not being set"
- **Cause**: Secure flag set in development
- **Solution**: Set `AUTH_COOKIE_SECURE=false` in development

## Support

- **Documentation**: https://github.com/Hallaxius/auth#readme
- **Issues**: https://github.com/Hallaxius/auth/issues
- **Security**: security@hallaxius.dev

---

**Last Updated**: 2026-07-23
**Version**: 5.3.0