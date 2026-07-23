# Monitoring & Alerting Guide - v5.3.0

This guide covers monitoring, alerting, and observability for @hallaxius/auth in production.

## Metrics to Monitor

### Application Metrics

#### Authentication Metrics

| Metric | Type | Description | Alert Threshold |
|--------|------|-------------|-----------------|
| `auth_login_attempts_total` | Counter | Total login attempts | - |
| `auth_login_failures_total` | Counter | Failed login attempts | >100/min |
| `auth_login_success_total` | Counter | Successful logins | - |
| `auth_mfa_verifications_total` | Counter | MFA verification attempts | - |
| `auth_mfa_failures_total` | Counter | Failed MFA attempts | >50/min |
| `auth_password_resets_total` | Counter | Password reset requests | >20/hour |
| `auth_registrations_total` | Counter | New user registrations | - |

#### Session Metrics

| Metric | Type | Description | Alert Threshold |
|--------|------|-------------|-----------------|
| `auth_active_sessions` | Gauge | Current active sessions | >10000 |
| `auth_sessions_created_total` | Counter | Sessions created | - |
| `auth_sessions_revoked_total` | Counter | Sessions revoked (logout) | - |
| `auth_token_refreshes_total` | Counter | Token refresh operations | - |
| `auth_token_refresh_failures` | Counter | Failed token refreshes | >50/min |

#### Rate Limiting Metrics

| Metric | Type | Description | Alert Threshold |
|--------|------|-------------|-----------------|
| `auth_ratelimit_hits_total` | Counter | Rate limit triggered | >1000/min |
| `auth_ratelimit_bypasses_total` | Counter | Rate limit bypassed | >0 |
| `auth_bruteforce_blocks_total` | Counter | IPs blocked for brute force | >100/hour |

#### Performance Metrics

| Metric | Type | Description | Alert Threshold |
|--------|------|-------------|-----------------|
| `auth_request_duration_seconds` | Histogram | Request latency | p95 > 500ms |
| `auth_jwt_signing_duration` | Histogram | JWT signing latency | p95 > 50ms |
| `auth_jwt_verification_duration` | Histogram | JWT verification latency | p95 > 50ms |
| `auth_password_hashing_duration` | Histogram | Password hashing latency | p95 > 500ms |
| `auth_redis_operation_duration` | Histogram | Redis operation latency | p95 > 100ms |

#### Error Metrics

| Metric | Type | Description | Alert Threshold |
|--------|------|-------------|-----------------|
| `auth_errors_total` | Counter | Total errors | >100/min |
| `auth_validation_errors_total` | Counter | Input validation errors | >500/min |
| `auth_database_errors_total` | Counter | Database errors | >10/min |
| `auth_redis_errors_total` | Counter | Redis errors | >10/min |

## Logging

### Log Levels

| Level | Usage |
|-------|-------|
| `error` | System errors, exceptions, failures |
| `warn` | Recoverable errors, rate limits, suspicious activity |
| `info` | Authentication events, session lifecycle |
| `debug` | Detailed debugging information |

### Log Events

#### Security Events (INFO)

```json
{
  "level": "info",
  "event": "auth.login.success",
  "userId": "user_123",
  "ip": "192.168.1.1",
  "userAgent": "Mozilla/5.0...",
  "timestamp": "2026-07-23T12:00:00.000Z"
}
```

```json
{
  "level": "info",
  "event": "auth.session.created",
  "sessionId": "ses_abc123",
  "userId": "user_123",
  "ip": "192.168.1.1",
  "timestamp": "2026-07-23T12:00:00.000Z"
}
```

```json
{
  "level": "info",
  "event": "auth.mfa.enabled",
  "userId": "user_123",
  "method": "totp",
  "timestamp": "2026-07-23T12:00:00.000Z"
}
```

#### Warning Events (WARN)

```json
{
  "level": "warn",
  "event": "auth.login.failure",
  "reason": "invalid_credentials",
  "ip": "192.168.1.1",
  "attemptCount": 3,
  "timestamp": "2026-07-23T12:00:00.000Z"
}
```

