#!/usr/bin/env bun
import { $ } from "bun";
import { readdir } from "fs/promises";
import { join } from "path";

console.log("Running unit tests with REDIS_AVAILABLE=false...");
process.env.REDIS_AVAILABLE = "false";

async function getTestFiles(dir: string): Promise<string[]> {
	const files: string[] = [];
	try {
		const entries = await readdir(dir, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = join(dir, entry.name);
			if (entry.isDirectory()) {
				const subFiles = await getTestFiles(fullPath);
				files.push(...subFiles);
			} else if (entry.name.endsWith(".test.ts")) {
				files.push(fullPath);
			}
		}
	} catch {
		
	}
	return files;
}

const testFiles = await getTestFiles("tests/unit");
console.log(`Found ${testFiles.length} test files`);

let passed = 0;
let failed = 0;

for (const file of testFiles) {
	console.log(`\n[TEST] Testing: ${file}`);
	const result = await $`bun test ${file} --timeout 30000`.nothrow();
	if (result.exitCode === 0) {
		passed++;
	} else {
		failed++;
		console.error(result.stderr.toString());
	}
}

console.log(`\n[OK] Passed: ${passed}, [FAIL] Failed: ${failed}`);
console.log("[OK] All tests completed!");

setTimeout(() => {
	process.exit(failed > 0 ? 1 : 0);
}, 100);