import { test, expect } from "./fixtures";

const REGISTER_START = "/api/auth/webauthn/register-start";

test.describe("webauthn", () => {
  test("webauthn register start rejects GET", async ({ api }) => {
    const resp = await api.get(REGISTER_START);
    expect(resp.status).toBe(405);
  });

  test("webauthn register start requires session", async ({ api }) => {
    const resp = await api.post(REGISTER_START, { username: "e2e-user" });
    expect(resp.status).toBe(401);
  });

  test.skip("real WebAuthn flow placeholder", () => {
    // Real WebAuthn requires a platform authenticator; covered by unit tests
    // + manual browser validation.
  });
});
