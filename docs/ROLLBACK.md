# Rollback Procedures - v5.3.0

This document outlines rollback procedures for @hallaxius/auth in case of deployment issues.

## When to Rollback

Rollback should be considered when:

- **Critical bugs** affecting authentication flow
- **Security vulnerabilities** discovered post-deployment
- **Performance degradation** beyond acceptable thresholds
- **Data corruption** or loss
- **Compatibility issues** with dependent services
- **Failed migration** scripts

## Rollback Decision Tree

```
Issue Detected
    │
    ├─> Can it be fixed with a hotfix? ──> YES ──> Deploy hotfix
    │                                      │
    │                                      NO
    │                                      │
    ├─> Is it affecting users? ──> NO ──> Monitor and investigate
    │                          │
    │                          YES
    │                          │
    ├─> Is data at risk? ──> YES ──> IMMEDIATE ROLLBACK
    │                    │
    │                    NO
    │                    │
    ├─> Is error rate > 5%? ──> YES ──> IMMEDIATE ROLLBACK
    │                        │
    │                        NO
    │                        │
    └─> Can wait for fix? ──> YES ──> Deploy fix in next release
                         │
                         NO
                         │
                         ROLLBACK
```

## Pre-Rollback Checklist

Before initiating rollback:

- [ ] **Identify the issue**: Document what's broken
- [ ] **Assess impact**: How many users are affected?
- [ ] **Check logs**: Gather error patterns and stack traces
- [ ] **Notify team**: Alert relevant stakeholders
- [ ] **Backup current state**: Save logs and metrics
- [ ] **Verify previous version**: Ensure target version is stable
- [ ] **Prepare communication**: Draft user notification if needed

## Rollback Methods

### Method 1: Kubernetes Rollback (Recommended)

#### Quick Rollback

```bash
# Rollback to previous revision
kubectl rollout undo deployment/auth-server

# Watch rollback progress
kubectl rollout status deployment/auth-server

# Verify rollback
kubectl get pods -l app=auth
```

#### Rollback to Specific Revision

```bash
# Check rollout history
kubectl rollout history deployment/auth-server

# Rollback to specific revision (e.g., revision 3)
kubectl rollout undo deployment/auth-server --to-revision=3

# Verify
kubectl get deployment auth-server -o jsonpath='{.spec.template.spec.containers[0].image}'
```

#### Force Rollback

```bash
# If normal rollback fails, force it
kubectl delete pod -l app=auth
kubectl rollout undo deployment/auth-server --force
```

### Method 2: Docker Rollback

#### Docker Compose

```bash
# Stop current version
docker-compose down

# Update docker-compose.yml to previous version
# Change image tag from 5.3.0 to 5.2.0

# Start previous version
docker-compose up -d

# Verify
docker-compose ps
```

#### Docker CLI

```bash
# Stop current container
docker stop auth-server
docker rm auth-server

# Pull previous version
docker pull hallaxius/auth:5.2.0

# Start previous version
docker run -d \
  -p 3000:3000 \
  --env-file .env \
  --name auth-server \
  --restart unless-stopped \
  hallaxius/auth:5.2.0

# Verify
docker ps | grep auth-server
docker logs auth-server
```

### Method 3: PM2 Rollback

#### Standard Rollback

```bash
# Stop current version
pm2 stop auth-server

# Delete current version
pm2 delete auth-server

# Start previous version
pm2 start /path/to/v5.2.0/dist/index.js \
  --name auth-server \
  -i max \
  --env production

# Verify
pm2 status
pm2 logs auth-server
```

#### PM2 with Ecosystem File

```bash
# Update ecosystem.config.js
module.exports = {
  apps: [{
    name: 'auth-server',
    script: './dist/index.js',
    instances: 'max',
    env: {
      NODE_ENV: 'production',
    },
  }],
};

# Rollback
pm2 start ecosystem.config.js
```

### Method 4: Traditional Server Rollback

```bash
# SSH to server
ssh user@server

# Navigate to app directory
cd /app/auth

# Stop service
sudo systemctl stop auth-server

# Restore previous version
# Option A: From backup
sudo cp -r /backups/auth-5.2.0/* .

# Option B: From git
git checkout v5.2.0
bun install --production
bun run build

# Start service
sudo systemctl start auth-server

# Verify
sudo systemctl status auth-server
```

## Post-Rollback Verification

### Immediate Checks (First 5 Minutes)

- [ ] **Service is running**: Check process status
- [ ] **Health checks pass**: `/health/live` and `/health/ready`
- [ ] **Error rate normalized**: Monitor error metrics
- [ ] **Login flow works**: Test authentication
- [ ] **No data loss**: Verify user sessions

### Short-term Monitoring (First Hour)

