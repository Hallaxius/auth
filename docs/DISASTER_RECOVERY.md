# Disaster Recovery Plan - v5.3.0

This document outlines the disaster recovery plan for @hallaxius/auth to ensure business continuity in case of major incidents.

## Disaster Scenarios

### Scenario 1: Complete Service Outage

**Description**: Auth service is completely unavailable.

**Impact**: Users cannot log in, sessions invalid, all authentication-dependent services down.

**Recovery Time Objective (RTO)**: 15 minutes

**Recovery Point Objective (RPO)**: 5 minutes

### Scenario 2: Data Corruption

**Description**: User data, sessions, or credentials corrupted.

**Impact**: Users cannot authenticate, potential data loss.

**RTO**: 30 minutes

**RPO**: 1 hour

### Scenario 3: Security Breach

**Description**: Unauthorized access to auth system or data.

**Impact**: Compromised credentials, potential data breach.

**RTO**: 1 hour (immediate containment)

**RPO**: N/A (focus on containment)

### Scenario 4: Infrastructure Failure

**Description**: Cloud provider outage, datacenter failure.

**Impact**: Complete service unavailability.

**RTO**: 30 minutes

**RPO**: 5 minutes

### Scenario 5: DDoS Attack

**Description**: Distributed denial of service attack.

**Impact**: Service degradation or outage.

**RTO**: 15 minutes (mitigation)

**RPO**: N/A

## Recovery Team

| Role | Responsibilities | Contact |
|------|-----------------|---------|
| **Incident Commander** | Overall coordination, decision making | oncall-ic@hallaxius.dev |
| **Technical Lead** | Technical decisions, architecture | tech-lead@hallaxius.dev |
| **Operations Engineer** | Infrastructure, deployment | ops@hallaxius.dev |
| **Security Engineer** | Security assessment, containment | security@hallaxius.dev |
| **Communications Lead** | Internal/external comms | comms@hallaxius.dev |

## Backup Strategy

### Data Backups

#### Redis Backups

```bash
# Automated backup script (runs every hour)
#!/bin/bash
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
redis-cli BGSAVE
sleep 10  # Wait for BGSAVE to complete
cp /var/lib/redis/dump.rdb /backups/redis/dump-${TIMESTAMP}.rdb
# Keep last 24 hourly backups
find /backups/redis -name "dump-*.rdb" -mtime +1 -delete
```

**Backup Frequency**: Hourly

**Retention**: 24 hours (hourly), 7 days (daily), 30 days (weekly)

**Storage**: S3 with versioning enabled

**Encryption**: AES-256 at rest

#### Database Backups

```bash
# PostgreSQL backup (runs every 6 hours)
#!/bin/bash
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
pg_dump \
  --host localhost \
  --username postgres \
  --format custom \
  --file /backups/db/auth-${TIMESTAMP}.dump \
  auth_db
# Upload to S3
aws s3 cp /backups/db/auth-${TIMESTAMP}.dump s3://hallaxius-backups/db/
```

**Backup Frequency**: Every 6 hours

**Retention**: 30 days

**Storage**: S3 with versioning and cross-region replication

#### Configuration Backups

```bash
# Backup environment variables and configs
#!/bin/bash
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
tar -czf /backups/config/config-${TIMESTAMP}.tar.gz \
  /app/auth/.env \
  /app/auth/config/ \
  /etc/nginx/conf.d/
aws s3 cp /backups/config/config-${TIMESTAMP}.tar.gz s3://hallaxius-backups/config/
```

**Backup Frequency**: Daily

**Retention**: 90 days

### Backup Verification

```bash
# Weekly backup restoration test
#!/bin/bash
# Test Redis backup restoration
redis-cli FLUSHALL
redis-cli RESTORE_FROM_RDB /backups/redis/dump-latest.rdb
redis-cli PING  # Should return PONG

# Test database backup restoration
pg_restore \
  --host localhost \
  --dbname auth_db_test \
  --clean \
  /backups/db/auth-latest.dump
```

## Recovery Procedures

### Procedure 1: Complete Service Restoration

#### Step 1: Assess Damage (2 minutes)

```bash
# Check service status
kubectl get pods -l app=auth
kubectl get events --sort-by='.lastTimestamp'

# Check logs
kubectl logs -l app=auth --tail=1000

# Check metrics
kubectl top pods -l app=auth
```

#### Step 2: Activate Backup Infrastructure (5 minutes)

```bash
# If primary region is down, activate DR region
# Update DNS to point to DR region
aws route53 change-resource-record-sets \
  --hosted-zone-id ZONE_ID \
  --change-batch file://dns-failover.json

# Scale up DR cluster
kubectl scale deployment auth-server --replicas=10 --namespace production
```

#### Step 3: Restore Data (5 minutes)

