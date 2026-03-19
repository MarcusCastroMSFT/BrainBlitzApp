// ─── Data tools ───────────────────────────────────────────────────────────────
// get_quiz, create_quiz, add_questions, delete_quiz
// Return structuredContent only — no widget template.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { nanoid } from "nanoid";
import { quizContainer, type QuizDoc, type QuestionDoc } from "../db.js";
import { APP_BASE_URL } from "../config.js";

export function registerQuizDataTools(server: McpServer) {

  // ── get_quiz ──────────────────────────────────────────────────────────────
  server.registerTool(
    "get_quiz",
    {
      title: "Get Quiz (data only)",
      description:
        "Fetches full quiz details by ID: all questions and answer options as structured data. " +
        "Requires the quiz ID (e.g. 'abc12345') — use show_quizzes first to get the ID if you only know the name. " +
        "Use this to answer questions about a specific quiz's content.",
      inputSchema: {
        quiz_id: z.string().describe("The ID of the quiz to fetch"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ quiz_id }) => {
      try {
        const { resource } = await quizContainer.item(quiz_id, quiz_id).read<QuizDoc>();
        if (!resource) {
          return {
            content: [{ type: "text" as const, text: `Quiz "${quiz_id}" not found.` }],
            isError: true,
          };
        }
        const fullQuestions = (resource.questions ?? [])
          .sort((a, b) => a.order - b.order)
          .map((q) => ({
            id: q.id,
            text: q.text,
            timeLimit: q.timeLimit,
            points: q.points,
            answers: q.answers.map((a) => ({ id: a.id, text: a.text, isCorrect: a.isCorrect })),
          }));
        return {
          structuredContent: {
            quiz: { id: resource.id, title: resource.title, theme: resource.theme, questions: fullQuestions },
          },
          content: [
            {
              type: "text" as const,
              text: `Quiz "${resource.title}" has ${fullQuestions.length} question${fullQuestions.length !== 1 ? "s" : ""}.`,
            },
          ],
        };
      } catch (e: any) {
        if (e.code === 404) {
          return { content: [{ type: "text" as const, text: `Quiz "${quiz_id}" not found.` }], isError: true };
        }
        throw e;
      }
    }
  );

  // ── create_quiz ───────────────────────────────────────────────────────────
  server.registerTool(
    "create_quiz",
    {
      title: "Create Quiz",
      description:
        "Creates a new Brain Blitz quiz with a title and optional theme. " +
        "Returns the new quiz's ID — use that ID immediately with add_questions to populate it.",
      inputSchema: {
        title: z.string().min(1).describe("Title for the new quiz"),
        theme: z
          .enum(["classic", "ocean", "volcano", "forest", "galaxy"])
          .default("classic")
          .describe("Visual theme"),
      },
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false, destructiveHint: false },
    },
    async ({ title, theme }) => {
      const doc: QuizDoc = {
        id: nanoid(8),
        title,
        theme: theme ?? "classic",
        createdAt: Date.now(),
        questions: [],
      };
      await quizContainer.items.create(doc);
      return {
        structuredContent: { id: doc.id, title, theme, questionCount: 0, url: APP_BASE_URL },
        content: [{ type: "text" as const, text: `Created quiz "${title}" (ID: ${doc.id}, theme: ${theme}).` }],
      };
    }
  );

  // ── add_questions ─────────────────────────────────────────────────────────
  server.registerTool(
    "add_questions",
    {
      title: "Add Questions",
      description:
        "Adds one or more multiple-choice questions to an existing Brain Blitz quiz in a single call. " +
        "IMPORTANT: 'quiz_id' must be the quiz's ID string (e.g. 'abc12345'), NOT its title. " +
        "Call show_quizzes first if you only know the quiz name. " +
        "Each question needs 2–4 answer options with exactly one marked correct. " +
        "When asked to add multiple questions, send them all in one call using the questions array.",
      inputSchema: {
        quiz_id: z
          .string()
          .describe("The quiz ID (e.g. 'abc12345'). Use show_quizzes to look it up if needed — do NOT pass the quiz title."),
        questions: z
          .array(
            z.object({
              text: z.string().min(1).describe("Question text"),
              time_limit: z
                .number().int().min(5).max(120).default(10)
                .describe("Seconds to answer (5–120, default 10)"),
              points: z
                .number().int().min(100).max(2000).default(1000)
                .describe("Points for a correct answer (default 1000)"),
              answers: z
                .array(
                  z.object({
                    text: z.string().describe("Answer option text"),
                    is_correct: z.boolean().describe("true for the correct answer, false otherwise"),
                  })
                )
                .min(2).max(4)
                .describe("2–4 answer options; exactly one must have is_correct: true"),
            })
          )
          .min(1)
          .describe("One or more questions to add. Batch all questions into this array in a single call."),
      },
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false, destructiveHint: false },
    },
    async ({ quiz_id, questions: qs }) => {
      let doc: QuizDoc;
      try {
        const res = await quizContainer.item(quiz_id, quiz_id).read<QuizDoc>();
        if (!res.resource) {
          return {
            content: [{ type: "text" as const, text: `Quiz ID "${quiz_id}" not found. Use show_quizzes to get the correct ID.` }],
            isError: true,
          };
        }
        doc = res.resource;
      } catch (e: any) {
        if (e.code === 404) {
          return {
            content: [{ type: "text" as const, text: `Quiz ID "${quiz_id}" not found. Use show_quizzes to get the correct ID.` }],
            isError: true,
          };
        }
        throw e;
      }

      let ord = doc.questions.length;
      const added: { question_id: string; text: string }[] = [];

      for (const q of qs) {
        const correctCount = q.answers.filter((a) => a.is_correct).length;
        if (correctCount !== 1) {
          return {
            content: [
              { type: "text" as const, text: `Question "${q.text}": exactly one answer must be correct (got ${correctCount}).` },
            ],
            isError: true,
          };
        }
        const qId = nanoid(8);
        const question: QuestionDoc = {
          id: qId,
          text: q.text,
          timeLimit: q.time_limit ?? 10,
          points: q.points ?? 1000,
          order: ord++,
          answers: q.answers.map((a) => ({ id: nanoid(8), text: a.text, isCorrect: a.is_correct })),
        };
        doc.questions.push(question);
        added.push({ question_id: qId, text: q.text });
      }

      await quizContainer.item(quiz_id, quiz_id).replace(doc);

      return {
        structuredContent: { quiz_id, quiz_title: doc.title, added },
        content: [
          { type: "text" as const, text: `Added ${added.length} question${added.length !== 1 ? "s" : ""} to quiz "${doc.title}".` },
        ],
      };
    }
  );

  // ── delete_quiz ───────────────────────────────────────────────────────────
  server.registerTool(
    "delete_quiz",
    {
      title: "Delete Quiz",
      description: "Permanently deletes a quiz and all its questions and answers. This action cannot be undone.",
      inputSchema: {
        quiz_id: z.string().describe("ID of the quiz to delete"),
      },
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false, destructiveHint: true },
    },
    async ({ quiz_id }) => {
      try {
        const { resource } = await quizContainer.item(quiz_id, quiz_id).read<QuizDoc>();
        if (!resource) {
          return {
            content: [{ type: "text" as const, text: `Quiz "${quiz_id}" not found.` }],
            isError: true,
          };
        }
        await quizContainer.item(quiz_id, quiz_id).delete();
        return {
          structuredContent: { deleted: true, quiz_id, title: resource.title },
          content: [{ type: "text" as const, text: `Deleted quiz "${resource.title}" and all its questions.` }],
        };
      } catch (e: any) {
        if (e.code === 404) {
          return { content: [{ type: "text" as const, text: `Quiz "${quiz_id}" not found.` }], isError: true };
        }
        throw e;
      }
    }
  );
}
