// ─── Cosmos DB document model ─────────────────────────────────────────────────
// Single document per quiz — questions and answers are embedded.
// Partition key: /id (quiz ID).

export interface AnswerDoc {
  id: string;
  text: string;
  isCorrect: boolean;
}

export interface QuestionDoc {
  id: string;
  text: string;
  imageUrl?: string;
  timeLimit: number;  // seconds
  points: number;
  order: number;
  answers: AnswerDoc[];
}

export interface QuizDoc {
  id: string;          // partition key
  title: string;
  theme: string;
  createdAt: number;   // epoch ms
  questions: QuestionDoc[];
}
