import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// Used by build.ts — not called directly by `vite build`.
// build.ts imports this helper and calls Vite's programmatic build() API
// three times (once per widget) so vite-plugin-singlefile works correctly
// (it requires a single entry point per invocation).

export function widgetConfig(name: string) {
  return defineConfig({
    plugins: [react(), tailwindcss(), viteSingleFile()],
    root: `./${name}`,
    build: {
      outDir: `../../src/widgets`,
      emptyOutDir: false,
    },
  });
}

// Default export satisfies the Vite CLI (used for `vite dev`).
export default defineConfig({
  plugins: [react(), tailwindcss()],
});
