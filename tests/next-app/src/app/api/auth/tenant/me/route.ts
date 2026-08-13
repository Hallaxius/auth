import { getInstances } from "@/lib/auth/state"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const { tenantAuth } = await getInstances()
  return tenantAuth.handleMe(request)
}
