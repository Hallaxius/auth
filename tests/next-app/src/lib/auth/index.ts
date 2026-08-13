import { credentials, magicLink, tenancy } from "@hallaxius/auth"
import type { StorageAdapters } from "@hallaxius/auth"
import { createStorageAdapters } from "@hallaxius/auth"
import {
  getSharedTestAuthUserStorage,
  dummyVerifyPassword,
  type AuthUserStorage,
} from "./storage"

/**
 * E2E app wiring for @hallaxius/auth (credentials + magic link + tenancy).
 *
 * ADR-002: the library never hashes passwords — the storage layer
 * (./storage.ts) owns hashing/verification.
 *
 * Tenancy: `acme.localhost` → tenant "acme", `suspended.localhost` →
 * 403 TENANT_SUSPENDED, plain `localhost` → no tenant. `*.localhost` resolves
 * to 127.0.0.1 inside Firefox without touching the hosts file.
 *
 * Storage: pinned to `globalThis` (getSharedTestAuthUserStorage) because
 * Next.js bundles route handlers and pages separately — a module-level
 * singleton would be duplicated per bundle and sessions minted by
 * /api/auth/* would not resolve in /dashboard (see storage.ts).
 */
const SESSION_SECRET =
  "e2e-only-secret-0123456789abcdef0123456789abcdef0123456789"
const SESSION_COOKIE = "credentials-session"
const SESSION_MAX_AGE_SECONDS = 15 * 60

/** Test-only: links captured by the fake notifier, keyed by recipient. */
const sentLinks = new Map<string, string>()

let cached: {
  auth: ReturnType<typeof credentials>
  magic: ReturnType<typeof magicLink>
} | null = null

export interface AppAuth {
  auth: ReturnType<typeof credentials>
  magic: ReturnType<typeof magicLink>
}

export async function getAppAuth(): Promise<AppAuth> {
  if (cached) return cached

  const adapters: StorageAdapters = createStorageAdapters({ type: "memory" })
  const storage: AuthUserStorage = await getSharedTestAuthUserStorage()

  const tenantStore = adapters.tenant
  const membershipStore = adapters.tenantMembership
  void tenantStore.set({
    id: "global",
    domain: "global",
    status: "active",
    createdAt: Date.now(),
  })
  void tenantStore.set({
    id: "acme",
    domain: "acme",
    status: "active",
    createdAt: Date.now(),
  })
  void tenantStore.set({
    id: "suspended",
    domain: "suspended",
    status: "suspended",
    createdAt: Date.now(),
  })

  const tenancyInstance = tenancy({
    enabled: true,
    baseDomains: ["localhost"],
    required: true,
    storage: { tenant: tenantStore, tenantMembership: membershipStore },
  })

  const auth = credentials({
    emailRequired: true,
    usernameRequired: false,
    session: {
      secret: SESSION_SECRET,
      expiresIn: "15m",
      cookieName: SESSION_COOKIE,
    },
    storage,
    meRateLimitStorage: adapters.rateLimit,
    dummyVerifyPassword,
    secure: false,
    sameSite: "lax",
    sessionRevocationStorage: adapters.tokenRevocation,
    tenancy: {
      enabled: true,
      baseDomains: ["localhost"],
      required: true,
      storage: { tenant: tenantStore, tenantMembership: membershipStore },
    },
  })

  const magic = magicLink({
    storage: adapters.magicLink,
    notifier: {
      async sendEmail(input) {
        if (input.link) sentLinks.set(input.to, input.link)
      },
    },
    mode: "link",
    ttlMinutes: 10,
    userLookup: async (recipient) => {
      const user = await storage.findByEmail(recipient)
      return { userId: user?.id ?? null }
    },
    tenantIdFromRequest: async (request) => {
      const tenantId = await tenancyInstance.resolveTenantId(request)
      return tenantId ?? "global"
    },
    async onVerified(result) {
      if (!result.userId) {
        return new Response(
          JSON.stringify({ error: "Unknown recipient", code: "USER_NOT_FOUND" }),
          { status: 404, headers: { "Content-Type": "application/json" } },
        )
      }
      const session = await auth.createSessionWithoutPassword({
        userId: result.userId,
        tenantId: result.tenantId,
        ip: "e2e-passwordless",
        userAgent: "magic-link",
      })
      const cookie = `${SESSION_COOKIE}=${session.sessionToken}; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}; HttpOnly; SameSite=lax`
      const user = result.userId
        ? await storage.findById(result.userId)
        : null
      const safeUser = user
        ? {
            id: user.id,
            username: user.username,
            email: user.email,
            roles: user.roles,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
          }
        : null
      return new Response(
        JSON.stringify({ success: true, user: safeUser }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": cookie,
          },
        },
      )
    },
  })

  cached = { auth, magic }
  return cached
}

/** Test-only: links captured by the fake notifier, keyed by recipient. */
export function getSentMagicLinks(): ReadonlyMap<string, string> {
  return sentLinks
}