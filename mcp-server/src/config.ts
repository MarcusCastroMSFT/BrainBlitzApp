// ─── Configuration constants ──────────────────────────────────────────────────

export const TEMPLATE_URI  = "ui://widget/brain-blitz-v8.html";
export const MIME_TYPE     = "text/html+skybridge";

// ── Game server connectivity ─────────────────────────────────────────────────
// GAME_PORT: The port the game server listens on (used by the local dev proxy).
// GAME_SERVER_PROXY_TARGET: The internal URL the MCP reverse-proxy forwards
//   Socket.io requests to.  In Azure Container Apps this is the game server's
//   internal FQDN; locally it's http://localhost:<GAME_PORT>.
// GAME_SERVER_URL: The PUBLIC URL widgets use in the browser to reach the
//   Socket.io endpoint.  In production this is the MCP Container App's own
//   public URL (which reverse-proxies to the game server).
export const GAME_PORT              = Number(process.env.GAME_PORT ?? 3001);
export const GAME_SERVER_PROXY_TARGET = process.env.GAME_SERVER_PROXY_TARGET ?? `http://localhost:${GAME_PORT}`;
export const GAME_SERVER_URL        = process.env.GAME_SERVER_URL ?? `http://localhost:${GAME_PORT}`;
export const GAME_SERVER_HOST = (() => {
  try { return new URL(GAME_SERVER_URL).hostname; } catch { return "localhost"; }
})();

// ── App base URL (the React SPA) ─────────────────────────────────────────────
// Used to build links the user can click to open the game host / edit pages.
// In production this is the game server Container App's public URL (which also
// serves the React SPA).  Locally it's the Vite dev server.
export const APP_BASE_URL = (process.env.APP_BASE_URL ?? "http://localhost:5173").replace(/\/$/, "");

export const GAME_PLAY_URI  = "ui://widget/brain-blitz-play-v1.html"; // live game
