import { getAppAuth } from "@/lib/auth"

export async function POST(request: Request): Promise<Response> {
  const { auth } = await getAppAuth()
  return auth.handleLogin(request)
}