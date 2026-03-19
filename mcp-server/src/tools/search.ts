// ─── Knowledge tools ──────────────────────────────────────────────────────────
// Implements the MCP standard search/fetch pattern so Brain Blitz acts as a
// company-knowledge source inside ChatGPT and GitHub Copilot.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { quizContainer, type QuizDoc } from "../db.js";
import { APP_BASE_URL } from "../config.js";

export function registerSearchTools(server: McpServer) {

  // ── search ────────────────────────────────────────────────────────────────
  server.registerTool(
    "search",
    {
      title: "Search Brain Blitz",
      description: "Search quizzes and questions by keyword. Compatible with ChatGPT company knowledge.",
      inputSchema: {
        query: z.string().describe("Search keyword"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ query }) => {
      const lower = query.toLowerCase();
      // Single query — filter title + questions in JS to avoid two RU charges
      const { resources } = await quizContainer.items
        .query<QuizDoc>({ query: "SELECT * FROM c" })
        .fetchAll();

      const results: { id: string; title: string; url: string }[] = [];
      for (const q of resources) {
        const titleMatch = q.title.toLowerCase().includes(lower);
        if (titleMatch) {
          results.push({ id: `quiz-${q.id}`, title: q.title, url: APP_BASE_URL });
        }
        for (const question of q.questions ?? []) {
          if (question.text.toLowerCase().includes(lower)) {
            results.push({ id: `question-${question.id}`, title: question.text, url: APP_BASE_URL });
          }
        }
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify({ results: results.slice(0, 20) }) }],
      };
    }
  );

  // ── fetch ─────────────────────────────────────────────────────────────────
  server.registerTool(
    "fetch",
    {
      title: "Fetch Brain Blitz Item",
      description:
        "Fetches details for a quiz or question by ID. " +
        "IDs from search results are prefixed: 'quiz-<id>' or 'question-<id>'.",
      inputSchema: {
        id: z.string().describe("Item ID, e.g. 'quiz-abc12345' or 'question-xyz98765'"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => {
      if (id.startsWith("quiz-")) {
        const quizId = id.slice(5);
        try {
          const { resource } = await quizContainer.item(quizId, quizId).read<QuizDoc>();
          if (!resource) {
            return { content: [{ type: "text" as const, text: JSON.stringify({ error: "not found" }) }], isError: true };
          }
          const qCount = resource.questions?.length ?? 0;
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  id,
                  title: resource.title,
                  text: `Quiz "${resource.title}" with ${qCount} questions. Theme: ${resource.theme}.`,
                  url: APP_BASE_URL,
                  metadata: { theme: resource.theme, questionCount: qCount },
                }),
              },
            ],
          };
        } catch (e: any) {
          if (e.code === 404) {
            return { content: [{ type: "text" as const, text: JSON.stringify({ error: "not found" }) }], isError: true };
          }
          throw e;
        }
      }

      if (id.startsWith("question-")) {
        const questionId = id.slice(9);
        // Use ARRAY_CONTAINS to let Cosmos filter server-side instead of full scan
        const { resources } = await quizContainer.items
          .query<QuizDoc>({
            query: "SELECT * FROM c WHERE ARRAY_CONTAINS(c.questions, { \"id\": @qid }, true)",
            parameters: [{ name: "@qid", value: questionId }],
          })
          .fetchAll();
        for (const quiz of resources) {
          const q = (quiz.questions ?? []).find((q) => q.id === questionId);
          if (q) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    id,
                    title: q.text,
                    text: q.text,
                    url: APP_BASE_URL,
                    metadata: { timeLimit: q.timeLimit, points: q.points },
                  }),
                },
              ],
            };
          }
        }
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: "not found" }) }], isError: true };
      }

      return {
        content: [
          { type: "text" as const, text: JSON.stringify({ error: "Unknown ID format. Expected 'quiz-<id>' or 'question-<id>'." }) },
        ],
        isError: true,
      };
    }
  );
}
