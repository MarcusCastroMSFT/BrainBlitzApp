// ─── MCP Server factory ───────────────────────────────────────────────────────
// Creates a fresh McpServer instance, wires all resources and tools, then
// returns it. Keeping this stateless (new instance per request) is the correct
// pattern for the Streamable HTTP transport.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerQuizWidgetResources } from "./resources/quiz-widget.js";
import { registerGameWidgetResources }  from "./resources/game-widgets.js";
import { registerQuizDataTools }        from "./tools/quiz-data.js";
import { registerQuizRenderTools }      from "./tools/quiz-render.js";
import { registerGameTools }            from "./tools/game.js";
import { registerSearchTools }          from "./tools/search.js";

export function createServer(): McpServer {
  const server = new McpServer(
    { name: "brain-blitz", version: "1.0.0" },
    {
      instructions:
        "You are the Brain Blitz assistant — an interactive quiz game platform.\n\n" +
        "AVAILABLE TOOLS (use ONLY these exact names):\n" +
        "  - show_quizzes: List/browse/view/manage all quizzes (opens interactive widget). This is the ONLY tool for listing quizzes.\n" +
        "  - get_quiz: Get full details of a specific quiz by ID.\n" +
        "  - create_quiz: Create a new quiz.\n" +
        "  - add_questions: Add questions to an existing quiz.\n" +
        "  - delete_quiz: Permanently delete a quiz.\n" +
        "  - play_game: Join and play a live game. Requires both a game PIN (code) and player name. Ask the user for BOTH before calling.\n" +
        "  - search: Search quizzes and questions by keyword.\n" +
        "  - fetch: Fetch details for a search result by ID.\n\n" +
        "IMPORTANT RULES:\n" +
        "  - There is NO tool called list_quizzes, join_game, or start_game. Do NOT invent tool names.\n" +
        "  - To list quizzes, ALWAYS call show_quizzes.\n" +
        "  - To join/play a game, ALWAYS call play_game with both 'code' and 'name' parameters.\n" +
        "  - Before calling play_game, ask the user for their game PIN AND their player name.",
    }
  );

  // Resources (widget HTML served under versioned URIs + legacy aliases)
  registerQuizWidgetResources(server);
  registerGameWidgetResources(server);

  // Tools
  registerQuizDataTools(server);   // get_quiz, create_quiz, add_questions, delete_quiz
  registerQuizRenderTools(server); // show_quizzes
  registerGameTools(server);       // play_game
  registerSearchTools(server);     // search, fetch

  return server;
}
