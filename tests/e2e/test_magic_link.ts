import { test, expect, SEED_EMAIL, uniqueEmail } from "./fixtures";

async function requestLink(api: Awaited<ReturnType<typeof import("./fixtures").test["fixtures"]["api"]>>, recipient: string): Promise<string> {
  const resp = await api.post("/api/auth/magic/request", { recipient });
  expect(resp.status).toBe(200);
  expect(resp.json().success).toBe(true);
  const links = (await api.get("/api/debug/magic-links")).json().links as Array<{ recipient: string; link: string }>;
  const match = links.filter((e) => e.recipient === recipient);
  expect(match.length).toBeGreaterThan(0);
  return match[match.length - 1].link;
}

async function freshRecipient(api: Awaited<ReturnType<typeof import("./fixtures").test["fixtures"]["api"]>>): Promise<string> {
  const email = uniqueEmail("magic");
  const resp = await api.register(email, "Fresh-Pass-1234!");
  expect([200, 201]).toContain(resp.status);
  return email;
}

test.describe("magic link", () => {
  test("magic link verify mints session", async ({ api }) => {
    const recipient = await freshRecipient(api);
    const link = await requestLink(api, recipient);
    const token = link.split("t=", 2)[1];
    const verify = await api.post("/api/auth/magic/verify", { token });
    expect(verify.status).toBe(200);
    expect(verify.json().success).toBe(true);
    const cookie = verify.headers["set-cookie"] || "";
    expect(cookie).toContain("credentials-session=");
    const me = await api.get("/api/auth/me", { extraHeaders: { Cookie: cookie.split(";", 1)[0] } });
    expect(me.status).toBe(200);
    expect(me.json().email).toBe(recipient);
  });

  test("magic link replay rejected", async ({ api }) => {
    const recipient = await freshRecipient(api);
    const link = await requestLink(api, recipient);
    const token = link.split("t=", 2)[1];
    const first = await api.post("/api/auth/magic/verify", { token });
    expect(first.status).toBe(200);
    const replay = await api.post("/api/auth/magic/verify", { token });
    expect(replay.status).toBe(400);
    expect(["MAGIC_LINK_USED", "MAGIC_LINK_INVALID"]).toContain(replay.json().code);
  });

  test("magic link unknown recipient does not leak", async ({ api }) => {
    const email = uniqueEmail("ghost");
    const resp = await api.post("/api/auth/magic/request", { recipient: email });
    expect(resp.status).toBe(200);
    expect(resp.json().success).toBe(true);
    const links = (await api.get("/api/debug/magic-links")).json().links as Array<{ recipient: string; link: string }>;
    const captured = links.filter((e) => e.recipient === email);
    expect(captured.length).toBe(0);
  });

  test("magic link bad token rejected", async ({ api }) => {
    const resp = await api.post("/api/auth/magic/verify", { token: "not.a.real.token" });
    expect(resp.status).toBe(400);
    expect(["MAGIC_LINK_INVALID", "MAGIC_LINK_USED"]).toContain(resp.json().code);
  });
});
