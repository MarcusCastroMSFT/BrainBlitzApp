// ─── Render tools ─────────────────────────────────────────────────────────────
// show_quizzes — the single tool for listing/browsing quizzes (with widget UI).

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { quizContainer, type QuizDoc } from "../db.js";
import { TEMPLATE_URI, APP_BASE_URL } from "../config.js";

/** Fetch all quizzes with question counts, newest first. */
async function fetchQuizzesWithCounts() {
  const { resources } = await quizContainer.items
    .query<QuizDoc>({
      query: "SELECT c.id, c.title, c.theme, c.createdAt, ARRAY_LENGTH(c.questions) AS questionCount FROM c ORDER BY c.createdAt DESC",
    })
    .fetchAll();
  return resources.map((q: any) => ({
    id: q.id,
    title: q.title,
    theme: q.theme,
    questionCount: q.questionCount ?? 0,
    createdAt: q.createdAt,
  }));
}

export function registerQuizRenderTools(server: McpServer) {

  // ── show_quizzes ──────────────────────────────────────────────────────────
  server.registerTool(
    "show_quizzes",
    {
      title: "Show Brain Blitz",
      description:
        "Lists and displays all Brain Blitz quizzes in an interactive widget. " +
        "Returns quiz IDs, titles, themes, and question counts. " +
        "IMPORTANT: This is the ONLY tool for listing quizzes — there is NO separate list_quizzes tool. " +
        "Use this whenever the user wants to SEE, BROWSE, LIST, VIEW, MANAGE, HOST, or EDIT their quizzes. " +
        "Trigger phrases: 'show my quizzes', 'list quizzes', 'list all quizzes', 'open Brain Blitz', 'manage quizzes', 'view quizzes'. " +
        "Also use this to look up a quiz ID when you only know the name.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
      _meta: {
        "openai/outputTemplate": TEMPLATE_URI,
        "openai/toolInvocation/invoking": "Opening Brain Blitz\u2026",
        "openai/toolInvocation/invoked": "Brain Blitz ready.",
        "openai/widgetAccessible": true,
      },
    },
    async () => {
      const withCounts = await fetchQuizzesWithCounts();
      return {
        structuredContent: { quizzes: withCounts, appBaseUrl: APP_BASE_URL },
        content: [{ type: "text" as const, text: `Brain Blitz loaded with ${withCounts.length} quiz${withCounts.length !== 1 ? "es" : ""}.` }],
      };
    }
  );

}