```bash
# Restore Redis from latest backup
kubectl exec -it redis-master -- redis-cli FLUSHALL
kubectl exec -it redis-master -- redis-cli RESTORE_FROM_RDB /backups/dump-latest.rdb

# Restore database if needed
kubectl exec -it db-master -- pg_restore \
  --dbname auth_db \
  --clean \
  /backups/auth-latest.dump
```

#### Step 4: Deploy Stable Version (3 minutes)

```bash
# Deploy last known good version
kubectl set image deployment/auth-server \
  auth=hallaxius/auth:5.2.0 \
  --record

# Watch rollout
kubectl rollout status deployment/auth-server
```

#### Step 5: Verify Service (5 minutes)

```bash
# Health checks
curl https://auth.hallaxius.com/health/live
curl https://auth.hallaxius.com/health/ready

# Smoke tests
./scripts/smoke-tests.sh

# Monitor metrics
kubectl top pods -l app=auth
```

### Procedure 2: Data Corruption Recovery

#### Step 1: Identify Corruption (5 minutes)

```bash
# Check data integrity
psql -U postgres -d auth_db -c "SELECT COUNT(*) FROM users;"
psql -U postgres -d auth_db -c "SELECT COUNT(*) FROM sessions;"

# Check for anomalies
psql -U postgres -d auth_db -c \
  "SELECT * FROM users WHERE created_at > NOW();"
```

#### Step 2: Stop Writes (Immediate)

```bash
# Scale down to prevent further corruption
kubectl scale deployment auth-server --replicas=0

# Enable maintenance mode
kubectl apply -f k8s/maintenance-mode.yaml
```

#### Step 3: Restore from Backup (15 minutes)

```bash
# Restore database to point-in-time
pg_restore \
  --host localhost \
  --dbname auth_db \
  --clean \
  /backups/db/auth-YYYYMMDD-HHMMSS.dump

# Restore Redis
redis-cli FLUSHALL
redis-cli RESTORE_FROM_RDB /backups/redis/dump-YYYYMMDD-HHMMSS.rdb
```

#### Step 4: Verify Data Integrity (10 minutes)

```bash
# Run data integrity checks
./scripts/data-integrity-check.sh

# Verify user counts
psql -U postgres -d auth_db -c \
  "SELECT COUNT(*) FROM users WHERE deleted_at IS NULL;"
```

#### Step 5: Resume Service (5 minutes)

```bash
# Disable maintenance mode
kubectl delete -f k8s/maintenance-mode.yaml

# Scale up service
kubectl scale deployment auth-server --replicas=5

# Monitor
kubectl logs -f -l app=auth
```

### Procedure 3: Security Breach Response

#### Step 1: Containment (Immediate)

```bash
# Revoke all sessions
kubectl exec -it redis-master -- redis-cli FLUSHDB

# Rotate JWT secrets
kubectl create secret generic auth-secrets \
  --from-literal=jwt-secret=$(openssl rand -base64 32) \
  --dry-run=client -o yaml | \
  kubectl apply -f -

# Restart all pods to invalidate tokens
kubectl delete pods -l app=auth
```

#### Step 2: Assessment (30 minutes)

```bash
# Analyze access logs
kubectl logs -l app=auth | grep -i "unauthorized\|forbidden"

# Check for suspicious activity
psql -U postgres -d auth_db -c \
  "SELECT * FROM audit_log WHERE action='login' AND status='failure' \
   AND timestamp > NOW() - INTERVAL '1 hour';"
```

#### Step 3: Remediation (1 hour)

- Force password reset for all users
- Revoke all API keys
- Enable enhanced logging
- Implement additional rate limiting
- Notify affected users

#### Step 4: Recovery (2 hours)

- Deploy security patches
- Restore from clean backup
- Implement additional security measures
- Gradual service restoration

### Procedure 4: DDoS Mitigation

#### Step 1: Detection (2 minutes)

```bash
# Check traffic spike
kubectl top pods -l app=auth

# Check request rate
kubectl logs -l app=auth | grep -c "request"

# Identify attack pattern
kubectl logs -l app=auth | awk '{print $1}' | sort | uniq -c | sort -rn | head -20
```

#### Step 2: Mitigation (5 minutes)

```bash
# Enable Cloudflare protection (if using)
curl -X PATCH \
  "https://api.cloudflare.com/client/v4/zones/ZONE_ID/firewall/rules" \
  -H "Authorization: Bearer API_TOKEN" \
  -d '{"rules":[{"action":"block","filter":{"expression":"ip.src in {<malicious_ips>}"}}]}'

# Scale up rate limiting
kubectl set env deployment/auth-server \
  RATE_LIMIT_MAX=10 \
  RATE_LIMIT_WINDOW=60000
```

