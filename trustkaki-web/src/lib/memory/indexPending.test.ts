import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { indexPendingMemory } from "./indexPending";
import { fictionalRecord, retrievalEvaluationScope as scope } from "@/lib/agents/evaluation/memoryRetrievalCases";
it("publishes only matching source versions and reports a concurrent correction", async () => {
  const publishEmbedding = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  const store = { pending: vi.fn().mockResolvedValue([fictionalRecord("a", "gardening"), fictionalRecord("b", "walking")]), publishEmbedding };
  const embedBatch = vi.fn().mockResolvedValue([[1], [2]]);
  expect(await indexPendingMemory(scope, store, embedBatch, AbortSignal.timeout(1000))).toEqual({ attempted: 2, published: 1, stale: 1 });
  expect(publishEmbedding.mock.calls[1]).toEqual([scope, "b", 1, [2], expect.any(AbortSignal)]);
});
it("keeps pending sources untouched when embedding fails", async () => {
  const store = { pending: vi.fn().mockResolvedValue([fictionalRecord("a", "fact")]), publishEmbedding: vi.fn() };
  await expect(indexPendingMemory(scope, store, async () => { throw new Error("unavailable"); }, AbortSignal.timeout(1000))).rejects.toThrow();
  expect(store.publishEmbedding).not.toHaveBeenCalled();
});
it("does not call the provider when no sources are pending", async () => {
  const embed = vi.fn();
  expect(await indexPendingMemory(scope, { pending: async () => [], publishEmbedding: vi.fn() }, embed, AbortSignal.timeout(1000))).toEqual({ attempted: 0, published: 0, stale: 0 });
  expect(embed).not.toHaveBeenCalled();
});
it("rejects incomplete provider batches before publishing any vector", async () => {
  const store = { pending: vi.fn().mockResolvedValue([fictionalRecord("a", "fact")]), publishEmbedding: vi.fn() };
  await expect(indexPendingMemory(scope, store, async () => [], AbortSignal.timeout(1000))).rejects.toThrow("Invalid embedding response");
  expect(store.publishEmbedding).not.toHaveBeenCalled();
});

it("forwards cancellation to pending SQL and vector publication", async () => {
  const signal = AbortSignal.timeout(1000);
  const store = { pending: vi.fn().mockResolvedValue([fictionalRecord("a", "gardening")]), publishEmbedding: vi.fn().mockResolvedValue(true) };
  await indexPendingMemory(scope, store, async () => [[1]], signal);
  expect(store.pending).toHaveBeenCalledWith(scope, 20, signal);
  expect(store.publishEmbedding).toHaveBeenCalledWith(scope, "a", 1, [1], signal);
});
