# Architecture Diagram - @hallaxius/auth v5.2.0

**Document Version:** 1.0  
**Last Updated:** July 23, 2026  
**System:** @hallaxius/auth Authentication Library

---

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │   Web    │  │  Mobile  │  │   API    │  │  Next.js 16  │   │
│  │  Browser │  │   App    │  │  Client  │  │   App Router │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘   │
│       │             │             │               │            │
│       └─────────────┴─────────────┴───────────────┘            │
│                         │ HTTPS                                │
└─────────────────────────┼──────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      AUTH LIBRARY LAYER                         │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │              @hallaxius/auth v5.2.0                       │ │
│  │  ┌─────────────────────────────────────────────────────┐ │ │
│  │  │              Public API Interface                    │ │ │
│  │  │  • AuthProvider                                     │ │ │
│  │  │  • Middleware                                       │ │ │
│  │  │  • Helpers (getSession, requireAuth, etc.)          │ │ │
│  │  └─────────────────────────────────────────────────────┘ │ │
│  │                           │                               │ │
│  │  ┌─────────────────────────────────────────────────────┐ │ │
│  │  │              Core Services Layer                     │ │ │
│  │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐            │ │ │
│  │  │  │   Auth   │ │ Session  │ │   MFA    │            │ │ │
│  │  │  │ Service  │ │ Service  │ │ Service  │            │ │ │
│  │  │  └──────────┘ └──────────┘ └──────────┘            │ │ │
│  │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐            │ │ │
│  │  │  │  OAuth2  │ │  Token   │ │   User   │            │ │ │
│  │  │  │ Service  │ │ Service  │ │ Service  │            │ │ │
│  │  │  └──────────┘ └──────────┘ └──────────┘            │ │ │
│  │  └─────────────────────────────────────────────────────┘ │ │
│  │                           │                               │ │
│  │  ┌─────────────────────────────────────────────────────┐ │ │
│  │  │              Security Layer                          │ │ │
│  │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐            │ │ │
│  │  │  │   Rate   │ │   Input  │ │  Crypto  │            │ │ │
│  │  │  │ Limiter  │ │Validator │ │  Utils   │            │ │ │
│  │  │  └──────────┘ └──────────┘ └──────────┘            │ │ │
│  │  └─────────────────────────────────────────────────────┘ │ │
│  │                           │                               │ │
│  │  ┌─────────────────────────────────────────────────────┐ │ │
│  │  │              Adapter Layer                           │ │ │
│  │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐            │ │ │
│  │  │  │   User   │ │  Cache   │ │  Token   │            │ │ │
│  │  │  │ Adapter  │ │ Adapter  │ │ Adapter  │            │ │ │
│  │  │  └──────────┘ └──────────┘ └──────────┘            │ │ │
│  │  └─────────────────────────────────────────────────────┘ │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      INFRASTRUCTURE LAYER                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │   PostgreSQL │  │    Redis     │  │  File System │         │
│  │   (Primary)  │  │   (Cache)    │  │   (Logs)     │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Authentication Flow Architecture

### 2.1 Credentials Authentication Flow

```
┌─────────┐                ┌──────────────────┐                ┌─────────┐
│  Client │                │  Auth Library    │                │ Storage │
└────┬────┘                └────────┬─────────┘                └────┬────┘
     │                              │                               │
     │  POST /login                 │                               │
     │  { email, password, totp }   │                               │
     │─────────────────────────────>│                               │
     │                              │                               │
     │                              │  1. Validate input (Zod)      │
     │                              │  2. Rate limit check          │
     │                              │                               │
     │                              │  3. Fetch user by email       │
     │                              │──────────────────────────────>│
     │                              │<──────────────────────────────│
     │                              │   User + password hash        │
     │                              │                               │
     │                              │  4. Verify password (PBKDF2)  │
     │                              │                               │
     │                              │  5. Verify TOTP (if enabled)  │
     │                              │                               │
     │                              │  6. Create session            │
     │                              │──────────────────────────────>│
     │                              │<──────────────────────────────│
     │                              │   Session ID                  │
     │                              │                               │
     │                              │  7. Generate JWT              │
     │                              │  8. Set cookie                │
     │                              │                               │
     │  Set-Cookie: session=...     │                               │
     │  JWT: { access, refresh }    │                               │
     │<─────────────────────────────│                               │
     │                              │                               │
```

