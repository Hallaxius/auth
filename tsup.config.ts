import { defineConfig } from "tsup";

export default defineConfig({
	entry: {
		index: "src/index.ts",
		components: "src/components/index.ts",
	},
	format: ["esm", "cjs"],
	dts: true,
	splitting: false,
	clean: true,
	treeshake: true,
	esbuildOptions(options) {
		options.jsx = "automatic";
		options.jsxImportSource = "react";
	},
	outDir: "dist",
	removeDtsExtension: true,
	external: ["next", "react", "react-dom"],
});
