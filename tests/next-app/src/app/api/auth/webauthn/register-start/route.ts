import { getInstances } from "@/lib/auth/state"

export async function POST(request: Request) {
  const { passkeys } = await getInstances()
  return passkeys.handleRegisterStart(request)
}
