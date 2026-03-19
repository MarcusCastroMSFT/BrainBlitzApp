import { Server, Socket } from "socket.io";
import { nanoid } from "nanoid";
import { quizContainer } from "../db";
import type { QuizDoc } from "../schema";
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  GameSession,
  Player,
  Question,
  LeaderboardEntry,
} from "../types";

// In-memory game sessions
const sessions: Record<string, GameSession> = {};
// Map socketId -> { code, playerId }
const socketMeta: Record<string, { code: string; playerId?: string; isHost?: boolean }> = {};

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/** Single point-read from Cosmos DB — returns the full quiz with all questions. */
async function getQuiz(quizId: string) {
  try {
    const { resource } = await quizContainer.item(quizId, quizId).read<QuizDoc>();
    if (!resource) return null;
    const questions: Question[] = (resource.questions ?? [])
      .sort((a, b) => a.order - b.order)
      .map((q) => ({
        id: q.id,
        quizId: resource.id,
        text: q.text,
        imageUrl: q.imageUrl,
        timeLimit: q.timeLimit,
        points: q.points,
        order: q.order,
        answers: q.answers.map((a) => ({ id: a.id, text: a.text, isCorrect: a.isCorrect })),
      }));
    return { id: resource.id, title: resource.title, theme: resource.theme, createdAt: resource.createdAt, questions };
  } catch (e: any) {
    if (e.code === 404) return null;
    throw e;
  }
}

function getLeaderboard(session: GameSession, top = 10): LeaderboardEntry[] {
  return Object.values(session.players)
    .sort((a, b) => b.score - a.score)
    .slice(0, top)
    .map((p, i) => ({ rank: i + 1, name: p.name, score: p.score, playerId: p.id }));
}

export function registerSocketHandlers(
  io: Server<ClientToServerEvents, ServerToClientEvents>
) {
  io.on("connection", (socket: Socket<ClientToServerEvents, ServerToClientEvents>) => {

    // HOST: create session
    socket.on("host_create_session", async (quizId, cb) => {
      const quiz = await getQuiz(quizId);
      if (!quiz) return cb("ERROR");
      let code = generateCode();
      while (sessions[code]) code = generateCode();

      sessions[code] = {
        code,
        quizId,
        hostSocketId: socket.id,
        status: "lobby",
        currentQuestionIndex: -1,
        players: {},
      };
      socketMeta[socket.id] = { code, isHost: true };
      socket.join(code);
      cb(code);
    });

    // HOST: start game
    socket.on("host_start_game", (code) => {
      const session = sessions[code];
      if (!session || session.hostSocketId !== socket.id) return;
      if (session.status !== "lobby") return;
      void sendNextQuestion(io, session);
    });

    // HOST: advance to next question
    socket.on("host_next_question", (code) => {
      const session = sessions[code];
      if (!session || session.hostSocketId !== socket.id) return;
      if (session.status !== "answer_reveal" && session.status !== "leaderboard") return;
      void sendNextQuestion(io, session);
    });

    // PLAYER: join game
    socket.on("player_join", async ({ code, name }, cb) => {
      const session = sessions[code];
      if (!session) return cb({ success: false, error: "Game not found" });
      if (session.status !== "lobby") return cb({ success: false, error: "Game already started" });
      if (!name.trim()) return cb({ success: false, error: "Name is required" });

      const playerId = nanoid(8);
      const player: Player = { id: playerId, name: name.trim(), score: 0, streak: 0, answers: [] };
      session.players[playerId] = player;
      socketMeta[socket.id] = { code, playerId };
      socket.join(code);

      // Notify host and all players
      io.to(code).emit("player_joined", { id: playerId, name: player.name });

      const quiz = await getQuiz(session.quizId);
      io.to(socket.id).emit("game_state", {
        code,
        status: session.status,
        quizTitle: quiz?.title ?? "",
        theme: (quiz?.theme as any) ?? "classic",
        playerCount: Object.keys(session.players).length,
        currentQuestionIndex: session.currentQuestionIndex,
        totalQuestions: quiz?.questions.length ?? 0,
      });

      cb({ success: true, playerId });
    });

    // PLAYER: submit answer
    socket.on("player_answer", async ({ code, answerId }) => {
      const session = sessions[code];
      const meta = socketMeta[socket.id];
      if (!session || !meta?.playerId) return;
      if (session.status !== "question") return;

      const player = session.players[meta.playerId];
      if (!player) return;

      const quiz = await getQuiz(session.quizId);
      // Check if already answered this question
      if (player.answers.find((a) => a.questionId === quiz?.questions[session.currentQuestionIndex]?.id)) return;
      const question = quiz?.questions[session.currentQuestionIndex];
      if (!question) return;

      const timeMs = Date.now() - (session.questionStartTime ?? Date.now());
      const correctAnswer = question.answers.find((a) => a.isCorrect);
      const isCorrect = correctAnswer?.id === answerId;

      let points = 0;
      if (isCorrect) {
        // Full points decays linearly over timeLimit
        const ratio = Math.max(0, 1 - timeMs / (question.timeLimit * 1000));
        points = Math.round(question.points * 0.5 + question.points * 0.5 * ratio);
        // Streak bonus
        player.streak += 1;
        if (player.streak >= 3) points = Math.round(points * 1.1);
      } else {
        player.streak = 0;
      }

      player.score += points;
      player.answers.push({ questionId: question.id, answerId, timeMs, points });
    });

    socket.on("disconnect", () => {
      const meta = socketMeta[socket.id];
      if (!meta) return;
      const session = sessions[meta.code];
      if (session && session.hostSocketId === socket.id) {
        // Host left — clean up after 30s
        setTimeout(() => {
          if (sessions[meta.code]?.hostSocketId === socket.id) {
            delete sessions[meta.code];
          }
        }, 30000);
      }
      delete socketMeta[socket.id];
    });
  });
}

