// ─── Widget HTML loader ───────────────────────────────────────────────────────
// Reads each widget's HTML file once at startup.
// Keeping HTML in separate files makes them easy to edit and review without
// wading through TypeScript source.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const widgetsDir = path.join(__dirname, "widgets");

const read = (name: string) =>
  fs.readFileSync(path.join(widgetsDir, name), "utf8");

export const WIDGET_HTML     = read("quiz-browser.html");
export const GAME_PLAY_HTML  = read("game-play.html");
