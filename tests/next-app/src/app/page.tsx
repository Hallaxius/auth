import Link from "next/link"

// Home page of the E2E test app.
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <h1 className="text-4xl font-bold">Auth Test App</h1>
      <p className="text-zinc-500">
        Test application for the @hallaxius/auth library.
      </p>
      <nav className="flex gap-4">
        <Link
          href="/login"
          className="rounded-lg bg-zinc-900 px-4 py-2 text-white hover:bg-zinc-700"
        >
          Sign in
        </Link>
        <Link
          href="/register"
          className="rounded-lg border px-4 py-2 hover:bg-zinc-100"
        >
          Create account
        </Link>
        <Link
          href="/dashboard"
          className="rounded-lg border px-4 py-2 hover:bg-zinc-100"
        >
          Dashboard
        </Link>
      </nav>
    </main>
  )
}
