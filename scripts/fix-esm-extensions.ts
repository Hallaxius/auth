import { readdirSync, readFileSync, writeFileSync, existsSync, statSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";

const distDir = join(process.cwd(), "dist");
const extensions = [".js", ".d.ts"];

function findFiles(dir: string): string[] {
	const results: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) {
			results.push(...findFiles(fullPath));
		} else {
			results.push(fullPath);
		}
	}
	return results;
}

function resolvePath(filePath: string, importPath: string): string | null {
	const fileDir = resolve(filePath, "..");
	const jsCandidate = resolve(fileDir, importPath + ".js");
	if (existsSync(jsCandidate) && statSync(jsCandidate).isFile()) return importPath + ".js";
	const dtsCandidate = resolve(fileDir, importPath + ".d.ts");
	if (existsSync(dtsCandidate) && statSync(dtsCandidate).isFile()) return importPath + ".d.ts";
	const candidate = resolve(fileDir, importPath);
	if (existsSync(candidate)) {
		if (statSync(candidate).isFile()) return importPath;
		const indexPath = resolve(fileDir, importPath, "index.js");
		if (existsSync(indexPath)) {
			return importPath.endsWith("/") ? importPath + "index.js" : importPath + "/index.js";
		}
	}
	return importPath + ".js";
}

function fixFile(filePath: string): void {
	let content = readFileSync(filePath, "utf-8");
	if (!content) return;
	const original = content;

	content = content.replace(
		/(from\s+["'])(\.{1,2}\/[^\s"']+)(["'])/g,
		(lit, prefix: string, path: string, suffix: string) => {
			if (path.endsWith(".js") || path.endsWith(".d.ts")) return lit;
			const resolved = resolvePath(filePath, path);
			if (resolved) return prefix + resolved + suffix;
			return lit;
		},
	);

	content = content.replace(
		/(import\s*["'])(\.{1,2}\/[^\s"']+)(["'])/g,
		(lit, prefix: string, path: string, suffix: string) => {
			if (path.endsWith(".js") || path.endsWith(".d.ts")) return lit;
			const resolved = resolvePath(filePath, path);
			if (resolved) return prefix + resolved + suffix;
			return lit;
		},
	);

	if (content !== original) {
		writeFileSync(filePath, content, "utf-8");
	}
}

const files = findFiles(distDir);
let count = 0;
for (const file of files) {
	if (extensions.some((ext) => file.endsWith(ext))) {
		fixFile(file);
		count++;
	}
}
console.log(`[fix-esm-extensions] Processed ${count} files.`);
