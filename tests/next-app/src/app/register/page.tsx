"use client"

import { useState } from "react"

export default function RegisterPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      })
      if (response.ok) {
        window.location.href = "/dashboard"
        return
      }
      let message = `Error ${response.status}`
      try {
        const body = (await response.json()) as { error?: string; code?: string }
        message = body.error ?? message
      } catch {
        // keep default message
      }
      setError(message)
    } catch {
      setError("Network failure")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main style={{ maxWidth: 360, margin: "48px auto", padding: "0 16px" }}>
      <h1>Create account</h1>
      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
        <label>
          Email
          <input
            name="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={8}
          />
        </label>
        <button type="submit" disabled={loading}>
          {loading ? "Creating..." : "Create account"}
        </button>
      </form>
      {error && (
        <p role="alert" style={{ color: "red" }}>
          {error}
        </p>
      )}
      <p>
        <a href="/login">I already have an account</a>
      </p>
    </main>
  )
}
