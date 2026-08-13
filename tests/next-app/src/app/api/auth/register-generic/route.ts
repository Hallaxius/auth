import { getInstances } from "@/lib/auth/state"

export async function POST(request: Request) {
  const { generic } = await getInstances()
  return generic.handleRegister(request)
}
