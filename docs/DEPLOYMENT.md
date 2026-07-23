# Deployment Checklist - v5.3.0

Use this checklist when deploying @hallaxius/auth v5.3.0 to production.

## Pre-Deployment

### Environment Setup

- [ ] Node.js 18+ or Bun 1.0+ installed
- [ ] Redis 6+ available (for multi-worker deployments)
- [ ] HTTPS certificates configured
- [ ] Environment variables set (see below)
- [ ] Dependencies installed (`bun install`)

### Required Environment Variables

```bash
# JWT Configuration
JWT_SECRET=<32+ character cryptographically secure random string>

# OAuth2 State Parameter
AUTH_STATE_SALT=<32+ character random salt>

# Environment
NODE_ENV=production

# Redis (required for multi-worker)
REDIS_URL=redis://localhost:6379

# Trusted Proxies (if behind reverse proxy)
TRUSTED_PROXIES=127.0.0.1,10.0.0.0/8,172.16.0.0/12

# Optional: Discord OAuth2 (if using)
DISCORD_CLIENT_ID=<your-client-id>
DISCORD_CLIENT_SECRET=<your-client-secret>
DISCORD_REDIRECT_URI=https://your-domain.com/auth/discord/callback
```

### Security Configuration

- [ ] `JWT_SECRET` is at least 32 characters with high entropy
- [ ] `AUTH_STATE_SALT` is configured
- [ ] HTTPS is enabled with valid certificates
- [ ] `trustProxy` is configured correctly
- [ ] CORS is configured with specific origins
- [ ] Rate limiting is tested and tuned

## Deployment Steps

### 1. Build the Package

```bash
bun run build
```

### 2. Run Tests

```bash
# Full test suite
bun test

# With coverage
bun test --coverage

# Security tests
bun run test:security

# Performance tests
bun run test:performance
```

### 3. Audit Dependencies

```bash
bun audit
```

### 4. Deploy

#### Docker Deployment

```bash
# Build image
docker build -t hallaxius/auth:5.3.0 .

# Run container
docker run -d \
  -p 3000:3000 \
  --env-file .env \
  --name auth-server \
  hallaxius/auth:5.3.0
```

#### Kubernetes Deployment

```bash
# Apply manifests
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secrets.yaml
```

#### Traditional Deployment

```bash
# Copy files to server
scp -r dist/ user@server:/app/auth

# Install production dependencies
bun install --production

# Start with PM2
pm2 start dist/index.js --name auth-server -i max
```

## Post-Deployment

### Health Checks

```bash
# Check health endpoint
curl https://your-domain.com/health

# Expected response:
# {"status":"ok","timestamp":"2026-07-23T00:00:00.000Z"}
```

### Smoke Tests

- [ ] Login flow works
- [ ] Token refresh works
- [ ] Logout works
- [ ] MFA verification works (if enabled)
- [ ] Password reset flow works
- [ ] Rate limiting is active
- [ ] Session revocation works

### Monitoring Setup

- [ ] Application logs are being collected
- [ ] Error tracking is configured (Sentry, etc.)
- [ ] Metrics are being collected (Prometheus, etc.)
- [ ] Alerts are configured for:
  - High error rate (>1%)
  - High latency (p95 > 500ms)
  - Redis connection failures
  - Memory usage >80%
  - CPU usage >80%

### Security Verification

- [ ] HTTPS is enforced
- [ ] Security headers are present:
  - `Strict-Transport-Security`
  - `X-Content-Type-Options`
  - `X-Frame-Options`
  - `X-XSS-Protection`
  - `Content-Security-Policy`
- [ ] Cookies have `secure` flag
- [ ] Cookies have `httpOnly` flag
- [ ] Cookies have `sameSite` attribute
- [ ] Rate limiting is active on all endpoints

## Rollback Procedures

If issues are detected after deployment:

### 1. Quick Rollback (Kubernetes)

```bash
# Rollback to previous deployment
kubectl rollout undo deployment/auth-server

# Check rollback status
kubectl rollout status deployment/auth-server
```

### 2. Docker Rollback

```bash
# Stop current container
docker stop auth-server
docker rm auth-server

# Start previous version
docker run -d \
  -p 3000:3000 \
  --env-file .env \
  --name auth-server \
  hallaxius/auth:5.2.0
```

### 3. PM2 Rollback

```bash
# Stop current version
pm2 stop auth-server

# Start previous version
pm2 start /path/to/previous/version/dist/index.js --name auth-server -i max
```

## Disaster Recovery

### Data Backup

- [ ] Redis data is backed up regularly
- [ ] Database (if used) is backed up regularly
- [ ] Backups are tested periodically

### Recovery Steps

1. **Restore Redis**: Load latest Redis backup
2. **Restore Database**: Run database restore scripts
3. **Restart Services**: Deploy fresh instances
4. **Verify Data**: Run data integrity checks
5. **Monitor**: Watch for anomalies

## Performance Benchmarks

Expected performance metrics for v5.3.0:

| Metric | Target | Acceptable |
|--------|--------|------------|
| Login latency (p50) | <50ms | <100ms |
| Login latency (p95) | <100ms | <200ms |
| Token refresh (p50) | <20ms | <50ms |
| Token refresh (p95) | <50ms | <100ms |
| Error rate | <0.1% | <1% |
| Availability | 99.9% | 99.5% |

## Support Contacts

- **Technical Support**: support@hallaxius.dev
- **Security Issues**: security@hallaxius.dev
- **Emergency**: Use GitHub Issues with "critical" label

## Version Information

- **Current Version**: 5.3.0
- **Previous Version**: 5.2.0
- **Release Date**: 2026-07-23
- **Semver**: Minor (backward compatible)

---

**Last Updated**: 2026-07-23
**Maintainer**: @hallaxius
