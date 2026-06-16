# @hallaxius/auth

> Plug-and-play Discord OAuth2 authentication for Elysia/Bun, Next.js, and any Node/edge runtime.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/@hallaxius/auth)](https://www.npmjs.com/package/@hallaxius/auth)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/@hallaxius/auth)](https://bundlephobia.com/package/@hallaxius/auth@latest)

## Features

- **Discord OAuth2** — Authorization code flow with CSRF protection (Web Crypto HMAC)
- **Elysia plugin** — `discordAuth(config)` with macros `auth`, `optionalAuth`, `requireRole`
- **Class wrapper** — `new Discord(config)` with method chaining
- **Standalone mode** — For Next.js App Router, Node.js, or any edge runtime
- **Route guards** — `withAuth`, `withOptionalAuth`, `withRole(roles)` for route handlers
- **Edge/Next.js middleware** — `middlewareAuth`, `middlewareRole`, `combine`, `nextAuth`, `nextRole`
- **User persistence** — Pluggable `UserStorage` interface (implement for your DB)
- **JWT sessions** — Stateless, edge-compatible (uses `jose`)
- **Server sessions** — In-memory Map with TTL (dev/light use)
- **Auto-join guild** — `DiscordClient.addMember()` to add users to your server after login
- **Edge compatible** — Web Crypto API, zero Node dependencies
- **Zero unnecessary deps** — Only `jose` and `@elysiajs/jwt`

## Installation

```bash
bun add @hallaxius/auth
# npm install @hallaxius/auth
# pnpm add @hallaxius/auth
# yarn add @hallaxius/auth
```

> **Peer dependencies:** `elysia >= 1.4.28` (required for plugin), `next` (optional, required for `nextAuth`/`nextRole`)

---

## Table of Contents

- [Quick Start](#quick-start)
- [Quick Start (v1.1+) — Presets](#quick-start-v11--presets)
- [Configuration](#configuration)
- [Elysia Plugin](#elysia-plugin)
  - [Factory Pattern / Presets](#factory-pattern--presets)
- [Standalone Mode](#standalone-mode)
- [Edge / Next.js Middleware](#edge--nextjs-middleware)
- [User Persistence](#user-persistence)
- [Auto-Join Guild](#auto-join-guild)
- [Utility Helpers](#utility-helpers)
- [Security Best Practices](#security-best-practices)
- [Migration Guide](#migration-guide)
- [Troubleshooting](#troubleshooting)
- [API Reference](#api-reference)
- [License](#license)

---

## Quick Start

### Elysia (Plugin)

```ts
import { Elysia } from "elysia"
import { discordAuth } from "@hallaxius/auth"

const app = new Elysia()
  .use(discordAuth({
    clientId: process.env.DISCORD_CLIENT_ID!,
    clientSecret: process.env.DISCORD_CLIENT_SECRET!,
    session: {
      type: "jwt",
      secret: process.env.JWT_SECRET!,
    },
  }))
  .get("/dashboard", ({ user }) => `Welcome, ${user.username}!`, {
    auth: true,
  })
  .listen(3000)
```

### Elysia (Wrapper)

```ts
import { Discord } from "@hallaxius/auth"

const app = new Discord({
  clientId: process.env.DISCORD_CLIENT_ID!,
  clientSecret: process.env.DISCORD_CLIENT_SECRET!,
  session: { type: "jwt", secret: process.env.JWT_SECRET! },
})

app.get("/dashboard", ({ user }) => `Welcome, ${user.username}!`, {
  auth: true,
})
app.listen(3000)
```

### Next.js (Standalone Route Handlers)

```ts
// lib/auth.ts
import { auth } from "@hallaxius/auth"

export const { handleLogin, handleCallback, handleLogout, handleMe } = auth({
  clientId: process.env.DISCORD_CLIENT_ID!,
  clientSecret: process.env.DISCORD_CLIENT_SECRET!,
  session: { type: "jwt", secret: process.env.JWT_SECRET! },
})
```

```ts
// app/auth/discord/route.ts
import { handleLogin } from "@/lib/auth"
export const GET = handleLogin
```

```ts
// app/auth/discord/callback/route.ts
import { handleCallback } from "@/lib/auth"
export const GET = handleCallback
```

```ts
// app/auth/discord/logout/route.ts
import { handleLogout } from "@/lib/auth"
export const GET = handleLogout
```

### Next.js (Middleware)

```ts
// middleware.ts
import { nextAuth, nextRole, combine } from "@hallaxius/auth"

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*"],
}

export default combine(
  nextAuth({
    secret: process.env.JWT_SECRET!,
    loginUrl: "/auth/discord",
    publicPaths: ["/", "/auth/*"],
  }),
  nextRole({
    secret: process.env.JWT_SECRET!,
    loginUrl: "/auth/discord",
    roles: { "/admin/*": ["admin"] },
  }),
)
```

---

## Quick Start (v1.1+) — Presets

### Simplified with Presets

The v1.1.0 introduced **presets** for common configurations and a **factory pattern** for explicit usage. **Updated in v1.2.0** with utility helpers, `getGuildMember()`, and `DISCORD_REDIRECT_URI` fallback.

#### SPA (React, Vue, Svelte, etc.)

```ts
import { Elysia } from "elysia"
import { discordAuth } from "@hallaxius/auth"

const app = new Elysia()
    .use(discordAuth.presets.spa({
        clientId: process.env.DISCORD_CLIENT_ID!,
        clientSecret: process.env.DISCORD_CLIENT_SECRET!,
        secret: process.env.JWT_SECRET!,
    }))
    .get("/dashboard", ({ user }) => `Welcome, ${user.username}!`, { auth: true })
    .listen(3000)
```

#### Server-Side (with UserStorage)

```ts
const app = new Elysia()
    .use(discordAuth.presets.server({
        clientId: process.env.DISCORD_CLIENT_ID!,
        clientSecret: process.env.DISCORD_CLIENT_SECRET!,
        secret: process.env.JWT_SECRET!,
        storage: myStorage,
    }))
    .get("/dashboard", ({ user }) => `Hi ${user.username}`, { auth: true })
    .listen(3000)
```

#### Next.js App Router

```ts
const app = new Elysia()
    .use(discordAuth.presets.nextjs({
        clientId: process.env.DISCORD_CLIENT_ID!,
        clientSecret: process.env.DISCORD_CLIENT_SECRET!,
        secret: process.env.JWT_SECRET!,
    }))
```

#### Edge Runtime (Workers, Deno)

```ts
const app = new Elysia()
    .use(discordAuth.presets.edge({
        clientId: process.env.DISCORD_CLIENT_ID!,
        clientSecret: process.env.DISCORD_CLIENT_SECRET!,
        secret: process.env.JWT_SECRET!,
    }))
```

#### Factory Pattern

```ts
import { from } from "@hallaxius/auth"

const app = from({
    clientId: process.env.DISCORD_CLIENT_ID!,
    clientSecret: process.env.DISCORD_CLIENT_SECRET!,
    session: { type: "jwt", secret: process.env.JWT_SECRET! },
})
```

### Preset Configuration

| Preset | `session.type` | `secure` | `sameSite` | Best For |
|--------|---------------|----------|------------|----------|
| `spa` | `jwt` | `false` | `lax` | React / Vue / Svelte (localhost dev) |
| `server` | `server` | `true` | `lax` | Traditional backends (requires `storage`) |
| `nextjs` | `jwt` | `true` | `lax` | Next.js App Router / Middleware |
| `edge` | `jwt` | `true` | `lax` | Cloudflare Workers, Deno, edge runtimes |

---

## Configuration

### DiscordAuthConfig

```ts
interface DiscordAuthConfig {
  clientId: string
  clientSecret: string
  session: SessionConfig
  scopes?: DiscordScope[]
  prompt?: "consent" | "none"
  routes?: RoutesConfig
  callbacks?: Callbacks
  storage?: UserStorage
  meRoute?: string
  redirectUri?: string
  disablePKCE?: boolean
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `clientId` | `string` | — | Discord OAuth2 Client ID |
| `clientSecret` | `string` | — | Discord OAuth2 Client Secret |
| `session` | `SessionConfig` | — | Session configuration |
| `scopes` | `DiscordScope[]` | `["identify"]` | OAuth2 scopes |
| `prompt` | `"consent" \| "none"` | `"consent"` | OAuth2 prompt parameter |
| `redirectUri` | `string` | `DISCORD_REDIRECT_URI` env or auto-computed | Full absolute callback URL registered in Discord Developer Portal. Overrides auto-computed `{prefix}/callback`. Falls back to `process.env.DISCORD_REDIRECT_URI` then auto-computed `{prefix}/callback` |
| `routes` | `RoutesConfig` | — | Custom route paths |
| `callbacks` | `Callbacks` | — | `onSuccess` / `onError` hooks |
| `storage` | `UserStorage` | — | Optional user persistence |
| `meRoute` | `string` | `"/auth/me"` | Path for `/me` endpoint |
| `disablePKCE` | `boolean` | `false` | Disable PKCE (S256) for server-side confidential clients |

### SessionConfig

```ts
interface SessionConfig {
  type: "jwt" | "server"
  secret: string
  expiresIn?: string | number
  cookieName?: string
  cookiePath?: string
  httpOnly?: boolean
  secure?: boolean
  sameSite?: "lax" | "strict" | "none"
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `type` | `"jwt"` \| `"server"` | — | Session storage type |
| `secret` | `string` | — | HMAC secret for JWT signing |
| `expiresIn` | `string` \| `number` | `"7d"` | Expiration (e.g. `"7d"`, `"1h"`, `3600`) |
| `cookieName` | `string` | `"discord-auth-session"` | Cookie name |
| `cookiePath` | `string` | `"/"` | Cookie path |
| `httpOnly` | `boolean` | `true` | HttpOnly flag |
| `secure` | `boolean` | `false` | Secure flag |
| `sameSite` | `"lax"` \| `"strict"` \| `"none"` | `"lax"` | SameSite policy |

### RoutesConfig

```ts
interface RoutesConfig {
  prefix?: string
  callback?: string
  logout?: string
  error?: string
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `prefix` | `string` | `"/auth/discord"` | Route prefix |
| `callback` | `string` | `"/auth/discord/callback"` | Full callback path (used directly) |
| `logout` | `string` | `"/auth/discord/logout"` | Full logout path (used directly) |
| `error` | `string` | `"/auth/discord/error"` | Full error path (used directly) |

### Callbacks

```ts
interface Callbacks {
  onSuccess?: (
    user: DiscordUser,
    tokens: DiscordTokenResponse,
  ) => Promise<{ redirect?: string } | undefined>
  onError?: (
    error: Error,
    phase: "auth" | "callback" | "session",
  ) => Promise<{ redirect?: string } | undefined>
}
```

### Edge Configs

```ts
interface EdgeSessionConfig {
  secret: string
  cookieName?: string
}

interface EdgeAuthConfig extends EdgeSessionConfig {
  loginUrl?: string
  publicPaths?: string[]
}

interface EdgeRoleConfig extends EdgeSessionConfig {
  loginUrl?: string
  roles: Record<string, string[]>
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `secret` | `string` | — | JWT secret (same as `SessionConfig.secret`) |
| `cookieName` | `string` | `"discord-auth-session"` | Cookie name |
| `loginUrl` | `string` | `"/auth/discord"` | Redirect URL for unauthenticated users |
| `publicPaths` | `string[]` | `[]` | Paths that bypass auth (`*` wildcard supported) |
| `roles` | `Record<string, string[]>` | — | Path pattern → required roles |

### Redirect URI

The `redirectUri` is the full absolute URL that Discord redirects users to after authorization. It **must match exactly** what is registered in the [Discord Developer Portal](https://discord.com/developers/applications) under **OAuth2 → Redirects**.

**Resolution order (when `redirectUri` is not provided):**

1. `config.redirectUri` (explicit)
2. `process.env.DISCORD_REDIRECT_URI` (environment variable)
3. Auto-generated from the route prefix: `{routes.prefix}/callback` (e.g. `/auth/discord/callback`)

Setting `DISCORD_REDIRECT_URI` is useful when the auto-computed path doesn't match your deployment URL (e.g. reverse proxy, custom domain).

**For the OAuth2 flow to work, you MUST:**

1. Add the full absolute callback URL to your Discord app at `https://discord.com/developers/applications/{your-app-id}/oauth2`
2. Ensure it matches the `redirectUri` your application sends

Examples:

| Environment | Discord Portal Entry | Config |
|-------------|---------------------|--------|
| Local dev | `http://localhost:3000/auth/discord/callback` | `redirectUri: "http://localhost:3000/auth/discord/callback"` |
| Production | `https://your-site.com/auth/discord/callback` | `redirectUri: "https://your-site.com/auth/discord/callback"` |

```ts
discordAuth({
  clientId: process.env.DISCORD_CLIENT_ID!,
  clientSecret: process.env.DISCORD_CLIENT_SECRET!,
  session: { type: "jwt", secret: process.env.JWT_SECRET! },
  redirectUri: process.env.DISCORD_REDIRECT_URI!,
})
```

> ⚠️ The URL must match character-for-character including protocol (`http` vs `https`), trailing slashes, and port number.
> ⚠️ In production, always use `https`. Discord does not allow `http` except for `localhost`.

---

## Elysia Plugin

### discordAuth(config)

Registers OAuth2 login, callback, logout routes and exposes auth macros.

```ts
import { Elysia } from "elysia"
import { discordAuth } from "@hallaxius/auth"

const app = new Elysia()
  .use(discordAuth({
    clientId: process.env.DISCORD_CLIENT_ID!,
    clientSecret: process.env.DISCORD_CLIENT_SECRET!,
    session: {
      type: "jwt",
      secret: process.env.JWT_SECRET!,
      expiresIn: "7d",
    },
    scopes: ["identify", "guilds"],
    prompt: "consent",
  }))
```

### Factory Pattern / Presets

> **New in v1.1.0** — explicit factory and presets for common configurations.

#### `discordAuth.from(config)`

Explicit factory alias for `discordAuth()`. Use when you prefer a factory-style API.

```ts
import { discordAuth } from "@hallaxius/auth"

const app = discordAuth.from({
    clientId: process.env.DISCORD_CLIENT_ID!,
    clientSecret: process.env.DISCORD_CLIENT_SECRET!,
    session: { type: "jwt", secret: process.env.JWT_SECRET! },
})
```

#### `discordAuth.presets.spa(opts)`, `.server(opts)`, `.nextjs(opts)`, `.edge(opts)`

Pre-configured presets with sensible defaults for each environment:

| Preset | `session.type` | `secure` | `sameSite` | Best For |
|--------|---------------|----------|------------|----------|
| `spa` | `jwt` | `false` | `lax` | React / Vue / Svelte (localhost dev) |
| `server` | `server` | `true` | `lax` | Traditional backends (requires `storage`) |
| `nextjs` | `jwt` | `true` | `lax` | Next.js App Router / Middleware |
| `edge` | `jwt` | `true` | `lax` | Cloudflare Workers, Deno, edge runtimes |

```ts
// SPA
discordAuth.presets.spa({
    clientId: process.env.DISCORD_CLIENT_ID!,
    clientSecret: process.env.DISCORD_CLIENT_SECRET!,
    secret: process.env.JWT_SECRET!,
})

// Server with storage
discordAuth.presets.server({
    clientId: "...",
    clientSecret: "...",
    secret: "...",
    storage: myStorage,
})
```

#### `discordAuth.middlewares(deps)`

Returns the same standalone middleware factory as `middlewares()`. An alias for when you want to access middlewares through the plugin object.

#### Type Inference

Use `InferUser`, `InferSession`, and `InferStoredUser` to extract the JWT payload type from your configured app:

```ts
import { Elysia } from "elysia"
import { discordAuth, type InferUser } from "@hallaxius/auth"

const app = new Elysia()
    .use(discordAuth({
        clientId: "...",
        clientSecret: "...",
        session: { type: "jwt", secret: process.env.JWT_SECRET! },
    }))

type User = InferUser<typeof app>
// User has: { discordId: string; username: string; ... }
```

#### Macros

| Macro | Type | Description |
|-------|------|-------------|
| `auth` | `boolean` | Requires authentication; injects `ctx.user` and `ctx.storedUser` |
| `optionalAuth` | `boolean` | Optional auth; injects `ctx.user` (null if not authenticated) |
| `requireRole` | `string[]` | Requires auth + specific roles (only with `storage`) |

#### Routes Registered

| Route | Method | Description |
|-------|--------|-------------|
| `GET /auth/discord` | GET | Redirects to Discord OAuth2 consent |
| `GET /auth/discord/callback` | GET | Handles OAuth2 callback, creates session |
| `GET /auth/discord/logout` | GET | Destroys session, clears cookie |
| `GET /auth/me` | GET | Returns current user (only when `storage` is configured) |

#### Route Guards

```ts
// Protected route — injects ctx.user + ctx.storedUser
app.get("/dashboard", ({ user, storedUser }) => {
  return { user, storedUser }
}, { auth: true })

// Optional auth — user is null when not logged in
app.get("/", ({ user }) => {
  return user ? `Hello ${user.username}` : "Hello stranger"
}, { optionalAuth: true })

// Role-based — 403 if user lacks required role
app.get("/admin", ({ user }) => {
  return `Admin panel — ${user.username}`
}, { requireRole: ["admin"] })
```

#### Custom Routes

```ts
discordAuth({
  routes: {
    prefix: "/api/auth",
    callback: "/api/auth/callback",
    logout: "/api/auth/logout",
  },
})
```

Routes are used directly as absolute paths. The `prefix` controls the login route and the `redirectUri` (auto-computed as `{prefix}/callback`, or overridden by the explicit `redirectUri` option):

- `GET /api/auth` → login
- `GET /api/auth/callback` → callback
- `GET /api/auth/logout` → logout

#### Callbacks

```ts
discordAuth({
  callbacks: {
    onSuccess: async (user, tokens) => {
      console.log(`User ${user.username} logged in`)
      return { redirect: "/welcome" }
    },
    onError: async (error, phase) => {
      console.error(`Error in ${phase}:`, error)
      return { redirect: "/error" }
    },
  },
})
```

#### User Persistence

```ts
import { createStorage } from "./my-storage"

discordAuth({
  storage: createStorage(db),
})
```

When `storage` is provided:
- Users are persisted on first login and updated on return
- `/me` route is registered
- `requireRole` macro becomes available
- `ctx.storedUser` contains `SafeStoredUser` (no tokens)

### new Discord(config) — Class Wrapper

Wraps the Elysia plugin with a fluent API.

```ts
import { Discord } from "@hallaxius/auth"

const app = new Discord({
  clientId: process.env.DISCORD_CLIENT_ID!,
  clientSecret: process.env.DISCORD_CLIENT_SECRET!,
  session: { type: "jwt", secret: process.env.JWT_SECRET! },
  storage: myStorage,
})

// Route guards work the same way
app
  .get("/dashboard", ({ user }) => `Hello ${user.username}`, { auth: true })
  .get("/admin", ({ user }) => `Admin: ${user.username}`, { requireRole: ["admin"] })
  .use(somePlugin)
  .listen(3000, () => console.log("Server running"))

// Access the underlying Elysia instance
const rawElysia = app.raw
```

#### Available Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `.get(path, handler, opts?)` | `this` | Register GET route |
| `.post(path, handler, opts?)` | `this` | Register POST route |
| `.put(path, handler, opts?)` | `this` | Register PUT route |
| `.delete(path, handler, opts?)` | `this` | Register DELETE route |
| `.patch(path, handler, opts?)` | `this` | Register PATCH route |
| `.all(path, handler, opts?)` | `this` | Register route for all methods |
| `.use(plugin)` | `this` | Mount Elysia plugin |
| `.onError(handler)` | `this` | Register error handler |
| `.listen(port, cb?)` | Elysia app | Start server |
| `.raw` | Elysia app | Access raw Elysia instance |

#### Properties

| Property | Type | Description |
|----------|------|-------------|
| `.config` | `DiscordAuthConfig` | Config passed to constructor |
| `.storage` | `UserStorage \| null` | Configured storage adapter |
| `.raw` | Elysia app | Raw Elysia instance for advanced use |

---

## Standalone Mode

Works with **Next.js App Router**, **Node.js**, **Bun**, or any runtime that supports standard `Request`/`Response`.

### auth(config) — Factory

```ts
import { auth } from "@hallaxius/auth"

const discord = auth({
  clientId: process.env.DISCORD_CLIENT_ID!,
  clientSecret: process.env.DISCORD_CLIENT_SECRET!,
  session: { type: "jwt", secret: process.env.JWT_SECRET! },
  scopes: ["identify", "email"],
})
```

Returns:

| Export | Type | Description |
|--------|------|-------------|
| `handleLogin` | `(Request) => Promise<Response>` | Redirects to Discord OAuth2 |
| `handleCallback` | `(Request) => Promise<Response>` | Exchanges code, sets cookie |
| `handleLogout` | `(Request) => Promise<Response>` | Clears session cookie (revokes token if storage present) |
| `handleMe` | `(Request) => Promise<Response>` | Returns current user (JSON) |
| `withAuth` | `(handler) => handler` | Protects a route handler |
| `withOptionalAuth` | `(handler) => handler` | Optional auth wrapper |
| `withRole` | `(...roles: string[]) => (handler: AuthHandler) => (Request) => Promise<Response>` | Role-based guard |

### Route Handlers

#### Login

```ts
// app/auth/discord/route.ts
import { auth } from "@hallaxius/auth"

const { handleLogin } = auth({
  clientId: process.env.DISCORD_CLIENT_ID!,
  clientSecret: process.env.DISCORD_CLIENT_SECRET!,
  session: { type: "jwt", secret: process.env.JWT_SECRET! },
})

export const GET = handleLogin
```

#### Callback

```ts
// app/auth/discord/callback/route.ts
import { auth } from "@hallaxius/auth"

const { handleCallback } = auth({
  clientId: process.env.DISCORD_CLIENT_ID!,
  clientSecret: process.env.DISCORD_CLIENT_SECRET!,
  session: { type: "jwt", secret: process.env.JWT_SECRET! },
})

export const GET = handleCallback
```

#### Logout

```ts
// app/auth/discord/logout/route.ts
import { auth } from "@hallaxius/auth"

const { handleLogout } = auth({
  clientId: process.env.DISCORD_CLIENT_ID!,
  clientSecret: process.env.DISCORD_CLIENT_SECRET!,
  session: { type: "jwt", secret: process.env.JWT_SECRET! },
})

export const GET = handleLogout
```

#### /me (Current User)

```ts
// app/api/me/route.ts
import { auth } from "@hallaxius/auth"

const { handleMe } = auth({
  clientId: process.env.DISCORD_CLIENT_ID!,
  clientSecret: process.env.DISCORD_CLIENT_SECRET!,
  session: { type: "jwt", secret: process.env.JWT_SECRET! },
})

export const GET = handleMe
```

With storage configured, returns `SafeStoredUser` (no tokens). Without storage, returns `SessionData`.

### Route Guards

#### withAuth — Protected Handler

```ts
// app/api/profile/route.ts
import { auth } from "@hallaxius/auth"

const { withAuth } = auth({
  clientId: process.env.DISCORD_CLIENT_ID!,
  clientSecret: process.env.DISCORD_CLIENT_SECRET!,
  session: { type: "jwt", secret: process.env.JWT_SECRET! },
})

export const GET = withAuth(async (req, { user, storedUser }) => {
  return Response.json({
    discordId: user.discordId,
    username: user.username,
    roles: storedUser?.roles ?? [],
  })
})
```

Returns **401** if not authenticated.

#### withOptionalAuth — Optional Auth

```ts
// app/api/posts/route.ts
import { withOptionalAuth } from "@/lib/auth"

export const GET = withOptionalAuth(async (req, { user, storedUser }) => {
  return Response.json({
    posts: await getPosts(),
    user: user ? { discordId: user.discordId } : null,
  })
})
```

Passes `null` for `user` when not authenticated (no error).

#### withRole — Role-based Guard

```ts
// app/api/admin/route.ts
import { withRole } from "@/lib/auth"

export const GET = withRole("admin", "moderator")(async (req, { user, storedUser }) => {
  return Response.json({ secret: "admin data" })
})
```

Returns **401** if not authenticated, **403** if missing required roles. Requires `storage`.

### Shared Config (Best Practice)

```ts
// lib/auth.ts
import { auth } from "@hallaxius/auth"
import { myStorage } from "./storage"

export const discord = auth({
  clientId: process.env.DISCORD_CLIENT_ID!,
  clientSecret: process.env.DISCORD_CLIENT_SECRET!,
  session: {
    type: "jwt",
    secret: process.env.JWT_SECRET!,
    expiresIn: "7d",
    secure: process.env.NODE_ENV === "production",
  },
  scopes: ["identify", "email", "guilds"],
  routes: {
    prefix: "/auth/discord",
    callback: "/callback",
  },
  callbacks: {
    onSuccess: async (user) => {
      console.log(`Login: ${user.username}`)
    },
  },
  storage: myStorage,
})

export const { handleLogin, handleCallback, handleLogout, handleMe, withAuth, withOptionalAuth, withRole } = discord
```

---

## Edge / Next.js Middleware

Functions that intercept requests **before** they reach route handlers. Perfect for protecting groups of routes in Next.js `middleware.ts` or any edge runtime.

### Edge Middleware (Generic)

Works with standard `Request`/`Response` (Bun, Node, CF Workers, Deno).

#### middlewareAuth(config)

```ts
import { middlewareAuth } from "@hallaxius/auth"

const auth = middlewareAuth({
  secret: process.env.JWT_SECRET!,
  loginUrl: "/auth/discord",
  publicPaths: ["/", "/auth/*", "/api/public/*"],
})
```

Returns: `(Request) => Promise<Response | undefined>`

| Return | Status | Meaning |
|--------|--------|---------|
| `Response` | 302 | Redirect to login |
| `undefined` | — | Allow request through |

#### middlewareRole(config)

```ts
import { middlewareRole } from "@hallaxius/auth"

const guard = middlewareRole({
  secret: process.env.JWT_SECRET!,
  loginUrl: "/auth/discord",
  roles: {
    "/admin/*": ["admin"],
    "/moderator/*": ["admin", "moderator"],
  },
})
```

Returns: `(Request) => Promise<Response | undefined>`

| Return | Status | Meaning |
|--------|--------|---------|
| `Response` | 302 | Redirect to login |
| `Response` | 403 | Forbidden (JSON: `{ error: "Forbidden" }`) |
| `undefined` | — | Allow request through |

**Important:** Roles must be embedded in the JWT token. This happens automatically when `storage` is configured and the user logs in through our callback.

#### combine(...middlewares)

```ts
import { combine, middlewareAuth, middlewareRole } from "@hallaxius/auth"

export default combine(
  middlewareAuth({ secret: "...", publicPaths: ["/"] }),
  middlewareRole({ secret: "...", roles: { "/admin/*": ["admin"] } }),
)
```

Executes middlewares in order; stops at the first that returns a `Response`. If all return `undefined`, request proceeds.

#### Path Pattern Matching

Patterns support `*` wildcard:

| Pattern | Matches |
|---------|---------|
| `/auth/*` | `/auth`, `/auth/login`, `/auth/discord/callback` |
| `/admin/*` | `/admin`, `/admin/users`, `/admin/settings` |
| `/api/public/*` | `/api/public`, `/api/public/data` |
| `/dashboard` | `/dashboard` (exact match only) |

### Next.js Adapter

For `middleware.ts` running on Edge Runtime.

#### nextAuth(config)

```ts
// middleware.ts
import { nextAuth } from "@hallaxius/auth"

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*"],
}

export default nextAuth({
  secret: process.env.JWT_SECRET!,
  loginUrl: "/auth/discord",
  publicPaths: ["/", "/auth/*"],
})
```

#### nextRole(config)

```ts
export default nextRole({
  secret: process.env.JWT_SECRET!,
  loginUrl: "/auth/discord",
  roles: {
    "/admin/*": ["admin"],
  },
})
```

#### Full Example

```ts
// middleware.ts
import {
  nextAuth,
  nextRole,
  combine,
} from "@hallaxius/auth"

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*", "/api/protected/:path*"],
}

export default combine(
  nextAuth({
    secret: process.env.JWT_SECRET!,
    loginUrl: "/auth/discord",
    publicPaths: [
      "/",
      "/auth/*",
      "/api/public/*",
      "/_next/*",
      "/favicon.ico",
    ],
  }),
  nextRole({
    secret: process.env.JWT_SECRET!,
    loginUrl: "/auth/discord",
    roles: {
      "/admin/*": ["admin"],
      "/api/admin/*": ["admin"],
    },
  }),
)
```

### Utilities

#### getSession(request, config)

Extracts session from any Request. Works in middleware, route handlers, or server components.

```ts
import { getSession } from "@hallaxius/auth"

// middleware.ts
const user = await getSession(request, {
  secret: process.env.JWT_SECRET!,
  cookieName: "discord-auth-session",
})

if (user) {
  console.log(user.discordId, user.username, user.roles)
}
```

Returns `SessionData | null`.

#### isPublicPath(path, patterns)

```ts
import { isPublicPath } from "@hallaxius/auth"

isPublicPath("/auth/login", ["/auth/*"])   // true
isPublicPath("/dashboard", ["/auth/*"])     // false
```

#### requiredRole(path, roleMap)

```ts
import { requiredRole } from "@hallaxius/auth"

requiredRole("/admin/users", { "/admin/*": ["admin"] })  // ["admin"]
requiredRole("/dashboard", { "/admin/*": ["admin"] })     // null
```

#### redirect(url)

Creates a **302 Response** with the given `Location` header. Only relative URLs are allowed (must start with `/`).

```ts
return redirect("/auth/discord")
// Response { status: 302, headers: { Location: "/auth/discord" } }
```

#### denied(message?)

Creates a **403 Response** with JSON body.

```ts
return denied("Access denied")
// Response { status: 403, body: { error: "Access denied" } }
```

---

## User Persistence

When you provide a `storage` implementation, users are persisted to your database and roles are enabled.

### The UserStorage Interface

```ts
interface UserStorage {
  findByDiscordId(discordId: string): Promise<StoredUser | null>
  create(data: CreateUserData): Promise<StoredUser>
  update(discordId: string, data: Partial<CreateUserData>): Promise<StoredUser>
  delete(discordId: string): Promise<void>
}
```

### StoredUser

```ts
interface StoredUser {
  id: string              // Your DB primary key
  discordId: string       // Discord user ID
  username: string
  globalName: string | null
  avatar: string | null
  email: string | null
  locale: string
  roles: string[]
  accessToken: string     // Discord access token
  refreshToken: string    // Discord refresh token
  tokenExpiresAt: number  // Unix timestamp
  createdAt: Date
  updatedAt: Date
}
```

### SafeStoredUser

```ts
type SafeStoredUser = Omit<StoredUser, "accessToken" | "refreshToken">
```

Used by `/me` endpoint and route guards. Never exposes tokens to the client.

### CreateUserData

```ts
interface CreateUserData {
  discordId: string
  username: string
  globalName: string | null
  avatar: string | null
  email: string | null
  locale: string
  roles: string[]
  accessToken: string
  refreshToken: string
  tokenExpiresAt: number
}
```

### How It Works

1. **First login** → `storage.create(data)` is called with default role `["user"]`
2. **Returning user** → `storage.update(discordId, data)` refreshes tokens + profile
3. **Roles** → embedded in JWT at login; checked by `requireRole` / `withRole`
4. **/me endpoint** → returns `SafeStoredUser` (accessToken/refreshToken excluded)
5. **Route guards** → `ctx.storedUser` contains `SafeStoredUser | null`

### Example: PostgreSQL with Drizzle

```ts
import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core"
import { eq } from "drizzle-orm"
import type { CreateUserData, StoredUser, UserStorage } from "@hallaxius/auth"

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  discordId: text("discord_id").unique().notNull(),
  username: text("username").notNull(),
  globalName: text("global_name"),
  avatar: text("avatar"),
  email: text("email"),
  locale: text("locale").notNull().default("en"),
  roles: text("roles").array().notNull().default(["{user}"]),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  tokenExpiresAt: integer("token_expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
})

export function createDrizzleStorage(db: DrizzleClient): UserStorage {
  return {
    async findByDiscordId(discordId) {
      const result = await db
        .select()
        .from(users)
        .where(eq(users.discordId, discordId))
        .limit(1)
      return (result[0] as StoredUser) ?? null
    },

    async create(data) {
      const id = crypto.randomUUID()
      const now = new Date()
      await db.insert(users).values({ ...data, id, createdAt: now, updatedAt: now })
      return { ...data, id, createdAt: now, updatedAt: now }
    },

    async update(discordId, data) {
      const updated = await db
        .update(users)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(users.discordId, discordId))
        .returning()
      return updated[0] as StoredUser
    },

    async delete(discordId) {
      await db.delete(users).where(eq(users.discordId, discordId))
    },
  }
}
```

### Example: PostgreSQL with Prisma

```ts
import { PrismaClient } from "@prisma/client"
import type { CreateUserData, StoredUser, UserStorage } from "@hallaxius/auth"

const prisma = new PrismaClient()

export const prismaStorage: UserStorage = {
  async findByDiscordId(discordId) {
    const user = await prisma.user.findUnique({ where: { discordId } })
    return user as StoredUser | null
  },

  async create(data) {
    const user = await prisma.user.create({
      data: {
        ...data,
        id: crypto.randomUUID(),
        roles: data.roles ?? ["user"],
      },
    })
    return user as StoredUser
  },

  async update(discordId, data) {
    const user = await prisma.user.update({
      where: { discordId },
      data: { ...data, updatedAt: new Date() },
    })
    return user as StoredUser
  },

  async delete(discordId) {
    await prisma.user.delete({ where: { discordId } })
  },
}
```

### Example: In-Memory (Dev Only)

```ts
import type { CreateUserData, StoredUser, UserStorage } from "@hallaxius/auth"

const db = new Map<string, StoredUser>()

export const memoryStorage: UserStorage = {
  async findByDiscordId(discordId) {
    for (const user of db.values()) {
      if (user.discordId === discordId) return user
    }
    return null
  },

  async create(data) {
    const now = new Date()
    const user: StoredUser = {
      ...data,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    }
    db.set(user.id, user)
    return user
  },

  async update(discordId, data) {
    const existing = await this.findByDiscordId(discordId)
    if (!existing) throw new Error("User not found")
    const updated = { ...existing, ...data, updatedAt: new Date() }
    db.set(updated.id, updated)
    return updated
  },

  async delete(discordId) {
    for (const [id, user] of db) {
      if (user.discordId === discordId) {
        db.delete(id)
        return
      }
    }
  },
}
```

### Behavior Without Storage

If `storage` is not provided:

| Feature | Available? |
|---------|-----------|
| Login / Callback / Logout | ✅ Always |
| `/me` route | ❌ Not registered |
| `requireRole` macro | ❌ Not available (returns 500 if used) |
| `withRole` guard | ✅ Always exported (returns 500 if used without storage) |
| `ctx.storedUser` | Always `null` |
| Roles in JWT | ❌ Not embedded |
| Token auto-refresh | ❌ Not available |

---

## Auto-Join Guild

Automatically add authenticated users to your Discord server using the `DiscordClient.addMember()` method.

### Prerequisites

1. **Bot in the server** — Create an app at https://discord.com/developers/applications, go to the **Bot** page, click **"Reset Token"**, and copy the generated token.
2. **Invite the bot** — Use the **OAuth2 > URL Generator** tab, select the `bot` scope and the `Create Instant Invite` permission, then use the generated URL to add the bot to your server.
3. **Scope `guilds.join`** — Add `"guilds.join"` to your OAuth2 scopes config.

### Basic Flow

#### Elysia Plugin

```ts
import { Elysia } from "elysia"
import { discordAuth, DiscordClient } from "@hallaxius/auth"

const GUILD_ID = "123456789"
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN!

const app = new Elysia()
  .use(discordAuth({
    clientId: process.env.DISCORD_CLIENT_ID!,
    clientSecret: process.env.DISCORD_CLIENT_SECRET!,
    session: { type: "jwt", secret: process.env.JWT_SECRET! },
    scopes: ["identify", "email", "guilds.join"],
    callbacks: {
      onSuccess: async (user, tokens) => {
        const client = new DiscordClient(
          process.env.DISCORD_CLIENT_ID!,
          process.env.DISCORD_CLIENT_SECRET!,
        )
        await client.addMember({
          guildId: GUILD_ID,
          userId: user.id,
          accessToken: tokens.access_token,
          botToken: BOT_TOKEN,
          nick: user.username,
        })
      },
    },
  }))
  .listen(3000)
```

#### Standalone (Next.js / Node)

```ts
// lib/auth.ts
import { auth, DiscordClient } from "@hallaxius/auth"

export const discord = auth({
  clientId: process.env.DISCORD_CLIENT_ID!,
  clientSecret: process.env.DISCORD_CLIENT_SECRET!,
  session: { type: "jwt", secret: process.env.JWT_SECRET! },
  scopes: ["identify", "email", "guilds.join"],
  callbacks: {
    onSuccess: async (user, tokens) => {
      const client = new DiscordClient(
        process.env.DISCORD_CLIENT_ID!,
        process.env.DISCORD_CLIENT_SECRET!,
      )
      await client.addMember({
        guildId: process.env.DISCORD_GUILD_ID!,
        userId: user.id,
        accessToken: tokens.access_token,
        botToken: process.env.DISCORD_BOT_TOKEN!,
      })
    },
  },
})

export const { handleLogin, handleCallback } = discord
```

```ts
// app/auth/discord/callback/route.ts
import { handleCallback } from "@/lib/auth"
export const GET = handleCallback
```

### Method API

#### DiscordClient.addMember(params)

Adds an authenticated user to the server using the [Add Guild Member API](https://discord.com/developers/docs/resources/guild#add-guild-member).

##### Parameters (AddMemberParams)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `guildId` | `string` | ✅ | Discord server ID |
| `userId` | `string` | ✅ | User ID (from `user.id`) |
| `accessToken` | `string` | ✅ | OAuth2 access token (`tokens.access_token`) |
| `botToken` | `string` | ✅ | Discord bot token (from Bot page in Dev Portal) |
| `nick` | `string` | ❌ | User's nickname on the server |
| `roles` | `string[]` | ❌ | Role IDs to assign to the member |

##### Returns

`Promise<void>` — resolves with no value on success, rejects with `Error` if the API returns an error.

### Possible Errors

| HTTP Status | Likely Cause | Solution |
|-------------|-------------|----------|
| `201` | Member created successfully | ✅ Success |
| `204` | Member already in the server | ✅ Success |
| `400` | Invalid parameters or expired token | Verify `access_token` is valid and `guilds.join` scope is present |
| `403` | Bot lacks permission | Verify bot is in the server and has `CREATE_INSTANT_INVITE` permission |
| `404` | Invalid `guildId` or `userId` | Verify the IDs |
| `429` | Rate limit reached | Wait and retry |

#### DiscordClient.getGuildMember(guildId, userId, botToken)

Fetches a guild member's profile using the [Get Guild Member API](https://discord.com/developers/docs/resources/guild#get-guild-member). The bot must be in the guild.

```ts
import { DiscordClient } from "@hallaxius/auth"

const client = new DiscordClient(process.env.DISCORD_CLIENT_ID!, process.env.DISCORD_CLIENT_SECRET!)
const member = await client.getGuildMember("guild-id", "user-id", process.env.DISCORD_BOT_TOKEN!)
console.log(member.nick, member.roles)
```

##### Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `guildId` | `string` | ✅ | Discord server ID |
| `userId` | `string` | ✅ | User's Discord ID |
| `botToken` | `string` | ✅ | Discord bot token (from Bot page in Dev Portal) |

##### Returns

`Promise<DiscordGuildMember>` — the guild member object with `user`, `nick`, `roles`, `joined_at`, `premium_since`, `deaf`, `mute`, `pending` fields.

### Pattern with UserStorage

If you use `storage`, you can call `addMember` inside a custom hook after the callback:

```ts
callbacks: {
  onSuccess: async (user, tokens) => {
    // 1. User is already persisted automatically with storage
    // 2. Add to server
    const client = new DiscordClient(
      process.env.DISCORD_CLIENT_ID!,
      process.env.DISCORD_CLIENT_SECRET!,
    )
    await client.addMember({
      guildId: process.env.DISCORD_GUILD_ID!,
      userId: user.id,
      accessToken: tokens.access_token,
      botToken: process.env.DISCORD_BOT_TOKEN!,
    })
  },
},
```

### Important Notes

- **Bot token ≠ Client Secret** — the `botToken` comes from the **Bot** page in the Dev Portal, not the **Client Secret** from the OAuth2 page. These are different.
- **Scope `guilds.join` is required** — without it, the `access_token` cannot join the server.
- **The bot must be in the server** before calling `addMember`. Use the URL Generator with the `bot` scope to invite it.
- **Rate limits** — the members API is limited to 1 request per second per guild. For bulk joins, consider using a queue with delay.

---

## Utility Helpers

> **New in v1.2.0** — standalone utility functions for common tasks. All are available as top-level exports from `@hallaxius/auth`.

### `generateSecureSecret(length?)`

Generates a cryptographically secure, URL-safe random string using the Web Crypto API.

```ts
import { generateSecureSecret } from "@hallaxius/auth"

const secret = generateSecureSecret(32) // e.g. "xK8...base64url..."
```

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `length` | `number` | `32` | Number of random bytes (output is base64url encoded, slightly longer) |

---

### `validateConfig(config)`

Validates `DiscordAuthConfig` for common errors — missing or malformed fields. Throws `ConfigurationError` with a descriptive message for any invalid field.

```ts
import { validateConfig, ConfigurationError } from "@hallaxius/auth"

try {
  validateConfig({ clientId: "", clientSecret: "" })
} catch (e) {
  if (e instanceof ConfigurationError) {
    console.error(e.message) // "Missing required configuration: 'clientId' is required..."
  }
}
```

---

### `hasRoleInGuild(userId, guildId, roleId, botToken, clientId, clientSecret)`

Checks whether a Discord user has a specific role in a guild. Uses the Discord Bot API. Returns `false` on any error (never throws).

```ts
import { hasRoleInGuild } from "@hallaxius/auth"

const isAdmin = await hasRoleInGuild(
  "discord-user-id",
  "guild-id",
  "admin-role-id",
  process.env.DISCORD_BOT_TOKEN!,
  process.env.DISCORD_CLIENT_ID!,
  process.env.DISCORD_CLIENT_SECRET!,
)
```

---

### `hasAnyRoleInGuild(userId, guildId, roleIds, botToken, clientId, clientSecret)`

Checks whether a Discord user has at least one of the given roles in a guild. Returns `false` on any error.

```ts
import { hasAnyRoleInGuild } from "@hallaxius/auth"

const isStaff = await hasAnyRoleInGuild(
  "user-id", "guild-id",
  ["admin-role", "mod-role"],
  botToken, clientId, clientSecret,
)
```

---

### `isUserInGuild(userId, guildId, botToken, clientId, clientSecret)`

Returns `true` if the user is a member of the specified guild, `false` otherwise.

```ts
import { isUserInGuild } from "@hallaxius/auth"

const isMember = await isUserInGuild("user-id", "guild-id", botToken, clientId, clientSecret)
```

---

### `revokeUserSession(discordId, storage, clientId, clientSecret)`

Deletes a user's session from storage and revokes their Discord access token. Throws `StorageError` if storage operations fail.

```ts
import { revokeUserSession } from "@hallaxius/auth"

await revokeUserSession("discord-id", myStorage, clientId, clientSecret)
```

---

### `syncUserRoles(discordId, guildId, botToken, storage, clientId, clientSecret)`

Fetches the latest Discord guild roles for a user and updates their stored roles. Returns the updated roles array.

```ts
import { syncUserRoles } from "@hallaxius/auth"

const roles = await syncUserRoles("discord-id", "guild-id", botToken, myStorage, clientId, clientSecret)
```

---

### `autoJoinGuild(params)`

Adds a user to a Discord guild after authentication. Requires `guilds.join` scope and a bot token. Throws `GuildJoinError` on failure.

```ts
import { autoJoinGuild } from "@hallaxius/auth"

await autoJoinGuild({
  guildId: "guild-id",
  userId: "user-id",
  accessToken: "user-oauth-token",
  botToken: process.env.DISCORD_BOT_TOKEN!,
  nick: "New Member",
  roles: ["role-id"],
  clientId: "client-id",
  clientSecret: "client-secret",
})
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `guildId` | `string` | ✅ | Discord server ID |
| `userId` | `string` | ✅ | User's Discord ID |
| `accessToken` | `string` | ✅ | OAuth2 access token |
| `botToken` | `string` | ✅ | Discord bot token |
| `nick` | `string` | ❌ | Nickname for the member |
| `roles` | `string[]` | ❌ | Role IDs to assign |
| `clientId` | `string` | ✅ | Discord OAuth2 Client ID |
| `clientSecret` | `string` | ✅ | Discord OAuth2 Client Secret |

---

## API Reference

### Functions

| Function | Returns | Description |
|----------|---------|-------------|
| `auth(config)` | `{ handleLogin, handleCallback, handleLogout, handleMe, withAuth, withOptionalAuth, withRole }` | Standalone factory |
| `autoJoinGuild(params)` | `Promise<void>` | Adds a user to a Discord guild |
| `combine(...middlewares)` | `MiddlewareFn` | Composes multiple edge middlewares into one |
| `denied(message?)` | `Response` | Creates a **403** Response with JSON body `{ error: message }` |
| `discordAuth(config)` | `Elysia` instance | Creates an Elysia plugin |
| `discordAuth.from(config)` | `Elysia` instance | Factory alias for `discordAuth()` |
| `discordAuth.middlewares(deps)` | `{ withAuth, withOptionalAuth, withRole }` | Standalone middleware factory alias |
| `discordAuth.presets.spa(opts)` | `Elysia` instance | Pre-configured SPA preset |
| `discordAuth.presets.server(opts)` | `Elysia` instance | Pre-configured server preset |
| `discordAuth.presets.nextjs(opts)` | `Elysia` instance | Pre-configured Next.js preset |
| `discordAuth.presets.edge(opts)` | `Elysia` instance | Pre-configured edge preset |
| `generateSecureSecret(length?)` | `string` | Generates a crypto-random URL-safe string |
| `getSession(request, config)` | `Promise<SessionData \| null>` | Extracts and verifies a session from a Request's cookie |
| `hasRoleInGuild(userId, guildId, roleId, botToken, clientId, clientSecret)` | `Promise<boolean>` | Checks if a user has a specific Discord role |
| `hasAnyRoleInGuild(userId, guildId, roleIds, botToken, clientId, clientSecret)` | `Promise<boolean>` | Checks if a user has any of the given roles |
| `isPublicPath(path, patterns)` | `boolean` | Checks if a path matches any of the public path patterns |
| `isUserInGuild(userId, guildId, botToken, clientId, clientSecret)` | `Promise<boolean>` | Checks if a user is in a guild |
| `middlewareAuth(config)` | `(Request) => Promise<Response \| undefined>` | Creates an edge auth middleware |
| `middlewareRole(config)` | `(Request) => Promise<Response \| undefined>` | Creates an edge role middleware |
| `nextAuth(config)` | `(Request) => Promise<Response \| undefined>` | Creates a Next.js-compatible auth middleware |
| `nextRole(config)` | `(Request) => Promise<Response \| undefined>` | Creates a Next.js-compatible role middleware |
| `redirect(url)` | `Response` | Creates a **302** Response with the given `Location` header (relative URLs only) |
| `requiredRole(path, roleMap)` | `string[] \| null` | Returns the required roles for a path pattern |
| `revokeUserSession(discordId, storage, clientId, clientSecret)` | `Promise<void>` | Deletes user session and revokes token |
| `syncUserRoles(discordId, guildId, botToken, storage, clientId, clientSecret)` | `Promise<string[]>` | Syncs guild roles to storage |
| `validateConfig(config)` | `void` | Validates DiscordAuthConfig, throws `ConfigurationError` |

### Classes

#### Discord

Elysia wrapper class with fluent API. See [Elysia Plugin — Class Wrapper](#new-discordconfig--class-wrapper).

#### DiscordClient

Discord API client with methods for OAuth2, user info, and guild management.

##### Methods

| Method | Description |
|--------|-------------|
| `generateAuthUrl(params)` | Generates Discord OAuth2 authorization URL |
| `exchangeCode(params)` | Exchanges authorization code for tokens |
| `refreshToken(params)` | Refreshes an expired access token |
| `revokeToken(params)` | Revokes an access token |
| `getUser(accessToken)` | Returns the authenticated user's profile |
| `getUserGuilds(accessToken)` | Returns the user's guilds |
| `getUserConnections(accessToken)` | Returns the user's connected accounts |
| `getGuildMember(guildId, userId, botToken)` | Gets a guild member's profile (requires bot in guild) |
| `addMember(params)` | Adds a user to a guild (requires `guilds.join` scope + bot token) |

### Types

| Type | Definition | Description |
|------|------------|-------------|
| `AddMemberParams` | `{ guildId, userId, accessToken, botToken, nick?, roles? }` | Parameters for `client.addMember()` |
| `AuthHandler` | `(Request, { user: SessionData \| null, storedUser: SafeStoredUser \| null }) => Response \| Promise<Response>` | Route handler with auth context |
| `Callbacks` | `{ onSuccess?, onError? }` | Auth lifecycle hooks |
| `CreateUserData` | `{ discordId, username, ..., roles, accessToken, refreshToken, tokenExpiresAt }` | Data for user creation |
| `DiscordAuthConfig` | `{ clientId, clientSecret, session, scopes?, prompt?, routes?, callbacks?, storage?, meRoute?, redirectUri?, disablePKCE? }` | Main config interface |
| `DiscordConnection` | Discord connection shape | Discord connection object |
| `DiscordGuild` | Discord guild shape | Discord guild object |
| `DiscordGuildMember` | `{ user, nick, roles, joined_at, ... }` | Guild member object from Discord API |
| `DiscordScope` | Union of all Discord OAuth2 scopes | e.g. `"identify"`, `"email"`, `"guilds"` |
| `DiscordTokenResponse` | Token response shape | OAuth2 token response |
| `DiscordUser` | Discord user shape (snake_case fields, e.g. `global_name`) | Discord user object (raw API response) |
| `EdgeAuthConfig` | Extends `EdgeSessionConfig` with `loginUrl?`, `publicPaths?` | Config for auth middleware |
| `EdgePresetOpts` | `{ clientId, clientSecret, secret, redirectUri?, scopes?, prompt? }` | Options for `.presets.edge()` |
| `EdgeRoleConfig` | Extends `EdgeSessionConfig` with `loginUrl?`, `roles` | Config for role middleware |
| `GetGuildMemberParams` | `{ guildId, userId, botToken }` | Parameters for getting a guild member |
| `GuildMember` | `{ user, nick, roles, joinedAt, ... }` | Guild member object (camelCase) |
| `InferSession<T>` | Extracted JWT payload type | Infers session type from Elysia instance |
| `InferUser<T>` | Alias for `InferSession<T>` | Infers user type from Elysia instance |
| `InferStoredUser<T>` | `Omit<InferSession<T>, "accessToken" \| "refreshToken">` | Safe stored user type |
| `NextjsPresetOpts` | `{ clientId, clientSecret, secret, redirectUri?, scopes?, prompt? }` | Options for `.presets.nextjs()` |
| `PromptType` | `"consent" \| "none"` | OAuth2 prompt type |
| `RoutesConfig` | `{ prefix?, callback?, logout?, error? }` | Custom route paths |
| `SafeStoredUser` | `Omit<StoredUser, "accessToken" \| "refreshToken">` | StoredUser without sensitive fields |
| `ServerPresetOpts` | `{ clientId, clientSecret, secret, storage, redirectUri?, scopes?, prompt? }` | Options for `.presets.server()` |
| `SpaPresetOpts` | `{ clientId, clientSecret, secret, redirectUri?, scopes?, prompt? }` | Options for `.presets.spa()` |
| `SessionConfig` | `{ type, secret, expiresIn?, cookieName?, cookiePath?, httpOnly?, secure?, sameSite? }` | Session configuration |
| `SessionData` | `{ discordId, username, globalName, avatar, email, locale, roles? }` | Session payload |
| `SessionType` | `"jwt" \| "server"` | Session storage type |
| `StoredUser` | Full user shape with tokens | Persisted user object |
| `UserStorage` | `{ findByDiscordId, create, update, delete }` | Persistence interface |

---

## Security Best Practices

This library implements OAuth 2.0 best practices by default. Follow these guidelines to keep your application secure.

### ✅ Always Enabled (No Configuration Required)

| Feature | Implementation | Protection Against |
|---------|----------------|-------------------|
| **PKCE (S256)** | `code_verifier` + `code_challenge` in auth flow | Authorization code interception |
| **State Parameter** | HMAC-SHA256 signed state with 5-minute TTL | CSRF attacks |
| **Token Revocation** | Automatic `revokeToken()` on logout | Token reuse after logout |
| **Rate Limit Detection** | Monitors `Retry-After`, `X-RateLimit-*` headers | API abuse, DoS |

### 🔐 Configuration Checklist

#### 1. **HTTPS in Production**

```ts
// Always use HTTPS in production
session: {
    type: "jwt",
    secret: process.env.JWT_SECRET!,
    secure: process.env.NODE_ENV === "production", // Required for HTTPS
    sameSite: "lax", // or "strict" for more security
}
```

> ⚠️ Discord **requires HTTPS** for OAuth2 callbacks. `secure: true` ensures cookies are only sent over HTTPS.

#### 2. **Secrets Management**

```bash
# Never hardcode secrets in your code
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret
JWT_SECRET=generate_a_strong_secret_here
DISCORD_BOT_TOKEN=your_bot_token
```

**JWT Secret Requirements:**
- Minimum 32 characters (256 bits)
- Use cryptographically random string: `crypto.randomUUID() + crypto.randomUUID()`
- Never reuse Discord client secret as JWT secret

#### 3. **Redirect URI Configuration**

The `redirectUri` **must match exactly** what's registered in the Discord Developer Portal:

```ts
discordAuth({
    clientId: process.env.DISCORD_CLIENT_ID!,
    clientSecret: process.env.DISCORD_CLIENT_SECRET!,
    session: { type: "jwt", secret: process.env.JWT_SECRET! },
    redirectUri: "https://yourdomain.com/auth/discord/callback", // Must match Discord Portal
})
```

**Common Mistakes:**
- ❌ `http://` in production (Discord blocks this)
- ❌ Missing trailing slash
- ❌ Different port number
- ❌ `localhost` in production

Check your redirect URI at: `https://discord.com/developers/applications/{app-id}/oauth2`

#### 4. **Scopes**

Only request the scopes you need:

```ts
// Good: Minimal scopes
scopes: ["identify"]

// Only if you need email
scopes: ["identify", "email"]

// Only if you need guild info
scopes: ["identify", "guilds"]

// Only if you need to add users to your server
scopes: ["identify", "email", "guilds.join"]
```

> 💡 Fewer scopes = smaller consent dialog = higher conversion rate.

#### 5. **Session Security**

```ts
session: {
    type: "jwt",
    secret: process.env.JWT_SECRET!,
    expiresIn: "7d", // Or "1h", "24h" - adjust to your needs
    secure: process.env.NODE_ENV === "production",
    httpOnly: true, // Always true - prevents XSS
    sameSite: "lax", // or "strict" for more security
    cookieName: "discord-auth-session",
}
```

| Option | Recommended | Why |
|--------|-------------|-----|
| `httpOnly` | `true` | Prevents JavaScript from reading cookies (XSS protection) |
| `secure` | `true` (production) | Ensures cookies are only sent over HTTPS |
| `sameSite` | `"lax"` or `"strict"` | Prevents CSRF attacks |
| `expiresIn` | `"7d"` or less | Limits session lifetime |

### 🛡️ PKCE (Proof Key for Code Exchange)

PKCE is **enabled by default** for all applications. This protects against authorization code interception attacks, which is especially important for:

- Single Page Applications (SPAs)
- Mobile applications
- Any public client where the client secret cannot be kept confidential

**How it works:**
1. A random `code_verifier` is generated for each login request
2. The `code_challenge` (SHA-256 hash of the verifier) is sent to Discord
3. When Discord redirects back, the `code_verifier` is used to exchange the code for tokens
4. Without the correct verifier, the code cannot be exchanged

**Disabling PKCE (Not Recommended):**

```ts
discordAuth({
    clientId: process.env.DISCORD_CLIENT_ID!,
    clientSecret: process.env.DISCORD_CLIENT_SECRET!,
    session: { type: "jwt", secret: process.env.JWT_SECRET! },
    disablePKCE: true, // Only disable for server-side confidential clients
})
```

> ⚠️ Only disable PKCE if you fully understand the security implications and are using a server-side confidential client.

### 🚨 Rate Limiting

The library detects Discord API rate limits and throws `RateLimitError`:

```ts
import { RateLimitError } from "@hallaxius/auth"

try {
    await client.getUser(accessToken)
} catch (error) {
    if (error instanceof RateLimitError) {
        // error.retryAfter contains seconds to wait
        console.log(`Rate limited. Retry after ${error.retryAfter} seconds`)
        // Implement your retry logic with exponential backoff
    }
}
```

**Discord Rate Limit Headers:**
- `X-RateLimit-Remaining`: Requests remaining in current window
- `X-RateLimit-Reset`: Unix timestamp when rate limit resets
- `Retry-After`: Seconds to wait (when rate limited)
- `X-RateLimit-Global`: Whether you're hitting the global rate limit

### 📋 Security Checklist

- [ ] All secrets stored in environment variables
- [ ] `secure: true` for cookies in production
- [ ] `httpOnly: true` for all session cookies
- [ ] HTTPS enabled in production
- [ ] Redirect URI matches Discord Developer Portal exactly
- [ ] PKCE enabled (default)
- [ ] Minimal scopes requested
- [ ] Session expiration configured
- [ ] Rate limit errors handled gracefully
- [ ] Token revocation on logout enabled (default with storage)

---

## Migration Guide

### v0.x → v1.0.0 (Breaking Changes)

This major version introduces important security improvements. Most changes are **backward compatible**, but there are a few breaking changes.

#### 🔴 Breaking Changes

##### 1. PKCE is Now Enabled by Default

**Before (v0.x):**
```ts
// PKCE was not implemented
generateAuthUrl(params) // No code_challenge
```

**After (v1.0.0):**
```ts
// PKCE is enabled by default
generateAuthUrl(params) // Includes code_challenge + code_challenge_method=S256
```

**If you need to disable PKCE** (not recommended):
```ts
discordAuth({
    clientId: process.env.DISCORD_CLIENT_ID!,
    clientSecret: process.env.DISCORD_CLIENT_SECRET!,
    session: { type: "jwt", secret: process.env.JWT_SECRET! },
    disablePKCE: true, // Only for server-side confidential clients
})
```

**Impact:** None for most users. PKCE is transparent and improves security. Only affects you if you're doing custom OAuth2 flow manipulation.

##### 2. Error Hierarchy

**Before (v0.x):**
```ts
try {
    await client.exchangeCode(params)
} catch (error) {
    // error is a generic Error
    if (error.message.includes("Failed to exchange code")) {
        // handle error
    }
}
```

**After (v1.0.0):**
```ts
import {
    InvalidCodeError,
    TokenExpiredError,
    RateLimitError,
    NetworkError,
} from "@hallaxius/auth"

try {
    await client.exchangeCode(params)
} catch (error) {
    if (error instanceof InvalidCodeError) {
        // Handle invalid authorization code
    } else if (error instanceof RateLimitError) {
        // Handle rate limiting with error.retryAfter
    } else if (error instanceof NetworkError) {
        // Handle network errors
    }
}
```

**Impact:** Your existing `catch` blocks will still work (errors extend `Error`). To use the new error types, update your imports.

#### 🟢 Non-Breaking Improvements

| Feature | Description | Action Required |
|---------|-------------|-----------------|
| **Auto Token Refresh** | Tokens are automatically refreshed 5 minutes before expiration | None - works automatically when `storage` is configured |
| **Token Revocation** | Tokens are automatically revoked on logout | None - works automatically when `storage` is configured |
| **Rate Limiting** | Detects Discord API rate limits and throws `RateLimitError` | None - existing code continues to work |
| **Deduplicated Config** | `processConfig` moved to `core/config.ts` | None - internal change only |

#### 📝 Full Migration Example

**Before:**
```ts
import { discordAuth } from "@hallaxius/auth"

const app = new Elysia()
    .use(discordAuth({
        clientId: process.env.DISCORD_CLIENT_ID!,
        clientSecret: process.env.DISCORD_CLIENT_SECRET!,
        session: { type: "jwt", secret: process.env.JWT_SECRET! },
    }))
    .get("/dashboard", ({ user }) => `Hello ${user.username}`, { auth: true })
```

**After (no changes needed):**
```ts
import { discordAuth } from "@hallaxius/auth"

const app = new Elysia()
    .use(discordAuth({
        clientId: process.env.DISCORD_CLIENT_ID!,
        clientSecret: process.env.DISCORD_CLIENT_SECRET!,
        session: { type: "jwt", secret: process.env.JWT_SECRET! },
        // PKCE is enabled by default - no need to configure
    }))
    .get("/dashboard", ({ user }) => `Hello ${user.username}`, { auth: true })
```

**Only change if you want to disable PKCE:**
```ts
discordAuth({
    // ... other config
    disablePKCE: true, // Not recommended
})
```

---

## Troubleshooting

Common issues and their solutions.

### 🔴 Authentication Flow Issues

#### "Invalid state parameter - possible CSRF attack"

**Cause:** The state parameter expired (5 minutes TTL) or was tampered with.

**Solutions:**
1. **User took too long to authenticate** - The state expires after 5 minutes. Ask the user to try again.
2. **Multiple tabs open** - Each login generates a new state. Only one tab should complete the flow.
3. **State not being passed correctly** - Verify your callback URL includes the `state` parameter.

**Debug:**
```ts
// The state is generated with HMAC-SHA256 and includes a timestamp
// It expires after 5 minutes (300,000ms)
const state = await generateState(secret)
// state format: "encodedPayload.signature"
```

#### "Missing authorization code"

**Cause:** Discord did not return a `code` parameter in the callback.

**Solutions:**
1. **User denied authorization** - Check if the user clicked "Cancel" on Discord's consent screen.
2. **Incorrect redirect URI** - Verify the `redirectUri` in your config matches exactly what's in the Discord Developer Portal.
3. **Missing scopes** - Ensure you're requesting at least `"identify"` scope.

**Debug:**
```ts
// Check the callback URL - it should look like:
// https://yourdomain.com/auth/discord/callback?code=AUTH_CODE&state=STATE
```

#### "Invalid authorization code"

**Cause:** The authorization code is invalid or expired.

**Solutions:**
1. **Code already used** - Authorization codes can only be used once. Generate a new one.
2. **Code expired** - Discord codes expire after 10 minutes. Complete the flow faster.
3. **PKCE mismatch** - If using PKCE, ensure the `code_verifier` matches the `code_challenge` sent to Discord.
4. **Incorrect client secret** - Verify your `clientSecret` is correct.
5. **Incorrect redirect URI** - The `redirectUri` used in `exchangeCode` must match the one used to generate the auth URL.

**Debug:**
```ts
// Verify your config:
{
    clientId: "YOUR_CLIENT_ID", // Must match Discord Portal
    clientSecret: "YOUR_CLIENT_SECRET", // Must match Discord Portal
    redirectUri: "https://yourdomain.com/auth/discord/callback", // Must match exactly
}
```

### 🔴 Token Issues

#### "Token has expired"

**Cause:** The access token expired and could not be refreshed.

**Solutions:**
1. **Auto-refresh enabled** - With `storage` configured, tokens are automatically refreshed 5 minutes before expiration. Ensure `storage` is provided.
2. **No storage configured** - Without storage, tokens cannot be automatically refreshed. User must log in again.
3. **Refresh token expired** - Discord refresh tokens may expire. User must log in again.

**Debug:**
```ts
// With storage, auto-refresh should work:
discordAuth({
    // ...
    storage: myStorage, // Required for auto-refresh
})
```

#### "Invalid token"

**Cause:** The access token is invalid or has been revoked.

**Solutions:**
1. **Token was revoked** - Check if you're calling `revokeToken()` manually or on logout.
2. **Token not stored correctly** - Verify your `storage` implementation is working.
3. **User logged out elsewhere** - If using multiple tabs, logging out in one tab revokes the token.

**Debug:**
```ts
// Verify token storage:
const storedUser = await storage.findByDiscordId(user.discordId)
console.log(storedUser?.accessToken) // Should be a valid token
```

### 🔴 PKCE Issues

#### "PKCE operation failed"

**Cause:** There was an error generating or validating PKCE parameters.

**Solutions:**
1. **Browser doesn't support Web Crypto API** - PKCE requires the [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API). All modern browsers support this.
2. **Edge runtime without crypto** - Some edge runtimes may not have `crypto` available. The library uses `crypto.subtle` which should be available in all supported environments.

**Debug:**
```ts
// Test PKCE generation:
import { generatePKCE } from "@hallaxius/auth"
const pkce = await generatePKCE()
console.log(pkce.codeVerifier) // Should be a 43-character base64url string
console.log(pkce.codeChallenge) // Should be a 43-character base64url string
console.log(pkce.codeChallengeMethod) // Should be "S256"
```

### 🔴 Rate Limiting

#### "Rate limit exceeded"

**Cause:** You're making too many requests to the Discord API.

**Solutions:**
1. **Handle RateLimitError** - Catch the error and implement retry logic:

```ts
import { RateLimitError } from "@hallaxius/auth"

async function getUserWithRetry(accessToken: string, retries = 3) {
    try {
        return await client.getUser(accessToken)
    } catch (error) {
        if (error instanceof RateLimitError && retries > 0) {
            const delay = (error.retryAfter ?? 5) * 1000
            await new Promise(resolve => setTimeout(resolve, delay))
            return getUserWithRetry(accessToken, retries - 1)
        }
        throw error
    }
}
```

2. **Implement caching** - Cache user data to reduce API calls.
3. **Check rate limit headers** - Monitor `X-RateLimit-Remaining` to proactively throttle.

**Discord Rate Limits:**
- Global rate limit: 50 requests per second per user
- Per-route rate limits: Varies by endpoint
- Guild endpoints: 1 request per second per guild for some operations

### 🔴 Configuration Issues

#### "clientId and clientSecret are required"

**Cause:** Missing required configuration.

**Solution:**
```ts
discordAuth({
    clientId: process.env.DISCORD_CLIENT_ID!, // Required
    clientSecret: process.env.DISCORD_CLIENT_SECRET!, // Required
    session: {
        type: "jwt",
        secret: process.env.JWT_SECRET!, // Required
    },
})
```

#### "session.secret is required"

**Cause:** Missing JWT secret in session configuration.

**Solution:**
```ts
session: {
    type: "jwt",
    secret: process.env.JWT_SECRET!, // Required
}
```

### 🔴 Cookie Issues

#### "Cookie not set"

**Cause:** Cookies are not being set properly.

**Solutions:**
1. **SameSite policy** - If using `sameSite: "none"`, you must also set `secure: true`.
2. **Secure flag in development** - If testing on `http://localhost`, set `secure: false`.
3. **Domain mismatch** - Cookies are only sent to the domain that set them.

**Debug:**
```ts
// For development:
session: {
    type: "jwt",
    secret: process.env.JWT_SECRET!,
    secure: false, // Required for http://localhost
    sameSite: "lax",
}

// For production:
session: {
    type: "jwt",
    secret: process.env.JWT_SECRET!,
    secure: true, // Required for HTTPS
    sameSite: "lax",
}
```

### 🔴 Discord Developer Portal Issues

#### "Invalid redirect URI"

**Cause:** The redirect URI in your config doesn't match what's registered in the Discord Developer Portal.

**Solution:**
1. Go to https://discord.com/developers/applications/{app-id}/oauth2
2. Check the "Redirects" section
3. Ensure your `redirectUri` config matches **exactly** (including protocol, port, and trailing slash)

#### "Invalid client ID or client secret"

**Cause:** Incorrect credentials from the Discord Developer Portal.

**Solution:**
1. Go to https://discord.com/developers/applications/{app-id}
2. Check the "OAuth2" section
3. Copy the **Client ID** and **Client Secret**
4. Ensure they match your environment variables

> ⚠️ Regenerate your client secret if you suspect it has been compromised.

### 🔴 Next.js Specific Issues

#### "Middleware not running"

**Cause:** Middleware file not in the correct location or not exported correctly.

**Solution:**
```ts
// middleware.ts (must be in root or src directory)
import { nextAuth, combine } from "@hallaxius/auth"

export const config = {
    matcher: ["/dashboard/:path*", "/admin/:path*"],
}

export default combine(
    nextAuth({ secret: process.env.JWT_SECRET! }),
)
```

#### "401 on protected routes"

**Cause:** User is not authenticated or session is invalid.

**Solutions:**
1. **Verify login flow** - Ensure the user can successfully log in.
2. **Check cookie name** - Default is `discord-auth-session`. Ensure it matches your config.
3. **Verify JWT secret** - The secret used in middleware must match the one used in auth config.

---

## License

MIT