#### Step 3: Traffic Filtering (10 minutes)

- Enable WAF rules
- Implement IP blocking
- Enable CAPTCHA for suspicious requests
- Rate limit by IP and user agent

#### Step 4: Monitoring (Ongoing)

- Monitor traffic patterns
- Adjust filtering rules
- Scale infrastructure as needed

## Communication Plan

### Internal Communication

| Phase | Channel | Frequency | Audience |
|-------|---------|-----------|----------|
| Detection | Slack #incidents | Immediate | Engineering team |
| Assessment | Slack #incidents | Every 15 min | Engineering + Management |
| Recovery | Slack #incidents | Every 30 min | All company |
| Resolution | Email + Slack | Once | All company |
| Post-mortem | Document | Within 48h | Engineering team |

### External Communication

| Phase | Channel | Audience |
|-------|---------|----------|
| Detection | Status page | Users |
| Recovery | Status page updates | Users |
| Resolution | Status page + Email | Users |
| Post-mortem | Blog post | Public |

### Communication Templates

#### Initial Notification

```markdown
**Status**: INVESTIGATING

We are currently investigating issues with our authentication service. 
Some users may experience login failures. Our team is working to resolve this.

Next update: [TIME]
```

#### Update Notification

```markdown
**Status**: IDENTIFIED

We have identified the root cause and are implementing a fix. 
Service restoration expected by [TIME].

Next update: [TIME]
```

#### Resolution Notification

```markdown
**Status**: RESOLVED

The authentication service issue has been resolved. All systems are operational.
We apologize for any inconvenience caused.

A detailed post-mortem will be published within 48 hours.
```

## Testing & Drills

### Quarterly DR Drills

**Objective**: Test recovery procedures and team readiness.

**Scenario**: Rotate through different disaster scenarios each quarter.

**Duration**: 2-4 hours

**Participants**: Entire recovery team

**Success Criteria**:
- RTO met (<15 minutes for critical scenarios)
- RPO met (<5 minutes data loss)
- All team members know their roles
- Documentation is accurate and up-to-date

### Monthly Backup Restoration Tests

**Objective**: Verify backup integrity and restoration procedures.

**Procedure**:
1. Select random backup from last 7 days
2. Restore to isolated environment
3. Verify data integrity
4. Document any issues
5. Fix backup procedures if needed

### Weekly Failover Tests

**Objective**: Test infrastructure failover capabilities.

**Procedure**:
1. Simulate primary region failure
2. Activate DR region
3. Verify service continuity
4. Fail back to primary
5. Document lessons learned

## Continuous Improvement

### Post-Incident Reviews

After every disaster or drill:

1. **Blameless Post-mortem**: What happened, why, and how to prevent
2. **Action Items**: Assign tasks to improve resilience
3. **Documentation Updates**: Update runbooks and procedures
4. **Tool Improvements**: Enhance monitoring and alerting
5. **Training**: Address knowledge gaps

### Metrics to Track

| Metric | Target | Measurement |
|--------|--------|-------------|
| Mean Time to Detect (MTTD) | <5 minutes | Incident start to detection |
| Mean Time to Respond (MTTR) | <10 minutes | Detection to response |
| Mean Time to Recover (MTTR) | <30 minutes | Response to recovery |
| Backup Success Rate | >99.9% | Successful backups / total |
| Drill Success Rate | 100% | Successful drills / total |

## Tools & Resources

### Monitoring Tools

- **Prometheus**: Metrics collection
- **Grafana**: Dashboards and visualization
- **PagerDuty**: Alerting and on-call management
- **Datadog**: APM and infrastructure monitoring

### Backup Tools

- **Velero**: Kubernetes backup and disaster recovery
- **pgBackRest**: PostgreSQL backup and recovery
- **Redis Backup**: Native RDB snapshots
- **AWS Backup**: Cross-region backup management

### Communication Tools

- **Slack**: Internal communication
- **Statuspage**: External status updates
- **Zoom**: Emergency conference bridge
- **Email**: User notifications

## Support Contacts

| Service | Contact | SLA |
|---------|---------|-----|
| AWS Support | AWS Console | 1 hour (Business) |
| Cloudflare | support@cloudflare.com | 15 minutes (Enterprise) |
| PagerDuty | support@pagerduty.com | 1 hour |
| Internal On-call | oncall@hallaxius.dev | 15 minutes |

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-23 | @hallaxius | Initial version for v5.3.0 |

## Approval

This disaster recovery plan has been reviewed and approved by:

- [ ] Engineering Manager
- [ ] Security Lead
- [ ] Operations Lead
- [ ] Compliance Officer

---

**Last Updated**: 2026-07-23
**Version**: 5.3.0
**Next Review**: 2026-10-23
