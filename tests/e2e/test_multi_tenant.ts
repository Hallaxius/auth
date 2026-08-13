import { test, expect, SEED_EMAIL, SEED_PASSWORD } from "./fixtures";

function host(baseURL: string, label: string): string {
  return baseURL.replace("localhost", `${label}.localhost`);
}

test.describe("multi-tenant", () => {
  test("login on tenant subdomain succeeds", async ({ api }) => {
    const baseURL = process.env.E2E_BASE_URL || `http://localhost:${process.env.E2E_PORT || 3100}`;
    const resp = await api.login(SEED_EMAIL, SEED_PASSWORD, { base: host(baseURL, "acme") });
    expect(resp.status).toBe(200);
    expect((resp.headers["set-cookie"] || "")).toContain("credentials-session=");
  });

  test("suspended tenant is blocked", async ({ api }) => {
    const baseURL = process.env.E2E_BASE_URL || `http://localhost:${process.env.E2E_PORT || 3100}`;
    const resp = await api.login(SEED_EMAIL, SEED_PASSWORD, { base: host(baseURL, "suspended") });
    expect(resp.status).toBe(403);
    expect(resp.json().code).toBe("TENANT_SUSPENDED");
  });

  test("unknown tenant gets 404", async ({ api }) => {
    const baseURL = process.env.E2E_BASE_URL || `http://localhost:${process.env.E2E_PORT || 3100}`;
    const resp = await api.login(SEED_EMAIL, SEED_PASSWORD, { base: host(baseURL, "ghost") });
    expect(resp.status).toBe(404);
    expect(resp.json().code).toBe("TENANT_NOT_FOUND");
  });

  test("divergent tenant header rejected", async ({ api }) => {
    const baseURL = process.env.E2E_BASE_URL || `http://localhost:${process.env.E2E_PORT || 3100}`;
    const resp = await api.post(
      "/api/auth/login",
      { email: SEED_EMAIL, password: SEED_PASSWORD },
      { extraHeaders: { "x-tenant-id": "evil" }, base: host(baseURL, "acme") },
    );
    expect(resp.status).toBe(403);
    expect(resp.json().code).toBe("TENANT_MISMATCH");
  });
});
