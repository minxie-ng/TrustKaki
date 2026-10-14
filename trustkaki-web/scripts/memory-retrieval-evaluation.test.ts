import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { runMemoryEvaluation } from "./memory-retrieval-evaluation";
it("runs deterministic guards with zero external provider setup", async () => {
  const create = vi.fn(); const report = await runMemoryEvaluation([], {}, create);
  expect(create).not.toHaveBeenCalled();
  expect(report).toMatchObject({ mode: "deterministic", semanticQualityMeasured: false, passed: 8, total: 8 });
});
it.each([
  ["--live"], ["--mode", "live"], ["--mode", "live", "--confirm-live"],
  ["--mode", "live", "--confirm-live", "--confirm-provider-budget"], ["--mode", "unknown"],
])("refuses incomplete external opt-in/configuration before provider setup: %j", async (...args) => {
  const create = vi.fn();
  await expect(runMemoryEvaluation(args, {}, create)).rejects.toThrow();
  expect(create).not.toHaveBeenCalled();
});

import { pilotQuestions, pilotRecords } from "../src/lib/agents/evaluation/memoryRetrievalCases";
const liveArgs = ["--mode", "live", "--confirm-live", "--confirm-provider-budget"];
const liveEnv = Object.fromEntries(Object.entries({
  PILOT_BUDGET_USD: "1", PILOT_MIN_SCORE: "0.5", PILOT_REGION: "test", PILOT_PLAN: "test",
  EMBEDDING_MODEL: "test", PINECONE_PILOT_HOST: "https://test.pinecone.io", PINECONE_API_KEY: "fictional",
  EMBEDDING_ENDPOINT: "https://example.com/embeddings", EMBEDDING_API_KEY: "fictional",
}).map(([key, value]) => [`TRUSTKAKI_MEMORY_${key}`, value]));
it.each(["clean", "distractor", "missing-correction", "native"])("exercises the complete live branch offline: %s", async scenario => {
  let count = 0; let currentQuery = "";
  const create: Parameters<typeof runMemoryEvaluation>[2] = () => ({
    usage: { embeddingTokens: 0, readUnits: 0, upsertedVectors: 0 },
    embedBatch: async texts => {
      if (scenario === "native") expect(texts.length).toBeLessThanOrEqual(96);
      return texts.map(() => [1]);
    },
    embed: async query => { currentQuery = query; return [1]; },
    indexState: async () => ({ dimension: 1, count }),
    upsert: async records => { count += records.length; },
    search: async () => {
      const q = pilotQuestions.find(q => q.query === currentQuery)!;
      return pilotRecords.filter(r => q.requiredKeys.some(key => key === r.contextKey)
        || r.id === "old_contact" || r.id === "expired_dance" || (scenario === "distractor" && r.id === "distractor-0"))
        .filter(r => !(scenario === "missing-correction" && q.id === "contact-0-0" && r.id === "contact"))
        .map(r => ({ ...r, sourceVersion: r.version, indexVersion: r.version, embeddingModel: "test", score: 1 }));
    },
  });
  const env = scenario === "native" ? { ...liveEnv, TRUSTKAKI_MEMORY_EMBEDDING_ENDPOINT: "https://api.pinecone.io/embed",
    TRUSTKAKI_MEMORY_EMBEDDING_API_KEY: undefined } : liveEnv;
  const report = await runMemoryEvaluation(liveArgs, env, create);
  expect(count).toBe(1007);
  expect(report).toMatchObject({ mode: "live", passedGate: scenario === "clean" || scenario === "native",
    forbiddenFacts: scenario === "distractor" ? 30 : 0, unavailableQueries: 0 });
  expect(report.observations).toHaveLength(30);
});
it("rejects stray known mode words", async () => {
  await expect(runMemoryEvaluation(["--mode", "deterministic", "live"], {})).rejects.toThrow();
});