```json
{
  "level": "warn",
  "event": "auth.ratelimit.hit",
  "endpoint": "/auth/login",
  "ip": "192.168.1.1",
  "limit": 5,
  "window": 900,
  "retryAfter": 600,
  "timestamp": "2026-07-23T12:00:00.000Z"
}
```

```json
{
  "level": "warn",
  "event": "auth.bruteforce.detected",
  "ip": "192.168.1.1",
  "attemptCount": 10,
  "blockDuration": 3600,
  "timestamp": "2026-07-23T12:00:00.000Z"
}
```

#### Error Events (ERROR)

```json
{
  "level": "error",
  "event": "auth.error",
  "message": "Database connection failed",
  "error": "ECONNREFUSED",
  "stack": "...",
  "timestamp": "2026-07-23T12:00:00.000Z"
}
```

```json
{
  "level": "error",
  "event": "auth.jwt.signing_failed",
  "error": "Invalid secret",
  "userId": "user_123",
  "timestamp": "2026-07-23T12:00:00.000Z"
}
```

### Log Aggregation

Configure log aggregation with one of these services:

- **ELK Stack** (Elasticsearch, Logstash, Kibana)
- **Datadog Logs**
- **Splunk**
- **AWS CloudWatch Logs**
- **Google Cloud Logging**
- **Azure Monitor Logs**

## Alerting Rules

### Critical Alerts (Page Immediately)

```yaml
# Alert: High Error Rate
alert: AuthHighErrorRate
expr: rate(auth_errors_total[5m]) > 0.01
for: 5m
labels:
  severity: critical
annotations:
  summary: "High error rate in auth service"
  description: "Error rate is {{ $value }}% (threshold: 1%)"

# Alert: Service Down
alert: AuthServiceDown
expr: up{job="auth"} == 0
for: 1m
labels:
  severity: critical
annotations:
  summary: "Auth service is down"
  description: "Auth service has been down for more than 1 minute"

# Alert: Redis Connection Lost
alert: AuthRedisDown
expr: auth_redis_connected == 0
for: 1m
labels:
  severity: critical
annotations:
  summary: "Redis connection lost"
  description: "Auth service lost connection to Redis"
```

### Warning Alerts (Notify During Business Hours)

```yaml
# Alert: High Login Failure Rate
alert: AuthHighLoginFailures
expr: rate(auth_login_failures_total[10m]) > 100
for: 10m
labels:
  severity: warning
annotations:
  summary: "High login failure rate"
  description: "{{ $value }} failed logins per minute"

# Alert: Rate Limit Triggered Frequently
alert: AuthHighRateLimitHits
expr: rate(auth_ratelimit_hits_total[5m]) > 1000
for: 5m
labels:
  severity: warning
annotations:
  summary: "High rate limit hit rate"
  description: "{{ $value }} rate limit hits per minute"

# Alert: High Memory Usage
alert: AuthHighMemory
expr: process_resident_memory_bytes / 1024 / 1024 > 4096
for: 5m
labels:
  severity: warning
annotations:
  summary: "High memory usage in auth service"
  description: "Memory usage is {{ $value }}MB (threshold: 4GB)"

# Alert: High Latency
alert: AuthHighLatency
expr: histogram_quantile(0.95, rate(auth_request_duration_seconds_bucket[5m])) > 0.5
for: 5m
labels:
  severity: warning
annotations:
  summary: "High request latency"
  description: "P95 latency is {{ $value }}s (threshold: 500ms)"
```

### Info Alerts (Log Only)

```yaml
# Alert: Deployment Completed
alert: AuthDeploymentCompleted
expr: auth_deployment_count > 0
labels:
  severity: info
annotations:
  summary: "New deployment completed"
  description: "Auth service deployed version {{ $value }}"

# Alert: Session Count High
alert: AuthHighSessionCount
expr: auth_active_sessions > 10000
for: 10m
labels:
  severity: info
annotations:
  summary: "High session count"
  description: "{{ $value }} active sessions"
```

