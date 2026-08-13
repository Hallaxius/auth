import { getAppAuth } from "@/lib/auth"

export async function POST(request: Request): Promise<Response> {
  const { magic } = await getAppAuth()
  return magic.handleRequest(request)
}