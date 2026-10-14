import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { retrievalGuardCases, retrievalEvaluationScope as scope, retrievalEvaluationTime as now, pilotQuestions, pilotRecords } from "@/lib/agents/evaluation/memoryRetrievalCases";
import { retrievePersonalMemory } from "./retrieval";

it.each(retrievalGuardCases)("meets unchanged baseline context targets for $id using labelled candidate ranks", async c => {
  const result = await retrievePersonalMemory({ seniorId: scope.seniorId, query: c.message, now }, {
    embeddingModel: "labelled-test-ranks", indexEmbeddingModel: "labelled-test-ranks", minimumScore: 0.3,
    resolveScope: async () => scope, embed: async () => [1],
    // Oracle ranks exercise selection/guards only; this is not a semantic embedding model.
    search: async () => c.records.map(r => ({ ...r, sourceVersion: r.version, indexVersion: r.version,
      embeddingModel: "labelled-test-ranks", score: c.requiredKeys.includes(r.contextKey) ? 1 : 0.5 })),
    fetchSources: async (_, ids) => c.records.filter(r => ids.includes(r.id)),
  });
  const keys = result.items.map(r => r.contextKey);
  expect(result.reason).toBeNull();
  for (const key of c.requiredKeys) expect(keys).toContain(key);
  for (const key of c.forbiddenKeys) expect(keys).not.toContain(key);
});
it("provides a fixed 30-question multilingual pilot and 1000 distractors without copying real data", () => {
  expect(pilotRecords).toHaveLength(1007); expect(new Set(pilotRecords.map(r => r.id)).size).toBe(1007);
  for (const language of ["English", "Mandarin", "Singlish"]) expect(pilotQuestions.filter(q => q.language === language)).toHaveLength(10);
  expect(pilotRecords.every(r => r.sourceRef.startsWith("fictional:"))).toBe(true);
});
