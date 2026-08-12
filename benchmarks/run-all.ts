#!/usr/bin/env bun

import { $ } from "bun";

console.log("Running @hallaxius/auth Benchmark Suite...\n");

const benchmarks = [
	"benchmarks/auth.ts",
	"benchmarks/jwt.ts",
	"benchmarks/rate-limit.ts",
	"benchmarks/mfa.ts",
];

for (const benchmark of benchmarks) {
	console.log(`\n${"=".repeat(60)}`);
	console.log(`Running: ${benchmark}`);
	console.log("=".repeat(60));

	try {
		await $`bun run ${benchmark}`;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`Failed to run ${benchmark}:`, message);
	}
}

console.log("\n[OK] All benchmarks completed!");
