"use client"

import { useState } from "react"

export default function LogoutButton() {
  const [loading, setLoading] = useState(false)

  async function handleLogout() {
    setLoading(true)
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      })
    } finally {
      window.location.href = "/login"
    }
  }

  return (
    <button type="button" onClick={handleLogout} disabled={loading}>
      {loading ? "Saindo..." : "Sair"}
    </button>
  )
}
