import { getInstances } from "@/lib/auth/state"

export const dynamic = "force-dynamic"

// E2E debug endpoint: returns the last SMS code "sent" by the fake
// notifier to a phone (or null when the phone is unknown).
export async function GET(request: Request) {
  const { lastSmsCodes } = await getInstances()
  const url = new URL(request.url)
  const phone = url.searchParams.get("phone") ?? ""
  const entry = phone ? lastSmsCodes.get(phone) : null
  if (!entry) {
    return Response.json({ phone, code: null, purpose: null })
  }
  return Response.json({ phone, code: entry.code, purpose: entry.purpose })
}