### 2.2 OAuth2 (Discord) Flow with PKCE

```
┌─────────┐         ┌──────────────┐         ┌─────────┐         ┌─────────┐
│  Client │         │ Auth Library │         │ Discord │         │ Storage │
└────┬────┘         └──────┬───────┘         └────┬────┘         └────┬────┘
     │                     │                      │                   │
     │  GET /auth/discord  │                      │                   │
     │────────────────────>│                      │                   │
     │                     │                      │                   │
     │                     │  Generate PKCE       │                   │
     │                     │  - code_verifier     │                   │
     │                     │  - code_challenge    │                   │
     │                     │                      │                   │
     │                     │  Generate state      │                   │
     │                     │  (32 bytes random)   │                   │
     │                     │                      │                   │
     │  Redirect to        │                      │                   │
     │  Discord OAuth      │                      │                   │
     │<────────────────────│                      │                   │
     │                     │                      │                   │
     │  GET /authorize     │                      │                   │
     │  - code_challenge   │                      │                   │
     │  - state            │                      │                   │
     │───────────────────────────────────────────>│                   │
     │                     │                      │                   │
     │  User authenticates │                      │                   │
     │  & authorizes       │                      │                   │
     │                     │                      │                   │
     │  Redirect to        │                      │                   │
     │  callback?code=...  │                      │                   │
     │  &state=...         │                      │                   │
     │<───────────────────────────────────────────│                   │
     │                     │                      │                   │
     │  GET /callback      │                      │                   │
     │  ?code=...&state=...│                      │                   │
     │────────────────────>│                      │                   │
     │                     │                      │                   │
     │                     │  Verify state        │                   │
     │                     │  (anti-CSRF)         │                   │
     │                     │                      │                   │
     │                     │  POST /token         │                   │
     │                     │  - code              │                   │
     │                     │  - code_verifier     │                   │
     │                     │─────────────────────>│                   │
     │                     │                      │                   │
     │                     │<─────────────────────│                   │
     │                     │  access_token        │                   │
     │                     │  refresh_token       │                   │
     │                     │                      │                   │
     │                     │  GET /users/@me      │                   │
     │                     │  (user info)         │                   │
     │                     │─────────────────────>│                   │
     │                     │<─────────────────────│                   │
     │                     │  Discord user data   │                   │
     │                     │                      │                   │
     │                     │  Create/Update user  │                   │
     │                     │─────────────────────────────────────────>│
     │                     │<─────────────────────────────────────────│
     │                     │                      │                   │
     │                     │  Create session      │                   │
     │                     │  Generate JWT        │                   │
     │                     │                      │                   │
     │  Set-Cookie:        │                      │                   │
     │  session=...        │                      │                   │
     │<────────────────────│                      │                   │
     │                     │                      │                   │
```

### 2.3 MFA (TOTP) Setup Flow

```
┌─────────┐         ┌──────────────┐         ┌─────────┐
│  Client │         │ Auth Library │         │ Storage │
└────┬────┘         └──────┬───────┘         └────┬────┘
     │                     │                      │
     │  POST /mfa/setup    │                      │
     │────────────────────>│                      │
     │                     │                      │
     │                     │  Generate TOTP secret│
     │                     │  (32 bytes base32)   │
     │                     │                      │
     │                     │  Generate backup     │
     │                     │  codes (10 codes)    │
     │                     │                      │
     │                     │  Store secret        │
     │                     │  (encrypted)         │
     │                     │─────────────────────>│
     │                     │<─────────────────────│
     │                     │                      │
     │                     │  Generate QR code    │
     │                     │  otpauth:// URI      │
     │                     │                      │
     │  { qrCode,          │                      │
     │    backupCodes }    │                      │
     │<────────────────────│                      │
     │                     │                      │
     │  POST /mfa/verify   │                      │
     │  { totpCode }       │                      │
     │────────────────────>│                      │
     │                     │                      │
     │                     │  Verify TOTP         │
     │                     │  (RFC 6238)          │
     │                     │                      │
     │                     │  Enable MFA          │
     │                     │─────────────────────>│
     │                     │<─────────────────────│
     │                     │                      │
     │  { success: true }  │                      │
     │<────────────────────│                      │
     │                     │                      │
```

