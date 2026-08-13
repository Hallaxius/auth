import { constantTimeCompareStrings, sha256Hex } from "@hallaxius/auth"

// ADR-002: the lib NEVER hashes passwords — the application is responsible.
// Deterministic hash + configurable cost (~50ms) to add realism to timing
// comparisons in E2E tests (parity between known and unknown users via dummyVerifyPassword).

const HASH_PREFIX = "v1"
const HASH_DELAY_MS = 50

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function hashPassword(password: string): Promise<string> {
  await sleep(HASH_DELAY_MS)
  return sha256Hex(`${HASH_PREFIX}:${password}`)
}

export async function verifyPasswordAgainst(
  storedHash: string,
  password: string,
): Promise<boolean> {
  await sleep(HASH_DELAY_MS)
  const computed = await sha256Hex(`${HASH_PREFIX}:${password}`)
  return constantTimeCompareStrings(computed, storedHash)
}

// Same cost as real verification — the dummy path (unknown user) must cost the
// same, to avoid leaking enumeration via timing.
export async function dummyVerifyPassword(_password: string): Promise<boolean> {
  await sleep(HASH_DELAY_MS)
  return true
}
