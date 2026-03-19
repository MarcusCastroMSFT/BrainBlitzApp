// ─── Game tools ───────────────────────────────────────────────────────────────
// play_game — single tool that launches the live game widget.
// The agent gathers PIN + name conversationally, then calls this tool.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { GAME_PLAY_URI, GAME_SERVER_URL } from "../config.js";

export function registerGameTools(server: McpServer) {

  // ── play_game ─────────────────────────────────────────────────────────────
  server.registerTool(
    "play_game",
    {
      title: "Play Brain Blitz",
      description:
        "Joins and launches a live Brain Blitz game inside the Copilot widget. " +
        "IMPORTANT: This is the ONLY tool for joining or playing games — there is NO separate join_game or start_game tool. " +
        "Use this when the user says 'join game', 'play game', 'join a game', 'I have a game PIN', 'enter game code', etc. " +
        "BOTH parameters are required: 'code' (the game PIN) and 'name' (player display name). " +
        "Before calling this tool, ask the user for their game PIN AND their player name if not already provided.",
      inputSchema: {
        code: z.string().describe("The game PIN or code (e.g. '721703')"),
        name: z.string().describe("The player's display name"),
      },
      annotations: { readOnlyHint: true },
      _meta: {
        "openai/outputTemplate": GAME_PLAY_URI,
        "openai/toolInvocation/invoking": "Launching game\u2026",
        "openai/toolInvocation/invoked": "Game ready — good luck!",
        "openai/widgetAccessible": true,
      },
    },
    async ({ code, name }) => ({
      structuredContent: { code, name, gameServerUrl: GAME_SERVER_URL },
      content: [{ type: "text" as const, text: `${name} is joining game ${code}. Game server: ${GAME_SERVER_URL}` }],
    })
  );
}
