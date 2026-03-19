/**
 * Brain Blitz MCP Server — entry point
 *
 * Thin HTTP layer only. All tools, resources, and HTML widgets live in their
 * own modules; see server.ts for the McpServer factory.
 *
 * Also reverse-proxies /socket.io/* to the local game server (port 3001) so
 * the widget iframe can reach Socket.io through the same ngrok tunnel that
 * serves MCP.  This avoids CSP / devtunnel issues entirely.
 */

import http from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import cors from "cors";
import httpProxy from "http-proxy";
import { createServer } from "./server.js";
import { GAME_SERVER_PROXY_TARGET } from "./config.js";

// ── Shared version (matches McpServer + package.json) ────────────────────────
const VERSION = "1.0.0";

// ─── Express + Streamable HTTP ────────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({ ok: true, name: "brain-blitz-mcp", version: VERSION });
});

// MCP endpoint – stateless: a new transport per request.
// ChatGPT sends tool calls as one-shot POST requests so this is the right model.
app.post("/mcp", async (req, res) => {
  try {
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("[MCP] POST error:", err);
    if (!res.headersSent) res.status(500).json({ error: String(err) });
  }
});

// SSE channel – stateless mode has no sessions to resume, return 405.
app.get("/mcp", (_req, res) => {
  res.status(405).json({ error: "SSE not supported in stateless mode" });
});

// Session termination – stateless, nothing to clean up
app.delete("/mcp", (_req, res) => {
  res.status(405).json({ error: "Session management not supported in stateless mode" });
});

const PORT = Number(process.env.MCP_PORT ?? 3002);

// ─── Reverse proxy: /socket.io/* → game server ──────────────────────────────
// This lets the widget connect to the MCP server URL for Socket.io without
// needing a separate tunnel.  GAME_SERVER_PROXY_TARGET is set via env var
// (in Azure this is the game server Container App's internal FQDN).

const proxy = httpProxy.createProxyServer({
  target: GAME_SERVER_PROXY_TARGET,
  ws: true,
  changeOrigin: true,
});

proxy.on("error", (err, _req, res) => {
  console.error("[proxy] error:", err.message);
  if (res && "writeHead" in res && !res.headersSent) {
    (res as http.ServerResponse).writeHead(502, { "Content-Type": "application/json" });
    (res as http.ServerResponse).end(JSON.stringify({ error: "Game server unavailable" }));
  }
});

// Intercept /socket.io HTTP requests BEFORE Express processes them.
const httpServer = http.createServer((req, res) => {
  if (req.url?.startsWith("/socket.io")) {
    // Add CORS headers for the widget sandbox origin
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
    proxy.web(req, res);
  } else {
    app(req, res);
  }
});

// Handle WebSocket upgrade for /socket.io
httpServer.on("upgrade", (req, socket, head) => {
  if (req.url?.startsWith("/socket.io")) {
    proxy.ws(req, socket, head);
  } else {
    socket.destroy();
  }
});

httpServer.listen(PORT, () => {
  console.log(`\n⚡ Brain Blitz MCP server`);
  console.log(`   Endpoint : http://localhost:${PORT}/mcp`);
  console.log(`   Health   : http://localhost:${PORT}/health`);
  console.log(`   Game proxy: /socket.io/* → ${GAME_SERVER_PROXY_TARGET}`);
  console.log(`   DB       : Azure Cosmos DB NoSQL\n`);
});

// ─── Graceful shutdown ───────────────────────────────────────────────────────
// Azure Container Apps sends SIGTERM before stopping a revision. Close the
// HTTP server so in-flight requests can drain before the process exits.
function shutdown(signal: string) {
  console.log(`\n[${signal}] Shutting down gracefully...`);
  httpServer.close(() => {
    console.log("HTTP server closed.");
    process.exit(0);
  });
  // Force exit after 10 s if connections don't drain
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
