import {
  MemoryBruteForceStore,
  MemoryMagicLinkStore,
  MemoryOtpStore,
  MemoryRateLimitStore,
  MemoryTenantMembershipStore,
  MemoryTenantStore,
  createSessionCookie,
  createStorageAdapters,
  credentials,
  magicLink,
  sha256Hex,
  smsOtp,
  tenancy,
  webauthn,
  type AuthUserStorage,
  type MagicLinkHandlers,
  type SmsOtpHandlers,
  type TenancyResult,
  type WebAuthnHandlers,
} from "@hallaxius/auth"
import { dummyVerifyPassword, hashPassword, verifyPasswordAgainst } from "./password"
import { SESSION_COOKIE_NAME } from "./session"

type TestAuthUser = {
  id: string
  username: string | null
  email: string | null
  password: string
  roles: string[]
  createdAt: Date
  updatedAt: Date
}

type CredentialsInstance = ReturnType<typeof credentials>

const SESSION_SECRET =
  "e2e-session-secret-0123456789abcdef-0123456789abcdef"
export const SEED_PASSWORD = "Password123!"
export const SEED_EMAILS = [
  "alice@example.com",
  "bob@example.com",
  "carol@example.com",
  "dave@example.com",
  "eve@example.com",
] as const
export const SEED_PHONES = [
  "+5511999990001",
  "+5511999990002",
  "+5511999990003",
  "+5511999990004",
]

export interface MagicLinkDebug {
  recipient: string
  tenantId: string
  ttlMinutes: number
  link?: string
  code?: string
}

export interface SmsCodeDebug {
  code: string
  purpose: string
  tenantId?: string
}

class TestUserStorage implements AuthUserStorage {
  private users = new Map<string, TestAuthUser>()
  private byUsername = new Map<string, string>()
  private byEmail = new Map<string, string>()
  private phoneIndex = new Map<string, string>()
  private bindings = new Map<string, string>()

  async seed(): Promise<void> {
const seed = [
      { id: "user-alice", email: SEED_EMAILS[0], username: "alice", phone: SEED_PHONES[0] },
      { id: "user-bob", email: SEED_EMAILS[1], username: "bob", phone: SEED_PHONES[1] },
      { id: "user-carol", email: SEED_EMAILS[2], username: "carol", phone: SEED_PHONES[2] },
      { id: "user-dave", email: SEED_EMAILS[3], username: "dave", phone: null },
      { id: "user-eve", email: SEED_EMAILS[4], username: "eve", phone: SEED_PHONES[3] },
    ] as const
    for (const entry of seed) {
      const created = await this.create({
        username: entry.username,
        email: entry.email,
        password: SEED_PASSWORD,
        roles: ["user"],
      })
      this.users.delete(created.id)
      this.users.set(entry.id, { ...created, id: entry.id })
      this.byUsername.set(entry.username, entry.id)
      this.byEmail.set(entry.email, entry.id)
      if (entry.phone) {
        this.phoneIndex.set(await sha256Hex(entry.phone), entry.id)
        this.bindings.set(entry.id, await sha256Hex(entry.phone))
      }
    }
  }

  async findByUsername(username: string): Promise<TestAuthUser | null> {
    const id = this.byUsername.get(username)
    if (!id) return null
    return this.users.get(id) ?? null
  }

  async findByEmail(email: string): Promise<TestAuthUser | null> {
    const id = this.byEmail.get(email)
    if (!id) return null
    return this.users.get(id) ?? null
  }

  async findById(id: string): Promise<TestAuthUser | null> {
    return this.users.get(id) ?? null
  }

