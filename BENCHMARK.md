# @hallaxius/auth — Performance Benchmarks

> Secure authentication toolkit for Bun and Next.js 16+ with Discord OAuth2, Credentials, MFA/TOTP, password reset flows — backed by built-in CSRF protection, rate limiting, and brute-force defense.

---

## Quick Start

```bash
# Run all benchmarks
bun run benchmarks

# Run specific benchmark
bun run benchmarks/auth.ts
bun run benchmarks/jwt.ts
bun run benchmarks/rate-limit.ts
bun run benchmarks/mfa.ts
```

---

## Latest Benchmark Results

### Test Environment
- **CPU:** AMD Ryzen 5 5600 6-Core Processor
- **Runtime:** Bun 1.3.14 (x64-win32)
- **OS:** Windows 11
- **Clock Speed:** ~1.53-1.99 GHz (varies by benchmark)

---

## 1. Authentication Operations

| Operation | Avg Time | P75 | P99 Range | Memory |
|-----------|----------|-----|-----------|--------|
| Login (valid credentials) | 98.14 µs | 94.20 µs | 56.80 µs-1.86 ms | 2.85 KB |
| Login (invalid password) | 15.64 µs | 17.20 µs | 7.20 µs-1.20 ms | 2.18 KB |
| Logout | 5.89 µs | 6.30 µs | 2.70 µs-1.15 ms | 547 B |

**Key Insights:**
- Login operations use external storage (Redis/Database/KV) for user lookup
- Invalid password attempts are rejected quickly (< 16 µs)
- Logout is extremely fast (< 6 µs) - only clears session cookie
- All operations maintain constant-time comparison to prevent timing attacks

---

## 2. JWT Operations

| Operation | Avg Time | P75 | P99 Range | Memory |
|-----------|----------|-----|-----------|--------|
| JWT Sign (HS256) | 42.45 µs | 41.90 µs | 23.00 µs-1.67 ms | 954 B |
| JWT Verify (valid) | 96.62 µs | 93.40 µs | 54.10 µs-1.96 ms | 1.96 KB |
| JWT Verify (expired) | 104.28 µs | 100.40 µs | 60.10 µs-2.29 ms | 1.33 KB |
| JWT Parse (no verify) | 37.87 µs | 38.20 µs | 20.90 µs-4.42 ms | 700 B |

**Key Insights:**
- JWT operations complete in < 100 µs for most cases
- Signature generation is 2x faster than verification (42 µs vs 97 µs)
- Parsing without verification is fastest (38 µs)
- Expired token verification takes ~8 µs longer than valid tokens

---

## 3. Rate Limiting Operations

| Operation | Avg Time | P75 | P99 Range | Memory |
|-----------|----------|-----|-----------|--------|
| Rate limit check (allowed) | 11.03 µs | 12.10 µs | 5.30 µs-1.40 ms | 578 B |
| Rate limit check (different IPs) | 111.93 µs | 127.50 µs | 62.60 µs-2.04 ms | 1.75 KB |

**Key Insights:**
- Rate limiting uses external storage (Redis/KV) for distributed deployments
- Individual checks are very fast (< 12 µs)
- Different IP checks are 10x slower due to storage lookups but still sub-millisecond
- Sliding window algorithm ensures accurate rate limiting across workers

---

## 4. MFA (TOTP) Operations

| Operation | Avg Time | P75 | P99 Range | Memory |
|-----------|----------|-----|-----------|--------|
| MFA Setup (generate TOTP secret) | 13.68 ms | 14.42 ms | 11.35-17.24 ms | 37.42 KB |
| MFA Verify (valid TOTP) | 27.40 ms | 28.66 ms | 24.58-30.37 ms | 24.38 KB |
| MFA Verify (invalid TOTP) | 4.94 µs | 5.17 µs | 4.27-6.23 µs | 462 B |
| Backup codes generation | 83.13 µs | 91.90 µs | 44.00 µs-2.74 ms | 4.09 KB |

**Key Insights:**
- MFA setup includes secret generation, encryption, and backup code creation
- Valid TOTP verification requires database operations (~27 ms)
- Invalid TOTP codes are rejected quickly (< 5 µs) - constant-time comparison
- Backup code generation is efficient at ~83 µs

---

## Performance Summary

### Fastest Operations (< 100 µs)
1. **MFA invalid code rejection:** 4.94 µs
2. **Logout:** 5.89 µs
3. **Rate limit check (allowed):** 11.03 µs
4. **Login (invalid password):** 15.64 µs
5. **JWT sign (HS256):** 42.45 µs
6. **JWT parse (no verify):** 37.87 µs
7. **JWT verify (valid):** 96.62 µs

### Moderate Operations (100 µs - 1 ms)
1. **Login (valid credentials):** 98.14 µs
2. **Rate limit check (different IPs):** 111.93 µs
3. **JWT verify (expired):** 104.28 µs
4. **Backup codes generation:** 83.13 µs

### Slowest Operations (> 1 ms)
1. **MFA setup (generate TOTP secret):** 13.68 ms
2. **MFA verify (valid TOTP):** 27.40 ms

**Note:** MFA operations are slower due to cryptographic operations and database persistence requirements.

---

## Running Custom Benchmarks

### Adjust Iterations
```bash
bun run benchmarks/auth.ts --iterations=10000
```

### Single Benchmark File
```bash
bun run benchmarks/jwt.ts
bun run benchmarks/rate-limit.ts
bun run benchmarks/mfa.ts
```

### All Benchmarks
```bash
bun run benchmarks
# or
bun run benchmarks/run-all.ts
```

---

## Benchmark Infrastructure

Benchmarks are powered by [mitata](https://github.com/evanwashere/mitata), a fast benchmarking library for Bun.

**Location:** `benchmarks/`

| File | Description |
|------|-------------|
| `auth.ts` | Authentication flow benchmarks (login, logout) |
| `jwt.ts` | JWT sign/verify benchmarks |
| `rate-limit.ts` | Rate limiting benchmarks |
| `mfa.ts` | MFA/TOTP benchmarks |
| `run-all.ts` | Runner for all benchmarks |

---

## Performance Best Practices

1. **Use External Storage:** All stateful operations require Redis/Database/KV for production
2. **Enable Rate Limiting:** Protect against brute force with minimal performance impact (< 12 µs)
3. **Short JWT Expiry:** Use 15-30 minute expiry for better security
4. **MFA for Sensitive Apps:** TOTP verification is fast enough for most use cases
5. **Monitor P99 Latency:** Focus on worst-case scenarios, not averages

---

## Notes

- All benchmarks run with warm-up iterations before measurement
- Results may vary based on hardware and system load
- Times include all overhead (I/O, encryption, database operations)
- For implementation examples and API usage, refer to [README.md](README.md)
- External storage (Redis/Database/KV) is required for all production deployments

---
