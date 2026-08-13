import { test, expect } from "./fixtures";
import { randomUUID } from "node:crypto";

const SEED_PHONES: Record<string, string> = {
  alice: "+5511999990001",
  bob: "+5511999990002",
  carol: "+5511999990003",
  eve: "+5511999990004",
};
const UNKNOWN_PHONE = "+5511999990999";

function tenant(): string {
  return `e2e-sms-${randomUUID().slice(0, 10)}`;
}

function debugUrl(phone: string): string {
  return `/api/auth/sms-debug?phone=${encodeURIComponent(phone)}`;
}

async function capturedCode(api: Awaited<ReturnType<typeof import("./fixtures").test["fixtures"]["api"]>>, phone: string): Promise<string | null> {
  const resp = await api.get(debugUrl(phone));
  expect(resp.status).toBe(200);
  return (resp.json().code as string) || null;
}

async function requestCode(api: Awaited<ReturnType<typeof import("./fixtures").test["fixtures"]["api"]>>, phone: string, tenantId?: string) {
  const resp = await api.post("/api/auth/sms/request", { phone, tenantId });
  expect(resp.status).toBe(200);
  expect(resp.json().success).toBe(true);
  return resp;
}

test.describe("sms otp", () => {
  test("sms request generates six digit code", async ({ api }) => {
    const phone = SEED_PHONES.alice;
    await requestCode(api, phone, tenant());
    const code = await capturedCode(api, phone);
    expect(code).not.toBeNull();
    expect(code!.length).toBe(6);
    expect(/^\d+$/.test(code!)).toBe(true);
  });

  test("sms verify mints session", async ({ api }) => {
    const t = tenant();
    const phone = SEED_PHONES.bob;
    await requestCode(api, phone, t);
    const code = await capturedCode(api, phone);
    const verify = await api.post("/api/auth/sms/verify", { phone, code, tenantId: t });
    expect(verify.status).toBe(200);
    const body = verify.json();
    expect(body.sessionToken).toBeTruthy();
    const me = await api.get("/api/auth/sms/me", { extraHeaders: { Cookie: `credentials-session=${body.sessionToken}` } });
    expect(me.status).toBe(200);
    expect(me.json().email).toBe("bob@example.com");
  });

  test("sms wrong code rejected", async ({ api }) => {
    const phone = SEED_PHONES.carol;
    await requestCode(api, phone, tenant());
    const verify = await api.post("/api/auth/sms/verify", { phone, code: "000000" });
    expect(verify.status).toBe(400);
    expect(verify.json().code).toBe("INVALID_CODE");
  });

  test("sms code reuse invalidated", async ({ api }) => {
    const t = tenant();
    const phone = SEED_PHONES.eve;
    await requestCode(api, phone, t);
    const code = await capturedCode(api, phone);
    const first = await api.post("/api/auth/sms/verify", { phone, code, tenantId: t });
    expect(first.status).toBe(200);
    const replay = await api.post("/api/auth/sms/verify", { phone, code, tenantId: t });
    expect(replay.status).toBe(400);
    expect(replay.json().code).toBe("INVALID_CODE");
  });

  test("sms unknown phone does not leak", async ({ api }) => {
    const t = tenant();
    const resp = await api.post("/api/auth/sms/request", { phone: UNKNOWN_PHONE, tenantId: t });
    expect(resp.status).toBe(200);
    expect(resp.json().success).toBe(true);
    expect(await capturedCode(api, UNKNOWN_PHONE)).toBeNull();
    const verify = await api.post("/api/auth/sms/verify", { phone: UNKNOWN_PHONE, code: "123456", tenantId: t });
    expect(verify.status).toBe(400);
  });

  test("sms request missing phone 400", async ({ api }) => {
    const resp = await api.post("/api/auth/sms/request", { tenantId: tenant() });
    expect(resp.status).toBe(400);
  });

  test("sms request wrong method 405", async ({ api }) => {
    const resp = await api.get("/api/auth/sms/request");
    expect(resp.status).toBe(405);
  });

  test("sms verify without code 400", async ({ api }) => {
    const resp = await api.post("/api/auth/sms/verify", { phone: SEED_PHONES.alice });
    expect(resp.status).toBe(400);
  });
});
