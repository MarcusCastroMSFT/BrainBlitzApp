// ─── Cosmos DB client (singleton) ────────────────────────────────────────────
// Shared Cosmos DB connection for all MCP tools. Uses the same database and
// container as the game server.
// Production: Always uses DefaultAzureCredential (managed identity).
// Local dev:  Falls back to COSMOS_KEY only when NODE_ENV !== 'production'.

import { CosmosClient, Container, Database } from "@azure/cosmos";
import { DefaultAzureCredential } from "@azure/identity";

const COSMOS_ENDPOINT = process.env.COSMOS_ENDPOINT ?? "";
const COSMOS_KEY = process.env.COSMOS_KEY ?? "";
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const DB_NAME = "brain-blitz";
const CONTAINER_NAME = "quizzes";

// ── Document interfaces (mirrors server/src/schema.ts) ─────────────────────

export interface AnswerDoc {
  id: string;
  text: string;
  isCorrect: boolean;
}

export interface QuestionDoc {
  id: string;
  text: string;
  imageUrl?: string;
  timeLimit: number;
  points: number;
  order: number;
  answers: AnswerDoc[];
}

export interface QuizDoc {
  id: string;
  title: string;
  theme: string;
  createdAt: number;
  questions: QuestionDoc[];
}

// ── Client setup ────────────────────────────────────────────────────────────

function createCosmosClient(): CosmosClient {
  // In production, ALWAYS use managed identity — never keys
  if (!IS_PRODUCTION && COSMOS_KEY) {
    return new CosmosClient({ endpoint: COSMOS_ENDPOINT, key: COSMOS_KEY });
  }
  return new CosmosClient({
    endpoint: COSMOS_ENDPOINT,
    aadCredentials: new DefaultAzureCredential(),
  });
}

const client = createCosmosClient();
export const database: Database = client.database(DB_NAME);
export const quizContainer: Container = database.container(CONTAINER_NAME);