---

## 3. Component Architecture

### 3.1 AuthProvider Component

```
┌─────────────────────────────────────────────────────────────┐
│                     AuthProvider                            │
├─────────────────────────────────────────────────────────────┤
│  Constructor:                                               │
│  - config: AuthConfig                                       │
│  - adapters: { userAdapter, cacheAdapter, tokenAdapter }    │
├─────────────────────────────────────────────────────────────┤
│  Public Methods:                                            │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ • login(email, password, totpCode?)                   │ │
│  │ • logout(sessionToken)                                │ │
│  │ • register(email, password, name)                     │ │
│  │ • refreshToken(refreshToken)                          │ │
│  │ • resetPassword(token, newPassword)                   │ │
│  │ • requestPasswordReset(email)                         │ │
│  │ • verifyEmail(token)                                  │ │
│  │ • resendVerificationEmail(userId)                     │ │
│  └───────────────────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ • oauth2.getAuthorizationUrl(provider, scopes?)       │ │
│  │ • oauth2.handleCallback(code, state)                  │ │
│  │ • oauth2.refreshAccessToken(refreshToken)             │ │
│  │ • oauth2.revokeToken(token)                           │ │
│  └───────────────────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ • mfa.setup(userId)                                   │ │
│  │ • mfa.verify(userId, totpCode)                        │ │
│  │ • mfa.disable(userId, totpCode)                       │ │
│  │ • mfa.useBackupCode(userId, backupCode)               │ │
│  └───────────────────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ • session.create(userId)                              │ │
│  │ • session.validate(sessionToken)                      │ │
│  │ • session.revoke(sessionToken)                        │ │
│  │ • session.revokeAll(userId)                           │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Middleware Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Middleware Stack                         │
├─────────────────────────────────────────────────────────────┤
│  1. rateLimitMiddleware                                     │
│     - Sliding window algorithm                              │
│     - Per-IP, per-endpoint                                  │
│     - Redis-backed (distributed)                            │
├─────────────────────────────────────────────────────────────┤
│  2. sessionMiddleware                                       │
│     - Extract session token from cookie                     │
│     - Validate session                                      │
│     - Attach user to request                                │
├─────────────────────────────────────────────────────────────┤
│  3. authMiddleware (requireAuth)                            │
│     - Check authentication status                           │
│     - Redirect or 401 if not authenticated                  │
├─────────────────────────────────────────────────────────────┤
│  4. roleMiddleware (requireRole)                            │
│     - Check user roles                                      │
│     - RBAC enforcement                                        │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Security Architecture

### 4.1 Cryptographic Layer

```
┌─────────────────────────────────────────────────────────────┐
│                  Cryptographic Services                     │
├─────────────────────────────────────────────────────────────┤
│  Password Hashing (PBKDF2-SHA256)                           │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ Input: password (string)                               │ │
│  │ Salt: crypto.randomBytes(32)                           │ │
│  │ Iterations: 100,000                                    │ │
│  │ Output: 256-bit hash (base64)                          │ │
│  └───────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│  Session Encryption (AES-256-GCM)                           │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ Key: Derived from JWT_SECRET                           │ │
│  │ IV: crypto.randomBytes(12)                             │ │
│  │ Mode: Galois/Counter Mode (authenticated)              │ │
│  │ Output: ciphertext + auth tag                          │ │
│  └───────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│  JWT Signing (HS256)                                        │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ Algorithm: HMAC-SHA256                                 │ │
│  │ Secret: JWT_SECRET (32+ chars)                         │ │
│  │ Claims: sub, iat, exp, roles                           │ │
│  │ Expiry: 15 minutes (access token)                      │ │
│  └───────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│  TOTP Generation (RFC 6238)                                 │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ Algorithm: HMAC-SHA1                                   │ │
│  │ Time Step: 30 seconds                                  │ │
│  │ Digits: 6                                              │ │
│  │ Secret: 32 bytes (base32-encoded)                      │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Rate Limiting Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                 Rate Limiter (Sliding Window)               │
├─────────────────────────────────────────────────────────────┤
│  Algorithm: Sliding Window Log                              │
├─────────────────────────────────────────────────────────────┤
│  Storage Options:                                           │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │   In-Memory     │  │     Redis       │                  │
│  │  (single node)  │  │ (distributed)   │                  │
│  └─────────────────┘  └─────────────────┘                  │
├─────────────────────────────────────────────────────────────┤
│  Configuration:                                             │
│  - windowMs: Time window (e.g., 900000 = 15 min)            │
│  - maxAttempts: Max attempts per window (e.g., 5)           │
│  - keyGenerator: IP extraction function                     │
├─────────────────────────────────────────────────────────────┤
│  Flow:                                                      │
│  1. Extract IP (with proxy support)                         │
│  2. Generate key: `ratelimit:${endpoint}:${ip}`             │
│  3. Get timestamps from storage                             │
│  4. Remove old timestamps (outside window)                  │
│  5. Count remaining timestamps                              │
│  6. If count >= max: REJECT (429)                           │
│  7. Else: Add timestamp, ALLOW                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Data Flow Architecture

