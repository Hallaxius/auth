import { $ } from "bun";

const ROOT = import.meta.dir + "/../..";
const APP = import.meta.dir + "/../next-app";

async function run(cmd: string, cwd: string, label: string) {
  console.log(`[e2e-setup] ${label}...`);
  const proc = Bun.spawn(cmd.split(" "), { cwd, stdio: ["inherit", "inherit", "inherit"] });
  const exit = await proc.exited;
  if (exit !== 0) throw new Error(`${label} failed (exit ${exit})`);
}

async function main() {
  console.log("[e2e-setup] 1/4 building library...");
  await run("bun run build", ROOT, "library build");

  console.log("[e2e-setup] 2/4 installing app dependencies...");
  await run("npm install --install-links --no-audit --no-fund", APP, "app install");

  console.log("[e2e-setup] 3/4 building app...");
  await run("bun run build", APP, "app build");

  console.log("[e2e-setup] 4/4 installing Playwright Firefox...");
  await run("bunx playwright install firefox", ROOT, "playwright install");

  console.log("\n[e2e-setup] OK. Run with: bun run test:e2e");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
