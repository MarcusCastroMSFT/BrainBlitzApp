/**
 * build.ts
 * Invokes Vite's programmatic build() API once per widget.
 * vite-plugin-singlefile requires a single entry point per build, so we
 * cannot use a multi-input rollupOptions.input object — this script runs
 * three sequential builds instead.
 *
 * Each widget's root dir contains index.html; Vite outputs it as index.html.
 * After each build we rename index.html → <name>.html in src/widgets/.
 *
 * Run via: `npm run build` (see package.json "build" script)
 */

import { build } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "src", "widgets");

const WIDGETS = ["quiz-browser", "game-enter", "game-play"] as const;

for (const name of WIDGETS) {
  console.log(`\n▶  Building widget: ${name}`);
  await build({
    configFile: false,
    plugins: [react(), tailwindcss(), viteSingleFile()],
    root: path.join(__dirname, name),
    build: {
      outDir,
      emptyOutDir: false,
    },
    logLevel: "info",
  });

  // Vite names the output after the input file (index.html → index.html).
  // Rename to the widget-specific name expected by the MCP server.
  const src  = path.join(outDir, "index.html");
  const dest = path.join(outDir, `${name}.html`);
  fs.renameSync(src, dest);
  console.log(`✓  Done: ${name}.html`);
}

console.log("\n✅  All widgets built.");
