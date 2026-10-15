import "server-only";
import { configuredMemoryEmbeddings } from "./embeddings";
import { createPostgresMemoryStore } from "./postgresStore";
import { neonMemorySql } from "./neonDatabase";
import { indexClaimedMemory } from "./indexPending";

export const MEMORY_WORKER_LIMIT = 10;
export async function processPendingMemory(signal: AbortSignal) {
  signal.throwIfAborted();
  // Validate provider configuration before claiming attempts.
  const embeddings = configuredMemoryEmbeddings();
  const store = createPostgresMemoryStore(neonMemorySql, process.env.TRUSTKAKI_MEMORY_EMBEDDING_MODEL ?? "");
  const claims = await store.claimPending(null, MEMORY_WORKER_LIMIT, signal);
  return indexClaimedMemory(claims, store, embeddings.embedBatch, signal);
}
