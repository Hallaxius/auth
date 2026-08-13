import { test, expect, SEED_EMAIL, SEED_PASSWORD } from "./fixtures";
import { randomUUID } from "node:crypto";

const WRONG_PASSWORD = "Wrong-Pass-9999!";

function ua(): string {
  return `e2e-bruteforce-${randomUUID().slice(0, 12)}`;
}

test.describe("brute-force", () => {
  test("login locked after five failures", async ({ api }) => {
    const userAgent = ua();
    for (let i = 0; i < 4; i++) {
      const resp = await api.login(SEED_EMAIL, WRONG_PASSWORD, { userAgent });
      expect(resp.status).toBe(401);
    }

    const blocked = await api.login(SEED_EMAIL, WRONG_PASSWORD, { userAgent });
    expect(blocked.status).toBe(429);
    expect(blocked.json().code).toBe("BRUTE_FORCE_BLOCKED");
    expect("retry-after" in blocked.headers).toBe(true);
    expect(blocked.headers["ratelimit-remaining"]).toBe("0");
  });

  test("valid password also blocked after lockout", async ({ api }) => {
    const userAgent = ua();
    for (let i = 0; i < 4; i++) {
      const resp = await api.login(SEED_EMAIL, WRONG_PASSWORD, { userAgent });
      expect(resp.status).toBe(401);
    }

    const locked = await api.login(SEED_EMAIL, WRONG_PASSWORD, { userAgent });
    expect(locked.status).toBe(429);

    const blocked = await api.login(SEED_EMAIL, SEED_PASSWORD, { userAgent });
    expect(blocked.status).toBe(429);
    expect(blocked.json().code).toBe("BRUTE_FORCE_BLOCKED");
  });

  test("fresh user agent is not blocked", async ({ api }) => {
    const userAgent = ua();
    for (let i = 0; i < 4; i++) {
      const resp = await api.login(SEED_EMAIL, WRONG_PASSWORD, { userAgent });
      expect(resp.status).toBe(401);
    }

    const ok = await api.login(SEED_EMAIL, SEED_PASSWORD, { userAgent: ua() });
    expect(ok.status).toBe(200);
  });
});
