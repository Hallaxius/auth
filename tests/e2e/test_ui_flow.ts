import { test, expect, SEED_EMAIL, SEED_PASSWORD, uniqueEmail } from "./fixtures";

test.describe("UI flow", () => {
  test("home page links to auth pages", async ({ page }) => {
    await page.goto("/");
    await page.locator("a[href='/login']").waitFor();
    await page.locator("a[href='/register']").waitFor();
    await page.locator("a[href='/dashboard']").waitFor();
  });

  test("anonymous dashboard redirects to login", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForURL("**/login");
  });

  test("login form lands on dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.locator("input[name='email']").fill(SEED_EMAIL);
    await page.locator("input[name='password']").fill(SEED_PASSWORD);
    await page.locator("button[type='submit']").click();
    await page.waitForURL("**/dashboard");
    await page.locator("[data-testid='dashboard-email']").waitFor();
    expect(await page.locator("[data-testid='dashboard-email']").textContent()).toContain(SEED_EMAIL);
  });

  test("register form lands on dashboard", async ({ page }) => {
    await page.goto("/register");
    const email = uniqueEmail();
    await page.locator("input[name='email']").fill(email);
    await page.locator("input[name='password']").fill("Fresh-Pass-1234!");
    await page.locator("button[type='submit']").click();
    await page.waitForURL("**/dashboard");
    await page.locator("[data-testid='dashboard-email']").waitFor();
    expect(await page.locator("[data-testid='dashboard-email']").textContent()).toContain(email);
  });

  test("login error is shown in form", async ({ page }) => {
    await page.goto("/login");
    await page.locator("input[name='email']").fill(SEED_EMAIL);
    await page.locator("input[name='password']").fill("Wrong-Pass-9999!");
    await page.locator("button[type='submit']").click();
    await page.locator("p[role='alert']").waitFor();
    const alert = await page.locator("p[role='alert']").textContent();
    expect(alert && alert.trim().length).toBeGreaterThan(0);
  });

  test("logout returns to login", async ({ page }) => {
    await page.goto("/login");
    await page.locator("input[name='email']").fill(SEED_EMAIL);
    await page.locator("input[name='password']").fill(SEED_PASSWORD);
    await page.locator("button[type='submit']").click();
    await page.waitForURL("**/dashboard");
    await page.locator("text=Sair").click();
    await page.waitForURL("**/login");
    await page.goto("/dashboard");
    await page.waitForURL("**/login");
  });
});
