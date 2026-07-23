# Production Deployment Guide

This guide covers deploying @hallaxius/auth in production environments.

## Prerequisites

- Node.js 18+ or Bun 1.0+
- Redis 6+ (for multi-worker deployments)
- HTTPS termination (reverse proxy or load balancer)
- Environment variables configured

## Quick Start

```bash
# Install dependencies
bun install

# Set environment variables
cp .env.example .env
# Edit .env with production values

# Start in production mode
NODE_ENV=production bun run start
```

## Redis Configuration (Required for Multi-Worker)

For deployments with multiple workers or load balancers, Redis is **required** for:
- Distributed rate limiting
- Session token revocation
- Shared state across instances

### Installation

```bash
# Docker
docker run -d -p 6379:6379 --name auth-redis redis:7-alpine

# Or use a managed service (Redis Cloud, AWS ElastiCache, etc.)
```

### Configuration

```bash
# .env
REDIS_URL=redis://localhost:6379

# For Redis with authentication
REDIS_URL=redis://:password@localhost:6379

# For Redis Cluster
REDIS_URL=redis://node1:6379,node2:6379,node3:6379
```

### Connection Pool Settings

```typescript
import { createAuth } from '@hallaxius/auth';

const auth = createAuth({
  redis: {
    url: process.env.REDIS_URL,
    maxRetriesPerRequest: 3,
    connectTimeout: 10000,
    commandTimeout: 5000,
  },
});
```

## HTTPS Requirements

### Trust Proxy Configuration

When running behind a reverse proxy (nginx, Apache, load balancer):

```typescript
import express from 'express';
import { createAuth } from '@hallaxius/auth';

const app = express();

// Trust proxy for IP validation and secure cookies
app.set('trustProxy', true);

const auth = createAuth({
  trustProxy: true, // Enable X-Forwarded-For validation
  trustedProxies: ['127.0.0.1', '10.0.0.0/8', '172.16.0.0/12'], // Optional: restrict to specific IPs
});
```

### Environment Variables

```bash
# Required for production
NODE_ENV=production

# Trusted proxy IPs (comma-separated CIDR ranges)
TRUSTED_PROXIES=127.0.0.1,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16
```

### Cookie Security

In production, ensure cookies are configured securely:

```typescript
const auth = createAuth({
  session: {
    cookie: {
      secure: true, // Only send over HTTPS
      httpOnly: true, // Prevent XSS access (default)
      sameSite: 'lax', // CSRF protection (default)
      maxAge: 15 * 60 * 1000, // 15 minutes
    },
  },
});
```

### Reverse Proxy Examples

#### nginx

```nginx
server {
    listen 443 ssl http2;
    server_name auth.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Host $host;
    }
}
```

#### Apache

```apache
<VirtualHost *:443>
    ServerName auth.example.com

    SSLEngine on
    SSLCertificateFile /path/to/cert.pem
    SSLCertificateKeyFile /path/to/key.pem

    ProxyPreserveHost On
    ProxyPass / http://localhost:3000/
    ProxyPassReverse / http://localhost:3000/

    RequestHeader set X-Forwarded-Proto "https"
    RequestHeader set X-Forwarded-For "%{REMOTE_ADDR}s"
</VirtualHost>
```

## Rate Limiting

### Default Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| Login | 5 attempts | 15 minutes |
| Token Refresh | 10 requests | 1 minute |
| Password Reset | 3 requests | 1 hour |
| MFA Verify | 5 attempts | 15 minutes |
| Registration | 5 requests | 1 hour |

### Customizing Limits

```typescript
const auth = createAuth({
  rateLimit: {
    login: {
      max: 5,
      windowMs: 15 * 60 * 1000, // 15 minutes
    },
    tokenRefresh: {
      max: 10,
      windowMs: 60 * 1000, // 1 minute
    },
    passwordReset: {
      max: 3,
      windowMs: 60 * 60 * 1000, // 1 hour
    },
  },
});
```

### Redis-Backed Rate Limiting

For production, use Redis for accurate distributed rate limiting:

```bash
# Required environment variable
REDIS_URL=redis://localhost:6379
```

The library automatically uses Redis for rate limiting when available.

### Handling Rate Limit Responses

```typescript
import { authMiddleware } from '@hallaxius/auth';

app.use(authMiddleware());

// Rate limit responses return 429 with:
// {
//   error: 'Too Many Requests',
//   retryAfter: 900 // seconds until reset
// }
```

## Monitoring & Logging

### Structured Logging

```typescript
import { createAuth } from '@hallaxius/auth';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

const auth = createAuth({
  logger: {
    info: (msg, meta) => logger.info(msg, meta),
    warn: (msg, meta) => logger.warn(msg, meta),
    error: (msg, meta) => logger.error(msg, meta),
    debug: (msg, meta) => logger.debug(msg, meta),
  },
});
```

### Log Events

Key events to monitor:

| Event | Level | Description |
|-------|-------|-------------|
| `auth.login.success` | info | Successful login |
| `auth.login.failure` | warn | Failed login attempt |
| `auth.login.ratelimit` | warn | Rate limit triggered |
| `auth.token.refresh` | info | Token refreshed |
| `auth.token.revoked` | info | Token revoked (logout) |
| `auth.mfa.enabled` | info | MFA enabled for user |
| `auth.password.reset` | info | Password reset completed |
| `auth.error` | error | Internal error |

