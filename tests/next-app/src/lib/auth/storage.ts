import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto"

/**
 * Structural mirrors of the library's `AuthUser`/`AuthUserStorage`
 * (src/types.ts) — the package does not re-export them from the entrypoint,
 * and importing from the lib root would cross the Turbopack app root.
 * TS structural typing keeps the storage assignable to the library's types.
 */
export interface AuthUser {
  id: string
  username: string | null
  email: string | null
  password: string
  roles: string[]
  createdAt: Date
  updatedAt: Date
}

export type SafeAuthUser = Omit<AuthUser, "password">

export interface AuthUserStorage {
  findByUsername(username: string): Promise<AuthUser | null>
  findByEmail(email: string): Promise<AuthUser | null>
  findById(id: string): Promise<AuthUser | null>
  create(
    data: Omit<AuthUser, "id" | "createdAt" | "updatedAt"> & {
      password: string
    },
  ): Promise<AuthUser>
  update(userId: string, data: Partial<AuthUser>): Promise<AuthUser>
  delete(userId: string): Promise<void>
  verifyPassword(userId: string, password: string): Promise<boolean>
  dispose?(): void
}

/**
 * ADR-002 — the package never hashes passwords: hashing lives here, in the
 * consumer's storage layer. E2E-only: intentionally CHEAP scrypt params so the
 * browser suite stays fast while the flow (per-user salt, constant-time
 * compare) matches production semantics.
 */
const SCRYPT_OPTIONS = { N: 1024, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }
const KEY_LENGTH = 32
const DUMMY_SALT = "e2e-dummy-salt-000000000000000000000000"

function encodeScrypt(password: string, salt: string): string {
  const derived = scryptSync(password, salt, KEY_LENGTH, SCRYPT_OPTIONS)
  return `scrypt:${salt}:${derived.toString("base64")}`
}

function checkScrypt(encoded: string, password: string): boolean {
  const parts = encoded.split(":")
  if (parts.length !== 3 || parts[0] !== "scrypt") return false
  const derived = scryptSync(password, parts[1] as string, KEY_LENGTH, SCRYPT_OPTIONS)
  const expected = Buffer.from(parts[2] as string, "base64")
  return (
    derived.length === expected.length && timingSafeEqual(derived, expected)
  )
}

/**
 * Dummy verification for the "user not found" path — the library calls this
 * (when configured) to keep timing indistinguishable from a real compare.
 * Same cost, always false.
 */
export async function dummyVerifyPassword(password: string): Promise<boolean> {
  encodeScrypt(password, DUMMY_SALT)
  return false
}

type StoredUser = AuthUser & { password: string }

class MemoryAuthUserStorage implements AuthUserStorage {
  private users = new Map<string, StoredUser>()
  private byUsername = new Map<string, string>()
  private byEmail = new Map<string, string>()

  async findByUsername(username: string): Promise<AuthUser | null> {
    const id = this.byUsername.get(username)
    return id ? (this.users.get(id) ?? null) : null
  }

  async findByEmail(email: string): Promise<AuthUser | null> {
    const id = this.byEmail.get(email)
    return id ? (this.users.get(id) ?? null) : null
  }

  async findById(id: string): Promise<AuthUser | null> {
    return this.users.get(id) ?? null
  }

  async create(
    data: Omit<AuthUser, "id" | "createdAt" | "updatedAt"> & {
      password: string
    },
  ): Promise<AuthUser> {
    const now = new Date()
    const id = randomUUID()
    const user: StoredUser = {
      id,
      username: data.username ?? null,
      email: data.email ?? null,
      password: encodeScrypt(data.password, randomBytes(16).toString("hex")),
      roles: [...(data.roles ?? ["user"])],
      createdAt: now,
      updatedAt: now,
    }
    this.users.set(id, user)
    if (user.username) this.byUsername.set(user.username, id)
    if (user.email) this.byEmail.set(user.email, id)
    return { ...user, password: "" }
  }

  async update(
    userId: string,
    data: Partial<AuthUser>,
  ): Promise<AuthUser> {
    const existing = this.users.get(userId)
    if (!existing) throw new Error(`User ${userId} not found`)
    const updated: StoredUser = {
      ...existing,
      ...data,
      updatedAt: new Date(),
    }
    this.users.set(userId, updated)
    if (data.username !== undefined && data.username !== existing.username) {
      if (existing.username) this.byUsername.delete(existing.username)
      if (updated.username) this.byUsername.set(updated.username, userId)
    }
    if (data.email !== undefined && data.email !== existing.email) {
      if (existing.email) this.byEmail.delete(existing.email)
      if (updated.email) this.byEmail.set(updated.email, userId)
    }
    return { ...updated, password: "" }
  }

  async delete(userId: string): Promise<void> {
    const user = this.users.get(userId)
    if (user) {
      if (user.username) this.byUsername.delete(user.username)
      if (user.email) this.byEmail.delete(user.email)
      this.users.delete(userId)
    }
  }

  async verifyPassword(userId: string, password: string): Promise<boolean> {
    const user = this.users.get(userId)
    if (!user) return false
    return checkScrypt(user.password, password)
  }

  dispose(): void {}
}

export async function createTestAuthUserStorage(): Promise<AuthUserStorage> {
  const storage = new MemoryAuthUserStorage()
  for (const seed of SEED_USERS) {
    await storage.create({ ...seed, roles: ["user"] })
  }
  return storage
}

/**
 * Next.js compiles route handlers and pages into separate bundles, so a
 * module-level singleton is duplicated per bundle (each with its own users
 * and randomUUID ids). Pinning the storage to `globalThis` keeps ONE store
 * shared by every bundle in the same server process — a session minted by
 * /api/auth/* resolves in /dashboard.
 */
const GLOBAL_STORAGE_KEY = "__hallaxiusAuthE2eUserStorage__"

export async function getSharedTestAuthUserStorage(): Promise<AuthUserStorage> {
  const global = globalThis as Record<string, unknown>
  const existing = global[GLOBAL_STORAGE_KEY] as AuthUserStorage | undefined
  if (existing) return existing
  const storage = await createTestAuthUserStorage()
  global[GLOBAL_STORAGE_KEY] = storage
  return storage
}

export const SEED_USERS: Array<{
  username: string
  email: string
  password: string
}> = [
  { username: "e2e-user", email: "e2e-user@example.com", password: "E2E-Pass-1234!" },
  { username: "alice", email: "alice@example.com", password: "Alice-Pass-1234!" },
]