### 5.1 User Registration Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    Registration Flow                        │
├─────────────────────────────────────────────────────────────┤
│  1. Client → POST /register                                 │
│     { email, password, name }                               │
│                                                             │
│  2. Validate Input (Zod Schema)                             │
│     - Email format (RFC 5322)                               │
│     - Password strength (8+ chars, complexity)              │
│     - Name (2-50 chars)                                     │
│                                                             │
│  3. Check Duplicate Email                                   │
│     └─→ If exists: Return 409 Conflict                      │
│                                                             │
│  4. Hash Password (PBKDF2-SHA256)                           │
│     - Generate salt: crypto.randomBytes(32)                 │
│     - Hash: pbkdf2(password, salt, 100k, 32, 'sha256')      │
│                                                             │
│  5. Create User Record                                      │
│     {                                                       │
│       id: uuidv4(),                                         │
│       email,                                                │
│       passwordHash,                                         │
│       passwordSalt,                                         │
│       name,                                                 │
│       emailVerified: false,                                 │
│       createdAt: Date.now()                                 │
│     }                                                       │
│                                                             │
│  6. Generate Verification Token                             │
│     - JWT with 24h expiry                                   │
│     - Claims: { sub: userId, type: 'email-verification' }   │
│                                                             │
│  7. Send Verification Email                                 │
│     - Template: email-verification.html                     │
│     - Link: /verify-email?token={jwt}                       │
│                                                             │
│  8. Return Success                                          │
│     { success: true, message: 'Check your email' }          │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Token Refresh Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    Token Refresh Flow                       │
├─────────────────────────────────────────────────────────────┤
│  1. Client → POST /refresh                                  │
│     { refreshToken }                                        │
│                                                             │
│  2. Validate Refresh Token                                  │
│     - Verify JWT signature                                  │
│     - Check expiration                                      │
│     - Validate type claim                                   │
│                                                             │
│  3. Check Token Blacklist                                   │
│     └─→ If blacklisted: Return 401 Unauthorized             │
│                                                             │
│  4. Verify Session Still Valid                              │
│     - Check session exists in storage                       │
│     - Check session not revoked                             │
│                                                             │
│  5. Generate New Access Token                               │
│     - JWT with 15min expiry                                 │
│     - Claims: { sub, roles, iat, exp }                      │
│                                                             │
│  6. Generate New Refresh Token (optional)                   │
│     - JWT with 7d expiry                                    │
│     - Rotate refresh token (security best practice)         │
│                                                             │
│  7. Return New Tokens                                       │
│     {                                                       │
│       accessToken: jwt,                                     │
│       refreshToken: jwt (if rotated)                        │
│     }                                                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. Adapter Architecture

