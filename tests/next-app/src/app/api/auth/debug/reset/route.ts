import { resetInstances } from "@/lib/auth/state"

// E2E debug endpoint: resets all in-memory persistence for the current dev
// server instance (users, tenants, codes, sessions, brute-force counts).
// Returns 200 even if already clean.
export async function POST() {
  await resetInstances()
  return Response.json({ ok: true })
}
