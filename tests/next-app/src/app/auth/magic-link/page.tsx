"use client"

import { useEffect, useState } from "react"

export default function MagicLinkPage() {
  const [status, setStatus] = useState<string>("validating")

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("t")
    if (!token) {
      setStatus("invalid link")
      return
    }
    fetch("/api/auth/magic-verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        if (res.ok) {
          window.location.href = "/dashboard"
          return
        }
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        setStatus(body.error ?? `Error ${res.status}`)
      })
      .catch(() => setStatus("network error"))
  }, [])

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-bold">Magic link</h1>
      <p data-testid="magic-status">{status}</p>
    </main>
  )
}
