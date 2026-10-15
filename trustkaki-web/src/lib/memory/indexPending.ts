import "server-only";
import type { createPostgresMemoryStore } from "./postgresStore";
import type { MemoryScope } from "./retrievalContracts";

// One bounded attempt; failed sources remain pending for the next worker run.
export async function indexPendingMemory(scope: MemoryScope,
  store: Pick<ReturnType<typeof createPostgresMemoryStore>, "pending" | "publishEmbedding">,
  embedBatch: (texts: string[], signal: AbortSignal) => Promise<number[][]>, signal: AbortSignal) {
  signal.throwIfAborted();
  const sources = await store.pending(scope, 20);
  if (!sources.length) return { attempted: 0, published: 0, stale: 0 };
  const vectors = await embedBatch(sources.map(source => source.content), signal);
  if (vectors.length !== sources.length) throw new Error("Invalid embedding response");
  let published = 0;
  for (const [i, source] of sources.entries()) {
    signal.throwIfAborted();
    if (await store.publishEmbedding(scope, source.id, source.version, vectors[i])) published++;
  }
  return { attempted: sources.length, published, stale: sources.length - published };
}