## Dashboard Panels

### Grafana Dashboard Example

```json
{
  "dashboard": {
    "title": "Auth Service - v5.3.0",
    "panels": [
      {
        "title": "Login Success Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(auth_login_success_total[5m]) / rate(auth_login_attempts_total[5m]) * 100"
          }
        ]
      },
      {
        "title": "Active Sessions",
        "type": "stat",
        "targets": [
          {
            "expr": "auth_active_sessions"
          }
        ]
      },
      {
        "title": "Request Latency (p50, p95, p99)",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.50, rate(auth_request_duration_seconds_bucket[5m]))"
          },
          {
            "expr": "histogram_quantile(0.95, rate(auth_request_duration_seconds_bucket[5m]))"
          },
          {
            "expr": "histogram_quantile(0.99, rate(auth_request_duration_seconds_bucket[5m]))"
          }
        ]
      },
      {
        "title": "Error Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(auth_errors_total[5m]) * 100"
          }
        ]
      },
      {
        "title": "Rate Limit Hits",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(auth_ratelimit_hits_total[5m])"
          }
        ]
      },
      {
        "title": "Redis Operations/sec",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(auth_redis_operations_total[5m])"
          }
        ]
      }
    ]
  }
}
```

## Health Checks

### Liveness Probe

```yaml
livenessProbe:
  httpGet:
    path: /health/live
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 3
```

### Readiness Probe

```yaml
readinessProbe:
  httpGet:
    path: /health/ready
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 5
  timeoutSeconds: 3
  failureThreshold: 3
```

### Health Check Endpoints

#### `/health/live`

Returns `200 OK` if the service is running.

```json
{
  "status": "ok",
  "timestamp": "2026-07-23T12:00:00.000Z"
}
```

#### `/health/ready`

Returns `200 OK` if the service is ready to accept traffic.

```json
{
  "status": "ok",
  "timestamp": "2026-07-23T12:00:00.000Z",
  "checks": {
    "redis": "ok",
    "database": "ok"
  }
}
```

Returns `503 Service Unavailable` if dependencies are unhealthy.

```json
{
  "status": "degraded",
  "timestamp": "2026-07-23T12:00:00.000Z",
  "checks": {
    "redis": "error",
    "database": "ok"
  },
  "errors": [
    "Redis connection failed: ECONNREFUSED"
  ]
}
```

## Incident Response

### Runbook: High Error Rate

1. **Check logs** for error patterns
2. **Check recent deployments** - rollback if needed
3. **Check dependencies** (Redis, database)
4. **Check resource usage** (CPU, memory)
5. **Scale up** if under heavy load
6. **Notify team** if issue persists

### Runbook: Redis Connection Lost

1. **Check Redis status** - is it running?
2. **Check network connectivity**
3. **Check Redis memory usage**
4. **Restart Redis** if necessary
5. **Failover to replica** if primary is down
6. **Monitor session loss** and user impact

### Runbook: Brute Force Attack

1. **Check rate limit logs** for attack patterns
2. **Verify IP blocking** is working
3. **Consider lowering rate limits** temporarily
4. **Enable CAPTCHA** if available
5. **Notify security team**
6. **Document attack patterns**

## Tools Integration

### Prometheus

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'auth'
    static_configs:
      - targets: ['auth-service:3000']
    metrics_path: '/metrics'
    scrape_interval: 15s
```

### Datadog

```javascript
// Initialize Datadog tracer
const tracer = require('dd-trace').init({
  service: 'auth-service',
  env: 'production',
  version: '5.3.0'
});

// Enable metrics
const dogstatsd = require('node-dogstatsd').StatsD;
const statsd = new dogstatsd();
```

### Sentry

```typescript
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  release: '5.3.0',
  tracesSampleRate: 0.1,
});
```

## Support

- **Documentation**: https://github.com/Hallaxius/auth#readme
- **Issues**: https://github.com/Hallaxius/auth/issues
- **Emergency**: security@hallaxius.dev

---

**Last Updated**: 2026-07-23
**Version**: 5.3.0
