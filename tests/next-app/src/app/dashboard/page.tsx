import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { getAppAuth } from "@/lib/auth"
import LogoutButton from "./logout-button"

export const dynamic = "force-dynamic"

export default async function DashboardPage() {
  const cookieHeader = (await cookies()).toString()
  const request = new Request("http://localhost", {
    headers: { cookie: cookieHeader },
  })
  const { auth } = await getAppAuth()
  const user = await auth.getSession(request)
  if (!user) {
    redirect("/login")
  }

  return (
    <main style={{ maxWidth: 560, margin: "48px auto", padding: "0 16px" }}>
      <h1>Dashboard</h1>
      <p data-testid="dashboard-email">Logado como {user.email ?? user.username}</p>
      <ul>
        <li>id: {user.id}</li>
        <li>email: {user.email ?? "—"}</li>
        <li>roles: {user.roles.join(", ")}</li>
      </ul>
      <LogoutButton />
    </main>
  )
}