### 6.1 Adapter Pattern

```
┌─────────────────────────────────────────────────────────────┐
│                    Adapter Interface                        │
├─────────────────────────────────────────────────────────────┤
│  UserAdapter                                                │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ • findById(id: string): Promise<User | null>          │ │
│  │ • findByEmail(email: string): Promise<User | null>    │ │
│  │ • create(data: CreateUser): Promise<User>             │ │
│  │ • update(id: string, data: UpdateUser): Promise<User> │ │
│  │ • delete(id: string): Promise<void>                   │ │
│  │ • findByOAuth(provider: string, providerId: string):  │ │
│  │   Promise<User | null>                                │ │
│  │ • linkOAuth(userId: string, provider: string,         │ │
│  │   providerId: string): Promise<void>                  │ │
│  └───────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│  CacheAdapter                                               │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ • get(key: string): Promise<any>                      │ │
│  │ • set(key: string, value: any, ttl?: number):         │ │
│  │   Promise<void>                                       │ │
│  │ • delete(key: string): Promise<void>                  │ │
│  │ • clear(): Promise<void>                              │ │
│  └───────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│  TokenAdapter                                               │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ • create(userId: string, type: string,                │ │
│  │   token: string, expiresAt: Date): Promise<Token>     │ │
│  │ • findByToken(token: string): Promise<Token | null>   │ │
│  │ • revoke(token: string): Promise<void>                │ │
│  │ • revokeAll(userId: string, type?: string):           │ │
│  │   Promise<void>                                       │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 Built-in Adapters

```
┌─────────────────────────────────────────────────────────────┐
│                  Built-in Adapter Implementations           │
├─────────────────────────────────────────────────────────────┤
│  MemoryCacheAdapter                                         │
│  - In-memory key-value store                                │
│  - LRU eviction                                             │
│  - TTL-based expiration                                     │
│  - Use case: Development, single-instance                   │
├─────────────────────────────────────────────────────────────┤
│  RedisCacheAdapter                                          │
│  - Redis-backed cache                                       │
│  - Distributed support                                      │
│  - Automatic serialization                                  │
│  - Use case: Production, multi-instance                     │
├─────────────────────────────────────────────────────────────┤
│  RedisClusterCacheAdapter                                   │
│  - Redis Cluster support                                    │
│  - Automatic sharding                                       │
│  - Failover handling                                        │
│  - Use case: High-availability production                   │
├─────────────────────────────────────────────────────────────┤
│  MultiLevelCacheAdapter                                     │
│  - L1: Memory (fast)                                        │
│  - L2: Redis (distributed)                                  │
│  - Cache coherence protocol                                 │
│  - Use case: Performance-critical applications              │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. Deployment Architecture

### 7.1 Single-Instance Deployment

```
┌─────────────────────────────────────────────────────────────┐
│                    Single Instance                          │
├─────────────────────────────────────────────────────────────┤
│  ┌───────────────┐                                          │
│  │  App Server   │                                          │
│  │  (Bun/Node)   │                                          │
│  │               │                                          │
│  │  ┌─────────┐  │                                          │
│  │  │  Auth   │  │                                          │
│  │  │ Library │  │                                          │
│  │  └────┬────┘  │                                          │
│  │       │        │                                          │
│  │  ┌────┴────┐  │                                          │
│  │  │ Memory  │  │                                          │
│  │  │ Cache   │  │                                          │
│  │  └─────────┘  │                                          │
│  └───────┬───────┘                                          │
│          │                                                  │
│          ▼                                                  │
│  ┌───────────────┐                                          │
│  │  PostgreSQL   │                                          │
│  │  (Primary DB) │                                          │
│  └───────────────┘                                          │
└─────────────────────────────────────────────────────────────┘
```

### 7.2 Multi-Instance Deployment (Production)

