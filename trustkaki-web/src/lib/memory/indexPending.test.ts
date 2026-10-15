import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { indexPendingMemory } from "./indexPending";
import { fictionalRecord, retrievalEvaluationScope as scope } from "@/lib/agents/evaluation/memoryRetrievalCases";
const claim = (id: string) => ({ source: fictionalRecord(id, "gardening"), leaseToken: crypto.randomUUID() });
it("publishes matching claims and reports a concurrent correction", async () => {
  const claims = [claim("a"), claim("b")];
  const store = { claimPending: vi.fn().mockResolvedValue(claims), finishClaim: vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false) };
  expect(await indexPendingMemory(scope, store, async () => [[1],[2]], AbortSignal.timeout(1000)))
    .toEqual({ attempted: 2, published: 1, stale: 1 });
  expect(store.finishClaim.mock.calls[1]).toEqual([claims[1], [2], expect.any(AbortSignal)]);
});
it("releases leases but preserves database backoff after provider failure", async () => {
  const item = claim("a");
  const store = { claimPending: vi.fn().mockResolvedValue([item]), finishClaim: vi.fn().mockResolvedValue(true) };
  await expect(indexPendingMemory(scope, store, async () => { throw new Error("unavailable"); }, AbortSignal.timeout(1000))).rejects.toThrow();
  expect(store.finishClaim).toHaveBeenCalledWith(item, null, expect.any(AbortSignal));
});
it("does not call the provider when no sources are due", async () => {
  const embed = vi.fn();
  expect(await indexPendingMemory(scope, { claimPending: async () => [], finishClaim: vi.fn() }, embed, AbortSignal.timeout(1000)))
    .toEqual({ attempted: 0, published: 0, stale: 0 });
  expect(embed).not.toHaveBeenCalled();
});
it("rejects incomplete batches and releases all claims without publishing", async () => {
  const item = claim("a");
  const store = { claimPending: vi.fn().mockResolvedValue([item]), finishClaim: vi.fn() };
  await expect(indexPendingMemory(scope, store, async () => [], AbortSignal.timeout(1000))).rejects.toThrow("Invalid embedding response");
  expect(store.finishClaim).toHaveBeenCalledExactlyOnceWith(item, null, expect.any(AbortSignal));
});
it("forwards cancellation and releases using a separate live cleanup signal", async () => {
  const item = claim("a"), abort = new AbortController();
  const store = { claimPending: vi.fn().mockResolvedValue([item]), finishClaim: vi.fn() };
  await expect(indexPendingMemory(scope, store, async () => { abort.abort(); return [[1]]; }, abort.signal)).rejects.toThrow();
  expect(store.claimPending).toHaveBeenCalledWith(scope, 20, abort.signal);
  expect(store.finishClaim.mock.calls[0][1]).toBeNull();
  expect(store.finishClaim.mock.calls[0][2].aborted).toBe(false);
});
