import { getSentMagicLinks } from "@/lib/auth"

/**
 * Test-only (E2E): exposes the links captured by the fake magic-link
 * notifier. Never enabled outside this scaffold app.
 */
export async function GET(): Promise<Response> {
  const links = [...getSentMagicLinks().entries()].map(([recipient, link]) => ({
    recipient,
    link,
  }))
  return Response.json({ links })
}