async function sendNextQuestion(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  session: GameSession
) {
  const quiz = await getQuiz(session.quizId);
  if (!quiz) return;

  const nextIdx = session.currentQuestionIndex + 1;
  if (nextIdx >= quiz.questions.length) {
    // Game over
    session.status = "finished";
    const podium = getLeaderboard(session, 10);
    io.to(session.code).emit("game_finished", { podium });
    return;
  }

  session.currentQuestionIndex = nextIdx;
  session.status = "question";
  session.questionStartTime = Date.now();

  const question = quiz.questions[nextIdx];
  io.to(session.code).emit("question_start", {
    questionIndex: nextIdx,
    totalQuestions: quiz.questions.length,
    text: question.text,
    imageUrl: question.imageUrl,
    answers: question.answers.map((a) => ({ id: a.id, text: a.text })),
    timeLimit: question.timeLimit,
    startTime: session.questionStartTime,
  });

  // Auto-reveal after timeLimit + 1s
  setTimeout(() => {
    if (sessions[session.code]?.status !== "question") return;
    if (sessions[session.code]?.currentQuestionIndex !== nextIdx) return;
    void revealAnswers(io, session, question);
  }, (question.timeLimit + 1) * 1000);
}

async function revealAnswers(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  session: GameSession,
  question: Question
) {
  session.status = "answer_reveal";
  const correctAnswer = question.answers.find((a) => a.isCorrect);

  const playerResults: Record<string, { points: number; totalScore: number; correct: boolean }> = {};
  for (const [pid, player] of Object.entries(session.players)) {
    const ans = player.answers.find((a) => a.questionId === question.id);
    playerResults[pid] = {
      points: ans?.points ?? 0,
      totalScore: player.score,
      correct: ans?.answerId === correctAnswer?.id,
    };
  }

  io.to(session.code).emit("answer_reveal", {
    correctAnswerId: correctAnswer?.id ?? "",
    playerResults,
  });

  // After 5s show leaderboard
  setTimeout(async () => {
    if (sessions[session.code]?.status !== "answer_reveal") return;
    session.status = "leaderboard";
    const quiz = await getQuiz(session.quizId);
    const isLast = session.currentQuestionIndex >= (quiz?.questions.length ?? 0) - 1;
    io.to(session.code).emit("leaderboard", {
      entries: getLeaderboard(session, 10),
      isLastQuestion: isLast,
    });
  }, 5000);
}
