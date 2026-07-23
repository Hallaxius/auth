# API Reference - @hallaxius/auth

Documentação completa da API com exemplos de uso para todos os módulos.

## Índice

- [Discord OAuth2](#discord-oauth2)
- [Credentials Auth](#credentials-auth)
- [Password Reset](#password-reset)
- [MFA (TOTP + Backup Codes)](#mfa-totp--backup-codes)
- [Rate Limiting](#rate-limiting)
- [Middleware / Proxy](#middleware--proxy)
- [Config Utilities](#config-utilities)
- [Utils](#utils)
- [Error Handling](#error-handling)
- [Types](#types)

---

## Discord OAuth2

### `discord(config)`

Factory function que cria handlers completos de autenticação Discord OAuth2.

#### Parâmetros

```typescript
interface DiscordFactoryConfig {
  clientId: string;                    // Discord Client ID (obrigatório)
  clientSecret: string;                // Discord Client Secret (obrigatório)
  secret: string;                      // JWT signing secret, min 32 chars (obrigatório)
  callbackUrl: string;                 // Callback URL registrada no Discord
  scopes?: DiscordScope[];             // OAuth2 scopes (padrão: ['identify'])
  prompt?: 'consent' | 'none';         // Discord OAuth2 prompt
  storage?: UserStorage;               // User persistence interface
  routes?: RoutesConfig;               // Custom route paths
  redirectUri?: string;                // Override redirect URI
  disablePKCE?: boolean;               // Disable PKCE (NÃO recomendado)
  autoRefresh?: AutoRefreshConfig;     // Auto-refresh token config
  bruteForce?: BruteForceConfig;       // Brute force protection
  mfa?: DiscordMfaConfig;              // MFA requirement
  guildRoleSync?: GuildRoleSyncConfig; // Discord guild role sync
  csrf?: CsrfConfig;                   // CSRF protection settings
  callbacks?: Callbacks;               // onSuccess, onError callbacks
  stateSecret?: string;                // State HMAC secret (derived from secret)
  session?: SessionConfig;             // Session cookie configuration
}
```

#### Retorno

```typescript
interface DiscordAuthResult {
  handleLogin: (request: Request) => Promise<Response>;
  handleCallback: (request: Request) => Promise<Response>;
  handleLogout: (request: Request) => Promise<Response>;
  handleMe: (request: Request) => Promise<Response>;
  getSession: (request: Request) => Promise<SessionData | null>;
  withAuth: (handler: AuthHandler) => (request: Request) => Promise<Response>;
  dispose?: () => void;
}
```

#### Exemplo de Uso

```typescript
import { discord } from '@hallaxius/auth'

// Configuração básica
export const { handleLogin, handleCallback, handleLogout, handleMe } = await discord({
  clientId: process.env.DISCORD_CLIENT_ID!,
  clientSecret: process.env.DISCORD_CLIENT_SECRET!,
  secret: process.env.JWT_SECRET!,
  callbackUrl: process.env.DISCORD_REDIRECT_URI!,
  scopes: ['identify', 'email', 'guilds'],
  session: {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    httpOnly: true,
  },
})

// Com storage de usuários
export const { handleLogin, handleCallback } = await discord({
  clientId: process.env.DISCORD_CLIENT_ID!,
  clientSecret: process.env.DISCORD_CLIENT_SECRET!,
  secret: process.env.JWT_SECRET!,
  callbackUrl: process.env.DISCORD_REDIRECT_URI!,
  storage: drizzleStorage,  // UserStorage interface
  autoRefresh: {
    enabled: true,
    thresholdSeconds: 300,  // Refresh 5 min before expiry
    maxRetries: 3,
  },
})

// Com guild role sync
export const { handleCallback } = await discord({
  // ...config básico
  guildRoleSync: {
    enabled: true,
    guildId: 'your-guild-id',
    botToken: process.env.DISCORD_BOT_TOKEN!,
    syncOnLogin: true,
  },
  scopes: ['identify', 'guilds', 'guilds.members.read'],
})
```

#### Handlers HTTP

```typescript
// app/auth/discord/route.ts
import { handleLogin } from '@/lib/auth'
export const GET = handleLogin

// app/auth/discord/callback/route.ts
import { handleCallback } from '@/lib/auth'
export const GET = handleCallback

// app/auth/discord/logout/route.ts
import { handleLogout } from '@/lib/auth'
export const POST = handleLogout

// app/api/me/route.ts
import { handleMe } from '@/lib/auth'
export const GET = handleMe
```

#### Middleware de Autenticação

```typescript
import { discord } from '@hallaxius/auth'

const auth = await discord({ /* config */ })

// Proteger rota
export const GET = auth.withAuth(async (request, { user, storedUser }) => {
  return Response.json({ user })
})

// Extrair sessão manualmente
export async function GET(request: Request) {
  const session = await auth.getSession(request)
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return Response.json(session)
}
```

---

## Credentials Auth

### `credentials(config)`

Factory function para autenticação com username/password ou email/password.

#### Parâmetros

```typescript
interface CredentialsConfig {
  strategy: AuthStrategy;              // UsernameOnly | EmailOnly | UsernameEmail
  session: {
    secret: string;                    // JWT signing secret (min 32 chars)
    expiresIn?: string | number;       // Token expiry (padrão: '7d')
    cookieName?: string;               // Cookie name (padrão: 'credentials-session')
  };
  storage: AuthUserStorage;            // User persistence (obrigatório)
  hasher: PasswordHasher;              // Password hasher (bcrypt/argon2)
  bruteForce?: BruteForceConfig;       // Brute force protection
  cookiePath?: string;                 // Cookie path (padrão: '/')
  httpOnly?: boolean;                  // HttpOnly flag (padrão: true)
  secure?: boolean;                    // Secure flag (padrão: NODE_ENV === 'production')
  sameSite?: 'lax' | 'strict' | 'none'; // SameSite policy
  defaultRoles?: string[];             // Default roles (padrão: ['user'])
  minPasswordLength?: number;          // Min password length (padrão: 8)
}

enum AuthStrategy {
  UsernameOnly = 'username-only',
  EmailOnly = 'email-only',
  UsernameEmail = 'username-email',
}
```

#### Retorno

```typescript
interface CredentialsResult {
  handleRegister: (request: Request) => Promise<Response>;
  handleLogin: (request: Request) => Promise<Response>;
  handleLogout: (request: Request) => Promise<Response>;
  handleMe: (request: Request) => Promise<Response>;
  getSession: (request: Request) => Promise<AuthUser | null>;
  withAuth: (handler: AuthHandler) => (request: Request) => Promise<Response>;
}
```

#### Exemplo de Uso

```typescript
import { credentials, AuthStrategy } from '@hallaxius/auth'
import { bcryptHasher } from './hasher'
import { drizzleStorage } from './storage'

export const { handleRegister, handleLogin, handleLogout, handleMe } = credentials({
  strategy: AuthStrategy.UsernameEmail,
  session: {
    secret: process.env.JWT_SECRET!,
    expiresIn: '7d',
  },
  storage: drizzleStorage,
  hasher: bcryptHasher,
  bruteForce: {
    enabled: true,
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000,        // 15 minutes
    blockDurationMs: 30 * 60 * 1000,  // 30 minutes
  },
  minPasswordLength: 8,
})
```

#### Handlers HTTP

```typescript
// app/api/auth/register/route.ts
import { handleRegister } from '@/lib/auth'
export const POST = handleRegister

// app/api/auth/login/route.ts
import { handleLogin } from '@/lib/auth'
export const POST = handleLogin

// app/api/auth/logout/route.ts
import { handleLogout } from '@/lib/auth'
export const POST = handleLogout

// app/api/auth/me/route.ts
import { handleMe } from '@/lib/auth'
export const GET = handleMe
```

#### Password Hasher

```typescript
import type { PasswordHasher } from '@hallaxius/auth'
import bcrypt from 'bcrypt'

export const bcryptHasher: PasswordHasher = {
  async hash(password: string): Promise<string> {
    return bcrypt.hash(password, 12)
  },
  async verify(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash)
  },
}
```

---

## Password Reset

### `passwordReset(config)`

Factory function para forgot-password e reset-password flows.

#### Parâmetros

```typescript
interface PasswordResetConfig {
  storage: ResetTokenStorage;        // Token persistence (obrigatório)
  notifier: ResetNotifier;           // Email/SMS notifier (obrigatório)
  hasher: PasswordHasher;            // Password hasher (obrigatório)
  minPasswordLength?: number;        // Min password length (padrão: 8)
  tokenExpirationSeconds?: number;   // Token TTL (padrão: 3600)
  forgotPasswordRateLimit?: {        // Rate limit forgot-password
    maxAttempts: number;
    windowMs: number;
  };
  resetPasswordRateLimit?: {         // Rate limit reset-password
    maxAttempts: number;
    windowMs: number;
  };
  onPasswordReset?: (                // Callback after reset
    userId: string,
    newPasswordHash: string
  ) => Promise<void>;
  userLookup?: (                     // Custom user lookup
    emailOrUsername: string
  ) => Promise<{ userId: string; email: string; username: string } | null>;
}
```

#### Retorno

```typescript
interface PasswordResetResult {
  handleForgotPassword: (request: Request) => Promise<Response | undefined>;
  handleResetPassword: (request: Request) => Promise<Response | undefined>;
  requestReset: (target: string) => Promise<RequestResetResult>;
  consumeResetToken: (token: string) => Promise<ConsumeResetTokenResult>;
}
```

#### Exemplo de Uso

```typescript
import { passwordReset } from '@hallaxius/auth'
import { bcryptHasher } from './hasher'

export const { handleForgotPassword, handleResetPassword } = passwordReset({
  storage: resetTokenStorage,
  notifier: {
    async send(token, userId, email, username) {
      // Send email with reset link
      const resetLink = `${process.env.APP_URL}/auth/reset-password?token=${token.selector}.${token.validator}`
      await sendEmail({
        to: email,
        subject: 'Password Reset',
        body: `Click here to reset: ${resetLink}`,
      })
    },
  },
  hasher: bcryptHasher,
  minPasswordLength: 8,
  tokenExpirationSeconds: 3600,
  forgotPasswordRateLimit: {
    maxAttempts: 3,
    windowMs: 60 * 60 * 1000,  // 1 hour
  },
})
```

#### Handlers HTTP

```typescript
// app/api/auth/forgot-password/route.ts
import { handleForgotPassword } from '@/lib/auth'
export const POST = handleForgotPassword

// app/api/auth/reset-password/route.ts
import { handleResetPassword } from '@/lib/auth'
export const POST = handleResetPassword
```

#### Storage Interface

```typescript
interface ResetTokenStorage {
  create(data: {
    selector: string;
    validatorHash: string;
    expiry: number;
    userId: string;
    email: string;
    username: string;
  }): Promise<void>;

  consume(selector: string): Promise<{
    userId: string;
    email: string;
    username: string;
  } | null>;

  delete(selector: string): Promise<void>;

  findBySelector(selector: string): Promise<{
    userId: string;
    email: string;
    username: string;
    validatorHash: string;
    expiry: number;
  } | null>;

  deleteAllUserTokens?(userId: string): Promise<void>;
}
```

---

## MFA (TOTP + Backup Codes)

### `mfa(config)`

Factory function para MFA com TOTP (RFC 6238) e backup codes.

#### Parâmetros

```typescript
interface MfaFactoryConfig {
  storage: MfaStorage;             // MFA persistence (obrigatório)
  secret: string;                  // Encryption key (AES-GCM-256, min 32 chars)
  issuer?: string;                 // TOTP URI issuer (padrão: 'AuthApp')
  allowedMethods?: MfaMethod[];    // ['totp', 'backup_codes']
  verifyPassword?: (               // Password verification for disable
    userId: string,
    password: string
  ) => Promise<boolean>;
}

type MfaMethod = 'totp' | 'backup_codes';
```

#### Retorno

```typescript
interface MfaResult {
  setup: (userId: string) => Promise<TotpSetupResult>;
  verify: (userId: string, code: string, request?: Request) => Promise<MfaVerifyResult>;
  challenge: (userId: string, method: MfaMethod, code: string) => Promise<MfaChallengeResult>;
  isEnabled: (userId: string) => Promise<boolean>;
  disable: (userId: string) => Promise<void>;
  handleMfaSetup: (request: Request) => Promise<Response>;
  handleMfaVerify: (request: Request) => Promise<Response>;
  handleMfaChallenge: (request: Request) => Promise<Response>;
  handleMfaDisable: (request: Request) => Promise<Response>;
}
```

#### Exemplo de Uso

```typescript
import { mfa } from '@hallaxius/auth'

export const { handleMfaSetup, handleMfaVerify, handleMfaChallenge, handleMfaDisable } = mfa({
  storage: mfaStorage,
  secret: process.env.MFA_SECRET!,
  issuer: 'MyApp',
  allowedMethods: ['totp', 'backup_codes'],
  verifyPassword: async (userId, password) => {
    // Verify user password before allowing MFA disable
    const user = await getUser(userId)
    return bcrypt.compare(password, user.passwordHash)
  },
})
```

#### Handlers HTTP

```typescript
// app/api/auth/mfa/setup/route.ts
import { handleMfaSetup } from '@/lib/auth'
export const POST = handleMfaSetup

// app/api/auth/mfa/verify/route.ts
import { handleMfaVerify } from '@/lib/auth'
export const POST = handleMfaVerify

// app/api/auth/mfa/challenge/route.ts
import { handleMfaChallenge } from '@/lib/auth'
export const POST = handleMfaChallenge

// app/api/auth/mfa/disable/route.ts
import { handleMfaDisable } from '@/lib/auth'
export const POST = handleMfaDisable
```

#### Setup Flow

```typescript
// 1. User requests MFA setup
export async function POST(request: Request) {
  const session = await getSession(request)
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await mfa.setup(session.discordId)
  // result.secret: Base32-encoded TOTP secret
  // result.uri: otpauth:// URI for QR code
  // result.backupCodes: Array of 10 backup codes
  // result.pendingToken: Token for verify step

  return Response.json({
    totpUri: result.uri,
    backupCodes: result.backupCodes,
  })
}

// 2. User verifies TOTP code
export async function POST(request: Request) {
  const session = await getSession(request)
  const { code } = await request.json()

  const result = await mfa.verify(session.discordId, code)
  // result.success: boolean
  // result.backupCodes?: string[] (if verified with backup code)

  return Response.json({ success: true })
}
```

#### Storage Interface

```typescript
interface MfaStorage {
  getSecret(userId: string): Promise<string | null>;
  setSecret(userId: string, encryptedSecret: string): Promise<void>;
  setSecretIfAbsent?(userId: string, encryptedSecret: string): Promise<boolean | undefined>;
  deleteSecret(userId: string): Promise<void>;
  getBackupCodes(userId: string): Promise<string[] | null>;
  setBackupCodes(userId: string, hashedCodes: string[]): Promise<void>;
  consumeBackupCode(userId: string, codeIndex: number): Promise<void>;
  getLastUsedCounter(userId: string): Promise<number | null>;
  setLastUsedCounter(userId: string, counter: number): Promise<void>;
  setPendingToken?(userId: string, entry: PendingTokenEntry): Promise<void>;
  getPendingToken?(userId: string): Promise<PendingTokenEntry | null>;
  deletePendingToken?(userId: string): Promise<void>;
}

interface PendingTokenEntry {
  token: string;
  createdAt: number;
  expiresAt: number;
}
```

---

## Rate Limiting

### `rateLimit(config)`

Factory function para rate limiting com headers RFC-compliant.

#### Parâmetros

```typescript
interface RateLimitConfig {
  maxRequests: number;             // Max requests per window
  windowMs: number;                // Time window in milliseconds
  storage?: RateLimitStorage;      // Custom storage interface
  keyBy?: (request: Request) => Promise<string>; // Custom key extractor
}
```

#### Retorno

```typescript
interface RateLimitResult {
  middleware: (request: Request) => Promise<Response | undefined>;
  check: (request: Request) => Promise<RateLimitResult>;
  reset: (request: Request) => Promise<void>;
}
```

#### Exemplo de Uso

```typescript
import { rateLimit } from '@hallaxius/auth'

// Rate limit básico
export const { middleware: rateLimitMiddleware } = rateLimit({
  maxRequests: 100,
  windowMs: 60_000,  // 1 minute
})

// Custom key extractor
export const { middleware } = rateLimit({
  maxRequests: 10,
  windowMs: 60_000,
  keyBy: async (request) => {
    const ip = await extractIpFromRequest(request)
    return `api:${ip}`
  },
})

// Usar como middleware
export async function POST(request: Request) {
  const response = await rateLimitMiddleware(request)
  if (response) return response  // 429 if rate limited

  // Continue with request handling
  return Response.json({ success: true })
}
```

#### Headers RFC-Compliant

```
RateLimit: limit=100, remaining=99, reset=60
RateLimit-Policy: 100;w=60
Retry-After: 60  (on 429 response)
```

---

## Middleware / Proxy

### `middleware.auth(config)`

Middleware de autenticação para Next.js e edge runtimes.

#### Parâmetros

```typescript
interface EdgeAuthConfig {
  secret: string;                              // JWT secret (obrigatório)
  loginUrl?: string;                           // Redirect URL (padrão: '/auth/discord')
  publicPaths?: string[];                      // Paths que bypass auth
  cookieName?: string;                         // Cookie name (legacy)
  cookies?: Array<{                            // Multi-provider support
    name: string;
    secret: string;
  }>;
}
```

#### Exemplo de Uso

```typescript
import { middleware } from '@hallaxius/auth'

// Auth básico
const auth = middleware.auth({
  secret: process.env.JWT_SECRET!,
  loginUrl: '/auth/discord',
  publicPaths: ['/', '/auth/*', '/api/public/*'],
})

// Multi-provider
const auth = middleware.auth({
  cookies: [
    { name: 'discord-auth-session', secret: process.env.JWT_SECRET! },
    { name: 'credentials-session', secret: process.env.JWT_SECRET! },
  ],
  publicPaths: ['/'],
})

// middleware.ts (Next.js)
export { auth as default }
```

### `middleware.role(config)`

Middleware de autorização por roles.

#### Parâmetros

```typescript
interface EdgeRoleConfig {
  secret: string;                    // JWT secret (obrigatório)
  loginUrl?: string;                 // Redirect URL (padrão: '/auth/discord')
  roles: Record<string, string[]>;   // Path pattern → required roles
  cookieName?: string;               // Cookie name (padrão: 'discord-auth-session')
}
```

#### Exemplo de Uso

```typescript
import { middleware } from '@hallaxius/auth'

const role = middleware.role({
  secret: process.env.JWT_SECRET!,
  roles: {
    '/admin/*': ['admin'],
    '/mod/*': ['admin', 'moderator'],
    '/dashboard': ['user', 'admin'],
  },
})

// middleware.ts
export default middleware.combine(auth, role)
```

### `middleware.combine(...middlewares)`

Combina múltiplos middlewares.

```typescript
import { middleware } from '@hallaxius/auth'

export default middleware.combine(
  middleware.auth({ secret: '...', publicPaths: ['/'] }),
  middleware.role({ secret: '...', roles: { '/admin/*': ['admin'] } }),
)
```

### `middleware.session(request, config)`

Extrai sessão de qualquer Request.

```typescript
import { middleware } from '@hallaxius/auth'

const user = await middleware.session(request, {
  secret: process.env.JWT_SECRET!,
  cookieName: 'discord-auth-session',
})

if (user) {
  console.log(user.discordId, user.username, user.roles)
}
```

### `middleware.publicPath(path, patterns)`

Verifica se path é público.

```typescript
import { middleware } from '@hallaxius/auth'

const isPublic = middleware.publicPath('/auth/login', ['/auth/*'])
// true
```

### `middleware.required(path, roleMap)`

Retorna roles necessários para um path.

```typescript
import { middleware } from '@hallaxius/auth'

const roles = middleware.required('/admin/users', {
  '/admin/*': ['admin']
})
// ['admin']
```

### `middleware.redirect(url)`

Cria redirect 302.

```typescript
import { middleware } from '@hallaxius/auth'

return middleware.redirect('/auth/discord')
// Response { status: 302, Location: '/auth/discord' }
```

### `middleware.deny(message)`

Cria resposta 403.

```typescript
import { middleware } from '@hallaxius/auth'

return middleware.deny('Access denied')
// Response { status: 403, body: { error: 'Access denied' } }
```

---

## Config Utilities

### `config.processConfig(config)`

Processa configuração com defaults.

```typescript
import { config } from '@hallaxius/auth'

const internalConfig = await config.processConfig(userConfig)
```

### `config.pkce`

Utilitários PKCE (RFC 7636).

```typescript
import { config } from '@hallaxius/auth'

// Gerar PKCE pair
const { verifier, challenge, codeChallengeMethod } = await config.pkce.create()

// Validar verifier
config.pkce.validateVerifier(verifier)  // throws se inválido

// Gerar challenge
const challenge = await config.pkce.challenge(verifier)
```

---

## Utils

### `utils.secret(length?)`

Gera string aleatória criptograficamente segura.

```typescript
import { utils } from '@hallaxius/auth'

const secret = utils.secret(32)  // Base64URL-encoded, 32 bytes
```

### `utils.validate(config)`

Valida configuração Discord OAuth2.

```typescript
import { utils, errors } from '@hallaxius/auth'

try {
  utils.validate({ clientId: '', clientSecret: '' })
} catch (e) {
  if (e instanceof errors.AuthError) {
    console.error(e.message)
  }
}
```

### `utils.createPasswordHasher(algorithm)`

Cria password hasher.

```typescript
import { utils } from '@hallaxius/auth'

const hasher = utils.createPasswordHasher('bcrypt')
const hash = await hasher.hash('password')
const valid = await hasher.verify('password', hash)
```

### `utils.benchmarkPasswordHasher(hasher, password, iterations?)`

Benchmark de password hasher.

```typescript
import { utils } from '@hallaxius/auth'

const stats = await utils.benchmarkPasswordHasher(hasher, 'test-password', 10)
console.log(`Hash: ${stats.hashTimeMs}ms, Verify: ${stats.verifyTimeMs}ms`)
```

### `utils.constantTimeCompare(a, b)`

Comparação constante de byte arrays.

```typescript
import { utils } from '@hallaxius/auth'

const match = utils.constantTimeCompare(
  new Uint8Array([1, 2, 3]),
  new Uint8Array([1, 2, 3])
)  // true
```

### `utils.constantTimeCompareStrings(a, b)`

Comparação constante de strings.

```typescript
import { utils } from '@hallaxius/auth'

const match = utils.constantTimeCompareStrings('abc', 'abc')  // true
```

### `utils.constantTimeCompareHex(a, b)`

Comparação constante de hex strings.

```typescript
import { utils } from '@hallaxius/auth'

const match = utils.constantTimeCompareHex('a1b2c3', 'a1b2c3')  // true
```

### `utils.isIPv6(ip)`

Verifica se IP é IPv6.

```typescript
import { utils } from '@hallaxius/auth'

const isV6 = utils.isIPv6('2001:db8::1')  // true
```

### `utils.maskIPv6To64(ip)`

Mask IPv6 para /64.

```typescript
import { utils } from '@hallaxius/auth'

const masked = utils.maskIPv6To64('2001:db8:1234:5678:abcd:ef01:2345:6789')
// '2001:db8:1234:5678::'
```

### `utils.sanitizeIP(ip)`

Sanitiza IP (remove brackets, normaliza).

```typescript
import { utils } from '@hallaxius/auth'

const clean = utils.sanitizeIP('[2001:db8::1]')  // '2001:db8::1'
```

### `utils.guild`

Operações de guild Discord.

```typescript
import { utils } from '@hallaxius/auth'

// Add user to guild
await utils.guild.join({
  guildId: 'guild-id',
  userId: 'user-id',
  accessToken: 'user-token',
  botToken: process.env.DISCORD_BOT_TOKEN!,
  nick: 'Nickname',      // optional
  roles: ['role-id'],    // optional
})

// Check if user has role
const isAdmin = await utils.guild.hasRole(
  'user-id',
  'guild-id',
  'admin-role-id',
  process.env.DISCORD_BOT_TOKEN!
)

// Sync roles
const roles = await utils.guild.sync(
  'discord-id',
  'guild-id',
  process.env.DISCORD_BOT_TOKEN!,
  storage
)

// Check if user is member
const isMember = await utils.guild.hasMember(
  'user-id',
  'guild-id',
  process.env.DISCORD_BOT_TOKEN!
)

// Check if user has any role
const hasAny = await utils.guild.hasAnyRole(
  'user-id',
  'guild-id',
  ['role1', 'role2'],
  process.env.DISCORD_BOT_TOKEN!
)
```

### `utils.revoke(token, secret, storage?)`

Revoga token JWT (adiciona a blacklist).

```typescript
import { utils } from '@hallaxius/auth'

await utils.revoke(token, process.env.JWT_SECRET!, redisStorage)
```

---

## Error Handling

### `AuthError`

Classe base para todos os erros de autenticação.

```typescript
import { AuthError, ErrorCodes } from '@hallaxius/auth'

try {
  await handleCallback(request)
} catch (e) {
  if (e instanceof AuthError) {
    console.log(e.code)        // Error code string
    console.log(e.statusCode)  // HTTP status code
    console.log(e.retryAfter)  // Seconds until retry (if rate limited)
    console.log(e.cause)       // Original error
  }
}
```

### `ErrorCodes`

Códigos de erro estáveis.

```typescript
import { ErrorCodes } from '@hallaxius/auth'

const ErrorCodes = {
  // Configuration
  CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',

  // CSRF / State
  INVALID_STATE: 'INVALID_STATE',
  EXPIRED_STATE: 'EXPIRED_STATE',
  STATE_REUSED: 'STATE_REUSED',
  STATE_BINDING_FAILED: 'STATE_BINDING_FAILED',

  // PKCE
  PKCE_VALIDATION_FAILED: 'PKCE_VALIDATION_FAILED',
  INVALID_CODE_VERIFIER: 'INVALID_CODE_VERIFIER',

  // OAuth2 Flow
  INVALID_CODE: 'INVALID_CODE',
  INVALID_GRANT: 'INVALID_GRANT',
  TOKEN_EXCHANGE_FAILED: 'TOKEN_EXCHANGE_FAILED',

  // Tokens
  INVALID_TOKEN: 'INVALID_TOKEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_REFRESH_FAILED: 'TOKEN_REFRESH_FAILED',
  TOKEN_REVOKED: 'TOKEN_REVOKED',
  INTERACTION_REQUIRED: 'INTERACTION_REQUIRED',

  // MFA
  MFA_REQUIRED: 'MFA_REQUIRED',
  MFA_SETUP_REQUIRED: 'MFA_SETUP_REQUIRED',
  MFA_INVALID_CODE: 'MFA_INVALID_CODE',
  MFA_INVALID_BACKUP: 'MFA_INVALID_BACKUP',
  MFA_BACKUP_EXHAUSTED: 'MFA_BACKUP_EXHAUSTED',
  MFA_NOT_SETUP: 'MFA_NOT_SETUP',
  MFA_ALREADY_SETUP: 'MFA_ALREADY_SETUP',
  MFA_CHALLENGE_FAILED: 'MFA_CHALLENGE_FAILED',

  // Password Reset
  RESET_TOKEN_EXPIRED: 'RESET_TOKEN_EXPIRED',
  RESET_TOKEN_INVALID: 'RESET_TOKEN_INVALID',
  RESET_TOKEN_USED: 'RESET_TOKEN_USED',
  RESET_TOKEN_CONSUMED: 'RESET_TOKEN_CONSUMED',
  RESET_PASSWORD_WEAK: 'RESET_PASSWORD_WEAK',

  // Rate Limiting
  RATE_LIMITED: 'RATE_LIMITED',
  RATE_LIMITED_ROUTE: 'RATE_LIMITED_ROUTE',

  // Upstream / Network
  UPSTREAM_ERROR: 'UPSTREAM_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',

  // Storage
  STORAGE_READ_ERROR: 'STORAGE_READ_ERROR',
  STORAGE_WRITE_ERROR: 'STORAGE_WRITE_ERROR',
  STORAGE_UNAVAILABLE: 'STORAGE_UNAVAILABLE',

  // Credentials
  USERNAME_TAKEN: 'USERNAME_TAKEN',
  EMAIL_TAKEN: 'EMAIL_TAKEN',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  CREDENTIALS_VALIDATION_ERROR: 'CREDENTIALS_VALIDATION_ERROR',

  // Guild
  GUILD_JOIN_ERROR: 'GUILD_JOIN_ERROR',
  GUILD_SYNC_ERROR: 'GUILD_SYNC_ERROR',

  // Brute Force
  BRUTE_FORCE_BLOCKED: 'BRUTE_FORCE_BLOCKED',
} as const
```

### `isAuthError(error)`

Type guard para AuthError.

```typescript
import { isAuthError } from '@hallaxius/auth'

if (isAuthError(e)) {
  console.log(e.code, e.statusCode)
}
```

### `getCode(error)`

Extrai código de erro.

```typescript
import { getCode } from '@hallaxius/auth'

const code = getCode(e)  // 'TOKEN_EXPIRED' | undefined
```

### Error Classes Especializadas

```typescript
import {
  ConfigurationError,
  InvalidStateError,
  ExpiredStateError,
  StateReusedError,
  PKCEValidationError,
  InvalidCodeError,
  InvalidGrantError,
  TokenExchangeError,
  InvalidTokenError,
  TokenExpiredError,
  TokenRefreshError,
  TokenRevokedError,
  MfaRequiredError,
  RateLimitError,
  UpstreamError,
  NetworkError,
  StorageReadError,
  StorageWriteError,
  StorageUnavailableError,
  UsernameTakenError,
  EmailTakenError,
  InvalidCredentialsError,
  UserNotFoundError,
  CredentialsValidationError,
  GuildJoinError,
  GuildSyncError,
  BruteForceBlockedError,
  InvalidCodeVerifierError,
  InteractionRequiredError,
} from '@hallaxius/auth'
```

---

## Types

### Tipos Comuns

```typescript
import type {
  SessionData,        // Dados da sessão JWT
  AuthUser,           // User de credentials auth
  StoredUser,         // User persistido no DB
  SafeStoredUser,     // User sem tokens (client-safe)
  DiscordUser,        // User do Discord API
  DiscordScope,       // OAuth2 scopes
  MfaMethod,          // 'totp' | 'backup_codes'
  AuthStrategy,       // UsernameOnly | EmailOnly | UsernameEmail
  PasswordHasher,     // Hash/verify interface
  RateLimitResult,    // Rate limit result
  MfaVerifyResult,    // MFA verify result
  TotpSetupResult,    // TOTP setup result
} from '@hallaxius/auth'
```

### SessionData

```typescript
interface SessionData {
  discordId: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
  email: string | null;
  locale: string;
  roles?: string[];
  mfaEnabled?: boolean;
}
```

### DiscordScope

```typescript
type DiscordScope =
  | 'identify'
  | 'email'
  | 'guilds'
  | 'guilds.join'
  | 'guilds.members.read'
  | 'connections'
  | 'role_connections.write'
  | 'rpc'
  | 'rpc.notifications.read'
  | 'rpc.voice.read'
  | 'rpc.voice.write'
  | 'activities.read'
  | 'activities.write'
  | 'bot'
  | 'webhook.incoming'
  | 'messages.read'
  | 'applications.builds.upload'
  | 'applications.builds.read'
  | 'applications.commands'
  | 'applications.commands.permissions.update'
  | 'applications.store.update'
  | 'applications.entitlements'
  | 'relationships.read'
  | 'voice'
  | 'dm_channels.read'
```

Para documentação completa de tipos, visite [TypeDoc](https://hallaxius.github.io/auth/typedoc/).
