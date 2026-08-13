import { test, expect, SEED_EMAIL, SEED_PASSWORD } from "./fixtures";

async function loggedIn(api: Awaited<ReturnType<typeof import("./fixtures").test["fixtures"]["api"]>>, email = SEED_EMAIL, password = SEED_PASSWORD): Promise<string> {
  const login = await api.login(email, password);
  expect(login.status).toBe(200);
  const cookie = login.headers["set-cookie"] || "";
  const name = cookie.split(";", 1)[0];
  expect(name.startsWith("credentials-session=")).toBe(true);
  return name;
}

test.describe("session", () => {
  test("me without session returns 401", async ({ api }) => {
    const resp = await api.get("/api/auth/me");
    expect(resp.status).toBe(401);
  });

  test("me with session returns user", async ({ api }) => {
    const cookie = await loggedIn(api);
    const resp = await api.get("/api/auth/me", { extraHeaders: { Cookie: cookie } });
    expect(resp.status).toBe(200);
    const body = resp.json();
    expect(body.email).toBe(SEED_EMAIL);
    expect("password" in body).toBe(false);
  });

  test("session cookie attributes are secure", async ({ api }) => {
    await loggedIn(api);
    const raw = (await api.login(SEED_EMAIL, SEED_PASSWORD)).headers["set-cookie"] || "";
    expect(raw).toContain("HttpOnly");
    expect(raw).toContain("SameSite=lax");
    expect(raw).toContain("Path=/");
  });

  test("logout clears session", async ({ api }) => {
    const cookie = await loggedIn(api);
    const logout = await api.post("/api/auth/logout", {}, { extraHeaders: { Cookie: cookie } });
    expect(logout.status).toBe(200);
    const cleared = logout.headers["set-cookie"] || "";
    expect(cleared).toContain("credentials-session=");
    expect(cleared.includes("Max-Age=0") || cleared.includes("Expires=")).toBe(true);
    const resp = await api.get("/api/auth/me", { extraHeaders: { Cookie: cookie } });
    expect(resp.status).toBe(401);
  });
});
