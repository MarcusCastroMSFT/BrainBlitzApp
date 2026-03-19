// ─── Cosmos DB client (singleton) ────────────────────────────────────────────
// Production: Always uses DefaultAzureCredential (managed identity).
// Local dev:  Falls back to COSMOS_KEY only when NODE_ENV !== 'production'.
// The Azure Bicep template sets disableLocalAuth=true on the Cosmos account,
// so key-based auth is physically blocked in Azure.

import { CosmosClient, Container, Database } from "@azure/cosmos";
import { DefaultAzureCredential } from "@azure/identity";

const COSMOS_ENDPOINT = process.env.COSMOS_ENDPOINT ?? "";
const COSMOS_KEY = process.env.COSMOS_KEY ?? "";
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const DB_NAME = "brain-blitz";
const CONTAINER_NAME = "quizzes";

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

/**
 * Ensures the database and container exist.
 * In Azure the Bicep template pre-creates them, but this is useful for local
 * development with the Cosmos DB emulator.
 */
export async function ensureDatabase(): Promise<void> {
  await client.databases.createIfNotExists({ id: DB_NAME });
  await database.containers.createIfNotExists({
    id: CONTAINER_NAME,
    partitionKey: { paths: ["/id"] },
  });
  console.log(`✅ Cosmos DB ready — ${COSMOS_ENDPOINT} / ${DB_NAME} / ${CONTAINER_NAME}`);
}
