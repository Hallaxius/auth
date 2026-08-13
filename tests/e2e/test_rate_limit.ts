import { test, expect } from "./fixtures";
import { randomUUID } from "node:crypto";

test.describe("rate limit", () => {
  test("me rate limited after ten requests", async ({ api }) => {
    const acme = (process.env.E2E_BASE_URL || `http://localhost:${process.env.E2E_PORT || 3100}`).replace("localhost", "acme.localhost");
    const userAgent = `e2e-ratelimit-${randomUUID().slice(0, 12)}`;
    for (let i = 0; i < 10; i++) {
      const resp = await api.get("/api/auth/me", { base: acme, userAgent });
      expect([401, 429]).toContain(resp.status);
    }

    const limited = await api.get("/api/auth/me", { base: acme, userAgent });
    expect(limited.status).toBe(429);
    expect("retry-after" in limited.headers).toBe(true);
    expect(limited.headers["ratelimit-limit"]).toBe("10");
    expect(limited.headers["ratelimit-remaining"]).toBe("0");
  });
});
