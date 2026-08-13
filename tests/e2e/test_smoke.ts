import { test, expect, SEED_EMAIL, SEED_PASSWORD } from "./fixtures";

test.describe("smoke", () => {
  test("smoke base route answers", async ({ page }) => {
    await page.goto("/");
    await page.locator("a[href='/login']").waitFor();
    await page.locator("a[href='/register']").waitFor();
  });

  test("smoke API answers", async ({ api }) => {
    const resp = await api.get("/api/auth/me");
    expect(resp.status).toBe(401);
    expect(resp.headers["content-type"] || "").toContain("application/json");
  });

  test("smoke login seed user", async ({ api }) => {
    const resp = await api.login(SEED_EMAIL, SEED_PASSWORD);
    expect(resp.status).toBe(200);
  });
});
