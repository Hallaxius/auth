import { createSessionCookie } from "@hallaxius/auth"

export const SESSION_COOKIE_NAME = "credentials-session"

// Same cookie profile emitted by credentials() (httpOnly, Path=/, lax in dev)
export function sessionCookieHeader(value: string): string {
  return createSessionCookie(SESSION_COOKIE_NAME, value, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
  })
}

// Appends Set-Cookie to a Response (used by passwordless flows that
// return sessionToken in the body, e.g. sms-verify and magic-link onVerified).
export function withSessionCookie(
  response: Response,
  sessionToken: string,
): Response {
  response.headers.append("Set-Cookie", sessionCookieHeader(sessionToken))
  return response
}
