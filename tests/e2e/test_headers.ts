import { test, expect, SEED_EMAIL, SEED_PASSWORD } from "./fixtures";
import { randomUUID } from "node:crypto";

test.describe("headers", () => {
  test("API responses are JSON", async ({ api }) => {
    const login = await api.login(SEED_EMAIL, SEED_PASSWORD);
    expect(login.headers["content-type"] || "").toContain("application/json");
    const me = await api.get("/api/auth/me");
    expect(me.headers["content-type"] || "").toContain("application/json");
    const bad = await api.login(SEED_EMAIL, "Wrong-Pass-9999!");
    expect(bad.headers["content-type"] || "").toContain("application/json");
  });

  test("session cookie is HttpOnly SameSite", async ({ api }) => {
    const resp = await api.login(SEED_EMAIL, SEED_PASSWORD);
    const raw = resp.headers["set-cookie"] || "";
    expect(raw).toContain("HttpOnly");
    expect(raw).toContain("SameSite=lax");
    expect(raw).not.toContain("Secure");
  });

  test("blocked response carries rate limit headers", async ({ api }) => {
    const ua = `e2e-headers-${randomUUID().slice(0, 12)}`;
    for (let i = 0; i < 4; i++) {
      await api.login(SEED_EMAIL, "Wrong-Pass-9999!", { userAgent: ua });
    }
    const blocked = await api.login(SEED_EMAIL, "Wrong-Pass-9999!", { userAgent: ua });
    expect(blocked.status).toBe(429);
    expect("retry-after" in blocked.headers).toBe(true);
    expect(blocked.headers["ratelimit-limit"]).toBe("5");
  });
});
