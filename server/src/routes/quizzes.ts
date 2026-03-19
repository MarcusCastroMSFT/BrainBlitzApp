import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { nanoid } from "nanoid";
import { quizContainer } from "../db";
import type { QuizDoc, QuestionDoc, AnswerDoc } from "../schema";
import type { Question } from "../types";

const UPLOADS_DIR = path.join(__dirname, "..", "..", "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => cb(null, `${nanoid()}-${file.originalname}`),
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

export const quizRouter = Router();

/** Convert a Cosmos QuizDoc to the API shape (with Question[]) */
function toApiQuiz(doc: QuizDoc) {
  return {
    id: doc.id,
    title: doc.title,
    theme: doc.theme,
    createdAt: doc.createdAt,
    questions: (doc.questions ?? [])
      .sort((a, b) => a.order - b.order)
      .map((q) => ({
        id: q.id,
        quizId: doc.id,
        text: q.text,
        imageUrl: q.imageUrl,
        timeLimit: q.timeLimit,
        points: q.points,
        order: q.order,
        answers: q.answers.map((a) => ({ id: a.id, text: a.text, isCorrect: a.isCorrect })),
      })),
  };
}

// List all quizzes (summary — no embedded questions needed for list view)
quizRouter.get("/", async (_req, res) => {
  try {
    const { resources } = await quizContainer.items
      .query<QuizDoc>({
        query: "SELECT c.id, c.title, c.theme, c.createdAt FROM c ORDER BY c.createdAt DESC",
      })
      .fetchAll();
    res.json(resources);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// Get single quiz with questions + answers (single document read!)
quizRouter.get("/:id", async (req, res) => {
  try {
    const { resource } = await quizContainer.item(req.params.id, req.params.id).read<QuizDoc>();
    if (!resource) return res.status(404).json({ error: "Quiz not found" });
    res.json(toApiQuiz(resource));
  } catch (e: any) {
    if (e.code === 404) return res.status(404).json({ error: "Quiz not found" });
    res.status(500).json({ error: String(e) });
  }
});

// Create quiz
quizRouter.post("/", async (req, res) => {
  try {
    const { title, theme = "classic" } = req.body;
    if (!title) return res.status(400).json({ error: "title is required" });
    const doc: QuizDoc = {
      id: nanoid(8),
      title,
      theme,
      createdAt: Date.now(),
      questions: [],
    };
    await quizContainer.items.create(doc);
    res.json(toApiQuiz(doc));
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// Update quiz
quizRouter.patch("/:id", async (req, res) => {
  try {
    const { resource: existing } = await quizContainer.item(req.params.id, req.params.id).read<QuizDoc>();
    if (!existing) return res.status(404).json({ error: "Quiz not found" });
    const { title, theme } = req.body;
    if (title) existing.title = title;
    if (theme) existing.theme = theme;
    await quizContainer.item(req.params.id, req.params.id).replace(existing);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// Delete quiz (single document delete — no cascading needed!)
quizRouter.delete("/:id", async (req, res) => {
  try {
    await quizContainer.item(req.params.id, req.params.id).delete();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// Add question to quiz
quizRouter.post("/:id/questions", async (req, res) => {
  try {
    const { resource: doc } = await quizContainer.item(req.params.id, req.params.id).read<QuizDoc>();
    if (!doc) return res.status(404).json({ error: "Quiz not found" });
    const { text = "", timeLimit = 30, points = 1000, answers: ans, order } = req.body;
    const qId = nanoid(8);
    const question: QuestionDoc = {
      id: qId,
      text,
      timeLimit,
      points,
      order: order ?? doc.questions.length,
      answers: Array.isArray(ans)
        ? ans.map((a: any) => ({ id: nanoid(8), text: a.text, isCorrect: !!a.isCorrect }))
        : [],
    };
    doc.questions.push(question);
    await quizContainer.item(req.params.id, req.params.id).replace(doc);
    res.json({ id: qId });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// Update question
quizRouter.patch("/:id/questions/:qId", async (req, res) => {
  try {
    const { resource: doc } = await quizContainer.item(req.params.id, req.params.id).read<QuizDoc>();
    if (!doc) return res.status(404).json({ error: "Quiz not found" });
    const q = doc.questions.find((q) => q.id === req.params.qId);
    if (!q) return res.status(404).json({ error: "Question not found" });

    const { text, timeLimit, points, answers: ans, imageUrl, order } = req.body;
    if (text !== undefined) q.text = text;
    if (timeLimit !== undefined) q.timeLimit = timeLimit;
    if (points !== undefined) q.points = points;
    if (imageUrl !== undefined) q.imageUrl = imageUrl;
    if (order !== undefined) q.order = order;
    if (Array.isArray(ans)) {
      q.answers = ans.map((a: any) => ({ id: nanoid(8), text: a.text, isCorrect: !!a.isCorrect }));
    }
    await quizContainer.item(req.params.id, req.params.id).replace(doc);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// Delete question
quizRouter.delete("/:id/questions/:qId", async (req, res) => {
  try {
    const { resource: doc } = await quizContainer.item(req.params.id, req.params.id).read<QuizDoc>();
    if (!doc) return res.status(404).json({ error: "Quiz not found" });
    doc.questions = doc.questions.filter((q) => q.id !== req.params.qId);
    await quizContainer.item(req.params.id, req.params.id).replace(doc);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// Upload image for a question
quizRouter.post("/:id/questions/:qId/image", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const imageUrl = `/uploads/${req.file.filename}`;
    const { resource: doc } = await quizContainer.item(req.params.id, req.params.id).read<QuizDoc>();
    if (!doc) return res.status(404).json({ error: "Quiz not found" });
    const q = doc.questions.find((q) => q.id === req.params.qId);
    if (!q) return res.status(404).json({ error: "Question not found" });
    q.imageUrl = imageUrl;
    await quizContainer.item(req.params.id, req.params.id).replace(doc);
    res.json({ imageUrl });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});