### Metrics to Track

```typescript
// Example: Prometheus metrics
import client from 'prom-client';

const authMetrics = {
  loginAttempts: new client.Counter({
    name: 'auth_login_attempts_total',
    help: 'Total login attempts',
    labelNames: ['status'], // 'success' | 'failure'
  }),
  rateLimitHits: new client.Counter({
    name: 'auth_ratelimit_hits_total',
    help: 'Total rate limit hits',
    labelNames: ['endpoint'],
  }),
  activeSessions: new client.Gauge({
    name: 'auth_active_sessions',
    help: 'Number of active sessions',
  }),
  tokenRefreshLatency: new client.Histogram({
    name: 'auth_token_refresh_latency_seconds',
    help: 'Token refresh latency',
    buckets: [0.01, 0.05, 0.1, 0.5, 1],
  }),
};
```

### Health Checks

```typescript
import { authMiddleware } from '@hallaxius/auth';

app.get('/health', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    checks: {
      redis: 'unknown',
      database: 'unknown',
    },
  };

  try {
    // Check Redis connection
    await auth.redis.ping();
    health.checks.redis = 'ok';
  } catch (error) {
    health.checks.redis = 'error';
    health.status = 'degraded';
  }

  res.json(health);
});
```

## Performance Tuning

### Worker Processes

Use PM2 or similar for multi-worker deployments:

```bash
# Install PM2
bun add -g pm2

# Start with auto-scaling workers
pm2 start server.js -i max --name auth-server

# Or specify worker count
pm2 start server.js -i 4 --name auth-server
```

### Memory Management

```bash
# Set Node.js memory limit
NODE_OPTIONS="--max-old-space-size=4096" bun run start

# Or in PM2
pm2 start server.js --max-memory-restart 4G
```

### Connection Pooling

```typescript
const auth = createAuth({
  redis: {
    url: process.env.REDIS_URL,
    maxRetriesPerRequest: 3,
    connectTimeout: 10000,
    commandTimeout: 5000,
    // For ioredis
    maxLoadingRetryTime: 10000,
  },
});
```

## Security Checklist

Before deploying to production:

- [ ] `JWT_SECRET` is at least 32 characters with high entropy
- [ ] `AUTH_STATE_SALT` is configured
- [ ] `NODE_ENV=production` is set
- [ ] HTTPS is enabled with valid certificates
- [ ] `trustProxy` is configured correctly
- [ ] Redis is configured for multi-worker deployments
- [ ] Rate limiting is tested and tuned
- [ ] Cookie `secure` flag is enabled
- [ ] CORS is configured with specific origins
- [ ] Error messages don't leak sensitive information
- [ ] Logging is configured (no sensitive data in logs)
- [ ] Health check endpoint is implemented
- [ ] Monitoring/alerting is configured
- [ ] Backup strategy for Redis (if used)
- [ ] Dependency vulnerabilities are audited (`bun audit`)

## Troubleshooting

### Common Issues

**Issue**: Sessions not persisting across workers
- **Solution**: Configure Redis with `REDIS_URL`

**Issue**: Rate limiting not working correctly
- **Solution**: Ensure Redis is configured; in-memory rate limiting doesn't work across workers

**Issue**: IP addresses showing as localhost
- **Solution**: Set `trustProxy: true` and configure `TRUSTED_PROXIES`

**Issue**: Cookies not being set
- **Solution**: Ensure `secure: true` only with HTTPS; check `sameSite` configuration

### Debug Mode

Enable debug logging for troubleshooting:

```bash
DEBUG=@hallaxius/auth:* bun run start
```

Or in code:

```typescript
const auth = createAuth({
  logger: {
    info: console.log,
    warn: console.warn,
    error: console.error,
    debug: console.log, // Enable debug
  },
});
```

## Deployment Examples

### Docker

```dockerfile
FROM oven/bun:1

WORKDIR /app

COPY package.json bun.lockb ./
RUN bun install --production

COPY . .

ENV NODE_ENV=production

EXPOSE 3000

CMD ["bun", "run", "start"]
```

### Docker Compose

```yaml
version: '3.8'

services:
  auth:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - JWT_SECRET=${JWT_SECRET}
      - AUTH_STATE_SALT=${AUTH_STATE_SALT}
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data
    restart: unless-stopped

volumes:
  redis-data:
```

### Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: auth-server
spec:
  replicas: 3
  selector:
    matchLabels:
      app: auth
  template:
    metadata:
      labels:
        app: auth
    spec:
      containers:
      - name: auth
        image: your-registry/auth:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: auth-secrets
              key: jwt-secret
        - name: AUTH_STATE_SALT
          valueFrom:
            secretKeyRef:
              name: auth-secrets
              key: state-salt
        - name: REDIS_URL
          value: "redis://redis-service:6379"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
```

## Support

For production support, contact: support@hallaxius.dev

Report security issues to: security@hallaxius.dev