```
┌─────────────────────────────────────────────────────────────┐
│                  Multi-Instance (HA)                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Load Balancer (nginx/HAProxy)           │   │
│  │              - SSL Termination                       │   │
│  │              - Health Checks                         │   │
│  │              - Round-robin/Least-conn                │   │
│  └────────────────────┬────────────────────────────────┘   │
│                       │                                     │
│         ┌─────────────┼─────────────┐                       │
│         │             │             │                       │
│         ▼             ▼             ▼                       │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐                 │
│  │  App 1    │ │  App 2    │ │  App 3    │                 │
│  │  (Bun)    │ │  (Bun)    │ │  (Bun)    │                 │
│  │           │ │           │ │           │                 │
│  │ ┌───────┐ │ │ ┌───────┐ │ │ ┌───────┐ │                 │
│  │ │ Auth  │ │ │ │ Auth  │ │ │ │ Auth  │ │                 │
│  │ │ Lib   │ │ │ │ Lib   │ │ │ │ Lib   │ │                 │
│  │ └───┬───┘ │ │ └───┬───┘ │ │ └───┬───┘ │                 │
│  └─────┼─────┘ └─────┼─────┘ └─────┼─────┘                 │
│        │             │             │                         │
│        └─────────────┼─────────────┘                         │
│                      │                                       │
│                      ▼                                       │
│         ┌────────────────────────┐                          │
│         │     Redis Cluster      │                          │
│         │  - Distributed Cache   │                          │
│         │  - Session Store       │                          │
│         │  - Rate Limiting       │                          │
│         └────────────────────────┘                          │
│                      │                                       │
│                      ▼                                       │
│         ┌────────────────────────┐                          │
│         │     PostgreSQL         │                          │
│         │  - Primary DB          │                          │
│         │  - Replication         │                          │
│         └────────────────────────┘                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 8. Monitoring & Observability

### 8.1 Audit Logging Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Audit Logging System                      │
├─────────────────────────────────────────────────────────────┤
│  Events Logged:                                             │
│  - login.attempt                                            │
│  - login.success                                            │
│  - login.failure                                            │
│  - logout                                                   │
│  - register                                                 │
│  - password.reset.request                                   │
│  - password.reset.complete                                  │
│  - mfa.setup                                                │
│  - mfa.verify                                               │
│  - session.create                                           │
│  - session.revoke                                           │
│  - token.refresh                                            │
├─────────────────────────────────────────────────────────────┤
│  Log Structure:                                             │
│  {                                                          │
│    id: uuid,                                                │
│    timestamp: ISO8601,                                      │
│    event: string,                                           │
│    userId: string | null,                                   │
│    email: string | null,                                    │
│    ipAddress: string,                                       │
│    userAgent: string,                                       │
│    success: boolean,                                        │
│    metadata: object                                         │
│  }                                                          │
├─────────────────────────────────────────────────────────────┤
│  Storage:                                                   │
│  - File-based (development)                                 │
│  - Elasticsearch/Splunk (production)                        │
│  - Retention: 90 days default                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 9. Performance Architecture

### 9.1 Caching Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                  Multi-Level Caching                        │
├─────────────────────────────────────────────────────────────┤
│  L1 Cache: Memory (In-Process)                              │
│  - Latency: < 1ms                                           │
│  - Size: 10,000 entries max                                 │
│  - Eviction: LRU                                            │
│  - TTL: 5 minutes                                           │
├─────────────────────────────────────────────────────────────┤
│  L2 Cache: Redis (Distributed)                              │
│  - Latency: 5-10ms                                          │
│  - Size: Unlimited                                          │
│  - Eviction: TTL-based                                      │
│  - TTL: 15 minutes                                          │
├─────────────────────────────────────────────────────────────┤
│  Cache Hit Flow:                                            │
│  1. Check L1 (Memory)                                       │
│     └─→ Hit: Return immediately (< 1ms)                     │
│     └─→ Miss: Check L2 (Redis)                              │
│        └─→ Hit: Populate L1, Return (5-10ms)                │
│        └─→ Miss: Query DB, Populate L1+L2                   │
└─────────────────────────────────────────────────────────────┘
```

### 9.2 Performance Benchmarks

