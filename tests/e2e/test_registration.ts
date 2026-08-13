import { test, expect, uniqueEmail } from "./fixtures";

const VALID_PASSWORD = "Strong-Pass-1234!";

test.describe("registration", () => {
  test("register success sets session cookie", async ({ api }) => {
    const email = uniqueEmail();
    const resp = await api.register(email, VALID_PASSWORD);
    expect(resp.status).toBe(201);
    const body = resp.json();
    expect(body.user.email).toBe(email);
    expect("password" in body.user).toBe(false);
    expect("roles" in body.user).toBe(true);
    const cookie = resp.headers["set-cookie"] || "";
    expect(cookie).toContain("credentials-session=");
  });

  test("register duplicate email conflicts", async ({ api }) => {
    const email = uniqueEmail();
    const first = await api.register(email, VALID_PASSWORD);
    expect(first.status).toBe(201);
    const second = await api.register(email, VALID_PASSWORD);
    expect(second.status).toBe(409);
    const code = second.json().code as string;
    expect(["EMAIL_TAKEN", "USERNAME_TAKEN"]).toContain(code);
  });

  test("register weak password rejected", async ({ api }) => {
    const resp = await api.register(uniqueEmail(), "short");
    expect(resp.status).toBe(400);
    expect(resp.json().code).toBe("PASSWORD_TOO_SHORT");
  });

  test("register wrong method returns 405", async ({ api }) => {
    const resp = await api.get("/api/auth/register");
    expect(resp.status).toBe(405);
  });

  test("register wrong content type returns 415", async ({ api }) => {
    const resp = await api.post(
      "/api/auth/register",
      { email: uniqueEmail(), password: VALID_PASSWORD },
      { contentType: "text/plain" },
    );
    expect(resp.status).toBe(415);
  });
});