- [ ] **Error rate < 1%**: Monitor continuously
- [ ] **Latency normal**: p95 < 500ms
- [ ] **No user complaints**: Check support channels
- [ ] **Metrics stable**: CPU, memory, network
- [ ] **Logs clean**: No unusual patterns

### Long-term Monitoring (First 24 Hours)

- [ ] **All metrics normal**: Compare with baseline
- [ ] **No recurring issues**: Issue is fully resolved
- [ ] **User feedback positive**: No complaints
- [ ] **Team confident**: Ready to close incident

## Rollback Communication

### Internal Communication

```markdown
**Subject**: [INCIDENT] Auth Service Rollback to v5.2.0

**Status**: RESOLVED

**Timeline**:
- [TIME] Issue detected: [description]
- [TIME] Rollback decision made
- [TIME] Rollback initiated
- [TIME] Rollback completed
- [TIME] Service verified

**Impact**:
- Duration: [X minutes]
- Affected users: [estimate]
- Data loss: [none/minimal/estimated]

**Next Steps**:
1. Post-mortem scheduled for [date]
2. Hotfix development in progress
3. Enhanced monitoring enabled

**Contact**: [incident commander]
```

### External Communication (if needed)

```markdown
**Subject**: Auth Service Incident Resolution

Dear Users,

We experienced a brief issue with our authentication service today at [TIME]. 
The issue has been resolved by rolling back to the previous stable version.

**Impact**: Some users may have experienced login failures between [TIME] and [TIME].

**Resolution**: Service is now fully operational. All user data is intact.

**Next Steps**: We are conducting a thorough investigation and will share 
a post-mortem report within 48 hours.

We apologize for any inconvenience.

Best regards,
The Hallaxius Team
```

## Data Recovery (if needed)

### Redis Data Recovery

```bash
# If Redis data was corrupted, restore from backup
redis-cli BGSAVE  # Save current state first

# Stop Redis
sudo systemctl stop redis

# Restore from backup
cp /var/lib/redis/dump.rdb.backup /var/lib/redis/dump.rdb

# Start Redis
sudo systemctl start redis

# Verify
redis-cli PING
redis-cli INFO persistence
```

### Database Recovery

```bash
# Restore from backup (example for PostgreSQL)
pg_restore \
  --host localhost \
  --port 5432 \
  --username postgres \
  --dbname auth_db \
  /backups/auth-db-$(date +%Y%m%d).dump

# Verify
psql -U postgres -d auth_db -c "SELECT COUNT(*) FROM users;"
```

## Common Rollback Issues

### Issue: Rollback Fails

**Symptoms**: Rollback command fails or hangs

**Solutions**:
1. Check cluster resources (disk space, memory)
2. Verify previous version image exists
3. Force delete problematic pods: `kubectl delete pod --force`
4. Manual rollback: deploy previous version as new deployment

### Issue: Data Incompatibility

**Symptoms**: Previous version can't read new data format

**Solutions**:
1. Check migration scripts for reversibility
2. Restore data from pre-deployment backup
3. Run data migration scripts to downgrade schema
4. Contact support if data recovery needed

### Issue: Configuration Drift

**Symptoms**: Rollback works but service behaves differently

**Solutions**:
1. Compare environment variables between versions
2. Check config files for differences
3. Restore previous configuration from backup
4. Verify secrets and certificates

## Post-Rollback Actions

### Immediate (Within 1 Hour)

1. **Document incident**: Create incident report
2. **Notify stakeholders**: Send status update
3. **Preserve evidence**: Save logs, metrics, traces
4. **Monitor closely**: Watch for recurring issues

### Short-term (Within 24 Hours)

1. **Root cause analysis**: Identify what went wrong
2. **Blameless post-mortem**: Schedule team meeting
3. **Action items**: Create tasks to prevent recurrence
4. **Update runbooks**: Document lessons learned

### Long-term (Within 1 Week)

1. **Implement fixes**: Address root cause
2. **Improve testing**: Add tests for missed scenarios
3. **Enhance monitoring**: Add alerts for early detection
4. **Review process**: Improve deployment procedures

## Emergency Contacts

| Role | Contact | Availability |
|------|---------|--------------|
| On-call Engineer | oncall@hallaxius.dev | 24/7 |
| Security Team | security@hallaxius.dev | 24/7 |
| Support Lead | support@hallaxius.dev | Business hours |
| Engineering Manager | [contact] | Business hours |

## Support

- **Documentation**: https://github.com/Hallaxius/auth#readme
- **Issues**: https://github.com/Hallaxius/auth/issues
- **Emergency**: security@hallaxius.dev

---

**Last Updated**: 2026-07-23
**Version**: 5.3.0
