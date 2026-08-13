import { test, expect, SEED_EMAIL } from "./fixtures";

const WRONG_PASSWORD = "Wrong-Pass-9999!";
const UNKNOWN_EMAIL = "no-such-user-xyz@example.com";

async function medianLoginMs(api: Awaited<ReturnType<typeof import("./fixtures").test["fixtures"]["api"]>>, email: string, rounds = 3): Promise<number> {
  const samples: number[] = [];
  for (let i = 0; i < rounds; i++) {
    const start = performance.now();
    const resp = await api.login(email, WRONG_PASSWORD);
    const elapsed = performance.now() - start;
    expect(resp.status).toBe(401);
    samples.push(elapsed);
  }
  samples.sort((a, b) => a - b);
  const mid = Math.floor(samples.length / 2);
  return samples.length % 2 !== 0 ? samples[mid] : (samples[mid - 1] + samples[mid]) / 2;
}

test.describe("timing", () => {
  test("unknown user and wrong password timing similar", async ({ api }) => {
    const unknown = await medianLoginMs(api, UNKNOWN_EMAIL);
    const existing = await medianLoginMs(api, SEED_EMAIL);

    expect(unknown).toBeLessThan(2000);
    expect(existing).toBeLessThan(2000);
    const ratio = Math.max(unknown, existing) / Math.max(Math.min(unknown, existing), 0.001);
    expect(ratio).toBeLessThan(5);
  });
});