  async create(
    data: Omit<TestAuthUser, "id" | "createdAt" | "updatedAt"> & {
      password: string
    },
  ): Promise<TestAuthUser> {
    const user: TestAuthUser = {
      id: crypto.randomUUID(),
      username: data.username ?? null,
      email: data.email ?? null,
      password: await hashPassword(data.password),
      roles: data.roles ?? [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    this.users.set(user.id, user)
    if (user.username) this.byUsername.set(user.username, user.id)
    if (user.email) this.byEmail.set(user.email, user.id)
    return user
  }

  async update(userId: string, data: Partial<TestAuthUser>): Promise<TestAuthUser> {
    const existing = this.users.get(userId)
    if (!existing) throw new Error(`User ${userId} not found`)
    const updated = { ...existing, ...data, updatedAt: new Date() }
    if (data.username !== undefined && data.username !== existing.username) {
      if (existing.username) this.byUsername.delete(existing.username)
      if (updated.username) this.byUsername.set(updated.username, userId)
    }
    if (data.email !== undefined && data.email !== existing.email) {
      if (existing.email) this.byEmail.delete(existing.email)
      if (updated.email) this.byEmail.set(updated.email, userId)
    }
    this.users.set(userId, updated)
    return updated
  }

  async delete(userId: string): Promise<void> {
    const user = this.users.get(userId)
    if (user) {
      if (user.username) this.byUsername.delete(user.username)
      if (user.email) this.byEmail.delete(user.email)
    }
    this.users.delete(userId)
  }

  async verifyPassword(userId: string, password: string): Promise<boolean> {
    const user = this.users.get(userId)
    if (!user) return false
    return verifyPasswordAgainst(user.password, password)
  }

  // ---- test helpers (outside the AuthUserStorage interface) ----

  async findByPhoneHash(phoneHash: string): Promise<string | null> {
    return this.phoneIndex.get(phoneHash) ?? null
  }

  getBinding(userId: string): Promise<{ phoneHash: string } | null> {
    const phoneHash = this.bindings.get(userId)
    return Promise.resolve(phoneHash ? { phoneHash } : null)
  }

  async setBinding(userId: string, phoneHash: string): Promise<void> {
    this.bindings.set(userId, phoneHash)
  }
}

export interface AppInstances {
  auth: CredentialsInstance
  generic: CredentialsInstance
  tenantAuth: CredentialsInstance
  tenancy: TenancyResult
  magic: MagicLinkHandlers & { dispose?: () => void }
  sms: SmsOtpHandlers
  passkeys: WebAuthnHandlers
  storage: TestUserStorage
  lastMagicLinks: Map<string, MagicLinkDebug>
  lastSmsCodes: Map<string, SmsCodeDebug>
  dispose: () => void
}

function hostTenantResolver(request: Request): Promise<string | null> {
  const host = (request.headers.get("host") ?? "").toLowerCase()
  const hostname = host.replace(/:\d+$/, "").replace(/^\[|\]$/g, "")
  if (hostname === "acme.localhost") return Promise.resolve("acme")
  if (hostname === "suspended.localhost") return Promise.resolve("suspended")
  return Promise.resolve(null)
}

async function buildInstances(): Promise<AppInstances> {
  const storage = new TestUserStorage()
  await storage.seed()

  const bruteForce = new MemoryBruteForceStore()
  const rateLimit = new MemoryRateLimitStore()
  const adapters = createStorageAdapters({ type: "memory" })
  const lastMagicLinks = new Map<string, MagicLinkDebug>()
  const lastSmsCodes = new Map<string, SmsCodeDebug>()

  const tenants = new MemoryTenantStore()
  await tenants.set({ id: "acme", domain: "acme", status: "active", createdAt: Date.now() })
  await tenants.set({
    id: "suspended",
    domain: "suspended",
    status: "suspended",
    createdAt: Date.now(),
  })

  const memberships = new MemoryTenantMembershipStore()
  await memberships.setMembership("acme", "user-alice", ["admin"])
  await memberships.setMembership("acme", "user-bob", ["user"])
  await memberships.setMembership("acme", "user-carol", ["user"])
  await memberships.setMembership("suspended", "user-carol", ["user"])

  const tenancyInstance = tenancy({
    enabled: true,
    required: true,
    resolver: hostTenantResolver,
    storage: { tenant: tenants, tenantMembership: memberships },
  })

  const baseConfig = {
    emailRequired: true,
    storage,
    session: { secret: SESSION_SECRET, expiresIn: "15m", cookieName: SESSION_COOKIE_NAME },
    bruteForce: {
      maxAttempts: 5,
      windowMs: 15 * 60 * 1000,
      blockDurationMs: 30 * 60 * 1000,
      storage: bruteForce,
    },
    dummyVerifyPassword,
    meRateLimitStorage: rateLimit,
    loginRateLimitStorage: rateLimit,
  } as const

  const auth = credentials({ ...baseConfig })

  const generic = credentials({ ...baseConfig, genericRegistrationErrors: true })

  const tenantAuth = credentials({
    ...baseConfig,
    tenancy: {
      enabled: true,
      required: true,
      resolver: hostTenantResolver,
      storage: { tenant: tenants, tenantMembership: memberships },
    },
  })

  const magic = magicLink({
    storage: new MemoryMagicLinkStore(),
    notifier: {
      sendEmail: async ({ tenantId, to, link, code, ttlMinutes }) => {
        lastMagicLinks.set(to, { recipient: to, tenantId, ttlMinutes, link, code })
      },
    },
    userLookup: async (recipient) => {
      const user = await storage.findByEmail(recipient)
      return user ? { userId: user.id } : null
    },
    requestLimit: { maxAttempts: 5, storage: bruteForce },
    recipientLimit: { maxAttempts: 5, storage: bruteForce },
    verifyLimit: { maxAttempts: 10, storage: bruteForce },
    onVerified: async (result) => {
      if (!result.userId) {
        return new Response(JSON.stringify({ error: "Unknown user" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
      }
      const session = await auth.createSessionWithoutPassword({
        userId: result.userId,
        tenantId: result.tenantId === "global" ? undefined : result.tenantId,
        ip: "unknown",
        userAgent: "unknown",
      })
      const cookie = createSessionCookie(SESSION_COOKIE_NAME, session.sessionToken, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
      })
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Set-Cookie": cookie },
      })
    },
  })

  const sms = smsOtp({
    notifier: {
      send: async ({ to, code, purpose, tenantId }) => {
        lastSmsCodes.set(to, { code, purpose, tenantId })
      },
    },
    smsPasswordless: true,
    allowedCountryPrefixes: ["+55"],
    storage: new MemoryOtpStore(),
    phoneLookup: async (phoneHash) => {
      const userId = await storage.findByPhoneHash(phoneHash)
      return userId ? { userId } : null
    },
    createSessionWithoutPassword: async (options) =>
      auth.createSessionWithoutPassword(options),
    bruteForceStorage: bruteForce,
    mfaStorage: adapters.mfa,
    secret: SESSION_SECRET,
    sessionCookieName: SESSION_COOKIE_NAME,
  })

  const passkeys = await webauthn({
    rp: {
      id: "localhost",
      name: "Auth Test App",
      origins: ["http://localhost:3000", "http://127.0.0.1:3000"],
    },
    storage: {
      credentials: adapters.webAuthn.credentials,
      challenges: adapters.webAuthn.challenges,
    },
    secret: SESSION_SECRET,
    sessionCookieName: SESSION_COOKIE_NAME,
    createSessionWithoutPassword: async (options) =>
      auth.createSessionWithoutPassword(options),
  })

  return {
    auth,
    generic,
    tenantAuth,
    tenancy: tenancyInstance,
    magic,
    sms,
    passkeys,
    storage,
    lastMagicLinks,
    lastSmsCodes,
    dispose: () => {
      auth.dispose?.()
      generic.dispose?.()
      tenantAuth.dispose?.()
      magic.dispose?.()
      tenancyInstance.dispose?.()
    },
  }
}

let instancesPromise: Promise<AppInstances> | null = null

export function getInstances(): Promise<AppInstances> {
  if (!instancesPromise) instancesPromise = buildInstances()
  return instancesPromise
}

export async function resetInstances(): Promise<void> {
  const previous = instancesPromise
  instancesPromise = null
  if (previous) {
    const instances = await previous
    instances.dispose()
  }
  await getInstances()
}

