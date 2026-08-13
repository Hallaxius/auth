import { getInstances } from "@/lib/auth/state"

export async function POST(request: Request) {
  const { tenantAuth } = await getInstances()
  return tenantAuth.handleLogin(request)
}
