import { test, expect, SEED_EMAIL, SEED_PASSWORD } from "./fixtures";

test.describe("login", () => {
  test("login success sets session cookie", async ({ api }) => {
    const resp = await api.login(SEED_EMAIL, SEED_PASSWORD);
    expect(resp.status).toBe(200);
    const body = resp.json();
    expect(body.user.email).toBe(SEED_EMAIL);
    expect("password" in body.user).toBe(false);
    const cookie = resp.headers["set-cookie"] || "";
    expect(cookie).toContain("credentials-session=");
  });

  test("login wrong password rejected", async ({ api }) => {
    const resp = await api.login(SEED_EMAIL, "Wrong-Pass-9999!");
    expect(resp.status).toBe(401);
    const body = resp.json();
    expect(body.code).toBe("INVALID_CREDENTIALS");
    expect((resp.headers["set-cookie"] || "")).not.toContain("credentials-session=");
  });

  test("login unknown email rejected", async ({ api }) => {
    const resp = await api.login("nobody-unknown@example.com", SEED_PASSWORD);
    expect(resp.status).toBe(401);
    expect(resp.json().code).toBe("INVALID_CREDENTIALS");
  });

  test("login missing body returns 400", async ({ api }) => {
    const resp = await api.post("/api/auth/login", {});
    expect(resp.status).toBe(400);
  });

  test("login wrong method returns 405", async ({ api }) => {
    const resp = await api.get("/api/auth/login");
    expect(resp.status).toBe(405);
  });
});
