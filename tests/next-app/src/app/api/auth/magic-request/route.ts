import { getInstances } from "@/lib/auth/state"

export async function POST(request: Request) {
  const { magic } = await getInstances()
  return magic.handleRequest(request)
}
