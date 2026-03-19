// Shared types (mirrored from server)
export type Theme = "classic" | "ocean" | "volcano" | "forest" | "galaxy";

export interface Answer {
  id: string;
  text: string;
  isCorrect: boolean;
}

export interface Question {
  id: string;
  quizId: string;
  text: string;
  imageUrl?: string;
  answers: Answer[];
  timeLimit: number;
  points: number;
  order: number;
}

export interface Quiz {
  id: string;
  title: string;
  theme: Theme;
  questions: Question[];
  createdAt: number;
}

export type GameStatus = "lobby" | "question" | "answer_reveal" | "leaderboard" | "finished";

export interface LeaderboardEntry {
  rank: number;
  name: string;
  score: number;
  playerId: string;
}

export interface QuestionPayload {
  questionIndex: number;
  totalQuestions: number;
  text: string;
  imageUrl?: string;
  answers: { id: string; text: string }[];
  timeLimit: number;
  startTime: number;
}

export interface AnswerRevealPayload {
  correctAnswerId: string;
  playerResults: Record<string, { points: number; totalScore: number; correct: boolean }>;
}

export interface LeaderboardPayload {
  entries: LeaderboardEntry[];
  isLastQuestion: boolean;
}

export interface PodiumPayload {
  podium: LeaderboardEntry[];
}
