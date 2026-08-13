import { getInstances } from "@/lib/auth/state"
import { SESSION_COOKIE_NAME } from "@/lib/auth/session"

export const dynamic = "force-dynamic"

// E2E debug endpoint: validates the session cookie emitted by the SMS flow.
export async function GET(request: Request) {
  const { auth } = await getInstances()
  const cookie = request.headers.get("cookie") ?? ""
  const user = await auth.getSession(request)
  if (!user) {
    return Response.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  }
  return Response.json({
    cookiePresent: cookie.includes(`${SESSION_COOKIE_NAME}=`),
    email: user.email ?? user.username,
    id: user.id,
  })
}