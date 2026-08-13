import { getInstances } from "@/lib/auth/state"

export const dynamic = "force-dynamic"

// E2E debug endpoint: returns the last magic link "sent" by the fake
// notifier to a recipient (or null when the recipient is unknown).
export async function GET(request: Request) {
  const { lastMagicLinks } = await getInstances()
  const url = new URL(request.url)
  const recipient = url.searchParams.get("recipient") ?? ""
  const entry = recipient ? lastMagicLinks.get(recipient) : null
  if (!entry) {
    return Response.json({ recipient, link: null, code: null, token: null })
  }
  const token = entry.link?.split("t=")[1] ?? null
  return Response.json({
    recipient,
    link: entry.link ?? null,
    code: entry.code ?? null,
    token,
    tenantId: entry.tenantId,
    ttlMinutes: entry.ttlMinutes,
  })
}
