import { getInstances } from "@/lib/auth/state"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const { sms } = await getInstances()
  return sms.handleSmsRequest(request)
}