| Operation | Latency (p50) | Latency (p99) | Throughput |
|-----------|---------------|---------------|------------|
| Login (cache hit) | 15ms | 45ms | 500 req/s |
| Login (cache miss) | 85ms | 150ms | 200 req/s |
| Token Validation | 2ms | 8ms | 2000 req/s |
| Session Creation | 10ms | 30ms | 800 req/s |
| Password Hashing | 70ms | 100ms | 100 req/s |

---

## 10. Security Boundaries

### 10.1 Trust Boundaries

```
┌─────────────────────────────────────────────────────────────┐
│                    Trust Boundary Diagram                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │              UNTRUSTED ZONE                           │ │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐              │ │
│  │  │ Client  │  │ Network │  │  Proxy  │              │ │
│  │  │ Browser │  │  (TLS)  │  │  (LB)   │              │ │
│  │  └────┬────┘  └────┬────┘  └────┬────┘              │ │
│  └───────┼───────────┼───────────┼─────────────────────┘ │
│          │           │           │ TRUST BOUNDARY         │
│          ▼           ▼           ▼                        │
│  ┌───────────────────────────────────────────────────────┐ │
│  │              TRUSTED ZONE                             │ │
│  │  ┌─────────────────────────────────────────────────┐  │ │
│  │  │           Auth Library                          │  │ │
│  │  │  • Input Validation (Zod)                       │  │ │
│  │  │  • Authentication                               │  │ │
│  │  │  • Authorization                                │  │ │
│  │  │  • Rate Limiting                                │  │ │
│  │  └─────────────────────────────────────────────────┘  │ │
│  │  ┌─────────────────────────────────────────────────┐  │ │
│  │  │           Application Server                    │  │ │
│  │  │  • Business Logic                               │  │ │
│  │  │  • Data Processing                              │  │ │
│  │  └─────────────────────────────────────────────────┘  │ │
│  └───────────────────────────────────────────────────────┘ │
│          │           │           │                         │
│          ▼           ▼           ▼                         │
│  ┌───────────────────────────────────────────────────────┐ │
│  │              DATA ZONE                                │ │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐              │ │
│  │  │   DB    │  │  Redis  │  │  Logs   │              │ │
│  │  └─────────┘  └─────────┘  └─────────┘              │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Appendix: File Structure

```
@hallaxius/auth/
├── src/
│   ├── index.ts                 # Main entry point
│   ├── provider.ts              # AuthProvider class
│   ├── types/                   # TypeScript types
│   │   ├── index.ts
│   │   ├── auth.ts
│   │   ├── session.ts
│   │   ├── user.ts
│   │   └── oauth2.ts
│   ├── services/                # Core services
│   │   ├── auth-service.ts
│   │   ├── session-service.ts
│   │   ├── token-service.ts
│   │   ├── mfa-service.ts
│   │   └── oauth2-service.ts
│   ├── middleware/              # Express middleware
│   │   ├── index.ts
│   │   ├── rate-limit.ts
│   │   ├── session.ts
│   │   └── auth.ts
│   ├── adapters/                # Adapter implementations
│   │   ├── cache/
│   │   │   ├── memory.ts
│   │   │   ├── redis.ts
│   │   │   ├── redis-cluster.ts
│   │   │   └── multi-level.ts
│   │   └── user/
│   │       └── postgres.ts
│   ├── utils/                   # Utilities
│   │   ├── crypto.ts
│   │   ├── jwt.ts
│   │   ├── totp.ts
│   │   ├── rate-limiter.ts
│   │   └── audit-logger.ts
│   └── constants/               # Constants
│       └── index.ts
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── security/
│   └── performance/
├── docs/
│   ├── SECURITY.md
│   ├── PRODUCTION.md
│   └── JSDOC-REPORT.md
└── security-audit/
    ├── SECURITY-AUDIT-REPORT.md
    ├── ARCHITECTURE-DIAGRAM.md
    ├── THREAT-MODEL.md
    └── FINAL-DELIVERY-REPORT.md
```

---

**Document Classification:** PUBLIC  
**Maintainer:** @hallaxius  
**Contact:** security@hallaxius.dev