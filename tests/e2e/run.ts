import { $ } from "bun";

const PORT = process.env.E2E_PORT || "3100";
const BASE_URL = `http://localhost:${PORT}`;
const ROOT = import.meta.dir + "/../..";
const APP = import.meta.dir + "/../next-app";
const E2E = import.meta.dir;

let serverProc: Bun.Subprocess | null = null;

function stopServer() {
  if (serverProc && !serverProc.killed) {
    console.log("[e2e-run] stopping dev server (started by THIS script)...");
    serverProc.kill();
    serverProc = null;
  }
}

async function isServerUp(): Promise<boolean> {
  try {
    const resp = await fetch(BASE_URL, { signal: AbortSignal.timeout(2000) });
    return resp.ok;
  } catch {
    return false;
  }
}

async function run(cmd: string, cwd: string, label: string): Promise<number> {
  console.log(`[e2e-run] ${label}...`);
  const proc = Bun.spawn(cmd.split(" "), { cwd, stdio: ["inherit", "inherit", "inherit"] });
  return proc.exited;
}

async function main() {
  process.on("exit", stopServer);

  const distExists = Bun.file(`${ROOT}/dist/index.js`).size > 0;
  const nextBuildExists = Bun.file(`${APP}/.next/BUILD_ID`).size > 0;
  if (!distExists || !nextBuildExists) {
    console.log("[e2e-run] build artifacts missing - running setup...");
    const setupExit = await run("bun run tests/e2e/setup.ts", ROOT, "setup");
    if (setupExit !== 0) process.exit(setupExit);
  }

  const buildExit = await run("bun run build", APP, "app build gate");
  if (buildExit !== 0) process.exit(buildExit);

  if (await isServerUp()) {
    console.log(`[e2e-run] server already running at ${BASE_URL} - REUSING`);
  } else {
    console.log(`[e2e-run] starting server on :${PORT}...`);
    serverProc = Bun.spawn(["bun", "run", "start", "--port", PORT], {
      cwd: APP,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", PORT },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let ready = false;
    for (let i = 0; i < 120; i++) {
      await Bun.sleep(1000);
      if (serverProc.killed) {
        console.error("[e2e-run] server exited early");
        process.exit(1);
      }
      if (await isServerUp()) { ready = true; break; }
    }
    if (!ready) {
      console.error("[e2e-run] server did not become ready");
      process.exit(1);
    }
    console.log(`[e2e-run] server ready at ${BASE_URL}`);
  }

  const smokeExit = await run(
    `bunx playwright test --project=firefox test_smoke.ts`,
    E2E,
    "smoke test",
  );
  if (smokeExit !== 0) {
    console.error("[e2e-run] SMOKE FAILED - aborting.");
    process.exit(smokeExit);
  }
  console.log("[e2e-run] smoke OK - running full suite...");

  const testArg = process.argv[2] || "";
  const fullExit = await run(
    `bunx playwright test --project=firefox ${testArg}`.trim(),
    E2E,
    "full suite",
  );
  process.exit(fullExit);
}

main();
