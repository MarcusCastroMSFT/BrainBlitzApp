// Shared types used by both server and client
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
  timeLimit: number; // seconds
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

export interface Player {
  id: string;
  name: string;
  score: number;
  streak: number;
  answers: { questionId: string; answerId: string; timeMs: number; points: number }[];
}

export type GameStatus =
  | "lobby"
  | "question"
  | "answer_reveal"
  | "leaderboard"
  | "finished";

export interface GameSession {
  code: string;
  quizId: string;
  hostSocketId: string;
  status: GameStatus;
  currentQuestionIndex: number;
  questionStartTime?: number;
  players: Record<string, Player>;
}

// Socket events
export interface ServerToClientEvents {
  game_state: (state: GameStatePayload) => void;
  question_start: (payload: QuestionPayload) => void;
  answer_reveal: (payload: AnswerRevealPayload) => void;
  leaderboard: (payload: LeaderboardPayload) => void;
  game_finished: (payload: PodiumPayload) => void;
  player_joined: (player: { id: string; name: string }) => void;
  error: (msg: string) => void;
}

export interface ClientToServerEvents {
  host_create_session: (quizId: string, cb: (code: string) => void) => void;
  host_start_game: (code: string) => void;
  host_next_question: (code: string) => void;
  player_join: (payload: { code: string; name: string }, cb: (res: JoinResult) => void) => void;
  player_answer: (payload: { code: string; answerId: string }) => void;
}

export interface JoinResult {
  success: boolean;
  playerId?: string;
  error?: string;
}

export interface GameStatePayload {
  code: string;
  status: GameStatus;
  quizTitle: string;
  theme: Theme;
  playerCount: number;
  currentQuestionIndex: number;
  totalQuestions: number;
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

export interface LeaderboardEntry {
  rank: number;
  name: string;
  score: number;
  playerId: string;
}

export interface LeaderboardPayload {
  entries: LeaderboardEntry[];
  isLastQuestion: boolean;
}

export interface PodiumPayload {
  podium: LeaderboardEntry[];
}
