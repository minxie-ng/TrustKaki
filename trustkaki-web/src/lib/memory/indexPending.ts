import "server-only";
import type { createPostgresMemoryStore, MemoryIndexClaim } from "./postgresStore";
import type { MemoryScope } from "./retrievalContracts";

type IndexStore = Pick<ReturnType<typeof createPostgresMemoryStore>, "claimPending" | "finishClaim">;
// Foreground and scheduled calls share durable leases, backoff and attempt caps.
export async function indexPendingMemory(scope: MemoryScope,
  store: IndexStore,
  embedBatch: (texts: string[], signal: AbortSignal) => Promise<number[][]>, signal: AbortSignal) {
  signal.throwIfAborted();
  return indexClaimedMemory(await store.claimPending(scope, 20, signal), store, embedBatch, signal);
}
export async function indexClaimedMemory(claims: MemoryIndexClaim[], store: Pick<IndexStore, "finishClaim">,
  embedBatch: (texts: string[], signal: AbortSignal) => Promise<number[][]>, signal: AbortSignal) {
  if (!claims.length) return { attempted: 0, published: 0, stale: 0 };
  try {
    signal.throwIfAborted();
    const vectors = await embedBatch(claims.map(c => c.source.content), signal);
    if (vectors.length !== claims.length) throw new Error("Invalid embedding response");
    let published = 0;
    for (const [i, claim] of claims.entries()) {
      signal.throwIfAborted();
      if (await store.finishClaim(claim, vectors[i], signal)) published++;
    }
    return { attempted: claims.length, published, stale: claims.length - published };
  } catch (error) {
    // Cleanup has its own short deadline; a disconnected process relies on lease expiry.
    await Promise.allSettled(claims.map(c => store.finishClaim(c, null, AbortSignal.timeout(1000))));
    throw error;
  }
}
