// ─── Game widget resources ────────────────────────────────────────────────────
// Live game player widget: GAME_PLAY_URI — served with CSP for Socket.io

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GAME_PLAY_URI, GAME_SERVER_HOST, MIME_TYPE } from "../config.js";
import { GAME_PLAY_HTML } from "../widgets.js";

export function registerGameWidgetResources(server: McpServer) {

  // ── Live game player ──────────────────────────────────────────────────────
  // CSP allows Socket.io CDN + game server connection.
  server.registerResource(
    "brain-blitz-game-play",
    GAME_PLAY_URI,
    { title: "Brain Blitz – Playing", description: "Live game player with Socket.io", mimeType: MIME_TYPE },
    async () => ({
      contents: [
        {
          uri: GAME_PLAY_URI,
          mimeType: MIME_TYPE,
          text: GAME_PLAY_HTML,
          _meta: {
            "openai/widgetCSP": {
              connect_domains: [GAME_SERVER_HOST, "cdn.socket.io"],
              resource_domains: ["cdn.socket.io", GAME_SERVER_HOST],
            },
            "openai/outputTemplate": GAME_PLAY_URI,
            "openai/widgetAccessible": true,
          },
        },
      ],
    })
  );
}
